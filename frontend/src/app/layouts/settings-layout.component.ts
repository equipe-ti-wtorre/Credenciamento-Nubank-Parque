import {
  ChangeDetectorRef,
  Component,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { SETTINGS_NAV_ITEMS } from '../config/admin-menu.config';
import { isSettingsReloadable } from '../pages/admin/settings-reloadable';

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
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
              *ngFor="let item of navItems"
              href="#"
              class="settings-nav-link"
              [class.settings-nav-active]="isActive(item.path)"
              (click)="goToSection(item.path, $event)"
            >
              <span class="settings-nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="min-w-0">
                <span class="block truncate">{{ item.label }}</span>
                <span *ngIf="item.subtitle" class="block text-[10px] text-[var(--app-text-muted)] truncate">
                  {{ item.subtitle }}
                </span>
              </span>
            </a>
          </nav>
        </aside>

        <div class="settings-panel-content">
          <router-outlet (activate)="onOutletActivate($event)"></router-outlet>
        </div>
      </div>
    </div>
  `,
})
export class SettingsLayoutComponent {
  readonly navItems = SETTINGS_NAV_ITEMS;

  @ViewChild(RouterOutlet) private outlet?: RouterOutlet;

  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  isActive(path: string): boolean {
    return this.router.isActive(
      this.router.createUrlTree(['/admin/configuracoes', path]),
      {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      },
    );
  }

  goToSection(path: string, event: Event) {
    event.preventDefault();

    if (this.isActive(path)) {
      this.reloadActivePage();
      return;
    }

    void this.router.navigate(['/admin/configuracoes', path]);
  }

  onOutletActivate(component: unknown) {
    if (isSettingsReloadable(component)) {
      component.reloadPage();
    }
    this.cdr.detectChanges();
  }

  private reloadActivePage() {
    const component = this.outlet?.component;
    if (isSettingsReloadable(component)) {
      component.reloadPage();
    }
    this.cdr.detectChanges();
  }
}
