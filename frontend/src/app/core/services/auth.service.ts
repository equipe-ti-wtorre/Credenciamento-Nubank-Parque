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
  requires_company?: boolean;
  is_super_admin?: boolean;
  is_ad_user: boolean;
  foto_url?: string;
  session_idle_minutes?: number | null;
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
  return hasExplicitPermission(user, module, action);
}

/** Checa a lista de permissões sem atalho de super admin. */
export function hasExplicitPermission(
  user: AuthUser | null | undefined,
  module: string,
  action: PermissionAction = 'view',
): boolean {
  if (!user) return false;
  const key = permissionKey(module, action);
  const perms = user.permissions;
  if (!Array.isArray(perms)) return false;
  return perms.some((item) => {
    if (typeof item === 'string') return item === key;
    if (item && typeof item === 'object') {
      const row = item as { modulo?: string; acao?: string; module?: string; action?: string };
      const modulo = row.modulo || row.module;
      const acao = row.acao || row.action;
      return !!modulo && !!acao && permissionKey(modulo, acao as PermissionAction) === key;
    }
    return false;
  });
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

const COMPANY_PROFILE_CODES = new Set([
  'PRODUTORA',
  'PADRAO',
  'EMPRESA_GESTOR',
  'EMPRESA_SOLICITANTE',
]);

export function isCompanyScopedAuthUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isTruthyFlag(user.requires_company) || isTruthyFlag(user.profile?.requires_company)) {
    return true;
  }
  const role = String(user.role || user.perfil || user.profile?.codigo || '').toUpperCase();
  return COMPANY_PROFILE_CODES.has(role);
}

export function canCreateEvents(user: AuthUser | null | undefined): boolean {
  if (!user || isCompanyScopedAuthUser(user)) return false;
  return hasExplicitPermission(user, 'events', 'create');
}

export function isSectorGestor(user: AuthUser | null | undefined): boolean {
  return !!user?.sectorMemberships?.some((m) => m.papel === 'GESTOR');
}

export function canApproveInSector(user: AuthUser | null | undefined): boolean {
  return !!user?.sectorMemberships?.some((m) => m.papel === 'APROVADOR' || m.papel === 'GESTOR');
}

