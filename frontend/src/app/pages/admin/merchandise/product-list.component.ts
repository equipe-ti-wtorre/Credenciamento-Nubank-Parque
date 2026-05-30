import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialsService, ProductItem } from '../../../services/materials.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ActionBtnComponent, ActionMenuComponent],
  template: `
    <div class="w-full">
      <div class="flex justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Produtos</h2>
          <p class="page-section-subtitle">Cadastro de produtos para controle de estoque.</p>
        </div>
        <button type="button" class="btn-primary" (click)="abrirModal()">+ Novo produto</button>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Descrição</th>
              <th class="px-4 py-3 text-left">Unidade</th>
              <th class="px-4 py-3 text-left">Fabricante</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of products()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ p.description }}</td>
              <td class="px-4 py-3">{{ p.unit_measure }}</td>
              <td class="px-4 py-3">{{ p.manufacturer || '—' }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="p.status"
                  [class.text-emerald-800]="p.status"
                  [class.bg-slate-100]="!p.status"
                  [class.text-slate-600]="!p.status"
                >
                  {{ p.status ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <app-action-menu>
                  <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(p)" />
                  <app-action-btn
                    *ngIf="p.status"
                    icon="delete"
                    title="Inativar"
                    variant="danger"
                    (action)="alterarStatus(p, false)"
                  />
                  <app-action-btn
                    *ngIf="!p.status"
                    icon="send"
                    title="Ativar"
                    variant="primary"
                    (action)="alterarStatus(p, true)"
                  />
                </app-action-menu>
              </td>
            </tr>
            <tr *ngIf="!loading() && products().length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum produto cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="showModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold mb-4">{{ editingId() ? 'Editar produto' : 'Novo produto' }}</h3>
        <form class="space-y-3" [formGroup]="form" (ngSubmit)="salvar()">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Descrição</label>
            <input formControlName="description" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Unidade de medida</label>
            <input
              formControlName="unit_measure"
              class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
              placeholder="Ex: UN, KG, CX"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Fabricante</label>
            <input formControlName="manufacturer" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm" />
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
export class ProductListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private materials = inject(MaterialsService);
  private notification = inject(NotificationService);

  products = signal<ProductItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);

  form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(200)]],
    unit_measure: ['', [Validators.required, Validators.maxLength(40)]],
    manufacturer: [''],
    status: [true],
  });

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.materials.listProducts().subscribe({
      next: (res) => {
        this.products.set(res.products);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar produtos.');
      },
    });
  }

  abrirModal() {
    this.editingId.set(null);
    this.form.reset({ description: '', unit_measure: '', manufacturer: '', status: true });
    this.showModal.set(true);
  }

  editar(p: ProductItem) {
    this.editingId.set(p.id_product);
    this.form.reset({
      description: p.description,
      unit_measure: p.unit_measure,
      manufacturer: p.manufacturer || '',
      status: p.status,
    });
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const id = this.editingId();
    const raw = this.form.getRawValue();
    const payload = {
      description: raw.description.trim(),
      unit_measure: raw.unit_measure.trim(),
      manufacturer: raw.manufacturer.trim() || null,
      ...(id ? { status: raw.status } : {}),
    };
    const req = id
      ? this.materials.updateProduct(id, payload)
      : this.materials.createProduct(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success(id ? 'Produto atualizado.' : 'Produto cadastrado.');
        this.fecharModal();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(err, 'Falha ao salvar produto.');
      },
    });
  }

  alterarStatus(p: ProductItem, ativo: boolean) {
    const req = ativo
      ? this.materials.activateProduct(p.id_product)
      : this.materials.inactivateProduct(p.id_product);
    req.subscribe({
      next: () => {
        this.notification.success(ativo ? 'Produto ativado.' : 'Produto inativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }
}
