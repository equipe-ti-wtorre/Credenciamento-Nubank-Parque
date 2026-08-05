import { Injectable } from '@angular/core';
import * as microsoftTeams from '@microsoft/teams-js';
import { getMsalClientId } from '../config/msal-runtime.config';

@Injectable({ providedIn: 'root' })
export class TeamsContextService {
  private initPromise: Promise<boolean> | null = null;
  private inTeams = false;
  private lastAuthError: string | null = null;
  private lastContext: microsoftTeams.app.Context | null = null;

  /** Página estática pública (sem Angular) — evita CancelledByUser por bootstrap lento. */
  static readonly AUTH_PATH = '/auth/teams.html';
  static readonly AUTH_POPUP_FLAG = 'teams.auth.popup';
  static readonly SSO_ERROR_KEY = 'teams.sso.lastError';
  static readonly PENDING_DEEP_LINK_KEY = 'teams.pendingDeepLink';

  /** URI do popup Teams (cadastrar no Azure SPA). */
  static teamsAuthRedirectUri(): string {
    return `${window.location.origin}${TeamsContextService.AUTH_PATH}`;
  }

  async ensureInitialized(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initializeWithRetry();
    return this.initPromise;
  }

  private deepLinkWatchStarted = false;
  private deepLinkListeners = new Set<(path: string) => void>();

  private async initializeWithRetry(): Promise<boolean> {
    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      try {
        await microsoftTeams.app.initialize();
        const context = await microsoftTeams.app.getContext();
        if (context) {
          this.lastContext = context;
          this.inTeams = true;
          try {
            microsoftTeams.app.notifySuccess();
          } catch {
            /* ignore */
          }
          return true;
        }
      } catch (err) {
        this.lastAuthError = this.errMessage(err, 'Teams app.initialize falhou');
      }
      await this.delay(150 * (i + 1));
      // próxima tentativa: zera promise parcial só no loop interno
    }
    this.inTeams = false;
    return false;
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  isInTeams(): boolean {
    return this.inTeams;
  }

  getContextSnapshot(): microsoftTeams.app.Context | null {
    return this.lastContext;
  }

  /**
   * Path do SPA vindo do deep link Teams (sino / Adaptive Card).
   * Ex.: /aprovacoes/12 via context.page.subPageId (subEntityId).
   */
  async getDeepLinkPath(): Promise<string | null> {
    const ok = await this.ensureInitialized();
    if (!ok) return null;
    try {
      const context = await microsoftTeams.app.getContext();
      this.lastContext = context;
      const fromCtx = this.extractPathFromContext(context);
      if (fromCtx) return fromCtx;
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      const loc = `${window.location.pathname}${window.location.search}`;
      if (/^\/aprovacoes(\/\d+|\?id=)/.test(loc) || /^\/acessos-servico\/\d+/.test(loc)) {
        return loc;
      }
    }
    return null;
  }

