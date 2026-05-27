import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { SessionIdleService } from '../core/services/session-idle.service';
import { StorageService } from '../core/services/storage.service';
import { ADMIN_MENU_ITEMS, AdminMenuItem } from '../config/admin-menu.config';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <aside
        class="sidebar-root relative z-30 bg-[var(--color-bg-surface)] border-r border-[var(--app-border)] flex flex-col shadow-sm shrink-0 transition-[width] duration-200"
        [class.w-72]="!sidebarCollapsed"
        [class.w-[4.5rem]]="sidebarCollapsed"
      >
        <!-- Logo empresa -->
        <div class="sidebar-logo-header shrink-0 border-b border-[var(--app-border)]">
          <div
            class="flex items-center bg-slate-900"
            [class.h-[4.25rem]]="!sidebarCollapsed"
            [class.h-14]="sidebarCollapsed"
            [class.px-4]="!sidebarCollapsed"
            [class.px-2]="sidebarCollapsed"
            [class.justify-between]="!sidebarCollapsed"
            [class.justify-center]="sidebarCollapsed"
            [class.gap-2]="!sidebarCollapsed"
          >
            <a routerLink="/dashboard" class="flex items-center min-w-0 shrink" [title]="'WTorre — Início'">
              <img
                [src]="sidebarCollapsed ? 'assets/wt-logo.png' : 'assets/wtorre.svg'"
                alt="WTorre"
                class="sidebar-logo-img object-contain transition-all duration-200"
                [class.object-left]="!sidebarCollapsed"
                [class.object-center]="sidebarCollapsed"
                [class.h-7]="!sidebarCollapsed"
                [class.h-6]="sidebarCollapsed"
                [class.w-auto]="true"
                [class.max-w-[11rem]]="!sidebarCollapsed"
                [class.max-w-[2.5rem]]="sidebarCollapsed"
              />
            </a>
            <button
              *ngIf="!sidebarCollapsed"
              type="button"
              (click)="toggleSidebar()"
              class="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              title="Recolher menu"
              aria-label="Recolher menu"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div *ngIf="sidebarCollapsed" class="flex justify-center py-1 border-b border-[var(--app-border)]">
          <button
            type="button"
            (click)="toggleSidebar()"
            class="p-1.5 rounded-lg hover:bg-[var(--app-nav-hover-bg)] text-[var(--app-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            title="Expandir menu"
            aria-label="Expandir menu"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Usuário logado -->
        <div
          class="border-b border-[var(--app-border)] flex items-center gap-3 shrink-0"
          [class.p-4]="!sidebarCollapsed"
          [class.p-2]="sidebarCollapsed"
          [class.justify-center]="sidebarCollapsed"
          [title]="sidebarCollapsed ? userName : ''"
        >
          <img
            *ngIf="userPhotoUrl"
            [src]="userPhotoUrl"
            alt=""
            (error)="onPhotoError()"
            class="w-10 h-10 rounded-full object-cover shrink-0 border border-[var(--app-border)]"
          />
          <div
            *ngIf="!userPhotoUrl"
            class="w-10 h-10 rounded-full bg-[var(--app-nav-active-bg)] text-[var(--app-nav-active-text)] flex items-center justify-center text-sm font-bold shrink-0"
            aria-hidden="true"
          >
            {{ userInitials }}
          </div>
          <div *ngIf="!sidebarCollapsed" class="min-w-0 flex-1">
            <button
              type="button"
              disabled
              title="Perfil em breve"
              class="block w-full text-left text-sm font-semibold truncate text-[var(--app-text)] opacity-60 cursor-not-allowed"
            >
              {{ userName }}
            </button>
            <span class="text-[10px] text-[var(--app-text-muted)]">Perfil em breve</span>
          </div>
        </div>

        <nav class="flex-1 min-h-0 p-3 space-y-0.5 overflow-y-auto">
          <a
            routerLink="/dashboard"
            routerLinkActive="sidebar-nav-active"
            class="sidebar-nav-link"
            [class.px-3]="!sidebarCollapsed"
            [class.py-2.5]="!sidebarCollapsed"
            [class.justify-center]="sidebarCollapsed"
            [class.p-2.5]="sidebarCollapsed"
            [title]="sidebarCollapsed ? 'Início' : ''"
          >
            <span class="sidebar-nav-icon" aria-hidden="true">🏠</span>
            <span *ngIf="!sidebarCollapsed" class="truncate">Início</span>
          </a>

          <div *ngIf="canAccessGate" class="pt-4">
            <p
              *ngIf="!sidebarCollapsed"
              class="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2"
            >
              Operação
            </p>
            <a
              routerLink="/portaria"
              routerLinkActive="sidebar-nav-active"
              class="sidebar-nav-link"
              [class.px-3]="!sidebarCollapsed"
              [class.py-2.5]="!sidebarCollapsed"
              [class.justify-center]="sidebarCollapsed"
              [class.p-2.5]="sidebarCollapsed"
              [title]="sidebarCollapsed ? 'Portaria' : ''"
            >
              <span class="sidebar-nav-icon" aria-hidden="true">🚪</span>
              <span *ngIf="!sidebarCollapsed" class="truncate">Portaria</span>
            </a>
          </div>

          <div *ngIf="canAccessEvents && !isAdmin" class="pt-4">
            <p
              *ngIf="!sidebarCollapsed"
              class="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2"
            >
              Operação
            </p>
            <a
              routerLink="/admin/eventos"
              routerLinkActive="sidebar-nav-active"
              class="sidebar-nav-link"
              [class.px-3]="!sidebarCollapsed"
              [class.py-2.5]="!sidebarCollapsed"
              [class.justify-center]="sidebarCollapsed"
              [class.p-2.5]="sidebarCollapsed"
              [title]="sidebarCollapsed ? 'Eventos' : ''"
            >
              <span class="sidebar-nav-icon" aria-hidden="true">📅</span>
              <span *ngIf="!sidebarCollapsed" class="truncate">Eventos</span>
            </a>
            <a
              routerLink="/admin/frota"
              routerLinkActive="sidebar-nav-active"
              class="sidebar-nav-link"
              [class.px-3]="!sidebarCollapsed"
              [class.py-2.5]="!sidebarCollapsed"
              [class.justify-center]="sidebarCollapsed"
              [class.p-2.5]="sidebarCollapsed"
              [title]="sidebarCollapsed ? 'Frota' : ''"
            >
              <span class="sidebar-nav-icon" aria-hidden="true">🚗</span>
              <span *ngIf="!sidebarCollapsed" class="truncate">Frota</span>
            </a>
            <a
              routerLink="/admin/solicitacoes-servico"
              routerLinkActive="sidebar-nav-active"
              class="sidebar-nav-link"
              [class.px-3]="!sidebarCollapsed"
              [class.py-2.5]="!sidebarCollapsed"
              [class.justify-center]="sidebarCollapsed"
              [class.p-2.5]="sidebarCollapsed"
              [title]="sidebarCollapsed ? 'Serviços' : ''"
            >
              <span class="sidebar-nav-icon" aria-hidden="true">🔧</span>
              <span *ngIf="!sidebarCollapsed" class="truncate">Serviços</span>
            </a>
          </div>

          <div *ngIf="isAdmin" class="pt-4">
            <p
              *ngIf="!sidebarCollapsed"
              class="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2"
            >
              Administração
            </p>

            <a
              *ngFor="let item of adminMenuItems"
              [routerLink]="item.route"
              routerLinkActive="sidebar-nav-active"
              [routerLinkActiveOptions]="{ exact: false }"
              class="sidebar-nav-link"
              [class.px-3]="!sidebarCollapsed"
              [class.py-2.5]="!sidebarCollapsed"
              [class.justify-center]="sidebarCollapsed"
              [class.p-2.5]="sidebarCollapsed"
              [title]="sidebarCollapsed ? item.label : ''"
            >
              <span class="sidebar-nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span *ngIf="!sidebarCollapsed" class="truncate">{{ item.label }}</span>
            </a>
          </div>
        </nav>

        <div class="p-3 border-t border-[var(--app-border)] shrink-0">
          <button
            type="button"
            (click)="logout()"
            [disabled]="loggingOut"
            class="sidebar-nav-link w-full border border-[var(--app-border)] disabled:opacity-50"
            [class.px-3]="!sidebarCollapsed"
            [class.py-2]="!sidebarCollapsed"
            [class.justify-center]="sidebarCollapsed"
            [class.p-2.5]="sidebarCollapsed"
            [title]="sidebarCollapsed ? (loggingOut ? 'Saindo...' : 'Sair') : ''"
          >
            <span class="sidebar-nav-icon" aria-hidden="true">🚪</span>
            <span *ngIf="!sidebarCollapsed">{{ loggingOut ? 'Saindo...' : 'Sair' }}</span>
          </button>
        </div>
      </aside>

      <main class="flex-1 min-h-0 overflow-auto p-6 min-w-0">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
})
export class MainLayoutComponent implements OnInit {
  readonly adminMenuItems: AdminMenuItem[] = ADMIN_MENU_ITEMS;

