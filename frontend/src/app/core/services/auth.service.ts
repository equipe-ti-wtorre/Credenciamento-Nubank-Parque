import { Injectable, Injector } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';
import {
  AccountInfo,
  AuthenticationResult,
  BrowserAuthError,
  InteractionRequiredAuthError,
  IPublicClientApplication,
} from '@azure/msal-browser';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { LoggerService } from './logger.service';
import { MicrosoftProfileService } from './microsoft-profile.service';
import { SessionIdleService } from './session-idle.service';
import { TeamsContextService } from '../../services/teams-context.service';
import { consumeReturnUrl } from '../guards/auth.guard';

import { PermissionAction, permissionKey } from '../../config/modules.config';

export type SectorPapel = 'SOLICITANTE' | 'APROVADOR' | 'GESTOR';

export interface UserProfileInfo {
  id: number;
  codigo: string;
  nome: string;
  requires_company?: boolean;
  is_super_admin?: boolean;
}

export interface SectorMembership {
  sectorId: number;
  sectorNome: string;
  papel: SectorPapel;
}

export interface AuthUser {
  id: number;
  username: string;
  nome_completo: string;
  email: string;
  role: string;
  perfil?: string;
  id_perfil?: number | null;
  profile?: UserProfileInfo | null;
  permissions?: string[];
  id_company?: number | null;
  is_ad_user: boolean;
  foto_url?: string;
  session_idle_minutes?: number | null;
  notificar_portaria?: boolean;
  sectorMemberships?: SectorMembership[];
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return !!(user?.profile?.is_super_admin || (user as { is_super_admin?: boolean } | null)?.is_super_admin);
}

export function hasPermission(
  user: AuthUser | null | undefined,
  module: string,
  action: PermissionAction = 'view',
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const key = permissionKey(module, action);
  return !!user.permissions?.includes(key);
}

export function isSectorGestor(user: AuthUser | null | undefined): boolean {
  return !!user?.sectorMemberships?.some((m) => m.papel === 'GESTOR');
}

export function canApproveInSector(user: AuthUser | null | undefined): boolean {
  return !!user?.sectorMemberships?.some((m) => m.papel === 'APROVADOR' || m.papel === 'GESTOR');
}

export interface AuthSession {
  auth?: boolean;
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  user?: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private accessTokenCache: string | null = null;
  private refreshTokenCache: string | null = null;
  private tokensReady: Promise<void> | null = null;
  private redirectInFlight: Promise<void> | null = null;
  private backendValidationInFlight: Promise<void> | null = null;
  private lastProcessedRedirectId: string | null = null;
  private logoutPromise: Promise<void> | null = null;
  private logoutReason: 'idle' | null = null;
  private msalHandlingPaused = false;
  private cachedPhotoObjectUrl: string | null = null;

  private static readonly MSAL_INTERACTION_KEY = 'msal.interaction.status';
  private static readonly MSAL_REDIRECT_PROCESSED_KEY = 'msal.redirect.processed';

  constructor(
    private api: ApiService,
    private storage: StorageService,
    private router: Router,
    private msalConfigService: MsalConfigService,
    private logger: LoggerService,
    private notification: NotificationService,
    private microsoftProfile: MicrosoftProfileService,
    private injector: Injector,
    private teamsContext: TeamsContextService,
  ) {
    this.tokensReady = this.loadTokensFromStorage();
  }

  ensureTokensLoaded(): Promise<void> {
    return this.tokensReady ?? this.loadTokensFromStorage();
  }

  private async loadTokensFromStorage() {
    this.accessTokenCache = await this.storage.get('token');
    this.refreshTokenCache = await this.storage.get('refreshToken');
  }

  getAccessTokenSync(): string | null {
    return this.accessTokenCache;
  }

  async saveSession(response: AuthSession) {
    const access =
      response.accessToken || response.token || null;
    const refresh = response.refreshToken || null;

    this.msalHandlingPaused = false;
    this.accessTokenCache = access;
    this.refreshTokenCache = refresh;

    if (access) await this.storage.set('token', access);
    if (refresh) await this.storage.set('refreshToken', refresh);
    if (response.user) {
      await this.storage.set('currentUser', JSON.stringify(response.user));
    }

    void this.injector.get(SessionIdleService).resetAfterLogin();
  }