  /**
   * Escuta mudanças de contexto (clique no sino com o app já aberto) e notifica listeners.
   * Também revalida ao voltar o foco/visibilidade da aba.
   */
  async startDeepLinkWatch(onPath: (path: string) => void): Promise<() => void> {
    this.deepLinkListeners.add(onPath);
    const ok = await this.ensureInitialized();

    const emitPath = (path: string | null | undefined) => {
      const normalized = path ? this.normalizeDeepLinkPath(path) : null;
      if (!normalized) return;
      try {
        sessionStorage.setItem(TeamsContextService.PENDING_DEEP_LINK_KEY, normalized);
      } catch {
        /* ignore */
      }
      for (const listener of this.deepLinkListeners) {
        try {
          listener(normalized);
        } catch {
          /* ignore */
        }
      }
    };

    const emitFromContext = (context: microsoftTeams.app.Context | null | undefined) => {
      if (context) this.lastContext = context;
      emitPath(this.extractPathFromContext(context || this.lastContext));
    };

    // Path já na barra de endereço (webUrl https do Graph) ou pendente do boot
    if (typeof window !== 'undefined') {
      const loc = `${window.location.pathname}${window.location.search}`;
      if (/^\/(aprovacoes|acessos-servico)(\/|\?)/.test(loc)) {
        emitPath(loc);
      }
      try {
        const pending = sessionStorage.getItem(TeamsContextService.PENDING_DEEP_LINK_KEY);
        if (pending) emitPath(pending);
      } catch {
        /* ignore */
      }
    }

    if (ok && !this.deepLinkWatchStarted) {
      this.deepLinkWatchStarted = true;
      try {
        emitFromContext(this.lastContext);
      } catch {
        /* ignore */
      }

      try {
        microsoftTeams.app.registerOnContextChangeHandler((context) => {
          emitFromContext(context);
        });
      } catch {
        /* ignore */
      }

      const refresh = () => {
        void microsoftTeams.app
          .getContext()
          .then((ctx) => emitFromContext(ctx))
          .catch(() => undefined);
      };
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') refresh();
        });
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', refresh);
      }

      // Alguns clientes Teams só injetam subPageId alguns ms após o load
      void (async () => {
        for (let i = 0; i < 12; i++) {
          await this.delay(350);
          try {
            const ctx = await microsoftTeams.app.getContext();
            emitFromContext(ctx);
            if (this.extractPathFromContext(ctx)) break;
          } catch {
            /* ignore */
          }
        }
      })();
    } else if (ok) {
      const path = await this.getDeepLinkPath();
      if (path) onPath(path);
    }

    return () => {
      this.deepLinkListeners.delete(onPath);
    };
  }

  private extractPathFromContext(
    context: microsoftTeams.app.Context | null | undefined,
  ): string | null {
    if (!context) return null;
    const page = context.page as
      | { subPageId?: string; subEntityId?: string }
      | undefined;
    const candidates = [
      page?.subPageId,
      page?.subEntityId,
      (context as { subEntityId?: string }).subEntityId,
    ];
    for (const raw of candidates) {
      const path = this.normalizeDeepLinkPath(raw);
      if (path) return path;
    }
    return null;
  }

  private normalizeDeepLinkPath(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value) return null;
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    value = value.trim();
    if (/^https?:\/\//i.test(value)) {
      try {
        const u = new URL(value);
        value = `${u.pathname}${u.search}`;
      } catch {
        return null;
      }
    }
    // Teams às vezes envia sem barra inicial
    if (/^(aprovacoes|acessos-servico|admin)\b/i.test(value)) {
      value = `/${value}`;
    }
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (value.startsWith('/login') || value.startsWith('/auth/')) return null;
    return value;
  }

  getLastAuthError(): string | null {
    return this.lastAuthError;
  }

  rememberSsoError(message: string | null) {
    try {
      if (message) sessionStorage.setItem(TeamsContextService.SSO_ERROR_KEY, message);
      else sessionStorage.removeItem(TeamsContextService.SSO_ERROR_KEY);
    } catch {
      /* ignore */
    }
  }

  consumeSsoError(): string | null {
    try {
      const msg = sessionStorage.getItem(TeamsContextService.SSO_ERROR_KEY);
      sessionStorage.removeItem(TeamsContextService.SSO_ERROR_KEY);
      return msg;
    } catch {
      return null;
    }
  }

  markAuthPopupPending(): void {
    try {
      sessionStorage.setItem(TeamsContextService.AUTH_POPUP_FLAG, '1');
    } catch {
      /* ignore */
    }
  }

  isAuthPopupPending(): boolean {
    try {
      return sessionStorage.getItem(TeamsContextService.AUTH_POPUP_FLAG) === '1';
    } catch {
      return false;
    }
  }

  clearAuthPopupPending(): void {
    try {
      sessionStorage.removeItem(TeamsContextService.AUTH_POPUP_FLAG);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(TeamsContextService.AUTH_POPUP_FLAG);
    } catch {
      /* ignore */
    }
  }

  private ssoResources(): string[] {
    const clientId = getMsalClientId();
    const host =
      typeof window !== 'undefined' ? window.location.hostname : 'cred.nbpdev.com.br';
    const resources = new Set<string>();
    // Ordem: Application ID URI do manifest (prioridade Teams)
    resources.add(`api://${host}/${clientId || '90ac8301-8401-4287-9e69-287a4cdcbc2b'}`);
    resources.add('api://cred.nbpdev.com.br/90ac8301-8401-4287-9e69-287a4cdcbc2b');
    if (clientId && clientId !== '00000000-0000-0000-0000-000000000000') {
      resources.add(`api://${clientId}`);
      resources.add(clientId);
    }
    resources.add('api://90ac8301-8401-4287-9e69-287a4cdcbc2b');
    resources.add('90ac8301-8401-4287-9e69-287a4cdcbc2b');
    return [...resources];
  }

  /**
   * Token Azure AD do Teams (SSO).
   * silent=true: sem UI; silent=false: permite consentimento no Teams.
   * Tenta: resource do manifest → lista de resources.
   */
  async getAuthToken(options: { silent?: boolean } = {}): Promise<string | null> {
    this.lastAuthError = null;
    const ok = await this.ensureInitialized();
    if (!ok) {
      this.lastAuthError = 'Fora do Microsoft Teams (app.initialize).';
      return null;
    }

    const silent = options.silent === true;
    const resourceList = this.ssoResources();

    // 1) Resource explícito do manifest (mais confiável que “sem resources”)
    for (const resources of [
      [resourceList[0]],
      resourceList,
      undefined as string[] | undefined,
    ]) {
      try {
        const params: microsoftTeams.authentication.AuthTokenRequestParameters = { silent };
        if (resources) params.resources = resources;
        const token = await microsoftTeams.authentication.getAuthToken(params);
        if (token) {
          this.lastAuthError = null;
          return token;
        }
      } catch (err: unknown) {
        this.lastAuthError = this.errMessage(err, 'getAuthToken falhou');
      }
    }
    return null;
  }

  async authenticateWithPopup(popupPath = TeamsContextService.AUTH_PATH): Promise<string | null> {
    this.lastAuthError = null;
    const ok = await this.ensureInitialized();
    if (!ok) return null;

    let loginHint = '';
    try {
      const context = this.lastContext || (await microsoftTeams.app.getContext());
      loginHint =
        context?.user?.loginHint || context?.user?.userPrincipalName || '';
    } catch {
      /* ignore */
    }

    const qs = new URLSearchParams({ v: '20260715h' });
    if (loginHint) qs.set('login_hint', loginHint);
    const url = `${window.location.origin}${popupPath}?${qs.toString()}`;

    try {
      // Pequena pausa após SSO silent falhar (evita CancelledByUser no desktop)
      await this.delay(350);
      const result = await microsoftTeams.authentication.authenticate({
        url,
        width: 600,
        height: 720,
      });
      return typeof result === 'string' && result ? result : null;
    } catch (err: unknown) {
      this.lastAuthError = this.errMessage(err, 'authenticate falhou');
      return null;
    }
  }

  notifySuccess(token: string): void {
    microsoftTeams.authentication.notifySuccess(token);
  }

  notifyFailure(reason: string): void {
    microsoftTeams.authentication.notifyFailure(reason);
  }

  private errMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message?: string }).message || fallback);
    }
    return String(err ?? fallback);
  }
}
