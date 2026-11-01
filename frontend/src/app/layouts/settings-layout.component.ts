import {
  ChangeDetectorRef,
  Component,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SETTINGS_NAV_GROUPS, SettingsNavGroup, SettingsNavItem } from '../config/admin-menu.config';
import { isSettingsReloadable } from '../pages/admin/settings-reloadable';
import { AuthService, AuthUser, hasPermission } from '../core/services/auth.service';

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="settings-page-shell">
      <header class="settings-page-header">
        <h1 class="page-title">Configurações do Sistema</h1>
        <p class="page-subtitle">Gerencie automações, regras de negócio e integrações.</p>
      </header>

      <div class="settings-panel">
        <aside class="settings-panel-nav">
          <nav class="space-y-1">
            <a
              *ngFor="let group of navGroups"
              [routerLink]="['/admin/configuracoes', group.items[0].path]"
              class="settings-nav-link"
              [class.settings-nav-active]="isGroupActive(group)"
              [attr.aria-current]="isGroupActive(group) ? 'page' : null"
              (click)="onGroupClick(group, $event)"
            >
              <span class="settings-nav-icon" aria-hidden="true">{{ group.icon }}</span>
              <span class="min-w-0">
                <span class="block truncate">{{ group.label }}</span>
                <span *ngIf="group.subtitle" class="block text-[10px] text-[var(--app-text-muted)] truncate">
                  {{ group.subtitle }}
                </span>
              </span>
            </a>
          </nav>
        </aside>

        <div class="settings-panel-content">
          <div
            *ngIf="activeTabs.length > 1"
            class="settings-group-tabs"
            role="tablist"
            [attr.aria-label]="'Seções de ' + activeGroupLabel"
          >
            <a
              *ngFor="let tab of activeTabs"
              role="tab"
              [routerLink]="['/admin/configuracoes', tab.path]"
              routerLinkActive="on"
              [routerLinkActiveOptions]="{ exact: true }"
              [attr.aria-selected]="isTabActive(tab)"
              (click)="onNavClick(tab.path, $event)"
            >
              {{ tab.label }}
            </a>
          </div>
          <router-outlet (activate)="onOutletActivate($event)"></router-outlet>
        </div>
      </div>
    </div>
  `,
})
export class SettingsLayoutComponent implements OnInit {
  navGroups: SettingsNavGroup[] = [];

  @ViewChild(RouterOutlet) private outlet?: RouterOutlet;

  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);

  private currentUser: AuthUser | null = null;

  async ngOnInit() {
    this.currentUser = await this.auth.getCurrentUser();
    this.refreshNavGroups();
    this.cdr.markForCheck();
  }

  get activeTabs(): SettingsNavItem[] {
    return this.activeGroup?.items ?? [];
  }

  get activeGroupLabel(): string {
    return this.activeGroup?.label ?? 'configurações';
  }

  private get activeGroup(): SettingsNavGroup | undefined {
    return this.navGroups.find((group) => this.isGroupActive(group));
  }

  isGroupActive(group: SettingsNavGroup): boolean {
    const path = this.currentChildPath();
    return !!path && group.items.some((item) => item.path === path);
  }

  isTabActive(tab: SettingsNavItem): boolean {
    return this.currentChildPath() === tab.path;
  }

  private refreshNavGroups() {
    this.navGroups = SETTINGS_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => this.canView(item)),
    })).filter((group) => group.items.length > 0);
  }

  private canView(item: SettingsNavItem): boolean {
    if (!item.module) return true;
    return hasPermission(this.currentUser, item.module, 'view');
  }

  private currentChildPath(): string | null {
    const match = this.router.url.match(/\/admin\/configuracoes\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  /** Clique no grupo já aberto: recarrega a página atual. */
  onGroupClick(group: SettingsNavGroup, event: Event) {
    if (this.isGroupActive(group)) {
      event.preventDefault();
      this.reloadActivePage();
    }
  }

  /** Clique na aba já ativa: só recarrega a página (sem navegar de novo). */
  onNavClick(path: string, event: Event) {
    const urlTree = this.router.createUrlTree(['/admin/configuracoes', path]);
    if (
      this.router.isActive(urlTree, {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      })
    ) {
      event.preventDefault();
      this.reloadActivePage();
    }
  }

  onOutletActivate(component: unknown) {
    if (isSettingsReloadable(component)) {
      component.reloadPage();
    }
    this.cdr.markForCheck();
  }

  private reloadActivePage() {
    const component = this.outlet?.component;
    if (isSettingsReloadable(component)) {
      component.reloadPage();
    }
    this.cdr.markForCheck();
  }
}
