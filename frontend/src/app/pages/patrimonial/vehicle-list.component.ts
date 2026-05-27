import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Frota</h2>
          <p class="page-section-subtitle">Veículos cadastrados por empresa.</p>
        </div>
        <button type="button" class="btn-primary" (click)="abrirModal()">+ Novo veículo</button>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Placa</th>
              <th class="px-4 py-3 text-left">Empresa</th>
              <th class="px-4 py-3 text-left">Descrição</th>
              <th class="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let v of vehicles()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-mono font-semibold">{{ v.plate }}</td>
              <td class="px-4 py-3">{{ v.company_fancy_name || '—' }}</td>
              <td class="px-4 py-3">{{ v.description || '—' }}</td>
              <td class="px-4 py-3">{{ v.status ? 'Ativo' : 'Inativo' }}</td>
            </tr>
            <tr *ngIf="!loading() && vehicles().length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">Nenhum veículo.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold mb-4">Novo veículo</h3>
        <form class="space-y-3" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Placa</label>
            <input [(ngModel)]="form.plate" name="plate" required class="w-full mt-1 border rounded-xl px-3 py-2 text-sm font-mono uppercase" />
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
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  form = { plate: '', description: '' };

  constructor(
    private vehicleService: VehicleService,
    private notification: NotificationService,
  ) {}

  ngOnInit() {
    this.carregar();
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
    this.form = { plate: '', description: '' };
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    this.saving.set(true);
    this.vehicleService
      .create({ plate: this.form.plate.trim().toUpperCase(), description: this.form.description || null })
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
