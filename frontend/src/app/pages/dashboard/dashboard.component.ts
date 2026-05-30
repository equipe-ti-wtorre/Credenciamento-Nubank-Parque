import { Component, OnInit, ViewEncapsulation, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';
import {
  CredentialStatusKey,
  DashboardMetrics,
  ReportsService,
} from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';

interface StatCard {
  label: string;
  value: number | string;
  iconHtml: SafeHtml;
  tone: 'violet' | 'amber' | 'blue';
  delta?: string;
  deltaType?: 'up' | 'down' | 'flat';
}
interface Slice {
  name: string;
  value: number;
  color: string;
}
interface DayBar {
  day: string;
  value: number;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  user: Awaited<ReturnType<AuthService['getCurrentUser']>> = null;
  userName = '';
  loading = signal(true);
  metrics = signal<DashboardMetrics | null>(null);

  stats = signal<StatCard[]>([]);
  slices = signal<Slice[]>([]);
  week = signal<DayBar[]>([]);

  totalCredenciais = computed(() => this.slices().reduce((acc, s) => acc + s.value, 0));
  maxAcessos = computed(() => Math.max(...this.week().map((d) => d.value), 1));

  /** Icones SVG sanitizados UMA vez (sem chamada de metodo no template). */
  private readonly iconMap: Map<string, SafeHtml>;
  private readonly rawIcons: Record<string, string> = {
    building:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M9 11h2M9 15h2M14 7h1M14 11h1M14 15h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>',
    userplus:
      '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 11h-6M19 8v6" stroke-linecap="round" stroke-linejoin="round"/>',
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
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>`,
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
    const role = String(this.user?.role || '').toUpperCase();
    if (['ADMIN', 'PRODUTORA', 'PADRAO'].includes(role)) {
      this.loadMetrics();
    } else {
      this.loading.set(false);
    }
  }

  loadMetrics() {
    this.loading.set(true);
    this.reportsService.getDashboard().subscribe({
      next: (m) => {
        this.metrics.set(m);
        this.stats.set(this.buildStats(m));
        this.slices.set(
          m.credentialsByStatus.map((x) => ({
            name: x.label,
            value: x.total,
            color: this.statusColor(x.status, x.label),
          })),
        );
        this.week.set(this.buildWeek(m));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar dashboard.');
      },
    });
  }

  private buildStats(m: DashboardMetrics): StatCard[] {
    return [
      {
        label: 'Empresas ativas',
        value: m.kpis.activeCompanies,
        iconHtml: this.icon('building'),
        tone: 'violet',
      },
      {
        label: 'Aguardando Allianz',
        value: m.kpis.pendingAllianz,
        iconHtml: this.icon('clock'),
        tone: 'amber',
        delta: 'Pendente',
        deltaType: 'flat',
      },
      {
        label: 'Acessos hoje',
        value: m.kpis.accessesToday,
        iconHtml: this.icon('userplus'),
        tone: 'blue',
        ...this.accessesDelta(m.accessesLast7Days),
      },
    ];
  }

  /** Delta defensivo: hoje = ultimo item ordenado por data, ontem = penultimo. */
  private accessesDelta(
    days: { day: string; total: number }[],
  ): Pick<StatCard, 'delta' | 'deltaType'> {
    if (!days || days.length < 2) {
      return {};
    }
    const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
    const today = sorted[sorted.length - 1].total;
    const yesterday = sorted[sorted.length - 2].total;
    const diff = today - yesterday;
    const deltaType: StatCard['deltaType'] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';

    if (yesterday === 0) {
      // Evita divisao por zero: usa variacao absoluta.
      return { delta: `${diff >= 0 ? '+' : ''}${diff}`, deltaType };
    }
    const pct = Math.round((diff / yesterday) * 100);
    return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, deltaType };
  }

  private buildWeek(m: DashboardMetrics): DayBar[] {
    const sorted = [...m.accessesLast7Days].sort((a, b) => a.day.localeCompare(b.day));
    return sorted.map((x) => ({ day: this.weekdayLabel(x.day), value: x.total }));
  }

  private weekdayLabel(day: string): string {
    const parts = day.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      const [y, mo, d] = parts;
      return WEEKDAYS[new Date(y, mo - 1, d).getDay()];
    }
    return day.slice(5);
  }

  /** Cor por CHAVE estavel; cai no normalizador do label e por fim em muted. */
  private statusColor(status: CredentialStatusKey | undefined, label: string): string {
    const key = (status || this.normalizeLabel(label)).toUpperCase();
    switch (key) {
      case 'ACTIVE':
        return 'var(--wt-success)';
      case 'PENDING':
        return 'var(--wt-warning)';
      case 'EXPIRED':
        return 'var(--wt-danger)';
      default:
        return 'var(--wt-muted)';
    }
  }

  /** Ponte temporaria ate a API enviar `status`. */
  private normalizeLabel(label: string): CredentialStatusKey {
    const l = (label || '').toLowerCase();
    if (l.startsWith('ativ')) return 'ACTIVE';
    if (l.startsWith('pend') || l.startsWith('aguard')) return 'PENDING';
    if (l.startsWith('expir') || l.startsWith('venc')) return 'EXPIRED';
    return 'UNKNOWN';
  }

  dashOffset(index: number): number {
    const total = this.totalCredenciais() || 1;
    const before = this.slices()
      .slice(0, index)
      .reduce((acc, s) => acc + s.value, 0);
    return -(before / total) * 100;
  }

  dashArray(value: number): string {
    const total = this.totalCredenciais() || 1;
    const len = (value / total) * 100;
    return `${len} ${100 - len}`;
  }
}
