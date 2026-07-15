import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, filter } from 'rxjs';
import { AuthService, AuthUser, hasPermission, isSectorGestor } from '../core/services/auth.service';
import { SessionIdleService } from '../core/services/session-idle.service';
import { StorageService } from '../core/services/storage.service';
import { ApiService } from '../core/services/api.service';
import { NotificationService } from '../core/services/notification.service';
import { ApprovalService } from '../services/approval.service';
import { DocumentChangeService } from '../services/document-change.service';
import { ADMIN_MENU_ITEMS, ADMIN_MENU_MODULE_MAP, AdminMenuItem, MenuIconLibrary } from '../config/admin-menu.config';
import { NotificationsDropdownComponent } from './notifications-dropdown.component';
import { TeamsContextService } from '../services/teams-context.service';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
const DEFAULT_TITLE = 'Credenciamento';

interface NavItem {
  label: string;
  route: string;
  iconHtml?: SafeHtml;
  iconLibrary?: MenuIconLibrary;
  iconName?: string;
  iconSrc?: string;
  exact?: boolean;
  /** Mostra o badge de pendencias (aprovacoes de evento/acesso ou documentos). */
  showBadge?: boolean;
  /** Fonte do contador do badge; default = approvals. */
  badgeSource?: 'approvals' | 'document';
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationsDropdownComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  collapsed = signal(false);
  pageTitle = signal(DEFAULT_TITLE);
  pendingApprovals = signal(0);
  pendingDocumentApprovals = signal(0);

  navGroups: NavGroup[] = [];

  userName = '';
  userRoleLabel = '';
  userPhotoUrl: string | null = null;
  currentUser: AuthUser | null = null;
  loggingOut = false;
  notifyPortaria = false;
  prefSaving = false;

  /** Icones SVG sanitizados UMA vez (sem chamada de metodo por render). */
  private readonly iconMap: Map<string, SafeHtml>;
  private routerSub?: Subscription;

  private readonly rawIcons: Record<string, string> = {
    home: '<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" stroke-linejoin="round"/>',
    gate: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M9 21V9"/>',
    in: '<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke-linecap="round" stroke-linejoin="round"/>',
    out: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke-linecap="round" stroke-linejoin="round"/>',
    users:
      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-linecap="round" stroke-linejoin="round"/>',
    building:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M9 11h2M9 15h2M14 7h1M14 11h1M14 15h1"/>',
    badge:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.7-1.3 1.8-2 3-2s2.3.7 3 2M15 9h4M15 13h3"/>',
    doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-linejoin="round"/><path d="M14 2v6h6M9 14l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>',
    truck:
      '<path d="M3 13l2-5h11l3 4h2v4h-2M5 17a2 2 0 100-4 2 2 0 000 4zM17 17a2 2 0 100-4 2 2 0 000 4z" stroke-linecap="round" stroke-linejoin="round"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" stroke-linejoin="round"/>',
    warehouse:
      '<path d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke-linejoin="round"/><path d="M9 21v-8h6v8"/>',
    chart:
      '<path d="M3 3v18h18M7 14l3-3 3 2 5-6" stroke-linecap="round" stroke-linejoin="round"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/>',
    wrench:
      '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.3-2.3 2.9-2.3z" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  constructor(
    private authService: AuthService,
    private sessionIdle: SessionIdleService,
    private storage: StorageService,
    private api: ApiService,
    private notification: NotificationService,
    private approvalService: ApprovalService,
    private documentChangeService: DocumentChangeService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private teamsContext: TeamsContextService,
  ) {
    this.iconMap = new Map(
      Object.entries(this.rawIcons).map(([key, path]) => [key, this.buildIcon(path)]),
    );
  }

