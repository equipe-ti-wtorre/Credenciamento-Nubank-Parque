import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MaterialsService,
  StorageLocationItem,
  StorageLocationType,
} from '../../../services/materials.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../../shared/actions';
import { ModalComponent } from '../../../shared/modal/modal.component';

@Component({
  selector: 'app-storage-location-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ActionMenuComponent,
    ModalComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Locais de armazenagem</h2>
          <p class="page-section-subtitle">Depósitos e lojas para movimentação de mercadorias.</p>
        </div>
        <button type="button" class="btn-action-primary" (click)="abrirModal()">+ Novo local</button>
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
                  <app-action-btn icon="edit" title="Editar local" variant="neutral" (action)="editar(loc)" />
                  <app-action-dropdown>
                    <button appActionDropdownItem type="button" (click)="alterarStatus(loc, !loc.status)">
                      <svg
                        class="action-dropdown__item-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        @if (loc.status) {
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                          <path d="M12 2v10" />
                        } @else {
                          <path d="M22 2L11 13" />
                          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                        }
                      </svg>
                      {{ loc.status ? 'Inativar' : 'Ativar' }}
                    </button>
                  </app-action-dropdown>
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

    <app-modal
      [open]="showModal()"
      [title]="editingId() ? 'Editar local' : 'Novo local'"
      size="sm"
      (close)="fecharModal()"
    >
      <form id="location-form" class="space-y-3" [formGroup]="form" (ngSubmit)="salvar()">
        <div>
          <label class="form-label" for="location-name">Nome</label>
          <input id="location-name" formControlName="name" class="form-field" />
        </div>
        <div>
          <label class="form-label" for="location-type">Tipo</label>
          <select id="location-type" formControlName="type" class="form-select">
            <option value="DEPOSITO">Depósito</option>
            <option value="LOJA">Loja</option>
          </select>
        </div>
        <div *ngIf="editingId()">
          <label class="form-label" for="location-status">Status</label>
          <select id="location-status" formControlName="status" class="form-select">
            <option [ngValue]="true">Ativo</option>
            <option [ngValue]="false">Inativo</option>
          </select>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
        <button type="submit" form="location-form" class="btn-action-primary" [disabled]="saving() || form.invalid">
          {{ saving() ? 'Salvando...' : (editingId() ? 'Salvar local' : 'Criar local') }}
        </button>
      </div>
    </app-modal>
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
