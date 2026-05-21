import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TenantService, AzureTenant, TenantStatusItem } from '../../../services/tenant.service';
import { NotificationService } from '../../../core/services/notification.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6 mb-6">
        <div>
          <h1 class="text-2xl font-black text-gray-800">Tenants Azure AD</h1>
          <p class="text-gray-500 text-sm mt-1">
            Cadastre e gerencie os tenants.
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            (click)="testarTodos()"
            [disabled]="loadingStatus"
            class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {{ loadingStatus ? 'Testando...' : 'Testar conexões' }}
          </button>
          <button
            type="button"
            (click)="novoTenant()"
            class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold"
          >
            + Novo tenant
          </button>
        </div>
      </div>

      <div *ngIf="showForm" class="mb-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <h2 class="text-lg font-bold mb-4">{{ editingId ? 'Editar' : 'Novo' }} tenant</h2>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase">Nome</label>
            <input [(ngModel)]="form.nome" name="nome" required class="w-full mt-1 border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase">Azure Tenant ID</label>
            <input
              [(ngModel)]="form.azure_tenant_id"
              name="azure_tenant_id"
              required
              class="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase">Client ID</label>
            <input
              [(ngModel)]="form.client_id"
              name="client_id"
              required
              class="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-gray-500 uppercase"
              >Client Secret {{ editingId ? '(deixe vazio para manter)' : '' }}</label
            >
            <input
              type="password"
              [(ngModel)]="form.client_secret"
              name="client_secret"
              class="w-full mt-1 border rounded-lg px-3 py-2"
            />
          </div>
          <div class="flex items-center gap-4 md:col-span-2">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" />
              Ativo
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="form.eh_principal" name="eh_principal" />
              Tenant principal (MSAL)
            </label>
          </div>
          <div class="md:col-span-2 flex gap-2">
            <button type="submit" [disabled]="saving" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">
              {{ saving ? 'Salvando...' : 'Salvar' }}
            </button>
            <button type="button" (click)="cancelarForm()" class="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
          </div>
        </form>
      </div>

      <div *ngIf="statusList().length" class="mb-6 space-y-2">
        <h3 class="text-sm font-bold text-gray-600 uppercase">Último diagnóstico</h3>
        <div
          *ngFor="let s of statusList()"
          class="p-3 rounded-lg border text-sm flex justify-between"
          [class.border-emerald-200]="s.status === 'ok'"
          [class.border-rose-200]="s.status !== 'ok'"
        >
          <span class="font-medium">{{ s.label }}</span>
          <span>{{ s.status === 'ok' ? 'OK' : s.message }}</span>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="px-4 py-3">Nome</th>
              <th class="px-4 py-3">Tenant ID</th>
              <th class="px-4 py-3">Principal</th>
              <th class="px-4 py-3">Ativo</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tenants()" class="border-t border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">{{ t.nome }}</td>
              <td class="px-4 py-3 font-mono text-xs truncate max-w-[200px]" [title]="t.azure_tenant_id">
                {{ t.azure_tenant_id }}
              </td>
              <td class="px-4 py-3">{{ t.eh_principal ? 'Sim' : '—' }}</td>
              <td class="px-4 py-3">{{ t.ativo ? 'Sim' : 'Não' }}</td>
              <td class="px-4 py-3 text-right space-x-2">
                <button type="button" (click)="editar(t)" class="text-blue-600 hover:underline">Editar</button>
                <button
                  *ngIf="t.ativo"
                  type="button"
                  (click)="desativar(t)"
                  class="text-rose-600 hover:underline"
                >
                  Desativar
                </button>
              </td>
            </tr>
            <tr *ngIf="tenants().length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-gray-500">Nenhum tenant cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class TenantListComponent implements OnInit {
  tenants = signal<AzureTenant[]>([]);
  statusList = signal<TenantStatusItem[]>([]);
  showForm = false;
  editingId: number | null = null;
  saving = false;
  loadingStatus = false;

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

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.tenantService.list().subscribe({
      next: (res) => this.tenants.set(res.tenants),
      error: () => this.notification.error('Falha ao carregar tenants.'),
    });
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
    this.showForm = true;
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
    this.showForm = true;
  }

  cancelarForm() {
    this.showForm = false;
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
        this.showForm = false;
        this.notification.success('Tenant salvo.');
        this.carregar();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(
          this.notification.extractErrorMessage(err, 'Falha ao salvar.'),
        );
      },
    });
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

  testarTodos() {
    this.loadingStatus = true;
    this.tenantService.status().subscribe({
      next: (res) => {
        this.statusList.set(res.tenants);
        this.loadingStatus = false;
      },
      error: () => {
        this.loadingStatus = false;
        this.notification.error('Falha no diagnóstico.');
      },
    });
  }
}
