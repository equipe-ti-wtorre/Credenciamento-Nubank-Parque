import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ExternalCompany,
  MaterialsService,
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
  selector: 'app-external-company-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ActionMenuComponent,
    ModalComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Empresas eventuais</h2>
          <p class="page-section-subtitle">
            Identidade de remetentes sem cadastro de prestador. Corrija OCR e una duplicatas.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <select
            class="border border-[var(--app-border)] rounded-xl px-3 py-1.5 text-sm bg-white"
            [(ngModel)]="filterRevisado"
            (ngModelChange)="carregar()"
            name="filterRevisado"
          >
            <option value="0">Pendentes de revisão</option>
            <option value="1">Revisadas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>

      <div class="card-surface tabela-rolavel">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Razão social</th>
              <th class="px-4 py-3 text-left">Documento</th>
              <th class="px-4 py-3 text-left">Origem</th>
              <th class="px-4 py-3 text-right">Movimentos</th>
              <th class="px-4 py-3 text-left">Revisado</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of companies()" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ c.legal_name }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ c.cnpj || c.cpf || '—' }}</td>
              <td class="px-4 py-3">{{ c.origem }}</td>
              <td class="px-4 py-3 text-right">{{ c.total_movimentos }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="c.revisado"
                  [class.text-emerald-800]="c.revisado"
                  [class.bg-amber-100]="!c.revisado"
                  [class.text-amber-800]="!c.revisado"
                >
                  {{ c.revisado ? 'Sim' : 'Pendente' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <app-action-menu>
                  <app-action-btn icon="edit" title="Revisar" variant="neutral" (action)="editar(c)" />
                  <app-action-dropdown>
                    <button appActionDropdownItem type="button" (click)="abrirMerge(c)">
                      Unir com outra
                    </button>
                  </app-action-dropdown>
                </app-action-menu>
              </td>
            </tr>
            <tr *ngIf="!loading() && companies().length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                Nenhuma empresa eventual nesta fila.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      title="Revisar empresa eventual"
      size="md"
      (close)="fecharModal()"
    >
      <form [formGroup]="form" class="grid gap-3">
        <label class="text-xs font-bold uppercase text-slate-500">Razão social</label>
        <input class="border rounded-xl px-3 py-2" formControlName="legal_name" />
        <label class="text-xs font-bold uppercase text-slate-500">Nome fantasia</label>
        <input class="border rounded-xl px-3 py-2" formControlName="trade_name" />
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold uppercase text-slate-500">UF</label>
            <input class="border rounded-xl px-3 py-2 w-full" formControlName="uf" maxlength="2" />
          </div>
          <div>
            <label class="text-xs font-bold uppercase text-slate-500">Município</label>
            <input class="border rounded-xl px-3 py-2 w-full" formControlName="municipio" />
          </div>
        </div>
        <label class="text-xs font-bold uppercase text-slate-500">Endereço</label>
        <input class="border rounded-xl px-3 py-2" formControlName="endereco" />
      </form>
      <div modal-footer class="flex justify-end gap-2 p-4">
        <button type="button" class="btn-secondary" (click)="fecharModal()">Cancelar</button>
        <button type="button" class="btn-action-primary" (click)="salvar()" [disabled]="saving()">
          {{ saving() ? 'Salvando…' : 'Marcar revisado' }}
        </button>
      </div>
    </app-modal>

    <app-modal
      [open]="showMerge()"
      title="Unir duplicata"
      subtitle="Os movimentos da origem passam para o destino e a origem é removida."
      size="sm"
      (close)="fecharMerge()"
    >
      <div class="grid gap-3">
        <p class="text-sm text-slate-600">
          Origem: <strong>{{ merging()?.legal_name }}</strong>
        </p>
        <label class="text-xs font-bold uppercase text-slate-500">ID do destino</label>
        <input class="border rounded-xl px-3 py-2" [(ngModel)]="mergeTargetId" name="mergeTargetId" />
      </div>
      <div modal-footer class="flex justify-end gap-2 p-4">
        <button type="button" class="btn-secondary" (click)="fecharMerge()">Cancelar</button>
        <button type="button" class="btn-action-primary" (click)="confirmarMerge()" [disabled]="saving()">
          Unir
        </button>
      </div>
    </app-modal>
  `,
})
export class ExternalCompanyListComponent implements OnInit {
  private materials = inject(MaterialsService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  loading = signal(false);
  saving = signal(false);
  companies = signal<ExternalCompany[]>([]);
  filterRevisado: '' | '0' | '1' = '0';
  showModal = signal(false);
  showMerge = signal(false);
  editingId = signal<number | null>(null);
  merging = signal<ExternalCompany | null>(null);
  mergeTargetId = '';

  form = this.fb.group({
    legal_name: ['', [Validators.required, Validators.minLength(2)]],
    trade_name: [''],
    uf: [''],
    municipio: [''],
    endereco: [''],
  });

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    const revisado =
      this.filterRevisado === '' ? undefined : Number(this.filterRevisado);
    this.materials.listExternalCompanies({ revisado }).subscribe({
      next: (res) => {
        this.companies.set(res.companies);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar empresas eventuais.');
      },
    });
  }

  editar(c: ExternalCompany) {
    this.editingId.set(c.id_external_company);
    this.form.reset({
      legal_name: c.legal_name,
      trade_name: c.trade_name || '',
      uf: c.uf || '',
      municipio: c.municipio || '',
      endereco: c.endereco || '',
    });
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (this.form.invalid || !this.editingId()) return;
    this.saving.set(true);
    const raw = this.form.getRawValue();
    this.materials
      .patchExternalCompany(this.editingId()!, {
        legal_name: String(raw.legal_name || '').trim(),
        trade_name: raw.trade_name?.trim() || null,
        uf: raw.uf?.trim().toUpperCase() || null,
        municipio: raw.municipio?.trim() || null,
        endereco: raw.endereco?.trim() || null,
        revisado: true,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success('Empresa revisada.');
          this.fecharModal();
          this.carregar();
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao revisar.');
        },
      });
  }

  abrirMerge(c: ExternalCompany) {
    this.merging.set(c);
    this.mergeTargetId = '';
    this.showMerge.set(true);
  }

  fecharMerge() {
    this.showMerge.set(false);
    this.merging.set(null);
  }

  confirmarMerge() {
    const source = this.merging();
    const target = Number(this.mergeTargetId);
    if (!source || !target) {
      this.notification.error('Informe o ID de destino.');
      return;
    }
    this.saving.set(true);
    this.materials.mergeExternalCompanies(source.id_external_company, target).subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success('Empresas unidas.');
        this.fecharMerge();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(err, 'Falha ao unir.');
      },
    });
  }
}
