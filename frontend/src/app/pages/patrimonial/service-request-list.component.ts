import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatrimonialService, ServiceAccessItem } from '../../services/patrimonial.service';
import { VehicleService, VehicleItem } from '../../services/vehicle.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-service-request-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Solicitações de serviço</h2>
          <p class="page-section-subtitle">Acesso patrimonial de veículos à arena.</p>
        </div>
        <button type="button" class="btn-primary" (click)="abrirModal()">+ Nova solicitação</button>
      </div>

      <div class="space-y-3">
        <div *ngFor="let s of services()" class="card-surface p-4">
          <div class="flex justify-between gap-2">
            <div>
              <p class="font-semibold text-slate-800">{{ s.service_type }}</p>
              <p class="text-sm text-slate-500">{{ s.company_fancy_name }} · {{ s.access_status_description }}</p>
            </div>
            <button
              *ngIf="isAdmin && s.id_access_status === 2"
              type="button"
              class="btn-primary text-xs py-1 px-3"
              (click)="aprovar(s)"
            >
              Aprovar
            </button>
          </div>
          <p class="text-xs text-slate-500 mt-2">
            Datas: {{ s.dates.join(', ') || '—' }} · Veículos:
            {{ s.vehicles.map((v) => v.plate).join(', ') || '—' }}
          </p>
        </div>
        <p *ngIf="!loading() && services().length === 0" class="text-slate-500 text-sm">Nenhuma solicitação.</p>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold mb-4">Nova solicitação</h3>
        <form class="space-y-3" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo de serviço</label>
            <input [(ngModel)]="form.service_type" name="service_type" required class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Data (AAAA-MM-DD)</label>
            <input [(ngModel)]="form.date" name="date" type="date" required class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Veículos</label>
            <select [(ngModel)]="form.selectedVehicles" name="vehicles" multiple class="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white min-h-[100px]">
              <option *ngFor="let v of fleet()" [value]="v.id_vehicle">{{ v.plate }}</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" (click)="fecharModal()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Enviar</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class ServiceRequestListComponent implements OnInit {
  services = signal<ServiceAccessItem[]>([]);
  fleet = signal<VehicleItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  isAdmin = false;
  form = { service_type: '', date: '', selectedVehicles: [] as number[] };

  constructor(
    private patrimonialService: PatrimonialService,
    private vehicleService: VehicleService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
    this.carregar();
    this.vehicleService.list(1, 200).subscribe({
      next: (res) => this.fleet.set(res.vehicles.filter((v) => v.status)),
    });
  }

  carregar() {
    this.loading.set(true);
    this.patrimonialService.list().subscribe({
      next: (res) => {
        this.services.set(res.services);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar solicitações.');
      },
    });
  }

  abrirModal() {
    this.form = { service_type: '', date: '', selectedVehicles: [] };
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (!this.form.selectedVehicles.length) {
      this.notification.error('Selecione ao menos um veículo.');
      return;
    }
    this.saving.set(true);
    this.patrimonialService
      .create({
        service_type: this.form.service_type.trim(),
        dates: [this.form.date],
        id_vehicles: this.form.selectedVehicles,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success('Solicitação enviada. Aguardando aprovação.');
          this.fecharModal();
          this.carregar();
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao criar solicitação.');
        },
      });
  }

  aprovar(s: ServiceAccessItem) {
    this.patrimonialService.patchStatus(s.id_service_access, { id_access_status: 3 }).subscribe({
      next: () => {
        this.notification.success('Solicitação aprovada.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao aprovar.'),
    });
  }
}
