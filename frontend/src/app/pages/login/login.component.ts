import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamsContextService } from '../../services/teams-context.service';
import { rememberReturnUrl } from '../../core/guards/auth.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './login.component.scss',
  template: `
    @if (isNubank) {
      <div class="login-nubank">
        <div class="login-nubank__brand">
          Nubank Parque
          <span class="login-nubank__underline" aria-hidden="true"></span>
        </div>
        <h2 class="login-nubank__title">Credenciamento</h2>
        <p class="login-nubank__sub">Entre com sua conta corporativa para acessar o sistema.</p>

        <p *ngIf="idleMessage" class="login-nubank__msg login-nubank__msg--warn">{{ idleMessage }}</p>
        <p *ngIf="teamsHint" class="login-nubank__msg login-nubank__msg--info">{{ teamsHint }}</p>
        <p *ngIf="msalWarning" class="login-nubank__msg login-nubank__msg--warn">{{ msalWarning }}</p>

        <ng-container *ngIf="showAdminLogin">
          <form class="login-nubank__form" (ngSubmit)="login()">
            <div>
              <label class="login-nubank__label">E-mail</label>
              <input
                type="text"
                required
                [(ngModel)]="credentials.username"
                name="username"
                [disabled]="loading"
                placeholder="admin@exemplo.com"
                class="login-nubank__input"
              />
            </div>
            <div>
              <label class="login-nubank__label">Senha</label>
              <input
                type="password"
                required
                [(ngModel)]="credentials.password"
                name="password"
                [disabled]="loading"
                class="login-nubank__input"
              />
            </div>
            <button type="submit" [disabled]="loading" class="login-nubank__submit">
              {{ loading ? 'Processando...' : 'Entrar' }}
            </button>
          </form>
        </ng-container>

        <button
          type="button"
          (click)="loginMicrosoft()"
          [disabled]="loading || msalBusy"
          class="login-nubank__ms"
        >
          <span class="login-nubank__chip" aria-hidden="true">
            <svg viewBox="0 0 23 23" width="16" height="16">
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#7fba00" d="M12 1h10v10H12z" />
              <path fill="#00a4ef" d="M1 12h10v10H1z" />
              <path fill="#ffb900" d="M12 12h10v10H12z" />
            </svg>
          </span>
          <span>{{ inTeamsUi ? 'Entrar com Microsoft (Teams)' : 'Entrar com Microsoft' }}</span>
        </button>

        <div class="login-nubank__divider">ou</div>

        <div class="login-nubank__alt">
          <button type="button" class="login-nubank__alt-btn" (click)="showAdminLogin = !showAdminLogin">
            {{ showAdminLogin ? 'Ocultar login admin' : 'Login sem Microsoft' }}
          </button>
        </div>

        <div class="login-nubank__secure">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Ambiente seguro &middot; acesso corporativo
        </div>
      </div>
    } @else {
      <div class="w-full max-w-[380px] mx-auto space-y-8">
        <div class="flex flex-col items-center">
          <img
            [src]="theme.logoFullSrc()"
            [alt]="theme.logoAlt()"
            class="w-auto object-contain"
            style="height: 52px; max-width: 260px"
          />
          <div
            class="mt-2 w-28 h-0.5 rounded-full"
            style="background: var(--brand)"
            aria-hidden="true"
          ></div>
        </div>
        <h2 class="text-xl font-medium text-white text-center">Credenciamento</h2>
        <p *ngIf="idleMessage" class="text-amber-300 text-sm text-center px-2">{{ idleMessage }}</p>
        <p *ngIf="teamsHint" class="text-sky-300 text-sm text-center px-2">{{ teamsHint }}</p>
        <p *ngIf="msalWarning" class="text-amber-300 text-xs text-center px-2">{{ msalWarning }}</p>

        <ng-container *ngIf="showAdminLogin">
          <form class="space-y-5" (ngSubmit)="login()">
            <div>
              <label class="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5"
                >E-MAIL</label
              >
              <input
                type="text"
                required
                [(ngModel)]="credentials.username"
                name="username"
                [disabled]="loading"
                placeholder="admin@exemplo.com"
                class="block w-full rounded-lg border-0 bg-gray-700/80 px-4 py-3 text-gray-200"
              />
            </div>
            <div>
              <label class="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5"
                >SENHA</label
              >
              <input
                type="password"
                required
                [(ngModel)]="credentials.password"
                name="password"
                [disabled]="loading"
                class="block w-full rounded-lg border-0 bg-gray-700/80 px-4 py-3 text-gray-200"
              />
            </div>
            <button
              type="submit"
              [disabled]="loading"
              class="w-full py-3 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {{ loading ? 'Processando...' : 'Entrar' }}
            </button>
          </form>
        </ng-container>

        <button
          type="button"
          (click)="loginMicrosoft()"
          [disabled]="loading || msalBusy"
          class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-gray-600 bg-gray-700/60 text-white hover:bg-gray-600 disabled:opacity-50"
        >
          <img
            src="https://learn.microsoft.com/en-us/azure/active-directory/develop/media/howto-add-branding-in-azure-ad-apps/ms-symbollockup_mssymbol_19.png"
            alt="Microsoft"
            class="h-5 w-5"
          />
          <span>{{ inTeamsUi ? 'Entrar com Microsoft (Teams)' : 'Entrar com Microsoft' }}</span>
        </button>

        <div class="text-center">
          <button
            type="button"
            (click)="showAdminLogin = !showAdminLogin"
            class="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            {{ showAdminLogin ? 'Ocultar login admin' : 'Login sem Microsoft' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class LoginComponent implements OnInit {
  credentials = { username: '', password: '' };
  loading = false;
  msalBusy = false;
  readonly theme = inject(ThemeService);

  showAdminLogin = false;
  msalWarning: string | null = null;
  idleMessage: string | null = null;
  teamsHint: string | null = null;
  inTeamsUi = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private msalConfigService: MsalConfigService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
  ) {}

  get isNubank(): boolean {
    return this.theme.palette() === 'nubank-parque';
  }

  async ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'idle') {
      this.idleMessage = 'Sua sessão expirou por inatividade. Faça login novamente.';
    }

    // Flag residual do popup Teams (não confundir com login web).
    if (this.teamsContext.isAuthPopupPending()) {
      const hasAzureReturn =
        typeof window !== 'undefined' &&
        /(?:^|[?#&])(code|id_token|error)=/i.test(
          `${window.location.search}${window.location.hash}`,
        );
      const inTeams = await this.teamsContext.ensureInitialized();
      if (hasAzureReturn && inTeams) {
        this.loading = true;
        this.teamsHint = 'Concluindo autenticação Microsoft…';
        try {
          await this.msalConfigService.load();
          await this.authService.handleRedirect();
        } finally {
          this.loading = false;
          this.teamsContext.clearAuthPopupPending();
        }
        return;
      }
      this.teamsContext.clearAuthPopupPending();
    }

    if (await this.authService.isLoggedIn()) {
      this.authService.navigateAfterLogin();
      return;
    }

    const returnUrlParam = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrlParam?.startsWith('/')) {
      rememberReturnUrl(returnUrlParam);
    }

    const inTeams = await this.teamsContext.ensureInitialized();
    this.inTeamsUi = inTeams;
    if (inTeams) {
      const deep = await this.teamsContext.getDeepLinkPath();
      if (deep) rememberReturnUrl(deep);

      const ssoErr = this.teamsContext.consumeSsoError();
      if (ssoErr) {
        this.teamsHint = `SSO automático: ${ssoErr}. Use o botão Entrar com Microsoft.`;
      } else {
        this.teamsHint = 'Abrindo com sua conta Microsoft do Teams…';
      }
      this.loading = true;
      try {
        await this.msalConfigService.load();
        // Só silent automático — interativo/consent fica no botão (evita CancelledByUser)
        const ok = await this.authService.tryTeamsSsoLogin({ silent: true });
        if (ok) return;
        const detail = this.teamsContext.getLastAuthError() || ssoErr;
        this.teamsHint = detail
          ? `SSO automático falhou (${detail}). Use o botão Entrar com Microsoft.`
          : 'Não foi possível autenticar automaticamente. Use Entrar com Microsoft.';
      } catch (err) {
        this.teamsHint = this.notification.extractErrorMessage(
          err,
          'Não foi possível autenticar automaticamente. Use Entrar com Microsoft.',
        );
      } finally {
        this.loading = false;
      }
    } else {
      const ssoErr = this.teamsContext.consumeSsoError();
      this.teamsHint = ssoErr ? `SSO: ${ssoErr}` : null;
    }

    await this.msalConfigService.load();
    this.msalWarning = this.msalConfigService.getLoadError();
    this.msalBusy = true;
    await this.authService.handleRedirect();
    this.msalBusy = false;
  }

  login() {
    this.loading = true;
    this.authService.loginManual(this.credentials).subscribe({
      next: () => {
        this.loading = false;
        this.authService.navigateAfterLogin();
      },
      error: (err) => {
        this.loading = false;
        this.notification.error(
          this.notification.extractErrorMessage(err, 'Falha na autenticação'),
        );
      },
    });
  }

  async loginMicrosoft() {
    if (this.loading || this.msalBusy) return;
    this.loading = true;
    try {
      await this.msalConfigService.load();
      this.msalWarning = this.msalConfigService.getLoadError();
      await this.authService.loginMicrosoft();
    } catch (err) {
      this.notification.error(
        this.notification.extractErrorMessage(err, 'Não foi possível iniciar o login Microsoft.'),
      );
    } finally {
      this.loading = false;
    }
  }
}
