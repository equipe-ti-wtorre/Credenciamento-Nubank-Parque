import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ActionBtnComponent } from '../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../shared/actions/action-menu.component';

interface VehicleFormState {
  plate: string;
  brand: string;
  model: string;
  color: string;
  type: string;
  description: string;
  status: boolean;
  id_company: number | null;
}

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ActionBtnComponent, ActionMenuComponent],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Frota</h2>
          <p class="page-section-subtitle">Veículos cadastrados por empresa.</p>
        </div>
        <button type="button" class="btn-primary" (click)="abrirModal()">+ Novo veículo</button>
      </div>

      <div class="card-surface overflow-x-auto">
        <table class="w-full text-sm min-w-[900px]">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Placa</th>
              <th class="px-4 py-3 text-left">Marca</th>
              <th class="px-4 py-3 text-left">Modelo</th>
              <th class="px-4 py-3 text-left">Cor</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Empresa</th>
              <th class="px-4 py-3 text-left">Descrição</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Restrição</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let v of vehicles()" class="border-t border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3 font-mono font-semibold">{{ v.plate }}</td>
              <td class="px-4 py-3">{{ v.brand || '—' }}</td>
              <td class="px-4 py-3">{{ v.model || '—' }}</td>
              <td class="px-4 py-3">{{ v.color || '—' }}</td>
              <td class="px-4 py-3">{{ v.type || '—' }}</td>
              <td class="px-4 py-3">{{ v.company_fancy_name || '—' }}</td>
              <td class="px-4 py-3">{{ v.description || '—' }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="v.status"
                  [class.text-emerald-800]="v.status"
                  [class.bg-slate-100]="!v.status"
                  [class.text-slate-600]="!v.status"
                >
                  {{ v.status ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  *ngIf="v.is_blacklisted"
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800"
                  [title]="v.blacklist_reason || ''"
                >
                  Blacklist
                </span>
                <span *ngIf="!v.is_blacklisted" class="text-slate-400 text-xs">—</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end">
                  <app-action-menu>
                    <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(v)" />
                    <app-action-btn
                      *ngIf="isAdmin && !v.is_blacklisted"
                      icon="delete"
                      title="Incluir na blacklist"
                      variant="danger"
                      (action)="incluirBlacklist(v)"
                    />
                    <app-action-btn
                      *ngIf="isAdmin && v.is_blacklisted"
                      icon="send"
                      title="Remover da blacklist"
                      variant="primary"
                      (action)="removerBlacklist(v)"
                    />
                  </app-action-menu>
                </div>
              </td>
            </tr>
            <tr *ngIf="!loading() && vehicles().length === 0">
              <td colspan="10" class="px-4 py-8 text-center text-slate-500">Nenhum veículo.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold mb-4">{{ editingId() ? 'Editar veículo' : 'Novo veículo' }}</h3>
        <form class="space-y-3" (ngSubmit)="salvar()">
          <div *ngIf="isAdmin && !editingId()">
            <label class="text-xs font-bold text-slate-500 uppercase">Empresa</label>
            <select
              [(ngModel)]="form.id_company"
              name="id_company"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Selecione...</option>
              <option *ngFor="let c of companies()" [ngValue]="c.id_company">
                {{ c.fancy_name || c.company_name }}
              </option>
            </select>
            <p class="text-xs text-slate-500 mt-1">
              Não encontrou a empresa?
              <a routerLink="/admin/empresas" class="text-[var(--color-primary-dark)] font-medium hover:underline">
                Cadastrar empresa
              </a>
            </p>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Placa</label>
            <input
              [(ngModel)]="form.plate"
              name="plate"
              required
              class="w-full mt-1 border rounded-xl px-3 py-2 text-sm font-mono uppercase"
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Marca</label>
              <input
                [(ngModel)]="form.brand"
                name="brand"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Toyota"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Modelo</label>
              <input
                [(ngModel)]="form.model"
                name="model"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Corolla"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Cor</label>
              <input
                [(ngModel)]="form.color"
                name="color"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Prata"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
              <input
                [(ngModel)]="form.type"
                name="type"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Sedan"
              />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Descrição</label>
            <input
              [(ngModel)]="form.description"
              name="description"
              class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div *ngIf="editingId()" class="flex items-center gap-2">
            <input
              type="checkbox"
              [(ngModel)]="form.status"
              name="status"
              id="vehicle-status"
              class="rounded border-slate-300"
            />
            <label for="vehicle-status" class="text-sm text-slate-700">Veículo ativo</label>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" (click)="fecharModal()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">
              {{ saving() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class VehicleListComponent implements OnInit {
  vehicles = signal<VehicleItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);
  isAdmin = false;
  form: VehicleFormState = this.emptyForm();

  constructor(
    private vehicleService: VehicleService,
    private companyService: CompanyService,
    private authService: AuthService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || user?.perfil || '').toUpperCase() === 'ADMIN';
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.carregar();
  }

  private emptyForm(): VehicleFormState {
    return {
      plate: '',
      brand: '',
      model: '',
      color: '',
      type: '',
      description: '',
      status: true,
      id_company: null,
    };
  }

  carregarEmpresas() {
    this.companyService.list(1, 500, {}).subscribe({
      next: (res) => this.companies.set(res.companies.filter((c) => c.status)),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
  }

  carregar() {
    this.loading.set(true);
    this.vehicleService.list(1, 100).subscribe({
      next: (res) => {
        this.vehicles.set(res.vehicles);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar frota.');
      },
    });
  }

  abrirModal() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.showModal.set(true);
  }

  editar(v: VehicleItem) {
    this.editingId.set(v.id_vehicle);
    this.form = {
      plate: v.plate,
      brand: v.brand || '',
      model: v.model || '',
      color: v.color || '',
      type: v.type || '',
      description: v.description || '',
      status: v.status,
      id_company: v.id_company,
    };
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  salvar() {
    const id = this.editingId();
    if (!id && this.isAdmin && !this.form.id_company) {
      this.notification.error('Selecione a empresa do veículo.');
      return;
    }

    const payload = {
      plate: this.form.plate.trim().toUpperCase(),
      brand: this.form.brand.trim() || null,
      model: this.form.model.trim() || null,
      color: this.form.color.trim() || null,
      type: this.form.type.trim() || null,
      description: this.form.description.trim() || null,
    };

    this.saving.set(true);

    const request$ = id
      ? this.vehicleService.update(id, { ...payload, status: this.form.status })
      : this.vehicleService.create({
          ...payload,
          ...(this.isAdmin && this.form.id_company ? { id_company: this.form.id_company } : {}),
        });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success(id ? 'Veículo atualizado.' : 'Veículo cadastrado.');
        this.fecharModal();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(
          err,
          id ? 'Falha ao atualizar veículo.' : 'Falha ao cadastrar veículo.',
        );
      },
    });
  }

  incluirBlacklist(v: VehicleItem) {
    Swal.fire({
      title: 'Incluir na lista de restrição?',
      html: `<p class="text-sm text-slate-600 mb-3">Veículo: <strong class="font-mono">${v.plate}</strong></p>`,
      input: 'textarea',
      inputLabel: 'Motivo (mín. 10 caracteres)',
      inputPlaceholder: 'Descreva o motivo da restrição global...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Incluir na blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'Informe um motivo com pelo menos 10 caracteres.';
        }
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      this.vehicleService.addBlacklist(v.id_vehicle, result.value.trim()).subscribe({
        next: () => {
          this.notification.success('Veículo incluído na blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao incluir na blacklist.');
        },
      });
    });
  }

  removerBlacklist(v: VehicleItem) {
    Swal.fire({
      title: 'Remover da lista de restrição?',
      text: `A placa ${v.plate} poderá voltar a acessar a arena.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.vehicleService.removeBlacklist(v.id_vehicle).subscribe({
        next: () => {
          this.notification.success('Veículo removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao remover da blacklist.');
        },
      });
    });
  }
}
