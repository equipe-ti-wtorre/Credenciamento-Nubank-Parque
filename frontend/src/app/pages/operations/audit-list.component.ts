import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AuditFilterOptions,
  AuditFilters,
  AuditLogItem,
  AuditService,
} from '../../services/audit.service';
import { NotificationService } from '../../core/services/notification.service';
import { ActionBtnComponent } from '../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../shared/actions/action-menu.component';
import { ModalComponent } from '../../shared/modal/modal.component';

const ACTION_LABELS: Record<string, string> = {
  LIST: 'Listar',
  READ: 'Visualizar',
  CREATE: 'Criar',
  UPDATE: 'Atualizar',
  DELETE: 'Excluir',
  DEACTIVATE: 'Desativar',
  ACTIVATE: 'Ativar',
  SYNC: 'Sincronizar',
  LOGIN: 'Login',
  LOGIN_MICROSOFT: 'Login Microsoft',
  LOGIN_FAILED: 'Login falhou',
  LOGOUT: 'Logout',
  EXPORT: 'Exportar',
  APPROVE: 'Aprovar',
  REJECT: 'Reprovar',
  CANCEL: 'Cancelar',
};

const MODULE_LABELS: Record<string, string> = {
  users: 'Usuários internos',
  auth: 'Autenticação',
  tenants: 'Tenants Azure',
  smtp: 'Envios de e-mail',
  teams: 'Integração Teams',
  'system-reports': 'Relatórios do sistema',
  system_settings: 'Configurações do sistema',
  email_templates: 'Templates de e-mail',
  companies: 'Empresas',
  collaborators: 'Colaboradores',
  events: 'Eventos',
  credentials: 'Credenciais',
  gate: 'Portaria',
  approvals: 'Aprovações',
  sectors: 'Times',
  event_accreditation: 'Credenciamento',
  company_users: 'Usuários de empresas',
  profiles: 'Perfis',
  materials: 'Mercadorias',
  patrimonial: 'Patrimonial',
  vehicles: 'Frota',
  'service-access': 'Acessos de serviço',
  collaborator_blocklist: 'Gestão de bloqueio',
  facial: 'Reconhecimento facial',
  facial_settings: 'Integração facial',
  alerts: 'Alertas',
  reports: 'Relatórios operacionais',
  audit: 'Auditoria',
};

