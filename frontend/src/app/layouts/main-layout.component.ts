import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen bg-[var(--app-bg)] text-[var(--app-text)] overflow-hidden">
      <aside
        class="w-64 bg-[var(--color-bg-surface)] border-r border-[var(--app-border)] flex flex-col shadow-sm shrink-0"
      >
        <div class="h-16 flex items-center justify-center border-b border-[var(--app-border)]">
          <img src="assets/wtorre.svg" alt="WTorre" class="h-5 w-auto object-contain" />
        </div>
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-[var(--app-nav-active-bg)] text-[var(--app-nav-active-text)]"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--app-nav-hover-bg)]"
          >
            Início
          </a>
          <div *ngIf="isAdmin" class="pt-4">
            <p class="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)] mb-2">
              Administração
            </p>
            <a
              routerLink="/admin/tenants"
              routerLinkActive="bg-[var(--app-nav-active-bg)] text-[var(--app-nav-active-text)]"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--app-nav-hover-bg)]"
            >
              Tenants Azure
            </a>
          </div>
        </nav>
        <div class="p-3 border-t border-[var(--app-border)]">
          <p class="text-xs text-[var(--app-text-muted)] truncate px-2 mb-2">{{ userName }}</p>
          <button
            type="button"
            (click)="logout()"
            [disabled]="loggingOut"
            class="w-full text-sm py-2 rounded-lg border border-[var(--app-border)] hover:bg-[var(--app-nav-hover-bg)] disabled:opacity-50"
          >
            {{ loggingOut ? 'Saindo...' : 'Sair' }}
          </button>
        </div>
      </aside>
      <main class="flex-1 overflow-auto p-6">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
})
export class MainLayoutComponent implements OnInit {
  userName = '';
  isAdmin = false;
  loggingOut = false;

  constructor(private authService: AuthService) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.userName = user?.nome_completo || user?.email || 'Usuário';
    this.isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
  }

  async logout() {
    if (this.loggingOut) return;
    this.loggingOut = true;
    try {
      await this.authService.logout();
    } finally {
      this.loggingOut = false;
    }
  }
}
