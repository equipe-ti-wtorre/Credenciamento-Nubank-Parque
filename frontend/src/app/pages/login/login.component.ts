import { AfterViewInit, Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamsContextService } from '../../services/teams-context.service';
import { rememberReturnUrl } from '../../core/guards/auth.guard';
import { GatewayAuthService } from '../../core/services/gateway-auth.service';

type LoginBusy = 'ms' | 'admin' | 'session';
type CompanyStep = 'login' | 'forgot' | 'sent' | 'reset';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
  host: {
    '[class.login-page]': 'isNubank',
  },
})
export class LoginComponent implements OnInit, AfterViewInit {
  credentials = { username: '', password: '' };
  loading = signal(false);
  msalBusy = signal(false);
  busyKind = signal<LoginBusy | null>(null);
  emailInvalid = signal(false);
  passInvalid = signal(false);
  showPassword = signal(false);
  capsOn = signal(false);
  companyStep = signal<CompanyStep>('login');
  forgotEmail = '';
  forgotMessage: string | null = null;
  resetToken = signal<string | null>(null);
  resetEmailMasked: string | null = null;
  resetInvalid = signal(false);
  newPassword = '';
  newPasswordConfirm = '';
  showNewPassword = signal(false);
  resetPassInvalid = signal(false);
  resetConfirmInvalid = signal(false);
  readonly theme = inject(ThemeService);
  readonly currentYear = new Date().getFullYear();

