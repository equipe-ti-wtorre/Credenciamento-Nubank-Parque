import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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

type AccessReportTab = 'all' | 'no_exit';

@Component({
  selector: 'app-access-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Relatório de acessos</h2>
          <p class="page-section-subtitle">
            Consulte entradas e saídas da portaria (credenciais de evento e acessos de serviço).
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            (click)="exportExcel()"
            [disabled]="loading() || exporting()"
            class="btn-secondary disabled:opacity-50"
          >
            {{ exporting() ? 'Exportando...' : 'Exportar Excel' }}
          </button>
          <button
            type="button"
            (click)="load()"
            [disabled]="loading()"
            class="btn-secondary disabled:opacity-50"
          >
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
        </div>
      </div>

      <div class="flex gap-1 border-b border-[var(--app-border)] mb-4 overflow-x-auto">
        <button
          type="button"
          class="relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-0 bg-transparent cursor-pointer"
          [class.text-slate-900]="activeTab() === 'all'"
          [class.text-slate-500]="activeTab() !== 'all'"
          (click)="setTab('all')"
        >
          Todos
          <span
            class="inline-flex min-w-[1.5rem] justify-center px-1.5 py-0.5 rounded-md text-xs font-bold"
            [class]="
              activeTab() === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            "
          >
            {{ allCount() }}
          </span>
          <span
            *ngIf="activeTab() === 'all'"
            class="absolute left-3 right-3 bottom-0 h-0.5 bg-slate-900 rounded-full"
          ></span>
        </button>
        <button
          type="button"
          class="relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-0 bg-transparent cursor-pointer"
          [class.text-slate-900]="activeTab() === 'no_exit'"
          [class.text-slate-500]="activeTab() !== 'no_exit'"
          (click)="setTab('no_exit')"
        >
          Sem saída
          <span
            class="inline-flex min-w-[1.5rem] justify-center px-1.5 py-0.5 rounded-md text-xs font-bold"
            [class]="
              activeTab() === 'no_exit'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800'
            "
          >
            {{ insideCount() }}
          </span>
          <span
            *ngIf="activeTab() === 'no_exit'"
            class="absolute left-3 right-3 bottom-0 h-0.5 bg-amber-600 rounded-full"
          ></span>
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Entradas</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ summary().total }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Ainda no local</p>
          <p class="text-2xl font-bold text-amber-700 mt-1">{{ summary().inside }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Saídas concluídas</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ summary().completed }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Evento</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ summary().by_source.event }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Colaborador</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">
            {{ summary().by_source.service_collaborator }}
          </p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Veículo</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">
            {{ summary().by_source.service_vehicle }}
          </p>
        </div>
      </div>

      <div class="card-surface px-3 py-2.5 mb-4 shrink-0">
        <div class="flex flex-wrap xl:flex-nowrap items-end gap-2">
          <div class="min-w-[7.5rem] flex-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Origem</label>
            <select
              [(ngModel)]="filterSource"
              name="filterSource"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Todas</option>
              <option *ngFor="let src of sources" [value]="src.key">{{ src.label }}</option>
            </select>
          </div>
          <div *ngIf="activeTab() === 'all'" class="min-w-[6.5rem] flex-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Status</label>
            <select
              [(ngModel)]="filterStatus"
              name="filterStatus"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option *ngFor="let st of statuses" [value]="st.key">{{ st.label }}</option>
            </select>
          </div>
          <div class="min-w-[8rem] flex-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Evento</label>
            <select
              [(ngModel)]="filterIdEvent"
              name="filterIdEvent"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option *ngFor="let event of events()" [value]="event.id_event">
                {{ event.name }}
              </option>
            </select>
          </div>
          <div *ngIf="companies().length" class="min-w-[8rem] flex-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Empresa</label>
            <select
              [(ngModel)]="filterIdCompany"
              name="filterIdCompany"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Todas</option>
              <option *ngFor="let company of companies()" [value]="company.id_company">
                {{ company.fancy_name || company.company_name }}
              </option>
            </select>
          </div>
          <div class="min-w-[8.5rem] w-[8.5rem] shrink-0">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">De</label>
            <input
              type="date"
              [(ngModel)]="filterDateFrom"
              name="filterDateFrom"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div class="min-w-[8.5rem] w-[8.5rem] shrink-0">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Até</label>
            <input
              type="date"
              [(ngModel)]="filterDateTo"
              name="filterDateTo"
              (ngModelChange)="applyFilters()"
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div class="min-w-[10rem] flex-[1.4]">
            <label class="text-[10px] font-bold text-slate-500 uppercase leading-none">Busca</label>
            <input
              type="text"
              [(ngModel)]="filterQ"
              name="filterQ"
              (ngModelChange)="onSearchInput()"
              placeholder="Nome, doc, placa..."
              class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            (click)="clearFilters()"
            class="btn-secondary text-sm py-1.5 px-3 shrink-0 self-end"
          >
            Limpar
          </button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Entrada</th>
                <th class="px-4 py-3 text-left">Saída</th>
                <th class="px-4 py-3 text-left">Origem</th>
                <th class="px-4 py-3 text-left">Pessoa / Veículo</th>
                <th class="px-4 py-3 text-left">Documento / Placa</th>
                <th class="px-4 py-3 text-left">Contexto</th>
                <th class="px-4 py-3 text-left">Empresa</th>
                <th class="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loading(); else loadingRow">
                <tr
                  *ngFor="let item of items(); trackBy: trackByAccess"
                  class="border-t border-slate-100 hover:bg-slate-50 align-top"
                >
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {{ item.check_in | date: 'dd/MM/yy HH:mm' }}
                  </td>
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {{ item.check_out ? (item.check_out | date: 'dd/MM/yy HH:mm') : '—' }}
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700"
                    >
                      {{ item.source_label }}
                    </span>
                  </td>
                  <td class="px-4 py-3 font-medium">{{ item.person_or_vehicle }}</td>
                  <td class="px-4 py-3 font-mono text-xs text-slate-600">
                    {{ item.document_or_plate }}
                  </td>
                  <td class="px-4 py-3">{{ item.context_name }}</td>
                  <td class="px-4 py-3">{{ item.company_fancy_name }}</td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [class]="
                        item.check_out
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      "
                    >
                      {{ item.check_out ? 'Concluído' : 'No local' }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="items().length === 0">
                  <td colspan="8" class="px-4 py-8 text-center text-slate-500">
                    {{
                      activeTab() === 'no_exit'
                        ? 'Nenhum acesso sem saída registrada.'
                        : 'Nenhum acesso encontrado.'
                    }}
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>

        <div
          *ngIf="!loading()"
          class="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500"
        >
          {{ items().length }} de {{ summary().total }} registro(s) — lista limitada a 1000 mais
          recentes
        </div>
      </div>
    </div>

    <ng-template #loadingRow>
      <tr>
        <td colspan="8" class="px-4 py-8 text-center text-slate-500">Carregando...</td>
      </tr>
    </ng-template>
  `,
})
export class AccessReportComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSub: Subscription | null = null;

  readonly sources: { key: AccessSourceKey; label: string }[] = [
    { key: 'event', label: 'Credencial de evento' },
    { key: 'service_collaborator', label: 'Serviço — colaborador' },
    { key: 'service_vehicle', label: 'Serviço — veículo' },
  ];

  readonly statuses: { key: AccessStatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'inside', label: 'Ainda no local' },
    { key: 'completed', label: 'Saída concluída' },
  ];

  loading = signal(false);
  exporting = signal(false);
  activeTab = signal<AccessReportTab>('all');
  allCount = signal(0);
  insideCount = signal(0);
  items = signal<AccessReportItem[]>([]);
  events = signal<EventItem[]>([]);
  companies = signal<CompanyItem[]>([]);
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
