import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MaterialsService,
  StorageLocationItem,
  StorageLocationType,
} from '../../../services/materials.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';

@Component({
  selector: 'app-storage-location-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ActionBtnComponent, ActionMenuComponent],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Locais de armazenagem</h2>
          <p class="page-section-subtitle">Depósitos e lojas para movimentação de mercadorias.</p>
        </div>
        <button type="button" class="btn-primary" (click)="abrirModal()">+ Novo local</button>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let loc of locations()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ loc.name }}</td>
              <td class="px-4 py-3">{{ tipoLabel(loc.type) }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="loc.status"
                  [class.text-emerald-800]="loc.status"
                  [class.bg-slate-100]="!loc.status"
                  [class.text-slate-600]="!loc.status"
                >
                  {{ loc.status ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <app-action-menu>
                  <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(loc)" />
                  <app-action-btn
                    *ngIf="loc.status"
                    icon="delete"
                    title="Inativar"
                    variant="danger"
                    (action)="alterarStatus(loc, false)"
                  />
                  <app-action-btn
                    *ngIf="!loc.status"
                    icon="send"
                    title="Ativar"
                    variant="primary"
                    (action)="alterarStatus(loc, true)"
                  />
                </app-action-menu>
              </td>
            </tr>
            <tr *ngIf="!loading() && locations().length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">Nenhum local cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold mb-4">{{ editingId() ? 'Editar local' : 'Novo local' }}</h3>
        <form class="space-y-3" [formGroup]="form" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input formControlName="name" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
            <select formControlName="type" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white">
              <option value="DEPOSITO">Depósito</option>
              <option value="LOJA">Loja</option>
            </select>
          </div>
          <div *ngIf="editingId()">
            <label class="text-xs font-bold text-slate-500 uppercase">Status</label>
            <select formControlName="status" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white">
              <option [ngValue]="true">Ativo</option>
              <option [ngValue]="false">Inativo</option>
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" (click)="fecharModal()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || form.invalid">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class StorageLocationListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private materials = inject(MaterialsService);
  private notification = inject(NotificationService);

  locations = signal<StorageLocationItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    type: ['DEPOSITO' as StorageLocationType, Validators.required],
    status: [true],
  });

  ngOnInit() {
    this.carregar();
  }

  tipoLabel(type: StorageLocationType): string {
    return type === 'LOJA' ? 'Loja' : 'Depósito';
  }

  carregar() {
    this.loading.set(true);
    this.materials.listLocations().subscribe({
      next: (res) => {
        this.locations.set(res.locations);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar locais.');
      },
    });
  }

  abrirModal() {
    this.editingId.set(null);
    this.form.reset({ name: '', type: 'DEPOSITO', status: true });
    this.showModal.set(true);
  }

  editar(loc: StorageLocationItem) {
    this.editingId.set(loc.id_storage_location);
    this.form.reset({ name: loc.name, type: loc.type, status: loc.status });
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editingId();
    const value = this.form.getRawValue();
    const req = id
      ? this.materials.updateLocation(id, value)
      : this.materials.createLocation({ name: value.name, type: value.type });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success(id ? 'Local atualizado.' : 'Local cadastrado.');
        this.fecharModal();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(err, 'Falha ao salvar local.');
      },
    });
  }

  alterarStatus(loc: StorageLocationItem, ativo: boolean) {
    const req = ativo
      ? this.materials.activateLocation(loc.id_storage_location)
      : this.materials.inactivateLocation(loc.id_storage_location);
    req.subscribe({
      next: () => {
        this.notification.success(ativo ? 'Local ativado.' : 'Local inativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }
}