  showAdminLogin = false;
  msalWarning: string | null = null;
  idleMessage: string | null = null;
  teamsHint: string | null = null;
  sessionHint: string | null = null;
  authError: string | null = null;
  inTeamsUi = false;
  /** Login centralizado no navegador (fora do Teams e do app nativo). */
  gatewayEnabled = false;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passInput = viewChild<ElementRef<HTMLInputElement>>('passInput');

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private msalConfigService: MsalConfigService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
    private gateway: GatewayAuthService,
  ) {}

  get isNubank(): boolean {
    return this.theme.palette() === 'nubank-parque';
  }

  get adminTabIndex(): number {
    return this.showAdminLogin ? 0 : -1;
  }

  get msButtonBusy(): boolean {
    const kind = this.busyKind();
    return kind === 'ms' || kind === 'session' || this.msalBusy();
  }

  ngAfterViewInit(): void {
    if (!this.isNubank || typeof document === 'undefined') return;
    const root = this.host.nativeElement;
    root.querySelectorAll('.in').forEach((node: Element) => {
      node.addEventListener('animationend', (event: Event) => {
        const name = (event as AnimationEvent).animationName ?? '';
        if (name.startsWith('rise')) node.classList.remove('in');
      });
    });
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
        this.begin('ms');
        this.teamsHint = 'Concluindo autenticação Microsoft…';
        try {
          await this.msalConfigService.load();
          await this.authService.handleRedirect();
        } finally {
          this.end();
          this.teamsContext.clearAuthPopupPending();
        }
        return;
      }
      this.teamsContext.clearAuthPopupPending();
    }

    if (this.route.snapshot.queryParamMap.get('reset')) {
      await this.openResetFromQuery();
      return;
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
      this.begin('session');
      try {
        await this.msalConfigService.load();
        // Só silent automático — interativo/consent fica no botão (evita CancelledByUser)
        const ok = await this.authService.tryTeamsSsoLogin({ silent: true });
        if (ok) return;
        const detail = this.teamsContext.getLastAuthError() || ssoErr;
        if (detail && /audience|não autorizada|nao autorizada/i.test(detail)) {
          this.teamsHint =
            'SSO automático falhou: o app Teams deste tenant está com Client ID de outro Azure. ' +
            'Use o botão Entrar com Microsoft (abre popup) ou republicar o zip Nubank no admin.teams.';
        } else {
          this.teamsHint = detail
            ? `SSO automático falhou (${detail}). Use o botão Entrar com Microsoft.`
            : 'Não foi possível autenticar automaticamente. Use Entrar com Microsoft.';
        }
      } catch (err) {
        this.teamsHint = this.notification.extractErrorMessage(
          err,
          'Não foi possível autenticar automaticamente. Use Entrar com Microsoft.',
        );
      } finally {
        this.end();
      }
    } else {
      const ssoErr = this.teamsContext.consumeSsoError();
      this.teamsHint = ssoErr ? `SSO: ${ssoErr}` : null;

      this.gatewayEnabled = await this.gateway.isAvailable();
      if (this.gatewayEnabled) {
        // Após inatividade não reentra sozinho: o usuário clica em "Entrar com Microsoft".
        if (!this.idleMessage) await this.tryGatewayLogin();
        return;
      }
    }

    await this.msalConfigService.load();
    this.msalWarning = this.msalConfigService.getLoadError();
    this.msalBusy.set(true);
    try {
      await this.authService.handleRedirect();
      if (await this.authService.isLoggedIn()) {
        this.authService.navigateAfterLogin();
      }
    } finally {
      this.msalBusy.set(false);
    }
  }

  toggleAdmin(): void {
    this.showAdminLogin = !this.showAdminLogin;
    if (this.showAdminLogin) {
      setTimeout(() => this.emailInput()?.nativeElement.focus(), 300);
    }
  }

  togglePassword(): void {
    this.showPassword.update((open) => !open);
  }

  onPasswordKeyup(event: KeyboardEvent): void {
    this.capsOn.set(!!event.getModifierState?.('CapsLock'));
  }

  onAdminFieldInput(field: 'email' | 'pass'): void {
    if (field === 'email') this.emailInvalid.set(false);
    else this.passInvalid.set(false);
    this.authError = null;
  }


  openForgot(): void {
    this.forgotEmail = this.credentials.username.trim();
    this.forgotMessage = null;
    this.authError = null;
    this.emailInvalid.set(false);
    this.companyStep.set('forgot');
    this.showAdminLogin = true;
  }

  backToCompanyLogin(): void {
    this.companyStep.set('login');
    this.forgotMessage = null;
    this.authError = null;
    this.emailInvalid.set(false);
  }

  backToLogin(): void {
    this.companyStep.set('login');
    this.resetToken.set(null);
    this.resetInvalid.set(false);
    this.resetEmailMasked = null;
    this.authError = null;
    this.forgotMessage = null;
    this.newPassword = '';
    this.newPasswordConfirm = '';
    void this.router.navigate(['/login'], {
      queryParams: { reset: null },
      queryParamsHandling: 'merge',
    });
  }

  sendResetLink(): void {
    if (this.loading()) return;
    const email = this.forgotEmail.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    this.emailInvalid.set(!ok);
    if (!ok) {
      this.triggerShake();
      return;
    }
    this.authError = null;
    this.begin('admin');
    this.authService.requestPasswordReset(email).subscribe({
      next: (res) => {
        this.end();
        this.forgotMessage = res.message;
        this.companyStep.set('sent');
      },
      error: (err) => {
        this.end();
        const message = this.notification.extractErrorMessage(
          err,
          'Não foi possível enviar o e-mail de recuperação.',
        );
        if (this.isNubank) {
          this.authError = message;
          this.triggerShake();
          return;
        }
        this.notification.error(message);
      },
    });
  }

  submitNewPassword(): void {
    if (this.loading()) return;
    const token = this.resetToken();
    if (!token || this.resetInvalid()) return;
    const strong = this.passwordIsStrong(this.newPassword);
    const same = this.newPassword === this.newPasswordConfirm && this.newPasswordConfirm.length > 0;
    this.resetPassInvalid.set(!strong);
    this.resetConfirmInvalid.set(!same);
    if (!strong || !same) {
      this.triggerShake();
      return;
    }
    this.authError = null;
    this.begin('admin');
    this.authService
      .resetPassword({
        token,
        password: this.newPassword,
        password_confirm: this.newPasswordConfirm,
      })
      .subscribe({
        next: () => {
          this.end();
          this.authService.navigateAfterLogin();
        },
        error: (err) => {
          this.end();
          const message = this.notification.extractErrorMessage(
            err,
            'Não foi possível redefinir a senha.',
          );
          if (this.isNubank) {
            this.authError = message;
            this.triggerShake();
            return;
          }
          this.notification.error(message);
        },
      });
  }

  private async openResetFromQuery(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('reset') || '';
    this.companyStep.set('reset');
    this.resetToken.set(token);
    this.resetInvalid.set(false);
    this.authError = null;
    this.begin('session');
    try {
      const info = await firstValueFrom(this.authService.getPasswordReset(token));
      this.resetEmailMasked = info.reset.email_masked;
    } catch (err) {
      this.resetInvalid.set(true);
      this.authError = this.notification.extractErrorMessage(err, 'Link inválido ou expirado.');
    } finally {
      this.end();
    }
  }

  private passwordIsStrong(value: string): boolean {
    return (
      value.length >= 8 &&
      /[a-z]/.test(value) &&
      /[A-Z]/.test(value) &&
      /\d/.test(value) &&
      /[^A-Za-z0-9]/.test(value)
    );
  }

  login() {
    if (this.loading()) return;
    if (this.isNubank && !this.validateAdminForm()) return;
    this.authError = null;
    this.begin('admin');
    this.authService.loginManual(this.credentials).subscribe({
      next: () => {
        this.end();
        this.authService.navigateAfterLogin();
      },
      error: (err) => {
        this.end();
        const message = this.notification.extractErrorMessage(err, 'E-mail ou senha incorretos.');
        if (this.isNubank) {
          this.authError = message;
          this.triggerShake();
          this.passInput()?.nativeElement.select();
          return;
        }
        this.notification.error(message);
      },
    });
  }

  private async tryGatewayLogin(): Promise<void> {
    const returnedFromGateway = this.route.snapshot.queryParamMap.get('gw') === '1';
    this.sessionHint = 'Verificando sua sessão corporativa…';
    this.begin('session');
    try {
      const ok = await this.authService.loginWithGateway();
      if (!ok && returnedFromGateway) {
        this.showAuthError(
          'O login corporativo não retornou uma sessão válida. Tente novamente.',
          'Login não concluído',
        );
      }
    } catch (err) {
      if (returnedFromGateway) {
        this.showAuthError(
          this.notification.extractErrorMessage(err, 'Não foi possível entrar com a conta corporativa.'),
        );
      }
    } finally {
      this.end();
      this.sessionHint = null;
    }
  }

  async loginMicrosoft() {
    if (this.loading() || this.msalBusy()) return;
    this.authError = null;
    if (this.gatewayEnabled && !this.inTeamsUi) {
      this.begin('ms');
      try {
        const before = window.location.href;
        await this.gateway.redirectToLogin();
        if (window.location.href === before) this.end();
      } catch (err) {
        this.end();
        this.showAuthError(
          this.notification.extractErrorMessage(err, 'Não foi possível iniciar o login Microsoft.'),
        );
      }
      return;
    }
    this.begin('ms');
    try {
      await this.msalConfigService.load();
      this.msalWarning = this.msalConfigService.getLoadError();
      await this.authService.loginMicrosoft();
    } catch (err) {
      this.showAuthError(
        this.notification.extractErrorMessage(err, 'Não foi possível iniciar o login Microsoft.'),
      );
    } finally {
      this.end();
    }
  }

  private begin(kind: LoginBusy): void {
    this.busyKind.set(kind);
    this.loading.set(true);
  }

  private end(): void {
    this.busyKind.set(null);
    this.loading.set(false);
  }

  private validateAdminForm(): boolean {
    const value = this.credentials.username.trim();
    const emailLike = value.includes('@');
    const okUser =
      value.length > 0 && (!emailLike || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    const okPass = this.credentials.password.length > 0;
    this.emailInvalid.set(!okUser);
    this.passInvalid.set(!okPass);
    if (okUser && okPass) return true;
    this.triggerShake();
    if (!okUser) this.emailInput()?.nativeElement.focus();
    else this.passInput()?.nativeElement.focus();
    return false;
  }

  private showAuthError(message: string, title?: string): void {
    const text = title ? `${title}. ${message}` : message;
    if (this.isNubank) {
      this.authError = text;
      return;
    }
    if (title) this.notification.error(title, message);
    else this.notification.error(message);
  }

  private triggerShake(): void {
    const el = this.card()?.nativeElement;
    if (!el) return;
    el.classList.remove('in', 'shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }
}