@Component({
  selector: 'app-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionBtnComponent, ActionMenuComponent, ModalComponent],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Auditoria</h2>
          <p class="page-section-subtitle">
            Consulte todas as consultas, logins e alterações feitas no sistema, com o usuário responsável.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            (click)="recarregar()"
            [disabled]="loading"
            class="btn-action-secondary disabled:opacity-50"
          >
            {{ loading ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button
            type="button"
            (click)="exportar()"
            [disabled]="exporting || loading"
            class="btn-action-tonal disabled:opacity-50"
          >
            {{ exporting ? 'Exportando...' : 'Exportar Excel' }}
          </button>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label class="form-label" for="audit-module">Módulo</label>
            <select
              id="audit-module"
              name="auditModule"
              class="form-select"
              [(ngModel)]="filters.module"
              (ngModelChange)="aplicarFiltros()"
            >
              <option value="">Todos</option>
              <option *ngFor="let module of filterOptions.modules" [value]="module">
                {{ moduleLabel(module) }}
              </option>
            </select>
          </div>
          <div>
            <label class="form-label" for="audit-action">Ação</label>
            <select
              id="audit-action"
              name="auditAction"
              class="form-select"
              [(ngModel)]="filters.action"
              (ngModelChange)="aplicarFiltros()"
            >
              <option value="">Todas</option>
              <option *ngFor="let action of filterOptions.actions" [value]="action">
                {{ actionLabel(action) }}
              </option>
            </select>
          </div>
          <div>
            <label class="form-label" for="audit-user">Usuário</label>
            <input
              id="audit-user"
              name="auditUser"
              class="form-field"
              type="text"
              [(ngModel)]="filters.q"
              (ngModelChange)="onTextFilterChange()"
              placeholder="Nome ou e-mail"
            />
          </div>
          <div>
            <label class="form-label" for="audit-from">Data inicial</label>
            <input
              id="audit-from"
              name="auditFrom"
              class="form-field"
              type="date"
              [(ngModel)]="filters.from"
              (ngModelChange)="aplicarFiltros()"
            />
          </div>
          <div>
            <label class="form-label" for="audit-to">Data final</label>
            <input
              id="audit-to"
              name="auditTo"
              class="form-field"
              type="date"
              [(ngModel)]="filters.to"
              (ngModelChange)="aplicarFiltros()"
            />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="limparFiltros()" class="btn-action-secondary text-sm py-1.5 px-4">
            Limpar
          </button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="px-4 py-3 border-b border-[var(--app-border)] bg-[var(--color-bg-surface-alt)]">
          <h3 class="text-xs font-bold text-[var(--text-muted)] uppercase">Registros de auditoria</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Usuário</th>
                <th class="px-4 py-3 text-left">Ação</th>
                <th class="px-4 py-3 text-left">Módulo</th>
                <th class="px-4 py-3 text-left">Recurso</th>
                <th class="px-4 py-3 text-left">Resultado</th>
                <th class="px-4 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loading; else loadingRow">
                <tr *ngFor="let item of items" class="border-t border-[var(--app-border)] hover:bg-[var(--color-bg-surface-alt)]">
                  <td class="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                    {{ item.created_at | date: 'dd/MM/yy HH:mm:ss' }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="font-medium text-[var(--text-primary)]">{{ userName(item) }}</div>
                    <div class="text-xs text-[var(--text-muted)]" *ngIf="userEmail(item)">
                      {{ userEmail(item) }}
                    </div>
                  </td>
                  <td class="px-4 py-3 font-medium">{{ actionLabel(item.action) }}</td>
                  <td class="px-4 py-3">{{ moduleLabel(item.module) }}</td>
                  <td class="px-4 py-3 text-xs truncate max-w-[220px]" [title]="resourceLabel(item)">
                    {{ resourceLabel(item) }}
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [class.bg-emerald-100]="outcome(item) === 'success'"
                      [class.text-emerald-800]="outcome(item) === 'success'"
                      [class.bg-rose-100]="outcome(item) === 'failure'"
                      [class.text-rose-800]="outcome(item) === 'failure'"
                      [class.bg-slate-100]="!outcome(item)"
                      [class.text-slate-600]="!outcome(item)"
                    >
                      {{ outcomeLabel(item) }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <app-action-menu>
                      <app-action-btn
                        icon="document"
                        title="Detalhes"
                        variant="neutral"
                        (action)="abrirDetalhe(item)"
                      />
                    </app-action-menu>
                  </td>
                </tr>
                <tr *ngIf="items.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-[var(--text-muted)]">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
        <ng-template #loadingRow>
          <tr>
            <td colspan="7" class="px-4 py-8 text-center text-[var(--text-muted)]">Carregando...</td>
          </tr>
        </ng-template>
        <div
          *ngIf="pagination.totalPages > 1"
          class="px-4 py-3 border-t border-[var(--app-border)] flex items-center justify-between shrink-0"
        >
          <span class="text-xs text-[var(--text-muted)]">
            Página {{ pagination.page }} de {{ pagination.totalPages }} ({{ pagination.total }} registros)
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="irPagina(pagination.page - 1)"
              [disabled]="pagination.page <= 1"
              class="btn-action-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              (click)="irPagina(pagination.page + 1)"
              [disabled]="pagination.page >= pagination.totalPages"
              class="btn-action-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="!!selected"
      [title]="selected ? 'Auditoria #' + selected.id : 'Detalhe'"
      [subtitle]="selected ? actionLabel(selected.action) + ' · ' + moduleLabel(selected.module) : ''"
      size="lg"
      (close)="fecharDetalhe()"
    >
      <ng-container *ngIf="selected as item">
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="form-label">Data</dt>
            <dd>{{ item.created_at | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
          </div>
          <div>
            <dt class="form-label">Usuário</dt>
            <dd>{{ userName(item) }}<span *ngIf="userEmail(item)"> · {{ userEmail(item) }}</span></dd>
          </div>
          <div>
            <dt class="form-label">IP</dt>
            <dd>{{ item.ip || '—' }}</dd>
          </div>
          <div>
            <dt class="form-label">Cliente</dt>
            <dd>{{ item.client_type || '—' }}</dd>
          </div>
          <div>
            <dt class="form-label">Recurso</dt>
            <dd>{{ resourceLabel(item) }}</dd>
          </div>
          <div>
            <dt class="form-label">Request ID</dt>
            <dd class="font-mono text-xs break-all">{{ item.request_id || '—' }}</dd>
          </div>
          <div *ngIf="item.metadata?.http as http" class="sm:col-span-2">
            <dt class="form-label">HTTP</dt>
            <dd>{{ http.method || '' }} {{ http.path || '—' }} · {{ http.status ?? '—' }}</dd>
          </div>
        </dl>

        <div class="mt-5" *ngIf="hasDiff(item); else changesJson">
          <h3 class="form-label mb-2">Alterações</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="rounded-xl border border-[var(--app-border)] p-3">
              <p class="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Antes</p>
              <pre class="text-xs whitespace-pre-wrap break-all">{{ formatJson(diffValue(item, 'before')) }}</pre>
            </div>
            <div class="rounded-xl border border-[var(--app-border)] p-3">
              <p class="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Depois</p>
              <pre class="text-xs whitespace-pre-wrap break-all">{{ formatJson(diffValue(item, 'after')) }}</pre>
            </div>
          </div>
        </div>
        <ng-template #changesJson>
          <div class="mt-5" *ngIf="item.metadata?.changes != null">
            <h3 class="form-label mb-2">Alterações</h3>
            <pre class="text-xs whitespace-pre-wrap break-all rounded-xl border border-[var(--app-border)] p-3">{{
              formatJson(item.metadata?.changes)
            }}</pre>
          </div>
        </ng-template>
      </ng-container>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharDetalhe()">Fechar</button>
      </div>
    </app-modal>
  `,
})
export class AuditListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly audit = inject(AuditService);
  private readonly notification = inject(NotificationService);
  private readonly filterDebounceMs = 500;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  loading = true;
  exporting = false;
  items: AuditLogItem[] = [];
  selected: AuditLogItem | null = null;
  filterOptions: AuditFilterOptions = { modules: [], actions: [], users: [] };
  filters: AuditFilters = { module: '', action: '', q: '', from: '', to: '' };
  pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };

  ngOnInit() {
    this.carregarFiltros();
    this.carregar(1);
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] || action;
  }

  moduleLabel(module: string): string {
    return MODULE_LABELS[module] || module;
  }

  userName(item: AuditLogItem): string {
    return item.user?.name || (item.user_id != null ? `Usuário #${item.user_id}` : '—');
  }

  userEmail(item: AuditLogItem): string | null {
    return item.user?.email || null;
  }

  resourceLabel(item: AuditLogItem): string {
    const resource = item.metadata?.resource;
    if (resource == null) return '—';
    if (typeof resource !== 'object') return String(resource);
    const extras = [resource['nome'], resource['name'], resource['email']].filter(
      (value) => value != null && String(value).trim() !== '',
    );
    const parts = [resource.type, resource.id, ...extras].filter(
      (value) => value != null && String(value).trim() !== '',
    );
    return parts.length ? parts.map(String).join(' · ') : '—';
  }

  outcome(item: AuditLogItem): string | null {
    const value = item.metadata?.outcome;
    return value === 'success' || value === 'failure' ? value : null;
  }

  outcomeLabel(item: AuditLogItem): string {
    const value = this.outcome(item);
    if (value === 'success') return 'Sucesso';
    if (value === 'failure') return 'Falha';
    return '—';
  }

  hasDiff(item: AuditLogItem): boolean {
    const changes = item.metadata?.changes;
    return !!changes && typeof changes === 'object' && !Array.isArray(changes) && ('before' in changes || 'after' in changes);
  }

  diffValue(item: AuditLogItem, key: 'before' | 'after'): unknown {
    const changes = item.metadata?.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
    return (changes as Record<string, unknown>)[key] ?? null;
  }

  formatJson(value: unknown): string {
    if (value == null) return '—';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  onTextFilterChange() {
    if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
  }

  aplicarFiltros() {
    this.carregar(1);
  }

  limparFiltros() {
    this.filters = { module: '', action: '', q: '', from: '', to: '' };
    this.carregar(1);
  }

  recarregar() {
    this.carregar(this.pagination.page);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.carregar(page);
  }

  abrirDetalhe(item: AuditLogItem) {
    this.selected = item;
  }

  fecharDetalhe() {
    this.selected = null;
  }

  exportar() {
    this.exporting = true;
    this.audit.export(this.activeFilters()).subscribe({
      next: (blob) => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this.downloadBlob(blob, `auditoria-${date}.xlsx`);
        this.exporting = false;
        this.notification.success('Exportação concluída.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.exporting = false;
        this.notification.notifyHttpError(err, 'Falha ao exportar auditoria.');
        this.cdr.markForCheck();
      },
    });
  }

  private carregarFiltros() {
    this.audit.filters().subscribe({
      next: (options) => {
        this.filterOptions = options;
        this.cdr.markForCheck();
      },
      error: () => {
        this.filterOptions = { modules: [], actions: [], users: [] };
      },
    });
  }

  private carregar(page = 1) {
    this.loading = true;
    this.audit.list(page, this.pagination.limit, this.activeFilters()).subscribe({
      next: (res) => {
        this.items = res.items;
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
  }

  private activeFilters(): AuditFilters {
    return {
      module: this.filters.module,
      action: this.filters.action,
      q: this.filters.q,
      from: this.filters.from,
      to: this.filters.to,
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
}
