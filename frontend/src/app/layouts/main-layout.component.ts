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
import { AuthService } from '../core/services/auth.service';
import { SessionIdleService } from '../core/services/session-idle.service';
import { StorageService } from '../core/services/storage.service';
import { DocumentChangeService } from '../services/document-change.service';
import { ADMIN_MENU_ITEMS } from '../config/admin-menu.config';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
const DEFAULT_TITLE = 'WTORRE';

interface NavItem {
  label: string;
  route: string;
  iconHtml: SafeHtml;
  exact?: boolean;
  /** Mostra o badge de pendencias (resolvido via signal pendingApprovals). */
  showBadge?: boolean;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  collapsed = signal(false);
  pageTitle = signal(DEFAULT_TITLE);
  pendingApprovals = signal(0);

  navGroups: NavGroup[] = [];

  userName = '';
  userRoleLabel = '';
  userPhotoUrl: string | null = null;
  isAdmin = false;
  canAccessEvents = false;
  canAccessGate = false;
  loggingOut = false;

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
    private documentChange: DocumentChangeService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
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

    const user = await this.authService.getCurrentUser();
    this.userName = user?.nome_completo || user?.email || 'Usuário';
    const role = String(user?.role || user?.perfil || '').toUpperCase();
    this.isAdmin = role === 'ADMIN';
    this.canAccessEvents = role === 'ADMIN' || role === 'PRODUTORA' || role === 'PADRAO';
    this.canAccessGate = role === 'ADMIN' || role === 'CONTROLADOR';
    this.userRoleLabel = this.roleLabel(role);
    this.userPhotoUrl = await this.authService.resolveUserPhoto();

    this.buildNav();
    if (this.isAdmin) {
      this.loadPendingApprovals();
    }

    this.resolveTitle();
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.resolveTitle());

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
    const groups: NavGroup[] = [
      {
        items: [
          { label: 'Início', route: '/dashboard', iconHtml: this.iconFor('home'), exact: true },
        ],
      },
    ];

    if (this.canAccessGate) {
      groups.push({
        title: 'Operação',
        items: [
          { label: 'Portaria', route: '/portaria', iconHtml: this.iconFor('gate'), exact: true },
          { label: 'Registrar entrada', route: '/mercadorias/entrada', iconHtml: this.iconFor('in') },
          { label: 'Registrar saída', route: '/mercadorias/saida', iconHtml: this.iconFor('out') },
        ],
      });
    }

    if (this.canAccessEvents && !this.isAdmin) {
      groups.push({
        title: 'Operação',
        items: [
          { label: 'Eventos', route: '/admin/eventos', iconHtml: this.iconFor('calendar') },
          { label: 'Frota', route: '/admin/frota', iconHtml: this.iconFor('truck') },
          { label: 'Serviços', route: '/admin/solicitacoes-servico', iconHtml: this.iconFor('wrench') },
        ],
      });
    }

    if (this.isAdmin) {
      groups.push({
        title: 'Administração',
        items: ADMIN_MENU_ITEMS.map((item) => ({
          label: item.label,
          route: item.route,
          iconHtml: this.iconFor(item.iconKey),
          showBadge: item.route === '/admin/aprovacoes-documento',
        })),
      });
    }

    this.navGroups = groups;
  }

  private loadPendingApprovals(): void {
    this.documentChange.listPending().subscribe({
      next: (res) => this.pendingApprovals.set(res.requests?.length ?? 0),
      error: () => this.pendingApprovals.set(0),
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