export function isAdInternalUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const isAd = user.is_ad_user === true || Number(user.is_ad_user) === 1;
  if (!isAd) return false;
  if (user.id_company != null) return false;
  if (user.requires_company || user.profile?.requires_company) return false;
  return true;
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
   * skipSilent: não chama getAuthToken silent (já falhou).
   * interactive: no clique do botão, tenta getAuthToken com UI do Teams antes do popup MSAL.
   */
  async loginMicrosoftInTeams(
    options: {
      navigate?: boolean;
      skipSilent?: boolean;
      interactive?: boolean;
    } = {},
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
    let usedNativeSso = false;

    if (options.interactive) {
      // Gesto do usuário: SSO nativo do Teams (consentimento na máquina fria)
      token = await this.teamsContext.getAuthToken({ silent: false });
      usedNativeSso = !!token;
      if (!token) {
        const ssoErr = this.teamsContext.getLastAuthError();
        if (ssoErr === 'CancelledByUser') {
          throw new Error(
            'Login cancelado. Conclua a autenticação na janela do Teams (não feche antes).',
          );
        }
      }
    } else if (!options.skipSilent) {
      token = await this.teamsContext.getAuthToken({ silent: true });
      usedNativeSso = !!token;
    }

    if (!token) {
      token = await this.teamsContext.authenticateWithPopup();
      usedNativeSso = false;
    }
    if (!token) {
      const detail = this.teamsContext.getLastAuthError();
      const friendly =
        detail === 'CancelledByUser'
          ? 'Login cancelado. Conclua a escolha da conta no popup (não feche antes). Cadastre no Azure SPA: https://cred.nbpdev.com.br/auth/teams.html'
          : detail;
      throw new Error(
        friendly ||
          'Teams não liberou o token. No Azure: Application ID URI com hostname (api://cred.nbpdev.com.br/{clientId}) e SPA https://cred.nbpdev.com.br/auth/teams.html',
      );
    }

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
      return;
    } catch (err) {
      const msg =
        err instanceof HttpErrorResponse
          ? (typeof err.error === 'object' &&
            err.error &&
            'message' in err.error
              ? String((err.error as { message?: string }).message)
              : null) || err.message
          : err instanceof Error
            ? err.message
            : String(err);

      // Pacote Teams com webApplicationInfo de outro tenant: getAuthToken vem com aud errado.
      // Cai no popup MSAL (client ID principal / Nubank) para não travar o login.
      const audienceMismatch = /audience|não autorizada|nao autorizada/i.test(msg);
      if (usedNativeSso && audienceMismatch) {
        this.logger.warn('SSO Teams com audience inválida; tentando popup MSAL', { msg });
        this.teamsContext.rememberSsoError(msg);
        const popupToken = await this.teamsContext.authenticateWithPopup();
        if (!popupToken) {
          throw new Error(
            this.teamsContext.getLastAuthError() ||
              `${msg} Abra o popup Microsoft ou republicar o app Teams com o Client ID deste tenant.`,
          );
        }
        const res = await firstValueFrom(
          this.api.post<AuthSession>(
            '/auth/login-microsoft',
            {},
            { Authorization: `Bearer ${popupToken}` },
          ),
        );
        await this.saveSession(res);
        if (options.navigate !== false) {
          this.navigateAfterLogin();
        }
        return;
      }
      throw err instanceof Error ? err : new Error(msg);
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
        await this.router.navigateByUrl(teamsPath);
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
            await this.router.navigateByUrl(teamsPath);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await this.router.navigateByUrl(returnUrl);
      return;
    }
    await this.router.navigate(['/dashboard']);
  }

  async loginMicrosoft(): Promise<void> {
    this.msalHandlingPaused = false;
    this.clearStuckMsalInteraction();
    this.clearRedirectProcessedMarker();
    // Só carrega MSAL — não chamar processRedirect aqui (pode consumir resultado em cache).
    await this.msalConfigService.load();

    if (!this.msalConfigService.hasClientId()) {
      this.notification.warning(
        'Configuração pendente',
        this.msalConfigService.getLoadError() ||
          'Cadastre um tenant Azure principal antes de usar login Microsoft.',
      );
      return;
    }

    if (await this.teamsContext.ensureInitialized()) {
      // Clique do usuário: SSO interativo do Teams; se falhar (URI/API), cai no popup.
      await this.loginMicrosoftInTeams({
        skipSilent: true,
        interactive: true,
      });
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
        // Mantém code/state na URL para retry (AuthGuard / login) se MSAL ainda não consumiu.
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
      if (!fingerprint) return;

      // Se já processou mas não há sessão (falha parcial / marker antigo), tenta de novo.
      if (this.isRedirectAlreadyProcessed(fingerprint)) {
        const existingToken = await this.storage.get('token');
        if (existingToken) return;
        this.clearRedirectProcessedMarker();
      }

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

  private getRedirectFingerprint(azureResult: AuthenticationResult): string {
    const claims = azureResult.idTokenClaims as
      | { oid?: string; sub?: string; iat?: number }
      | undefined;
    const oid = claims?.oid || claims?.sub;
    const iat = claims?.iat;
    // Por login (não por conta): evita bloquear novo login da mesma conta.
    if (oid != null && iat != null) return `${oid}:${iat}`;
    return (
      azureResult.uniqueId ||
      azureResult.idToken?.slice(0, 64) ||
      azureResult.account?.homeAccountId ||
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
      await this.navigateAfterLoginAsync();
      // Foto fora do caminho crítico (evita 401/logout no meio do login).
      if (res.user?.is_ad_user) {
        void this.attachMicrosoftPhoto(azureResult.account);
      }
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

  /** Atualiza o usuário em cache a partir da API (permissões novas sem precisar de F5). */
  async refreshCurrentUser(options?: { fallbackToCache?: boolean }): Promise<AuthUser | null> {
    const fallback = options?.fallbackToCache !== false;
    try {
      await this.ensureTokensLoaded();
      if (!this.accessTokenCache) return fallback ? this.getCurrentUser() : null;
      const res = await firstValueFrom(this.api.get<{ user: AuthUser }>('/auth/me'));
      if (res?.user) {
        await this.storage.set('currentUser', JSON.stringify(res.user));
        return res.user;
      }
    } catch {
      /* mantém o cache local se /me falhar */
    }
    return fallback ? this.getCurrentUser() : null;
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

    if (refreshToken) {
      void firstValueFrom(this.api.post('/auth/logout', { refreshToken })).catch(() => {
        /* ignora erro de logout remoto */
      });
    }

    if (isMicrosoftUser && this.msalConfigService.hasClientId()) {
      await this.clearMicrosoftSession();
    }

    // Full reload zera o cache em memória do handleRedirectPromise (evita re-login SPA).
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
      return;
    }
    await this.router.navigateByUrl(loginUrl, { replaceUrl: true });
    this.msalHandlingPaused = false;
  }

  /** Limpa contas MSAL no browser sem depender de redirect externo do Azure. */
  private async clearMicrosoftSession(): Promise<void> {
    try {
      const msal = this.msalConfigService.getInstance();
      this.clearStuckMsalInteraction();
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
