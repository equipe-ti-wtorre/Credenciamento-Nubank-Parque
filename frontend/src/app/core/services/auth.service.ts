import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, tap } from 'rxjs';
import { BrowserAuthError, IPublicClientApplication } from '@azure/msal-browser';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { StorageService } from './storage.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { LoggerService } from './logger.service';

export interface AuthSession {
  auth?: boolean;
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  user?: {
    id: number;
    username: string;
    nome_completo: string;
    email: string;
    role: string;
    perfil?: string;
    is_ad_user: boolean;
  };
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
  private msalHandlingPaused = false;

  private static readonly MSAL_INTERACTION_KEY = 'msal.interaction.status';
  private static readonly MSAL_REDIRECT_PROCESSED_KEY = 'msal.redirect.processed';

  constructor(
    private api: ApiService,
    private storage: StorageService,
    private router: Router,
    private msalConfigService: MsalConfigService,
    private logger: LoggerService,
    private notification: NotificationService,
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
  }

  loginManual(credentials: { username: string; password: string }) {
    return this.api.post<AuthSession>('/auth/login', credentials).pipe(
      tap((response) => {
        void this.saveSession(response);
      }),
    );
  }

  async loginMicrosoft(): Promise<void> {
    this.msalHandlingPaused = false;
    await this.ensureMsalReady();

    if (!this.msalConfigService.hasClientId()) {
      this.notification.warning(
        'Configuração pendente',
        this.msalConfigService.getLoadError() ||
          'Cadastre um tenant Azure principal antes de usar login Microsoft.',
      );
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

      const fingerprint = this.getRedirectFingerprint(result);
      if (!fingerprint || this.isRedirectAlreadyProcessed(fingerprint)) return;

      if (this.backendValidationInFlight) {
        await this.backendValidationInFlight;
        return;
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
    azureResult: { idToken?: string; accessToken?: string },
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
      this.router.navigate(['/dashboard']);
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

  async getCurrentUser() {
    const u = await this.storage.get('currentUser');
    return u ? JSON.parse(u) : null;
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

  logout(): Promise<void> {
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
    await this.storage.remove('token');
    await this.storage.remove('refreshToken');
    await this.storage.remove('currentUser');
    this.clearRedirectProcessedMarker();
    this.clearStuckMsalInteraction();

    await this.router.navigateByUrl('/login', { replaceUrl: true });

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
      await msal.handleRedirectPromise();
      await msal.loginRedirect(request);
    }
  }

  private clearStuckMsalInteraction(): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(AuthService.MSAL_INTERACTION_KEY);
  }

  private isInteractionInProgressError(error: unknown): boolean {
    return (
      error instanceof BrowserAuthError &&
      error.errorCode === 'interaction_in_progress'
    );
  }
}