  private buildIcon(path: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">${path}</svg>`,
    );
  }

  private iconFor(key: string): SafeHtml {
    return this.iconMap.get(key) ?? '';
  }

  private mapMenuItem(item: AdminMenuItem): NavItem {
    const nav: NavItem = {
      label: item.label,
      route: item.route,
      showBadge: item.route === '/admin/aprovacoes-documento',
      badgeSource: item.route === '/admin/aprovacoes-documento' ? 'document' : undefined,
    };
    if (item.iconLibrary === 'image' && item.iconSrc) {
      nav.iconLibrary = 'image';
      nav.iconSrc = item.iconSrc;
      return nav;
    }
    if (item.iconLibrary && item.iconName) {
      nav.iconLibrary = item.iconLibrary;
      nav.iconName = item.iconName;
      return nav;
    }
    nav.iconHtml = this.iconFor(item.iconKey ?? 'home');
    return nav;
  }

  faIconClass(iconName: string): string {
    return `fa-solid fa-${iconName}`;
  }

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
    const storedCollapsed = await this.storage.get(SIDEBAR_COLLAPSED_KEY);
    this.collapsed.set(storedCollapsed === '1');

    void this.sessionIdle.startMonitoring();

    // Sino / card do Teams: contentUrl é "/" — navegar para /aprovacoes/:id via subEntityId
    try {
      const teamsPath = await this.teamsContext.getDeepLinkPath();
      if (teamsPath) {
        const pathOnly = teamsPath.split('?')[0];
        if (!this.router.url.startsWith(pathOnly)) {
          void this.router.navigateByUrl(teamsPath);
        }
      }
    } catch {
      /* ignore */
    }

    const user = await this.authService.getCurrentUser();
    this.currentUser = user;
    this.userName = user?.nome_completo || user?.email || 'Usuário';
    this.userRoleLabel = user?.profile?.nome || this.roleLabel(String(user?.role || user?.perfil || ''));
    this.notifyPortaria = !!user?.notificar_portaria;
    this.userPhotoUrl = await this.authService.resolveUserPhoto();
    this.refreshPreferencesFromApi();

    this.buildNav();
    this.loadPendingBadges();

    this.resolveTitle();
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.resolveTitle();
        this.loadPendingBadges();
      });

    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  private roleLabel(role: string): string {
    switch (role) {
      case 'ADMIN':
        return 'Acesso total';
      case 'CONTROLADOR':
        return 'Controle de acesso';
      case 'PRODUTORA':
        return 'Produtora';
      case 'PADRAO':
        return 'Padrão';
      default:
        return 'Usuário';
    }
  }

  private buildNav(): void {
    const user = this.currentUser;
    const groups: NavGroup[] = [];

    const baseItems: NavItem[] = [];
    if (hasPermission(user, 'dashboard', 'view')) {
      baseItems.push({ label: 'Início', route: '/dashboard', iconHtml: this.iconFor('home'), exact: true });
    }
    if (hasPermission(user, 'approvals', 'view')) {
      baseItems.push({
        label: 'Aprovações',
        route: '/aprovacoes',
        iconHtml: this.iconFor('doc'),
        showBadge: true,
        badgeSource: 'approvals',
      });
    }
    if (baseItems.length) {
      groups.push({ items: baseItems });
    }

    const operacaoItems: NavItem[] = [];
    if (hasPermission(user, 'gate', 'view')) {
      operacaoItems.push({ label: 'Portaria', route: '/portaria', iconHtml: this.iconFor('gate'), exact: true });
    }
    if (hasPermission(user, 'merchandise_entry', 'view')) {
      operacaoItems.push({ label: 'Registrar entrada', route: '/mercadorias/entrada', iconHtml: this.iconFor('in') });
    }
    if (hasPermission(user, 'merchandise_exit', 'view')) {
      operacaoItems.push({ label: 'Registrar saída', route: '/mercadorias/saida', iconHtml: this.iconFor('out') });
    }
    if (hasPermission(user, 'credential_denials', 'view')) {
      operacaoItems.push({
        label: 'Negações de credenciamento',
        route: '/operacao/negacoes-credenciamento',
        iconHtml: this.iconFor('chart'),
      });
    }
    if (hasPermission(user, 'events', 'view')) {
      operacaoItems.push({ label: 'Eventos', route: '/admin/eventos', iconHtml: this.iconFor('calendar') });
    }
    if (hasPermission(user, 'fleet', 'view')) {
      operacaoItems.push({
        label: 'Frota',
        route: '/admin/frota',
        iconLibrary: 'image',
        iconSrc: 'assets/icons/frota.png',
      });
    }
    if (hasPermission(user, 'service_access', 'view')) {
      operacaoItems.push({
        label: 'Acessos de Serviço',
        route: '/admin/acessos-servico',
        iconHtml: this.iconFor('wrench'),
      });
    }
    if (operacaoItems.length) {
      groups.push({ title: 'Operação', items: operacaoItems });
    }

    const adminItems = ADMIN_MENU_ITEMS.filter((item) => {
      const module = ADMIN_MENU_MODULE_MAP[item.route];
      return module ? hasPermission(user, module, 'view') : true;
    }).map((item) => this.mapMenuItem(item));

    if (adminItems.length) {
      groups.push({ title: 'Administração', items: adminItems });
    } else if (isSectorGestor(user) && hasPermission(user, 'sectors', 'view')) {
      groups.push({
        title: 'Gestão',
        items: [{ label: 'Setores', route: '/admin/setores', iconHtml: this.iconFor('users') }],
      });
    }

    this.navGroups = groups;
  }

  badgeCountFor(item: NavItem): number {
    return item.badgeSource === 'document'
      ? this.pendingDocumentApprovals()
      : this.pendingApprovals();
  }

  private loadPendingBadges(): void {
    this.loadPendingApprovals();
    this.loadPendingDocumentApprovals();
  }

  private loadPendingApprovals(): void {
    if (!hasPermission(this.currentUser, 'approvals', 'view')) {
      this.pendingApprovals.set(0);
      return;
    }
    this.approvalService.countPending().subscribe({
      next: (res) => this.pendingApprovals.set(res.total ?? 0),
      error: () => this.pendingApprovals.set(0),
    });
  }

  private loadPendingDocumentApprovals(): void {
    if (!hasPermission(this.currentUser, 'document_approvals', 'view')) {
      this.pendingDocumentApprovals.set(0);
      return;
    }
    this.documentChangeService.countPending().subscribe({
      next: (res) => this.pendingDocumentApprovals.set(res.total ?? 0),
      error: () => this.pendingDocumentApprovals.set(0),
    });
  }

  /** Desce ate a folha mais profunda da arvore de rotas; usa o ultimo title definido. */
  private resolveTitle(): void {
    let route = this.activatedRoute.root;
    let title: string | undefined;
    while (route.firstChild) {
      route = route.firstChild;
      const routeTitle = route.snapshot.data?.['title'];
      if (typeof routeTitle === 'string' && routeTitle.trim()) {
        title = routeTitle;
      }
    }
    this.pageTitle.set(title || DEFAULT_TITLE);
  }

  onPhotoError(): void {
    this.userPhotoUrl = null;
    this.cdr.detectChanges();
  }

  private refreshPreferencesFromApi(): void {
    this.api.get<{ user: AuthUser }>('/auth/me').subscribe({
      next: async (res) => {
        if (!res.user) return;
        this.currentUser = res.user;
        this.notifyPortaria = !!res.user.notificar_portaria;
        await this.storage.set('currentUser', JSON.stringify(res.user));
        this.cdr.detectChanges();
      },
      error: () => {
        /* preferência segue com valor local */
      },
    });
  }

  toggleNotifyPortaria(event: Event): void {
    const checked = !!(event.target as HTMLInputElement)?.checked;
    this.prefSaving = true;
    this.api.patch<{ user: AuthUser }>('/auth/me/preferences', { notificar_portaria: checked }).subscribe({
      next: async (res) => {
        this.notifyPortaria = !!res.user?.notificar_portaria;
        this.currentUser = res.user;
        await this.storage.set('currentUser', JSON.stringify(res.user));
        this.prefSaving = false;
        this.notification.success(
          this.notifyPortaria
            ? 'Você receberá alertas de entrada na portaria.'
            : 'Alertas de portaria desativados.',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.prefSaving = false;
        this.notifyPortaria = !checked;
        this.notification.notifyHttpError(err, 'Não foi possível salvar a preferência.');
        this.cdr.detectChanges();
      },
    });
  }

  async toggleSidebar() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    await this.storage.set(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
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
