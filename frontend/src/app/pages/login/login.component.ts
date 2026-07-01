import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full max-w-[380px] mx-auto space-y-8">
      <div class="flex flex-col items-center">
        <img src="assets/logo.svg" alt="Logo" class="h-10 w-auto object-contain" style="height: 45px" />
        <div class="mt-2 w-28 h-0.5 bg-blue-500 rounded-full" aria-hidden="true"></div>
      </div>
      <h2 class="text-xl font-medium text-white text-center">Credenciamento</h2>
      <p *ngIf="idleMessage" class="text-amber-300 text-sm text-center px-2">{{ idleMessage }}</p>
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
        <span>Entrar com Microsoft</span>
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
  `,
})
export class LoginComponent implements OnInit {
  credentials = { username: '', password: '' };
  loading = false;
  msalBusy = false;
  showAdminLogin = false;
  msalWarning: string | null = null;
  idleMessage: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private msalConfigService: MsalConfigService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'idle') {
      this.idleMessage = 'Sua sessão expirou por inatividade. Faça login novamente.';
    }
    if (await this.authService.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
      return;
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
        this.router.navigate(['/dashboard']);
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