  userName = '';
  userPhotoUrl: string | null = null;
  isAdmin = false;
  canAccessEvents = false;
  canAccessGate = false;
  loggingOut = false;
  sidebarCollapsed = false;

  constructor(
    private authService: AuthService,
    private sessionIdle: SessionIdleService,
    private storage: StorageService,
    private cdr: ChangeDetectorRef,
  ) {}

  get userInitials(): string {
    const name = this.userName.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  async ngOnInit() {
    const collapsed = await this.storage.get(SIDEBAR_COLLAPSED_KEY);
    this.sidebarCollapsed = collapsed === '1';

    void this.sessionIdle.startMonitoring();

    const user = await this.authService.getCurrentUser();
    this.userName = user?.nome_completo || user?.email || 'Usuário';
    const role = String(user?.role || user?.perfil || '').toUpperCase();
    this.isAdmin = role === 'ADMIN';
    this.canAccessEvents = role === 'ADMIN' || role === 'PRODUTORA' || role === 'PADRAO';
    this.canAccessGate = role === 'ADMIN' || role === 'CONTROLADOR';
    this.userPhotoUrl = await this.authService.resolveUserPhoto();
    this.cdr.detectChanges();
  }

  onPhotoError(): void {
    this.userPhotoUrl = null;
    this.cdr.detectChanges();
  }

  async toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    await this.storage.set(SIDEBAR_COLLAPSED_KEY, this.sidebarCollapsed ? '1' : '0');
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
