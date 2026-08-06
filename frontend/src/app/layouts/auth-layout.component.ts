import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../core/services/theme.service';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  styleUrl: './auth-layout.component.scss',
  template: `
    @if (isNubank) {
      <div class="auth-nubank">
        <section class="auth-nubank__hero">
          <div class="auth-nubank__bars" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 225 648" preserveAspectRatio="none">
              <rect x="0" y="0" width="90" height="216" fill="#c9e2bf" />
              <rect x="0" y="432" width="90" height="216" fill="#c9e2bf" />
              <rect x="92" y="216" width="39" height="216" fill="#c9e2bf" />
              <rect x="133" y="0" width="26" height="216" fill="#c9e2bf" />
              <rect x="133" y="432" width="26" height="216" fill="#c9e2bf" />
              <rect x="161" y="216" width="27" height="216" fill="#c9e2bf" />
              <rect x="190" y="0" width="12" height="216" fill="#c9e2bf" />
              <rect x="190" y="432" width="12" height="216" fill="#c9e2bf" />
              <rect x="204" y="216" width="12" height="216" fill="#c9e2bf" />
              <rect x="218" y="0" width="7" height="216" fill="#c9e2bf" />
              <rect x="218" y="432" width="7" height="216" fill="#c9e2bf" />
            </svg>
          </div>
          <div class="auth-nubank__wm">Nubank Parque</div>
          <div class="auth-nubank__mid">
            <h1>Credenciamento</h1>
            <p>
              Eventos, colaboradores e empresas parceiras — acesso controlado em um so lugar, do
              portao a arquibancada.
            </p>
          </div>
          <div class="auth-nubank__tagline">
            <span class="auth-nubank__dot"></span>Viver o momento.
          </div>
        </section>
        <section class="auth-nubank__panel">
          <div class="auth-nubank__outlet">
            <router-outlet></router-outlet>
          </div>
          <div class="auth-nubank__foot">
            &copy; {{ currentYear }} &middot; Credenciamento Nubank Parque
          </div>
        </section>
      </div>
    } @else {
      <div class="min-h-screen w-full flex overflow-hidden">
        <div
          class="hidden lg:flex lg:min-h-screen lg:w-[58%] relative overflow-hidden bg-cover bg-center bg-no-repeat"
          [style.background-image]="loginBg"
          aria-hidden="true"
        ></div>
        <div
          class="flex-1 min-h-screen flex flex-col bg-gradient-to-b from-[#0f172a] via-[#13203a] to-[#1e3a8a] text-slate-100"
        >
          <main class="flex-1 flex items-center justify-center p-4 sm:p-6">
            <div class="w-full max-w-md text-center">
              <router-outlet></router-outlet>
            </div>
          </main>
          <footer class="py-4 text-center text-slate-300 text-xs px-4">
            &copy; {{ currentYear }} Credenciamento
          </footer>
        </div>
      </div>
    }
  `,
})
export class AuthLayoutComponent {
  readonly theme = inject(ThemeService);
  readonly currentYear = new Date().getFullYear();
  readonly loginSrc = 'assets/login.png';

  get isNubank(): boolean {
    return this.theme.palette() === 'nubank-parque';
  }

  get loginBg(): string {
    return `url('${this.loginSrc}')`;
  }
}
