import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AuthenticationResult,
  PublicClientApplication,
  BrowserCacheLocation,
  LogLevel,
} from '@azure/msal-browser';
import { MsalConfigService } from '../../services/msal-config.service';
import { TeamsContextService } from '../../services/teams-context.service';
import {
  getMsalAuthority,
  getMsalClientId,
} from '../../config/msal-runtime.config';

/**
 * Rota pública `/auth/teams` — sem AuthGuard / sem sessão Credenciamento.
 * Aberta pelo popup do Teams; redirect MSAL volta para a mesma URL
 * (cadastrar no Azure SPA: https://cred.allianzparque.intra/auth/teams).
 */
@Component({
  selector: 'app-teams-login-popup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
      <div class="text-center space-y-3 max-w-sm">
        <p class="text-lg font-medium">Autenticando no Microsoft 365…</p>
        <p *ngIf="error" class="text-sm text-amber-300">{{ error }}</p>
        <p *ngIf="!error" class="text-sm text-slate-400">Não feche esta janela.</p>
      </div>
    </div>
  `,
})
export class TeamsLoginPopupComponent implements OnInit {
  error: string | null = null;

  constructor(
    private msalConfig: MsalConfigService,
    private teamsContext: TeamsContextService,
  ) {}

  async ngOnInit() {
    try {
      this.teamsContext.markAuthPopupPending();
      await this.teamsContext.ensureInitialized();
      await this.msalConfig.load();
      if (!this.msalConfig.hasClientId()) {
        throw new Error(this.msalConfig.getLoadError() || 'MSAL não configurado.');
      }

      const redirectUri = TeamsContextService.teamsAuthRedirectUri();
      // Instância dedicada com SessionStorage: start e retorno ficam nesta mesma rota.
      const msal = new PublicClientApplication({
        auth: {
          clientId: getMsalClientId(),
          authority: getMsalAuthority(),
          redirectUri,
          postLogoutRedirectUri: redirectUri,
        },
        cache: {
          cacheLocation: BrowserCacheLocation.SessionStorage,
        },
        system: {
          loggerOptions: {
            loggerCallback: () => {},
            logLevel: LogLevel.Error,
          },
        },
      });
      await msal.initialize();

      const redirected = await msal.handleRedirectPromise();
      if (redirected?.idToken || redirected?.accessToken) {
        this.finish(redirected);
        return;
      }

      const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
      if (account) {
        try {
          const silent = await msal.acquireTokenSilent({
            account,
            scopes: ['openid', 'profile', 'User.Read'],
            redirectUri,
          });
          this.finish(silent);
          return;
        } catch {
          /* interactive */
        }
      }

      this.clearMsalInteractionKeys();
      await msal.loginRedirect({
        scopes: ['openid', 'profile', 'User.Read'],
        prompt: 'select_account',
        redirectUri,
      });
    } catch (err: unknown) {
      this.teamsContext.clearAuthPopupPending();
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Falha no login Microsoft.';
      this.error = msg;
      try {
        this.teamsContext.notifyFailure(msg);
      } catch {
        /* ignore */
      }
    }
  }

  private finish(result: AuthenticationResult) {
    const token = result.idToken || result.accessToken;
    if (!token) {
      throw new Error('Token Microsoft vazio.');
    }
    this.teamsContext.clearAuthPopupPending();
    this.teamsContext.notifySuccess(token);
  }

  private clearMsalInteractionKeys() {
    if (typeof sessionStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (
        key.includes('interaction.status') ||
        key.includes('request.params') ||
        key.includes('request.state') ||
        key.includes('request.nonce') ||
        key.includes('request.origin')
      ) {
        keys.push(key);
      }
    }
    for (const key of keys) sessionStorage.removeItem(key);
  }
}
