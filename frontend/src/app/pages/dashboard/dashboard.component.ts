import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  CredentialStatusKey,
  DashboardMetrics,
  ReportsService,
} from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';

const AUTO_REFRESH_MS = 30_000;

interface StatCard {
  label: string;
  value: number | string;
  iconHtml: SafeHtml;
  tone: '' | 'amber' | 'blue' | 'green' | 'rose' | 'gray';
  tag?: string;
  trend?: string;
  trendDown?: boolean;
  highlight?: boolean;
  link?: string | null;
}

interface Slice {
  name: string;
  value: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

interface DayBar {
  day: string;
  value: number;
  heightPx: number;
  zero: boolean;
}

interface RankRow {
  label: string;
  total: number;
  pct: number;
}

interface SourceRow {
  label: string;
  total: number;
  tone: 'purple' | 'blue' | 'green';
  numTone: 'purple' | 'blue' | 'green';
}

interface MasterRow {
  label: string;
  value: number;
  color: string;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DONUT_R = 54;
const DONUT_C = 2 * Math.PI * DONUT_R;
const BAR_MAX_PX = 140;

const STATUS_COLORS = {
  awaitingProducer: '#D98A00',
  awaitingApproval: '#eaad42',
  approved: '#2f9e56',
  denied: '#e5484d',
  expired: '#9a94a6',
  unknown: '#b9a3e4',
} as const;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild('dashboardRoot') private dashboardRoot?: ElementRef<HTMLElement>;

  user: Awaited<ReturnType<AuthService['getCurrentUser']>> = null;
  userName = '';
  todayLabel = '';
  canLoadMetrics = false;
  loading = signal(true);
  refreshing = signal(false);
  fullscreenMode = signal(false);
  lastUpdatedAt = signal<Date | null>(null);
  metrics = signal<DashboardMetrics | null>(null);

  private metricsSub?: Subscription;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private readonly onFullscreenChange = (): void => {
    if (!document.fullscreenElement && this.fullscreenMode()) {
      this.exitFullscreenMode(false);
    }
  };

  stats = signal<StatCard[]>([]);
  slices = signal<Slice[]>([]);
  week = signal<DayBar[]>([]);
  topCompanies = signal<RankRow[]>([]);
  summaryCards = signal<{ label: string; value: number; tone: string }[]>([]);
  sourceRows = signal<SourceRow[]>([]);
  masterRows = signal<MasterRow[]>([]);
  companiesByType = signal<RankRow[]>([]);
  isAdmin = signal(false);

  totalCredenciais = computed(() => this.slices().reduce((acc, s) => acc + s.value, 0));
  lastUpdatedLabel = computed(() => {
    const at = this.lastUpdatedAt();
    if (!at) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(at);
    } catch {
      return at.toLocaleTimeString('pt-BR');
    }
  });

  private readonly iconMap: Map<string, SafeHtml>;
  private readonly rawIcons: Record<string, string> = {
    building:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    userplus:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    inside:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  };