  loginManual(credentials: { username: string; password: string }) {
    return this.api.post<AuthSession>('/auth/login', credentials).pipe(
      tap((response) => {
        void this.saveSession(response);
      }),
    );
  }

  /** Exchange getAuthToken → JWT. silent=false permite UI de consentimento do Teams. */
  async tryTeamsSsoLogin(
    options: { silent?: boolean; navigate?: boolean } = {},
  ): Promise<boolean> {
    const inTeams = await this.teamsContext.ensureInitialized();
    if (!inTeams) return false;

    await this.msalConfigService.load().catch(() => undefined);

    const silent = options.silent !== false;
    const token = await this.teamsContext.getAuthToken({ silent });
    if (!token) return false;

    try {
      const res = await firstValueFrom(
        this.api.post<AuthSession>(
          '/auth/login-microsoft',
          {},
          { Authorization: `Bearer ${token}` },
        ),
      );
      await this.saveSession(res);
      if (options.navigate !== false) {
        this.navigateAfterLogin();
      }
      return true;
    } catch (err) {
      this.logger.warn('Teams SSO / login-microsoft falhou', {
        err,
        ssoError: this.teamsContext.getLastAuthError(),
      });
      if (err instanceof HttpErrorResponse) {
        const msg =
          (typeof err.error === 'object' && err.error && 'message' in err.error
            ? String((err.error as { message?: string }).message)
            : null) || err.message;
        this.teamsContext.rememberSsoError(msg);
        // Não relança: guarda trata o próximo passo
        return false;
      }
      return false;
    }
  }

  /**
   * Login Microsoft no iframe do Teams.
   * skipSilent: pula getAuthToken (use após silent já ter falhado — evita CancelledByUser).
   */
  async loginMicrosoftInTeams(
    options: { navigate?: boolean; skipSilent?: boolean } = {},
  ): Promise<void> {
    await this.msalConfigService.load();
    if (!this.msalConfigService.hasClientId()) {
      this.notification.warning(
        'Configuração pendente',
        this.msalConfigService.getLoadError() ||
          'Cadastre um tenant Azure principal antes de usar login Microsoft.',
      );
      return;
    }

    let token: string | null = null;
    if (!options.skipSilent) {
      token = await this.teamsContext.getAuthToken({ silent: true });
    }
    if (!token) {
      token = await this.teamsContext.authenticateWithPopup();
    }
    if (!token) {
      const detail = this.teamsContext.getLastAuthError();
      const friendly =
        detail === 'CancelledByUser'
          ? 'Login cancelado. Conclua a escolha da conta no popup (não feche antes).'
          : detail;
      throw new Error(
        friendly ||
          'Teams não liberou o token. Confira Azure: Application ID URI com hostname, clientes Teams e SPA https://cred.allianzparque.intra/auth/teams.html',
      );
    }

    const res = await firstValueFrom(
      this.api.post<AuthSession>(
        '/auth/login-microsoft',
        {},
        { Authorization: `Bearer ${token}` },
      ),
    );
    await this.saveSession(res);
    if (options.navigate !== false) {
      this.navigateAfterLogin();
    }
  }

  navigateAfterLogin(): void {
    void this.navigateAfterLoginAsync();
  }

