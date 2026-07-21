import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EventItem, EventService } from '../../services/event.service';
import {
  DenialModuleKey,
  DenialReportFilters,
  DenialReportItem,
  ReportsService,
} from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-credential-denials-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Negações de credenciamento</h2>
          <p class="page-section-subtitle">
            Consulte as recusas registradas em todos os módulos (até 500 registros mais recentes).
          </p>
        </div>
        <button
          type="button"
          (click)="load()"
          [disabled]="loading()"
          class="btn-secondary disabled:opacity-50 shrink-0"
        >
          {{ loading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Módulo</label>
            <select
              [(ngModel)]="filterModule"
              (ngModelChange)="applyFilters()"
              name="filterModule"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos os módulos</option>
              <option *ngFor="let mod of modules" [value]="mod.key">{{ mod.label }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Evento</label>
            <select
              [(ngModel)]="filterIdEvent"
              (ngModelChange)="applyFilters()"
              name="filterIdEvent"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos os eventos</option>
              <option *ngFor="let event of events()" [value]="event.id_event">
                {{ event.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Data inicial</label>
            <input
              type="date"
              [(ngModel)]="filterDateFrom"
              (ngModelChange)="applyFilters()"
              name="filterDateFrom"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Data final</label>
            <input
              type="date"
              [(ngModel)]="filterDateTo"
              (ngModelChange)="applyFilters()"
              name="filterDateTo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="clearFilters()" class="btn-secondary text-sm py-1.5 px-4">
            Limpar
          </button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Módulo</th>
                <th class="px-4 py-3 text-left">Colaborador</th>
                <th class="px-4 py-3 text-left">Documento</th>
                <th class="px-4 py-3 text-left">Contexto</th>
                <th class="px-4 py-3 text-left">Empresa</th>
                <th class="px-4 py-3 text-left">Status na negação</th>
                <th class="px-4 py-3 text-left">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loading(); else loadingRow">
                <tr
                  *ngFor="let item of items(); trackBy: trackByDenial"
                  class="border-t border-slate-100 hover:bg-slate-50 align-top"
                >
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {{ item.denied_at | date: 'dd/MM/yy HH:mm' }}
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {{ item.module_label }}
                    </span>
                  </td>
                  <td class="px-4 py-3 font-medium">{{ item.collaborator_name }}</td>
                  <td class="px-4 py-3 font-mono text-xs text-slate-600">
                    {{ item.collaborator_document }}
                  </td>
                  <td class="px-4 py-3">{{ item.context_name }}</td>
                  <td class="px-4 py-3">{{ item.company_fancy_name }}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      {{ item.status_at_denial }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-700 max-w-xs">{{ item.reason }}</td>
                </tr>
                <tr *ngIf="items().length === 0">
                  <td colspan="8" class="px-4 py-8 text-center text-slate-500">
                    Nenhuma negação encontrada.
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
          {{ items().length }} registro(s) — exibindo no máximo 500 mais recentes
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
export class CredentialDenialsReportComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  readonly modules: { key: DenialModuleKey; label: string }[] = [
    { key: 'credential', label: 'Credencial' },
    { key: 'service_access', label: 'Acesso de serviço' },
    { key: 'event', label: 'Evento' },
    { key: 'document', label: 'Documento' },
  ];

  loading = signal(false);
  items = signal<DenialReportItem[]>([]);
  events = signal<EventItem[]>([]);

  filterModule = '';
  filterIdEvent = '';
  filterDateFrom = '';
  filterDateTo = '';

  constructor(
    private reportsService: ReportsService,
    private eventService: EventService,
    private notification: NotificationService,
  ) {}

  ngOnInit(): void {
    this.loadEvents();
    this.load();
  }

  trackByDenial(_index: number, item: DenialReportItem): string {
    return `${item.module_key}-${item.id_denial}`;
  }

  applyFilters(): void {
    this.load();
  }

  clearFilters(): void {
    this.filterModule = '';
    this.filterIdEvent = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reportsService.getDenials(this.buildFilters()).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar negações de credenciamento.');
        this.cdr.markForCheck();
      },
    });
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

  private buildFilters(): DenialReportFilters {
    return {
      module: this.filterModule || undefined,
      id_event: this.filterIdEvent || undefined,
      date_from: this.filterDateFrom || undefined,
      date_to: this.filterDateTo || undefined,
    };
  }
}
