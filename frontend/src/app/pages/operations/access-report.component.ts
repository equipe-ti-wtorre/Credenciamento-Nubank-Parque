import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { EventItem, EventService } from '../../services/event.service';
import {
  AccessReportFilters,
  AccessReportItem,
  AccessReportSummary,
  AccessSourceKey,
  AccessStatusFilter,
  ReportsService,
} from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';

type AccessReportTab = 'all' | 'no_exit';

@Component({
  selector: 'app-access-report',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchSelectComponent],
  templateUrl: './access-report.component.html',
  styleUrl: './access-report.component.scss',
})
export class AccessReportComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSub: Subscription | null = null;

  readonly sources: { key: AccessSourceKey; label: string }[] = [
    { key: 'service_collaborator', label: 'Serviço — colaborador' },
    { key: 'service_vehicle', label: 'Serviço — veículo' },
    { key: 'event', label: 'Evento' },
  ];

  readonly statuses: { key: AccessStatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'inside', label: 'No local' },
    { key: 'completed', label: 'Concluído' },
  ];

  loading = signal(false);
  exporting = signal(false);
  activeTab = signal<AccessReportTab>('all');
  allCount = signal(0);
  insideCount = signal(0);
  items = signal<AccessReportItem[]>([]);
  events = signal<EventItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  readonly eventOptions = computed(() =>
    this.events().map((event) => ({
      value: String(event.id_event),
      label: event.name,
    })),
  );
  summary = signal<AccessReportSummary>({
    total: 0,
    inside: 0,
    completed: 0,
    by_source: { event: 0, service_collaborator: 0, service_vehicle: 0 },
  });

  filterSource = '';
  filterStatus: AccessStatusFilter = 'all';
  filterIdEvent = '';
  filterIdCompany = '';
  filterDateFrom = '';
  filterDateTo = '';
  filterQ = '';

  constructor(
    private reportsService: ReportsService,
    private eventService: EventService,
    private companyService: CompanyService,
    private notification: NotificationService,
  ) {}

  ngOnInit(): void {
    this.loadEvents();
    this.loadCompanies();
    this.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.loadSub?.unsubscribe();
  }

  trackByAccess(_index: number, item: AccessReportItem): string {
    return `${item.source_key}-${item.access_id}-${item.check_in}`;
  }

  setTab(tab: AccessReportTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  onSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  clearFilters(): void {
    this.filterSource = '';
    this.filterStatus = 'all';
    this.filterIdEvent = '';
    this.filterIdCompany = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterQ = '';
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadSub?.unsubscribe();
    this.loadSub = this.reportsService.getAccesses(this.buildFilters()).subscribe({
      next: (res) => {
        const summary = res.summary ?? {
          total: 0,
          inside: 0,
          completed: 0,
          by_source: { event: 0, service_collaborator: 0, service_vehicle: 0 },
        };
        this.items.set(res.data ?? []);
        this.summary.set(summary);
        if (this.activeTab() === 'all') {
          this.allCount.set(summary.total);
          this.insideCount.set(summary.inside);
        } else {
          this.insideCount.set(summary.total);
        }
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar relatório de acessos.');
        this.cdr.markForCheck();
      },
    });
  }

  exportExcel(): void {
    this.exporting.set(true);
    this.reportsService.exportAccesses(this.buildFilters()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const suffix = this.activeTab() === 'no_exit' ? 'sem-saida' : 'completo';
        this.downloadBlob(blob, `relatorio-acessos-${suffix}-${date}.xlsx`);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.exporting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao exportar relatório de acessos.');
        this.cdr.markForCheck();
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadEvents(): void {
    this.eventService.list(1, 100).subscribe({
      next: (res) => {
        this.events.set(res.events ?? []);
        this.cdr.markForCheck();
      },
      error: () => {
        this.events.set([]);
      },
    });
  }

  private loadCompanies(): void {
    this.companyService.list(1, 200).subscribe({
      next: (res) => {
        this.companies.set(res.companies ?? []);
        this.cdr.markForCheck();
      },
      error: () => {
        this.companies.set([]);
      },
    });
  }

  private buildFilters(): AccessReportFilters {
    const status: AccessStatusFilter | undefined =
      this.activeTab() === 'no_exit'
        ? 'inside'
        : this.filterStatus !== 'all'
          ? this.filterStatus
          : undefined;

    return {
      source: this.filterSource || undefined,
      status,
      id_event: this.filterIdEvent || undefined,
      id_company: this.filterIdCompany || undefined,
      date_from: this.filterDateFrom || undefined,
      date_to: this.filterDateTo || undefined,
      q: this.filterQ || undefined,
    };
  }
}
