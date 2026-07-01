import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
        <table class="w-full text-sm min-w-[720px]">
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
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let v of vehicles()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-mono font-semibold">{{ v.plate }}</td>
              <td class="px-4 py-3">{{ v.brand || '—' }}</td>
              <td class="px-4 py-3">{{ v.model || '—' }}</td>
              <td class="px-4 py-3">{{ v.color || '—' }}</td>
              <td class="px-4 py-3">{{ v.type || '—' }}</td>
              <td class="px-4 py-3">{{ v.company_fancy_name || '—' }}</td>
              <td class="px-4 py-3">{{ v.description || '—' }}</td>
              <td class="px-4 py-3">{{ v.status ? 'Ativo' : 'Inativo' }}</td>
            </tr>
            <tr *ngIf="!loading() && vehicles().length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-slate-500">Nenhum veículo.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-lg shadow-xl">
        <h3 class="text-lg font-bold mb-4">Novo veículo</h3>
        <form class="space-y-3" (ngSubmit)="salvar()">
          <div *ngIf="isAdmin">
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
            <input [(ngModel)]="form.plate" name="plate" required class="w-full mt-1 border rounded-xl px-3 py-2 text-sm font-mono uppercase" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Marca</label>
              <input [(ngModel)]="form.brand" name="brand" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" placeholder="Ex.: Toyota" />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Modelo</label>
              <input [(ngModel)]="form.model" name="model" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" placeholder="Ex.: Corolla" />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Cor</label>
              <input [(ngModel)]="form.color" name="color" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" placeholder="Ex.: Prata" />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
              <input [(ngModel)]="form.type" name="type" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" placeholder="Ex.: Sedan" />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Descrição</label>
            <input [(ngModel)]="form.description" name="description" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" (click)="fecharModal()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Salvar</button>
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
  isAdmin = false;
  form = {
    plate: '',
    brand: '',
    model: '',
    color: '',
    type: '',
    description: '',
    id_company: null as number | null,
  };

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

  carregarEmpresas() {
    this.companyService.list(1, 500, {}).subscribe({
      next: (res) => this.companies.set(res.companies.filter((c) => c.status)),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
  }

  carregar() {
    this.loading.set(true);
    this.vehicleService.list().subscribe({
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
    this.form = {
      plate: '',
      brand: '',
      model: '',
      color: '',
      type: '',
      description: '',
      id_company: null,
    };
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (this.isAdmin && !this.form.id_company) {
      this.notification.error('Selecione a empresa do veículo.');
      return;
    }
    this.saving.set(true);
    this.vehicleService
      .create({
        plate: this.form.plate.trim().toUpperCase(),
        brand: this.form.brand.trim() || null,
        model: this.form.model.trim() || null,
        color: this.form.color.trim() || null,
        type: this.form.type.trim() || null,
        description: this.form.description.trim() || null,
        ...(this.isAdmin && this.form.id_company ? { id_company: this.form.id_company } : {}),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success('Veículo cadastrado.');
          this.fecharModal();
          this.carregar();
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar veículo.');
        },
      });
  }
}
