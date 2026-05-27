import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TenantService, AzureTenant, TenantStatusItem } from '../../../services/tenant.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent, ActionMenuComponent } from '../../../shared/actions';
import { SettingsReloadable } from '../settings-reloadable';
import Swal from 'sweetalert2';

export interface TenantDashboardItem extends AzureTenant {
  connectionStatus: 'ok' | 'error' | 'inactive' | 'unknown';
  statusMessage: string | null;
}

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionMenuComponent, ActionBtnComponent],
  template: `
    <div>
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h2 class="page-section-title">Status Tenants Azure</h2>
          <p class="page-section-subtitle">
            Visão geral da conectividade e cadastro dos tenants Azure AD do sistema.
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            type="button"
            (click)="carregar(true)"
            [disabled]="loading()"
            class="btn-secondary disabled:opacity-50"
          >
            {{ loading() ? 'Atualizando...' : 'Atualizar status' }}
          </button>
          <button type="button" (click)="novoTenant()" class="btn-primary">+ Novo tenant</button>
        </div>
      </div>

      <!-- Resumo -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Total</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stats().total }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Ativos</p>
          <p class="text-2xl font-bold text-indigo-600 mt-1">{{ stats().ativos }}</p>
        </div>
        <div class="card-surface p-4 border-emerald-200 bg-emerald-50/50">
          <p class="text-xs font-bold text-emerald-700 uppercase">Conectados</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ stats().conectados }}</p>
        </div>
        <div class="card-surface p-4 border-rose-200 bg-rose-50/50">
          <p class="text-xs font-bold text-rose-700 uppercase">Com erro</p>
          <p class="text-2xl font-bold text-rose-700 mt-1">{{ stats().comErro }}</p>
        </div>
      </div>

      <!-- Dashboard de tenants -->
      <div *ngIf="loading() && dashboardItems().length === 0" class="card-surface p-10 text-center text-slate-500">
        Carregando status dos tenants...
      </div>

      <div
        *ngIf="!loading() || dashboardItems().length > 0"
        class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6"
      >
        <article
          *ngFor="let t of dashboardItems()"
          class="card-surface p-5 flex flex-col gap-3 border-l-4"
          [class.border-l-emerald-500]="t.connectionStatus === 'ok'"
          [class.border-l-rose-500]="t.connectionStatus === 'error'"
          [class.border-l-slate-300]="t.connectionStatus === 'inactive' || t.connectionStatus === 'unknown'"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="font-bold text-slate-800 truncate" [title]="t.nome">{{ t.nome }}</h3>
              <p class="text-xs font-mono text-slate-500 truncate mt-0.5" [title]="t.azure_tenant_id">
                {{ t.azure_tenant_id }}
              </p>
            </div>
            <span
              class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
              [class.bg-emerald-100]="t.connectionStatus === 'ok'"
              [class.text-emerald-800]="t.connectionStatus === 'ok'"
              [class.bg-rose-100]="t.connectionStatus === 'error'"
              [class.text-rose-800]="t.connectionStatus === 'error'"
              [class.bg-slate-100]="t.connectionStatus === 'inactive'"
              [class.text-slate-600]="t.connectionStatus === 'inactive'"
              [class.bg-amber-100]="t.connectionStatus === 'unknown'"
              [class.text-amber-800]="t.connectionStatus === 'unknown'"
            >
              {{ statusLabel(t.connectionStatus) }}
            </span>
          </div>

          <p class="text-sm text-slate-600 flex-1">
            {{ statusDetail(t) }}
          </p>

          <div class="flex flex-wrap gap-2 text-xs">
            <span
              *ngIf="t.eh_principal"
              class="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold"
            >
              Principal (MSAL)
            </span>
            <span
              class="px-2 py-0.5 rounded-md font-medium"
              [class.bg-emerald-100]="t.ativo"
              [class.text-emerald-800]="t.ativo"
              [class.bg-slate-100]="!t.ativo"
              [class.text-slate-600]="!t.ativo"
            >
              {{ t.ativo ? 'Ativo' : 'Inativo' }}
            </span>
            <span
              *ngIf="t.hasSecret === false"
              class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium"
            >
              Sem secret
            </span>
          </div>

          <div class="pt-1 border-t border-slate-100">
            <ng-container *ngTemplateOutlet="tenantActions; context: { $implicit: t }"></ng-container>
          </div>
        </article>

        <div
          *ngIf="dashboardItems().length === 0 && !loading()"
          class="md:col-span-2 xl:col-span-3 card-surface p-10 text-center text-slate-500"
        >
          Nenhum tenant cadastrado. Clique em <strong>Novo tenant</strong> para começar.
        </div>
      </div>

      <!-- Tabela detalhada -->
      <div class="card-surface overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 class="text-xs font-bold text-slate-500 uppercase">Detalhes cadastrais</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="table-head">
            <tr>
              <th class="px-4 py-3">Nome</th>
              <th class="px-4 py-3">Tenant ID</th>
              <th class="px-4 py-3">Client ID</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of dashboardItems()" class="border-t border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3 font-medium text-slate-800">{{ t.nome }}</td>
              <td class="px-4 py-3 font-mono text-xs truncate max-w-[160px] text-slate-600" [title]="t.azure_tenant_id">
                {{ t.azure_tenant_id }}
              </td>
              <td class="px-4 py-3 font-mono text-xs truncate max-w-[160px] text-slate-600" [title]="t.client_id">
                {{ t.client_id }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="t.connectionStatus === 'ok'"
                  [class.text-emerald-800]="t.connectionStatus === 'ok'"
                  [class.bg-rose-100]="t.connectionStatus === 'error'"
                  [class.text-rose-800]="t.connectionStatus === 'error'"
                  [class.bg-slate-100]="t.connectionStatus === 'inactive'"
                  [class.text-slate-600]="t.connectionStatus === 'inactive'"
                  [class.bg-amber-100]="t.connectionStatus === 'unknown'"
                  [class.text-amber-800]="t.connectionStatus === 'unknown'"
                >
                  {{ statusLabel(t.connectionStatus) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <ng-container *ngTemplateOutlet="tenantActions; context: { $implicit: t }"></ng-container>
              </td>
            </tr>
            <tr *ngIf="dashboardItems().length === 0 && !loading()">
              <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum tenant cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ng-template #tenantActions let-t>
        <app-action-menu>
          <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(t)" />
          <app-action-btn
            icon="document"
            title="Ver diagnóstico"
            variant="primary"
            (action)="verDiagnostico(t)"
          />
          <app-action-btn
            icon="link"
            title="Copiar Tenant ID"
            variant="neutral"
            (action)="copiarTenantId(t)"
          />
          <app-action-btn
            *ngIf="t.ativo"
            icon="delete"
            title="Desativar"
            variant="danger"
            (action)="desativar(t)"
          />
        </app-action-menu>
      </ng-template>
    </div>

    <!-- Modal Novo / Editar tenant -->
    <div
      *ngIf="showModal()"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="'tenant-modal-title'"
    >
      <button
        type="button"
        class="absolute inset-0 bg-slate-900/50"
        aria-label="Fechar"
        (click)="fecharModal()"
      ></button>

      <div class="relative w-full max-w-2xl card-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-4 mb-4">
          <h3 id="tenant-modal-title" class="text-lg font-bold text-slate-800">
            {{ editingId ? 'Editar tenant' : 'Novo tenant' }}
          </h3>
          <button
            type="button"
            (click)="fecharModal()"
            class="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="form.nome"
              name="nome"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Azure Tenant ID</label>
            <input
              [(ngModel)]="form.azure_tenant_id"
              name="azure_tenant_id"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Client ID</label>
            <input
              [(ngModel)]="form.client_id"
              name="client_id"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase"
              >Client Secret {{ editingId ? '(deixe vazio para manter)' : '' }}</label
            >
            <input
              type="password"
              [(ngModel)]="form.client_secret"
              name="client_secret"
              [required]="!editingId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div class="flex items-center gap-4 md:col-span-2">
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" />
              Ativo
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" [(ngModel)]="form.eh_principal" name="eh_principal" />
              Tenant principal (MSAL)
            </label>
          </div>
          <div class="md:col-span-2 flex gap-2 justify-end pt-2">
            <button
              type="button"
              (click)="fecharModal()"
              class="px-4 py-2 border border-[var(--app-border)] rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button type="submit" [disabled]="saving" class="btn-secondary disabled:opacity-50">
              {{ saving ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TenantListComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private tenants = signal<AzureTenant[]>([]);
  private statusByTenantId = signal<Map<string, TenantStatusItem>>(new Map());

  loading = signal(false);
  showModal = signal(false);
  dashboardItems = computed<TenantDashboardItem[]>(() => this.buildDashboardItems());

  stats = computed(() => {
    const items = this.dashboardItems();
    return {
      total: items.length,
      ativos: items.filter((t) => t.ativo).length,
      conectados: items.filter((t) => t.connectionStatus === 'ok').length,
      comErro: items.filter((t) => t.connectionStatus === 'error').length,
    };
  });

  editingId: number | null = null;
  saving = false;

  form: AzureTenant = {
    nome: '',
    azure_tenant_id: '',
    client_id: '',
    client_secret: '',
    ativo: true,
    eh_principal: false,
  };

  constructor(
    private tenantService: TenantService,
    private notification: NotificationService,
  ) {}

  reloadPage() {
    this.carregar();
  }

  carregar(refreshStatus = false) {
    this.loading.set(true);

    const requests = {
      list: this.tenantService.list(),
      status: this.tenantService.status(),
    };

    forkJoin(requests).subscribe({
      next: ({ list, status }) => {
        this.tenants.set(list.tenants);
        const map = new Map<string, TenantStatusItem>();
        for (const s of status.tenants) {
          map.set(s.tenantId, s);
        }
        this.statusByTenantId.set(map);
        this.loading.set(false);
        this.cdr.markForCheck();
        if (refreshStatus) {
          this.notification.success('Status atualizado.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.cdr.markForCheck();
        this.tenantService.list().subscribe({
          next: (res) => {
            this.tenants.set(res.tenants);
            this.notification.error('Não foi possível testar as conexões. Lista carregada sem diagnóstico.');
          },
          error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tenants.'),
        });
      },
    });
  }

  private buildDashboardItems(): TenantDashboardItem[] {
    const statusMap = this.statusByTenantId();
    return this.tenants().map((t) => {
      let connectionStatus: TenantDashboardItem['connectionStatus'] = 'unknown';
      let statusMessage: string | null = null;

      if (!t.ativo) {
        connectionStatus = 'inactive';
        statusMessage = 'Tenant desativado — não participa dos testes de conexão.';
      } else {
        const diag = statusMap.get(t.azure_tenant_id);
        if (diag) {
          connectionStatus = diag.status === 'ok' ? 'ok' : 'error';
          statusMessage =
            diag.status === 'ok'
              ? diag.message || 'Conexão com Microsoft Graph validada.'
              : diag.message || 'Falha na conexão.';
        } else if (!t.hasSecret) {
          connectionStatus = 'error';
          statusMessage = 'Client secret não configurado.';
        } else {
          connectionStatus = 'unknown';
          statusMessage = 'Aguardando diagnóstico de conexão.';
        }
      }

      return { ...t, connectionStatus, statusMessage };
    });
  }

  statusLabel(status: TenantDashboardItem['connectionStatus']): string {
    const labels: Record<TenantDashboardItem['connectionStatus'], string> = {
      ok: 'Conectado',
      error: 'Erro',
      inactive: 'Inativo',
      unknown: 'Pendente',
    };
    return labels[status];
  }

  statusDetail(t: TenantDashboardItem): string {
    return t.statusMessage || '—';
  }

  novoTenant() {
    this.editingId = null;
    this.form = {
      nome: '',
      azure_tenant_id: '',
      client_id: '',
      client_secret: '',
      ativo: true,
      eh_principal: false,
    };
    this.showModal.set(true);
  }

  editar(t: AzureTenant) {
    this.editingId = t.id!;
    this.form = {
      nome: t.nome,
      azure_tenant_id: t.azure_tenant_id,
      client_id: t.client_id,
      client_secret: '',
      ativo: t.ativo,
      eh_principal: t.eh_principal,
    };
    this.showModal.set(true);
  }

  fecharModal() {
    if (this.saving) return;
    this.showModal.set(false);
    this.editingId = null;
  }

  salvar() {
    this.saving = true;
    const payload = { ...this.form };
    if (!payload.client_secret) delete payload.client_secret;

    const req = this.editingId
      ? this.tenantService.update(this.editingId, payload)
      : this.tenantService.create(payload);

    req.subscribe({
      next: () => {
        this.saving = false;
        this.showModal.set(false);
        this.editingId = null;
        this.notification.success('Tenant salvo.');
        this.carregar();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar.'));
      },
    });
  }

  verDiagnostico(t: TenantDashboardItem) {
    Swal.fire({
      title: t.nome,
      html: `
        <p class="text-left text-sm mb-2"><strong>Status:</strong> ${this.statusLabel(t.connectionStatus)}</p>
        <p class="text-left text-sm mb-2"><strong>Diagnóstico:</strong> ${t.statusMessage || '—'}</p>
        <p class="text-left text-sm mb-2 font-mono text-xs break-all"><strong>Tenant ID:</strong> ${t.azure_tenant_id}</p>
        <p class="text-left text-sm font-mono text-xs break-all"><strong>Client ID:</strong> ${t.client_id}</p>
      `,
      icon: t.connectionStatus === 'ok' ? 'success' : t.connectionStatus === 'error' ? 'error' : 'info',
      confirmButtonText: 'Fechar',
    });
  }

  async copiarTenantId(t: AzureTenant) {
    try {
      await navigator.clipboard.writeText(t.azure_tenant_id);
      this.notification.success('Tenant ID copiado.');
    } catch {
      this.notification.error('Não foi possível copiar.');
    }
  }

  desativar(t: AzureTenant) {
    Swal.fire({
      title: 'Desativar tenant?',
      text: t.nome,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Desativar',
    }).then((r) => {
      if (r.isConfirmed && t.id) {
        this.tenantService.remove(t.id).subscribe({
          next: () => {
            this.notification.success('Tenant desativado.');
            this.carregar();
          },
          error: () => this.notification.error('Falha ao desativar.'),
        });
      }
    });
  }
}