  private async navigateAfterLoginAsync(): Promise<void> {
    // Prioridade: deep link do Teams (sino / card) → returnUrl → dashboard
    try {
      const teamsPath = await this.teamsContext.getDeepLinkPath();
      if (teamsPath) {
        void this.router.navigateByUrl(teamsPath);
        return;
      }
    } catch {
      /* ignore */
    }

    const returnUrl = consumeReturnUrl();
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      // Preferir aprovacoes se o returnUrl for só a raiz do Teams
      if (returnUrl === '/' || returnUrl === '/dashboard') {
        try {
          const teamsPath = await this.teamsContext.getDeepLinkPath();
          if (teamsPath) {
            void this.router.navigateByUrl(teamsPath);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      void this.router.navigateByUrl(returnUrl);
      return;
    }
    void this.router.navigate(['/dashboard']);
  }

  async loginMicrosoft(): Promise<void> {
    this.msalHandlingPaused = false;
    this.clearStuckMsalInteraction();
    this.clearRedirectProcessedMarker();
    await this.ensureMsalReady();

    if (!this.msalConfigService.hasClientId()) {
      this.notification.warning(
        'Configuração pendente',
        this.msalConfigService.getLoadError() ||
          'Cadastre um tenant Azure principal antes de usar login Microsoft.',
      );
      return;
    }

    if (await this.teamsContext.ensureInitialized()) {
      // Silent já rodou na tela de login; getAuthToken de novo antes do popup
      // gera CancelledByUser em máquina sem sessão Microsoft.
      await this.loginMicrosoftInTeams({ skipSilent: true });
      return;
    }

    const msal = this.msalConfigService.getInstance();
    await this.loginRedirectWithRetry(msal);
  }

  handleRedirect(): Promise<void> {
    return this.ensureMsalReady();
  }

  /** Aguarda redirect pendente; reexecuta após logout/navegação SPA. */
  ensureMsalReady(): Promise<void> {
    if (this.msalHandlingPaused && !this.hasAzureRedirectInUrl()) {
      return Promise.resolve();
    }
    if (this.hasAzureRedirectInUrl()) {
      this.msalHandlingPaused = false;
    }
    if (!this.msalConfigService.hasClientId()) {
      return Promise.resolve();
    }
    if (this.redirectInFlight) {
      return this.redirectInFlight;
    }
    this.redirectInFlight = this.processRedirect().finally(() => {
      this.redirectInFlight = null;
    });
    return this.redirectInFlight;
  }

  private async processRedirect(): Promise<void> {
    try {
      const result = await this.msalConfigService.getInstance().handleRedirectPromise();
      if (!result) {
        if (this.hasAzureRedirectInUrl()) {
          this.clearAuthHashFromUrl();
        }
        return;
      }

      // Popup do Teams (authentication.authenticate): devolve o token ao iframe pai
      // sem validar no backend nesta janela (evita AADSTS50011 e CancelledByUser).
      if (this.teamsContext.isAuthPopupPending()) {
        this.teamsContext.clearAuthPopupPending();
        const token = result.idToken || result.accessToken;
        this.clearAuthHashFromUrl();
        await this.teamsContext.ensureInitialized().catch(() => false);
        if (token) {
          try {
            this.teamsContext.notifySuccess(token);
          } catch (err) {
            this.logger.error('notifySuccess Teams falhou', { err });
            try {
              this.teamsContext.notifyFailure('Falha ao concluir login no Teams.');
            } catch {
              /* ignore */
            }
          }
        } else {
          try {
            this.teamsContext.notifyFailure('Token Microsoft vazio.');
          } catch {
            /* ignore */
          }
        }
        return;
      }

      const fingerprint = this.getRedirectFingerprint(result);
      if (!fingerprint || this.isRedirectAlreadyProcessed(fingerprint)) return;

      if (this.backendValidationInFlight) {
        await this.backendValidationInFlight;
        return;
      }

      if (result.account) {
        this.msalConfigService.getInstance().setActiveAccount(result.account);
      }

      this.backendValidationInFlight = this.validarNoBackend(result, fingerprint).finally(
        () => {
          this.backendValidationInFlight = null;
        },
      );
      await this.backendValidationInFlight;
    } catch (error) {
      this.logger.error('Erro no retorno Microsoft', { error });
    }
  }

  private getRedirectFingerprint(azureResult: {
    account?: { homeAccountId?: string };
    uniqueId?: string;
    idToken?: string;
  }): string {
    return (
      azureResult.account?.homeAccountId ||
      azureResult.uniqueId ||
      azureResult.idToken?.slice(0, 48) ||
      ''
    );
  }

  private isRedirectAlreadyProcessed(fingerprint: string): boolean {
    if (this.lastProcessedRedirectId === fingerprint) return true;
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(AuthService.MSAL_REDIRECT_PROCESSED_KEY) === fingerprint;
  }

  private markRedirectProcessed(fingerprint: string): void {
    this.lastProcessedRedirectId = fingerprint;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(AuthService.MSAL_REDIRECT_PROCESSED_KEY, fingerprint);
    }
  }

  private clearRedirectProcessedMarker(): void {
    this.lastProcessedRedirectId = null;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AuthService.MSAL_REDIRECT_PROCESSED_KEY);
    }
  }

  private clearAuthHashFromUrl(): void {
    if (typeof window === 'undefined') return;
    const cleanUrl = window.location.pathname + window.location.search;
    if (window.location.hash || window.location.href !== cleanUrl) {
      window.history.replaceState(null, '', cleanUrl);
    }
  }

  private async validarNoBackend(
    azureResult: AuthenticationResult,
    fingerprint: string,
  ) {
    const tokenParaEnviar = azureResult.idToken || azureResult.accessToken;
    if (!tokenParaEnviar) return;

    try {
      const res = await firstValueFrom(
        this.api.post<AuthSession>(
          '/auth/login-microsoft',
          {},
          { Authorization: `Bearer ${tokenParaEnviar}` },
        ),
      );
      this.markRedirectProcessed(fingerprint);
      this.clearAuthHashFromUrl();
      await this.saveSession(res);
      if (res.user?.is_ad_user) {
        await this.attachMicrosoftPhoto(azureResult.account);
      }
      this.navigateAfterLogin();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && err.status === 429) {
        this.notification.error(
          'Muitas tentativas',
          'Aguarde alguns minutos antes de tentar novamente. Se o login Microsoft já funcionou, recarregue a página.',
        );
        return;
      }
      const msg =
        err instanceof HttpErrorResponse
          ? err.error?.message || err.message
          : 'Erro desconhecido';
      this.notification.error(
        'Erro de autenticação',
        msg || 'O Azure autenticou, mas o servidor recusou o acesso. Verifique se o tenant está cadastrado.',
      );
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const u = await this.storage.get('currentUser');
    return u ? (JSON.parse(u) as AuthUser) : null;
  }

  /** Foto do perfil Microsoft (API ou Graph). */
  async resolveUserPhoto(): Promise<string | null> {
    await this.ensureTokensLoaded();
    const user = await this.getCurrentUser();
    if (!this.isMicrosoftUser(user)) return null;
    if (this.cachedPhotoObjectUrl) return this.cachedPhotoObjectUrl;

    return this.fetchAndCacheMicrosoftPhoto();
  }

  private isMicrosoftUser(user: AuthUser | null): boolean {
    if (!user) return false;
    return user.is_ad_user === true || Number(user.is_ad_user) === 1;
  }

  private revokeCachedPhotoUrl(): void {
    if (this.cachedPhotoObjectUrl) {
      URL.revokeObjectURL(this.cachedPhotoObjectUrl);
      this.cachedPhotoObjectUrl = null;
    }
  }

  private async attachMicrosoftPhoto(account?: AccountInfo | null): Promise<void> {
    await this.ensureTokensLoaded();
    await this.fetchAndCacheMicrosoftPhoto(account);
  }

  private async fetchAndCacheMicrosoftPhoto(
    account?: AccountInfo | null,
  ): Promise<string | null> {
    this.revokeCachedPhotoUrl();

    let foto = await this.microsoftProfile.fetchPhotoObjectUrlFromApi();
    if (!foto) {
      const graphToken = await this.acquireMicrosoftGraphToken(account);
      if (graphToken) {
        foto = await this.microsoftProfile.fetchPhotoObjectUrlFromGraph(graphToken);
      }
    }
    if (foto) this.cachedPhotoObjectUrl = foto;
    return foto;
  }

  private async acquireMicrosoftGraphToken(
    preferredAccount?: AccountInfo | null,
  ): Promise<string | null> {
    if (!this.msalConfigService.hasClientId()) return null;
    try {
      await this.msalConfigService.load();
      const msal = this.msalConfigService.getInstance();
      const account =
        preferredAccount ||
        msal.getActiveAccount() ||
        msal.getAllAccounts()[0] ||
        null;
      if (!account) return null;

      msal.setActiveAccount(account);

      try {
        const result = await msal.acquireTokenSilent({
          scopes: ['User.Read'],
          account,
        });
        return result.accessToken;
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) throw error;
        const popup = await msal.acquireTokenPopup({
          scopes: ['User.Read'],
          account,
        });
        return popup.accessToken;
      }
    } catch (error) {
      this.logger.error('Não foi possível obter token Graph para foto', { error });
      return null;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.storage.get('token');
    return !!token;
  }

  async refreshSession(): Promise<string | null> {
    const refreshToken =
      this.refreshTokenCache || (await this.storage.get('refreshToken'));
    if (!refreshToken) return null;

    try {
      const res = await firstValueFrom(
        this.api.post<AuthSession>('/auth/refresh', { refreshToken }),
      );
      await this.saveSession(res);
      return res.accessToken || res.token || null;
    } catch {
      return null;
    }
  }

  logout(options?: { reason?: 'idle' }): Promise<void> {
    if (options?.reason) {
      this.logoutReason = options.reason;
    }
    if (this.logoutPromise) {
      return this.logoutPromise;
    }
    this.logoutPromise = this.performLogout().finally(() => {
      this.logoutPromise = null;
    });
    return this.logoutPromise;
  }

  isLoggingOut(): boolean {
    return this.logoutPromise !== null;
  }

  private hasAzureRedirectInUrl(): boolean {
    if (typeof window === 'undefined') return false;
    const target = `${window.location.search}${window.location.hash}`;
    return /(?:^|[?#&])(code|id_token|error)=/i.test(target);
  }

  private async performLogout(): Promise<void> {
    this.msalHandlingPaused = true;
    this.redirectInFlight = null;
    this.backendValidationInFlight = null;

    const user = await this.getCurrentUser();
    const isMicrosoftUser = !!user?.is_ad_user;
    const refreshToken =
      this.refreshTokenCache || (await this.storage.get('refreshToken'));

    this.accessTokenCache = null;
    this.refreshTokenCache = null;
    this.revokeCachedPhotoUrl();
    await this.storage.remove('token');
    await this.storage.remove('refreshToken');
    await this.storage.remove('currentUser');
    this.clearRedirectProcessedMarker();
    this.clearStuckMsalInteraction();

    this.injector.get(SessionIdleService).clearOnLogout();

    const loginUrl = this.logoutReason === 'idle' ? '/login?reason=idle' : '/login';
    this.logoutReason = null;
    await this.router.navigateByUrl(loginUrl, { replaceUrl: true });
    // Libera o handler MSAL para a próxima tentativa na tela de login.
    this.msalHandlingPaused = false;

    if (refreshToken) {
      void firstValueFrom(this.api.post('/auth/logout', { refreshToken })).catch(() => {
        /* ignora erro de logout remoto */
      });
    }

    if (isMicrosoftUser && this.msalConfigService.hasClientId()) {
      void this.clearMicrosoftSession();
    }
  }

  /** Limpa contas MSAL no browser sem depender de redirect externo do Azure. */
  private async clearMicrosoftSession(): Promise<void> {
    try {
      const msal = this.msalConfigService.getInstance();
      this.clearStuckMsalInteraction();
      await msal.handleRedirectPromise();
      await this.clearMsalCache(msal);
    } catch (error) {
      this.logger.error('Erro ao limpar sessão Microsoft', { error });
      this.clearStuckMsalInteraction();
    }
  }

  private async clearMsalCache(msal: IPublicClientApplication): Promise<void> {
    try {
      await msal.clearCache();
    } catch {
      /* ignora falha ao limpar cache MSAL */
    }
  }

  private async loginRedirectWithRetry(
    msal: IPublicClientApplication,
  ): Promise<void> {
    const request = {
      scopes: ['User.Read', 'openid', 'profile'],
      prompt: 'select_account' as const,
    };

    try {
      await msal.loginRedirect(request);
    } catch (error) {
      if (!this.isInteractionInProgressError(error)) throw error;
      this.clearStuckMsalInteraction();
      try {
        await msal.handleRedirectPromise();
      } catch {
        /* ignora redirect residual */
      }
      this.clearStuckMsalInteraction();
      await msal.loginRedirect(request);
    }
  }

  private clearStuckMsalInteraction(): void {
    if (typeof sessionStorage !== 'undefined') {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        if (
          key === AuthService.MSAL_INTERACTION_KEY ||
          key.includes('interaction.status') ||
          key.includes('request.params') ||
          key.includes('request.state') ||
          key.includes('request.nonce') ||
          key.includes('request.origin')
        ) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        sessionStorage.removeItem(key);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AuthService.MSAL_INTERACTION_KEY);
    }
  }

  private isInteractionInProgressError(error: unknown): boolean {
    return (
      error instanceof BrowserAuthError &&
      error.errorCode === 'interaction_in_progress'
    );
  }
}