  constructor(
    private authService: AuthService,
    private reportsService: ReportsService,
    private notification: NotificationService,
    private sanitizer: DomSanitizer,
  ) {
    this.iconMap = new Map(
      Object.entries(this.rawIcons).map(([key, path]) => [
        key,
        this.sanitizer.bypassSecurityTrustHtml(
          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`,
        ),
      ]),
    );
  }

  private icon(key: string): SafeHtml {
    return this.iconMap.get(key) ?? '';
  }

  async ngOnInit() {
    this.user = await this.authService.getCurrentUser();
    this.userName = this.user?.nome_completo || this.user?.email || 'Usuário';
    this.todayLabel = this.formatToday();
    const role = String(this.user?.role || '').toUpperCase();
    this.isAdmin.set(role === 'ADMIN');
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.canLoadMetrics = ['ADMIN', 'PRODUTORA', 'PADRAO'].includes(role);
    if (this.canLoadMetrics) {
      this.loadMetrics(true);
      this.startAutoRefresh();
    } else {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.stopAutoRefresh();
    this.metricsSub?.unsubscribe();
    this.exitFullscreenMode(true);
  }

  onRefreshClick(): void {
    if (!this.canLoadMetrics || this.refreshing()) return;
    this.loadMetrics(false);
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (this.canLoadMetrics && !this.refreshing()) {
        this.loadMetrics(false);
      }
    }, AUTO_REFRESH_MS);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.fullscreenMode() && !document.fullscreenElement) {
      this.exitFullscreenMode(false);
    }
  }

  toggleFullscreen(): void {
    if (this.fullscreenMode()) {
      this.exitFullscreenMode(true);
    } else {
      this.enterFullscreenMode();
    }
  }

  private enterFullscreenMode(): void {
    this.fullscreenMode.set(true);
    document.body.classList.add('dashboard-kiosk');
    const el = this.dashboardRoot?.nativeElement;
    if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => {
        /* CSS kiosk fallback when Fullscreen API is blocked */
      });
    }
  }

  private exitFullscreenMode(exitNative: boolean): void {
    this.fullscreenMode.set(false);
    document.body.classList.remove('dashboard-kiosk');
    if (exitNative && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  loadMetrics(initial = false) {
    if (initial || !this.metrics()) {
      this.loading.set(true);
    } else {
      this.refreshing.set(true);
    }

    this.metricsSub?.unsubscribe();
    this.metricsSub = this.reportsService.getDashboard().subscribe({
      next: (m) => {
        this.metrics.set(m);
        this.stats.set(this.buildStats(m));
        this.slices.set(this.buildSlices(m));
        this.week.set(this.buildWeek(m));
        this.topCompanies.set(this.buildTopCompanies(m));
        this.summaryCards.set(this.buildSummaryCards(m));
        this.sourceRows.set(this.buildSourceRows(m));
        this.masterRows.set(this.buildMasterRows(m));
        this.companiesByType.set(this.buildCompaniesByType(m));
        this.todayLabel = this.formatToday();
        this.lastUpdatedAt.set(new Date());
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (initial || !this.metrics()) {
          this.notification.notifyHttpError(err, 'Falha ao carregar dashboard.');
        }
      },
    });
  }

  private formatToday(): string {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return '';
    }
  }

  private buildStats(m: DashboardMetrics): StatCard[] {
    const delta = this.accessesDelta(m.accessesLast7Days);
    return [
      {
        label: 'Empresas ativas',
        value: m.kpis.activeCompanies,
        iconHtml: this.icon('building'),
        tone: '',
      },
      {
        label: 'Aguardando aprovação',
        value: m.kpis.pendingApproval,
        iconHtml: this.icon('clock'),
        tone: 'amber',
        tag: 'Credenciais',
      },
      {
        label: 'Acessos hoje',
        value: m.kpis.accessesToday,
        iconHtml: this.icon('userplus'),
        tone: 'blue',
        trend: delta.trend,
        trendDown: delta.trendDown,
      },
      {
        label: 'Dentro agora',
        value: m.kpis.currentlyInside,
        iconHtml: this.icon('inside'),
        tone: 'green',
        link: '/operacao/relatorio-acessos',
      },
      {
        label: 'Negativas (7 dias)',
        value: m.kpis.denialsLast7Days,
        iconHtml: this.icon('ban'),
        tone: 'rose',
        highlight: m.kpis.denialsLast7Days > 0,
        link: '/operacao/negacoes-credenciamento',
      },
      {
        label: 'Alertas não lidos',
        value: m.kpis.unreadAlerts,
        iconHtml: this.icon('bell'),
        tone: 'gray',
        tag:
          m.kpis.pendingWorkflowApprovals > 0
            ? `${m.kpis.pendingWorkflowApprovals} aprovações`
            : undefined,
        link: '/aprovacoes',
      },
    ];
  }

  private buildSummaryCards(m: DashboardMetrics) {
    const s = m.summary_by_status || { aprovados: 0, aguardando: 0, negados: 0, expirados: 0 };
    return [
      { label: 'Aprovados', value: s.aprovados || 0, tone: 'green' },
      { label: 'Aguardando', value: s.aguardando || 0, tone: 'amber' },
      { label: 'Negados', value: s.negados || 0, tone: 'rose' },
      { label: 'Expirados', value: s.expirados || 0, tone: 'gray' },
    ];
  }

  private buildSlices(m: DashboardMetrics): Slice[] {
    const total = m.credentialsByStatus.reduce((acc, x) => acc + x.total, 0) || 1;
    let offset = 0;
    return m.credentialsByStatus.map((x) => {
      const len = (x.total / total) * DONUT_C;
      const slice: Slice = {
        name: x.label,
        value: x.total,
        color: this.statusColor(x.status, x.label, x.id_access_status),
        dashArray: `${len} ${DONUT_C}`,
        dashOffset: -offset,
      };
      offset += len;
      return slice;
    });
  }

  private buildTopCompanies(m: DashboardMetrics): RankRow[] {
    const rows = m.topCompanies || [];
    const max = Math.max(...rows.map((r) => r.total), 1);
    return rows.map((r) => ({
      label: r.label,
      total: r.total,
      pct: Math.round((r.total / max) * 100),
    }));
  }

  private buildSourceRows(m: DashboardMetrics): SourceRow[] {
    const src = m.accessesBySourceToday || {
      event: 0,
      service_collaborator: 0,
      service_vehicle: 0,
    };
    return [
      { label: 'Evento', total: src.event || 0, tone: 'purple', numTone: 'purple' },
      { label: 'Serviço (PF)', total: src.service_collaborator || 0, tone: 'blue', numTone: 'blue' },
      {
        label: 'Serviço (veículo)',
        total: src.service_vehicle || 0,
        tone: 'green',
        numTone: 'green',
      },
    ];
  }

  private buildMasterRows(m: DashboardMetrics): MasterRow[] {
    const masters = m.masters || {
      activeCollaborators: 0,
      activeVehicles: 0,
      blacklistedCollaborators: 0,
      blacklistedVehicles: 0,
      pendingDocumentChanges: 0,
      companiesByType: [],
    };
    return [
      { label: 'Colaboradores ativos', value: masters.activeCollaborators, color: 'var(--db-blue)' },
      { label: 'Veículos ativos', value: masters.activeVehicles, color: 'var(--db-core)' },
      { label: 'Blacklist PF', value: masters.blacklistedCollaborators, color: 'var(--db-rose)' },
      { label: 'Blacklist veículos', value: masters.blacklistedVehicles, color: 'var(--db-rose)' },
      { label: 'Docs pendentes', value: masters.pendingDocumentChanges, color: 'var(--db-amber)' },
      { label: 'Eventos ativos', value: m.kpis.activeEvents || 0, color: 'var(--db-green)' },
    ];
  }

  private buildCompaniesByType(m: DashboardMetrics): RankRow[] {
    const rows = m.masters?.companiesByType || [];
    const max = Math.max(...rows.map((r) => r.total), 1);
    return rows.map((r) => ({
      label: r.label,
      total: r.total,
      pct: Math.round((r.total / max) * 100),
    }));
  }

  private accessesDelta(days: { day: string; total: number }[]): {
    trend?: string;
    trendDown?: boolean;
  } {
    if (!days || days.length < 2) return {};
    const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
    const today = sorted[sorted.length - 1].total;
    const yesterday = sorted[sorted.length - 2].total;
    const diff = today - yesterday;
    if (yesterday === 0) {
      if (diff === 0) return {};
      return { trend: `${diff >= 0 ? '+' : ''}${diff}`, trendDown: diff < 0 };
    }
    const pct = Math.round((diff / yesterday) * 100);
    if (pct === 0) return {};
    return { trend: `${pct >= 0 ? '+' : ''}${pct}%`, trendDown: pct < 0 };
  }

  private buildWeek(m: DashboardMetrics): DayBar[] {
    const sorted = [...m.accessesLast7Days].sort((a, b) => a.day.localeCompare(b.day));
    const max = Math.max(...sorted.map((x) => x.total), 1);
    return sorted.map((x) => {
      const zero = x.total <= 0;
      return {
        day: this.weekdayLabel(x.day),
        value: x.total,
        heightPx: zero ? 8 : Math.max(12, Math.round((x.total / max) * BAR_MAX_PX)),
        zero,
      };
    });
  }

  private weekdayLabel(day: string): string {
    const parts = day.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      const [y, mo, d] = parts;
      return WEEKDAYS[new Date(y, mo - 1, d).getDay()];
    }
    return day.slice(5);
  }

  private statusColor(
    status: CredentialStatusKey | undefined,
    label: string,
    idAccessStatus?: number,
  ): string {
    if (idAccessStatus === 1) return STATUS_COLORS.awaitingProducer;
    if (idAccessStatus === 2) return STATUS_COLORS.awaitingApproval;
    if (idAccessStatus === 3) return STATUS_COLORS.approved;
    if (idAccessStatus === 4) return STATUS_COLORS.denied;
    if (idAccessStatus === 5) return STATUS_COLORS.expired;

    const key = (status || this.normalizeLabel(label)).toUpperCase();
    const l = (label || '').toLowerCase();
    if (key === 'ACTIVE') return STATUS_COLORS.approved;
    if (key === 'DENIED') return STATUS_COLORS.denied;
    if (key === 'EXPIRED') return STATUS_COLORS.expired;
    if (key === 'PENDING') {
      if (l.includes('produtora')) return STATUS_COLORS.awaitingProducer;
      return STATUS_COLORS.awaitingApproval;
    }
    return STATUS_COLORS.unknown;
  }

  private normalizeLabel(label: string): CredentialStatusKey {
    const l = (label || '').toLowerCase();
    if (l.startsWith('aprov') || l.startsWith('ativ')) return 'ACTIVE';
    if (l.startsWith('pend') || l.startsWith('aguard')) return 'PENDING';
    if (l.startsWith('neg') || l.startsWith('reprov')) return 'DENIED';
    if (l.startsWith('expir') || l.startsWith('venc') || l.includes('autorização')) return 'EXPIRED';
    return 'UNKNOWN';
  }
}
