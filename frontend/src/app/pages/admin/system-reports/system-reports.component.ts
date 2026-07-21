import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  AuditFilters,
  AuditLogItem,
  ErrorFilters,
  ErrorLogItem,
  SystemReportsService,
} from '../../../services/system-reports.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';

type ReportTab = 'audit' | 'errors';

@Component({
  selector: 'app-system-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Relatórios do sistema</h2>
          <p class="page-section-subtitle">
            Consulte logs de auditoria e erros da aplicação. Exporte os registros filtrados em Excel.
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            type="button"
            (click)="exportar()"
            [disabled]="exporting"
            class="btn-secondary disabled:opacity-50"
          >
            {{ exporting ? 'Exportando...' : 'Exportar Excel' }}
          </button>
          <button type="button" (click)="recarregar()" class="btn-primary">Atualizar</button>
        </div>
      </div>

      <div class="flex gap-2 mb-4 border-b border-slate-200">
        <button
          type="button"
          (click)="setTab('audit')"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          [class.border-[var(--color-primary)]]="activeTab === 'audit'"
          [class.text-[var(--color-primary-dark)]]="activeTab === 'audit'"
          [class.border-transparent]="activeTab !== 'audit'"
          [class.text-slate-500]="activeTab !== 'audit'"
        >
          Auditoria
        </button>
        <button
          type="button"
          (click)="setTab('errors')"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
          [class.border-[var(--color-primary)]]="activeTab === 'errors'"
          [class.text-[var(--color-primary-dark)]]="activeTab === 'errors'"
          [class.border-transparent]="activeTab !== 'errors'"
          [class.text-slate-500]="activeTab !== 'errors'"
        >
          Erros do sistema
        </button>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <div *ngIf="activeTab === 'audit'">
            <label class="text-xs font-bold text-slate-500 uppercase">Módulo</label>
            <input
              [(ngModel)]="auditFilters.module"
              (ngModelChange)="onTextFilterChange()"
              name="auditModule"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              placeholder="ex.: auth"
            />
          </div>
          <div *ngIf="activeTab === 'audit'">
            <label class="text-xs font-bold text-slate-500 uppercase">Ação</label>
            <input
              [(ngModel)]="auditFilters.action"
              (ngModelChange)="onTextFilterChange()"
              name="auditAction"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              placeholder="ex.: LOGIN"
            />
          </div>
          <div *ngIf="activeTab === 'audit'">
            <label class="text-xs font-bold text-slate-500 uppercase">ID usuário</label>
            <input
              type="number"
              [(ngModel)]="auditFilters.user_id"
              (ngModelChange)="onTextFilterChange()"
              name="auditUserId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div *ngIf="activeTab === 'errors'">
            <label class="text-xs font-bold text-slate-500 uppercase">Módulo</label>
            <input
              [(ngModel)]="errorFilters.module"
              (ngModelChange)="onTextFilterChange()"
              name="errorModule"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              placeholder="ex.: smtp"
            />
          </div>
          <div *ngIf="activeTab === 'errors'">
            <label class="text-xs font-bold text-slate-500 uppercase">Nível</label>
            <select
              [(ngModel)]="errorFilters.level"
              (ngModelChange)="aplicarFiltros()"
              name="errorLevel"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="error">error</option>
              <option value="warn">warn</option>
            </select>
          </div>
          <div *ngIf="activeTab === 'errors'">
            <label class="text-xs font-bold text-slate-500 uppercase">Status HTTP</label>
            <input
              type="number"
              [(ngModel)]="errorFilters.status_code"
              (ngModelChange)="onTextFilterChange()"
              name="errorStatus"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Data inicial</label>
            <input
              type="date"
              [(ngModel)]="dateFrom"
              (ngModelChange)="aplicarFiltros()"
              name="dateFrom"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Data final</label>
            <input
              type="date"
              [(ngModel)]="dateTo"
              (ngModelChange)="aplicarFiltros()"
              name="dateTo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-1.5 px-4">
            Limpar
          </button>
        </div>
      </div>

      <div class="card-surface overflow-hidden" *ngIf="activeTab === 'audit'">
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 class="text-xs font-bold text-slate-500 uppercase">Logs de auditoria</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Data</th>
              <th class="px-4 py-3 text-left">Usuário</th>
              <th class="px-4 py-3 text-left">Ação</th>
              <th class="px-4 py-3 text-left">Módulo</th>
              <th class="px-4 py-3 text-left">IP</th>
              <th class="px-4 py-3 text-left">Request ID</th>
              <th class="px-4 py-3 text-left">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading; else loadingRow">
              <tr
                *ngFor="let item of auditItems"
                class="border-t border-slate-100 hover:bg-slate-50"
              >
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {{ item.created_at | date: 'dd/MM/yy HH:mm:ss' }}
                </td>
                <td class="px-4 py-3">{{ item.user_id ?? '—' }}</td>
                <td class="px-4 py-3 font-medium">{{ item.action }}</td>
                <td class="px-4 py-3">{{ item.module }}</td>
                <td class="px-4 py-3 text-xs text-slate-600">{{ item.ip || '—' }}</td>
                <td class="px-4 py-3 text-xs font-mono truncate max-w-[120px]" [title]="item.request_id || ''">
                  {{ item.request_id || '—' }}
                </td>
                <td class="px-4 py-3">
                  <button
                    type="button"
                    (click)="verDetalheAuditoria(item)"
                    class="text-sm text-[var(--color-primary-dark)] hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
              <tr *ngIf="auditItems.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">
                  Nenhum registro de auditoria encontrado.
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
        <ng-container *ngTemplateOutlet="paginationBar"></ng-container>
      </div>

      <div class="card-surface overflow-hidden" *ngIf="activeTab === 'errors'">
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 class="text-xs font-bold text-slate-500 uppercase">Logs de erros</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Data</th>
              <th class="px-4 py-3 text-left">Nível</th>
              <th class="px-4 py-3 text-left">Módulo</th>
              <th class="px-4 py-3 text-left">Mensagem</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Rota</th>
              <th class="px-4 py-3 text-left">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading; else loadingRow">
              <tr
                *ngFor="let item of errorItems"
                class="border-t border-slate-100 hover:bg-slate-50"
              >
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {{ item.created_at | date: 'dd/MM/yy HH:mm:ss' }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-rose-100]="item.level === 'error'"
                    [class.text-rose-800]="item.level === 'error'"
                    [class.bg-amber-100]="item.level === 'warn'"
                    [class.text-amber-800]="item.level === 'warn'"
                  >
                    {{ item.level }}
                  </span>
                </td>
                <td class="px-4 py-3">{{ item.module }}</td>
                <td class="px-4 py-3 truncate max-w-[220px]" [title]="item.message">
                  {{ item.message }}
                </td>
                <td class="px-4 py-3">{{ item.status_code ?? '—' }}</td>
                <td class="px-4 py-3 text-xs truncate max-w-[140px]" [title]="rotaCompleta(item)">
                  {{ rotaCompleta(item) }}
                </td>
                <td class="px-4 py-3">
                  <button
                    type="button"
                    (click)="verDetalheErro(item)"
                    class="text-sm text-[var(--color-primary-dark)] hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
              <tr *ngIf="errorItems.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">
                  Nenhum erro registrado.
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
        <ng-container *ngTemplateOutlet="paginationBar"></ng-container>
      </div>
    </div>

    <ng-template #loadingRow>
      <tr>
        <td colspan="7" class="px-4 py-8 text-center text-slate-500">Carregando...</td>
      </tr>
    </ng-template>

    <ng-template #paginationBar>
      <div
        *ngIf="pagination.totalPages > 1"
        class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
      >
        <span class="text-xs text-slate-500">
          Página {{ pagination.page }} de {{ pagination.totalPages }} ({{ pagination.total }}
          registros)
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            (click)="irPagina(pagination.page - 1)"
            [disabled]="pagination.page <= 1"
            class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            (click)="irPagina(pagination.page + 1)"
            [disabled]="pagination.page >= pagination.totalPages"
            class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class SystemReportsComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: ReportTab = 'audit';
  loading = true;
  exporting = false;

  auditItems: AuditLogItem[] = [];
  errorItems: ErrorLogItem[] = [];
  pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };

  auditFilters: AuditFilters = {};
  errorFilters: ErrorFilters = {};
  dateFrom = '';
  dateTo = '';
  private readonly filterDebounceMs = 350;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private systemReports: SystemReportsService,
    private notification: NotificationService,
  ) {
    this.carregar();
  }

  reloadPage() {
    this.recarregar();
  }

  setTab(tab: ReportTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.pagination.page = 1;
    this.carregar();
  }

  onTextFilterChange() {
    if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
  }

  aplicarFiltros() {
    this.pagination.page = 1;
    this.carregar();
  }

  limparFiltros() {
    if (this.filterDebounceTimer !== null) {
      clearTimeout(this.filterDebounceTimer);
      this.filterDebounceTimer = null;
    }
    this.auditFilters = {};
    this.errorFilters = {};
    this.dateFrom = '';
    this.dateTo = '';
    this.pagination.page = 1;
    this.carregar();
  }

  recarregar() {
    this.carregar(this.pagination.page);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.carregar(page);
  }

  exportar() {
    this.exporting = true;
    const obs =
      this.activeTab === 'audit'
        ? this.systemReports.exportAudit(this.getAuditFiltersWithDates())
        : this.systemReports.exportErrors(this.getErrorFiltersWithDates());

    obs.subscribe({
      next: (blob) => {
        const prefix = this.activeTab === 'audit' ? 'audit-logs' : 'error-logs';
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this.downloadBlob(blob, `${prefix}-${date}.xlsx`);
        this.exporting = false;
        this.notification.success('Exportação concluída.');
        this.cdr.markForCheck();
      },
      error: () => {
        this.exporting = false;
        this.notification.error('Falha ao exportar relatório.');
        this.cdr.markForCheck();
      },
    });
  }

  verDetalheAuditoria(item: AuditLogItem) {
    const meta = this.formatJson(item.metadata);
    Swal.fire({
      title: `Auditoria #${item.id}`,
      html: `<pre class="text-left text-xs max-h-96 overflow-auto whitespace-pre-wrap">${this.escapeHtml(
        `Ação: ${item.action}\nMódulo: ${item.module}\nUsuário: ${item.user_id ?? '—'}\nIP: ${item.ip || '—'}\nClient: ${item.client_type || '—'}\nRequest ID: ${item.request_id || '—'}\n\nMetadata:\n${meta}`,
      )}</pre>`,
      width: 640,
      confirmButtonText: 'Fechar',
    });
  }

  verDetalheErro(item: ErrorLogItem) {
    const meta = this.formatJson(item.metadata);
    const stack = item.stack || '—';
    Swal.fire({
      title: `Erro #${item.id}`,
      html: `<pre class="text-left text-xs max-h-96 overflow-auto whitespace-pre-wrap">${this.escapeHtml(
        `Nível: ${item.level}\nMódulo: ${item.module}\nStatus: ${item.status_code ?? '—'}\nRota: ${this.rotaCompleta(item)}\nMensagem: ${item.message}\n\nStack:\n${stack}\n\nMetadata:\n${meta}`,
      )}</pre>`,
      width: 720,
      confirmButtonText: 'Fechar',
    });
  }

  rotaCompleta(item: ErrorLogItem): string {
    if (!item.method && !item.path) return '—';
    return `${item.method || ''} ${item.path || ''}`.trim();
  }

  private carregar(page = 1) {
    this.loading = true;
    if (this.activeTab === 'audit') {
      this.systemReports
        .listAudit(page, this.pagination.limit, this.getAuditFiltersWithDates())
        .subscribe({
          next: (res) => {
            this.auditItems = res.items;
            this.pagination = res.pagination;
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.loading = false;
            this.notification.notifyHttpError(err, 'Falha ao carregar logs de auditoria.');
            this.cdr.markForCheck();
          },
        });
    } else {
      this.systemReports
        .listErrors(page, this.pagination.limit, this.getErrorFiltersWithDates())
        .subscribe({
          next: (res) => {
            this.errorItems = res.items;
            this.pagination = res.pagination;
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.loading = false;
            this.notification.notifyHttpError(err, 'Falha ao carregar logs de erros.');
            this.cdr.markForCheck();
          },
        });
    }
  }

  private getAuditFiltersWithDates(): AuditFilters {
    return {
      ...this.auditFilters,
      from: this.dateFrom || undefined,
      to: this.dateTo || undefined,
    };
  }

  private getErrorFiltersWithDates(): ErrorFilters {
    return {
      ...this.errorFilters,
      from: this.dateFrom || undefined,
      to: this.dateTo || undefined,
    };
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private formatJson(value: unknown): string {
    if (value == null) return '—';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
