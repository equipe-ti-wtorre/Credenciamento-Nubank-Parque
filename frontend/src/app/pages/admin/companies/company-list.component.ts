import { ChangeDetectorRef, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  CompanyContact,
  CompanyItem,
  CompanyService,
  CompanyType,
  formatCnpj,
  normalizeCnpjInput,
} from '../../../services/company.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../../shared/modal/modal.component';

interface CompanyFormState {
  id_company_type: number | null;
  cnpj: string;
  company_name: string;
  fancy_name: string;
  contacts: CompanyContact[];
}

@Component({
  selector: 'app-company-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ModalComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Empresas</h2>
          <p class="page-section-subtitle">
            Cadastro de produtoras, empresas padrão e fornecedores vinculados ao credenciamento.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-secondary disabled:opacity-50">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" (click)="novaEmpresa()" class="btn-primary">+ Nova empresa</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Total (página)</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stats().total }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Ativas</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ stats().ativas }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Inativas</p>
          <p class="text-2xl font-bold text-slate-600 mt-1">{{ stats().inativas }}</p>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">CNPJ</label>
            <input
              [(ngModel)]="filterCnpj"
              (ngModelChange)="onTextFilterChange()"
              name="filterCnpj"
              placeholder="Somente números"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="filterName"
              (ngModelChange)="onTextFilterChange()"
              name="filterName"
              placeholder="Razão social ou fantasia"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
            <select
              [(ngModel)]="filterTypeId"
              (ngModelChange)="aplicarFiltros()"
              name="filterTypeId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todos</option>
              <option *ngFor="let t of types()" [ngValue]="t.id_company_type">{{ t.description }}</option>
            </select>
          </div>
          <div>
            <button type="button" (click)="limparFiltros()" class="btn-secondary w-full justify-center text-sm py-2 px-4">
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Razão social</th>
              <th class="px-4 py-3 text-left">Nome fantasia</th>
              <th class="px-4 py-3 text-left">CNPJ</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let c of companies()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ c.company_name }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.fancy_name || '—' }}</td>
                <td class="px-4 py-3 font-mono text-slate-600">{{ formatCnpj(c.cnpj) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.company_type?.description || '—' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="c.status"
                    [class.text-emerald-800]="c.status"
                    [class.bg-slate-100]="!c.status"
                    [class.text-slate-600]="!c.status"
                  >
                    {{ c.status ? 'Ativa' : 'Inativa' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                      <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(c)" />
                      <app-action-dropdown>
                        <button appActionDropdownItem type="button" (click)="alterarStatus(c, !c.status)">
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
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                            <path d="M12 2v10" />
                          </svg>
                          {{ c.status ? 'Desativar' : 'Ativar' }}
                        </button>
                      </app-action-dropdown>
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="companies().length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">Nenhuma empresa encontrada.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">Carregando empresas...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>

        <div
          *ngIf="pagination().totalPages > 1"
          class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
        >
          <span class="text-xs text-slate-500">
            Página {{ pagination().page }} de {{ pagination().totalPages }} ({{ pagination().total }} registros)
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="irPagina(pagination().page - 1)"
              [disabled]="pagination().page <= 1"
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              (click)="irPagina(pagination().page + 1)"
              [disabled]="pagination().page >= pagination().totalPages"
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editingId() ? 'Editar empresa' : 'Nova empresa'"
      subtitle="Cadastre dados da empresa e contatos vinculados."
      size="xl"
      (close)="fecharModal()"
    >
      <form id="company-form" class="space-y-4" (ngSubmit)="salvar()">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="form-label" for="company-type">Tipo</label>
              <select
                id="company-type"
                [(ngModel)]="form.id_company_type"
                name="id_company_type"
                required
                class="form-select"
              >
                <option [ngValue]="null" disabled>Selecione</option>
                <option *ngFor="let t of types()" [ngValue]="t.id_company_type">{{ t.description }}</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="company-cnpj">CNPJ</label>
              <input
                id="company-cnpj"
                [(ngModel)]="form.cnpj"
                name="cnpj"
                required
                maxlength="18"
                placeholder="00.000.000/0000-00"
                class="form-field font-mono text-sm"
              />
            </div>
            <div>
              <label class="form-label" for="company-name">Razão social</label>
              <input
                id="company-name"
                [(ngModel)]="form.company_name"
                name="company_name"
                required
                class="form-field"
              />
            </div>
            <div>
              <label class="form-label" for="company-fancy">Nome fantasia</label>
              <input
                id="company-fancy"
                [(ngModel)]="form.fancy_name"
                name="fancy_name"
                class="form-field"
              />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="form-label mb-0">Contatos</label>
              <button type="button" (click)="adicionarContato()" class="btn-action-tonal text-xs">+ Contato</button>
            </div>
            <div *ngIf="form.contacts.length === 0" class="text-sm text-slate-500 py-2">Nenhum contato adicionado.</div>
            <div
              *ngFor="let contact of form.contacts; let i = index"
              class="border border-[var(--app-border)] rounded-xl p-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-2"
            >
              <div class="md:col-span-2 flex justify-between items-center">
                <span class="text-xs font-semibold text-slate-600">Contato {{ i + 1 }}</span>
                <button type="button" (click)="removerContato(i)" class="text-xs text-rose-600 hover:underline">Remover</button>
              </div>
              <div>
                <label class="text-xs text-slate-500">Nome</label>
                <input
                  [(ngModel)]="contact.name"
                  [name]="'contact_name_' + i"
                  required
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label class="text-xs text-slate-500">Departamento</label>
                <input
                  [(ngModel)]="contact.department"
                  [name]="'contact_dept_' + i"
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label class="text-xs text-slate-500">Telefone</label>
                <input
                  [(ngModel)]="contact.phone"
                  [name]="'contact_phone_' + i"
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label class="text-xs text-slate-500">E-mail</label>
                <input
                  type="email"
                  [(ngModel)]="contact.email"
                  [name]="'contact_email_' + i"
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary">Cancelar</button>
        <button type="submit" form="company-form" [disabled]="saving()" class="btn-action-primary">
          {{ saving() ? 'Salvando...' : (editingId() ? 'Salvar alterações' : 'Salvar empresa') }}
        </button>
      </div>
    </app-modal>
  `,
})
export class CompanyListComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  readonly formatCnpj = formatCnpj;

  companies = signal<CompanyItem[]>([]);
  types = signal<CompanyType[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterCnpj = '';
  filterName = '';
  filterTypeId: number | null = null;

  appliedCnpj = '';
  appliedName = '';
  appliedTypeId: number | null = null;

  private readonly filterDebounceMs = 350;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  form: CompanyFormState = this.emptyForm();

  stats = computed(() => {
    const list = this.companies();
    return {
      total: list.length,
      ativas: list.filter((c) => c.status).length,
      inativas: list.filter((c) => !c.status).length,
    };
  });

  constructor(
    private companyService: CompanyService,
    private notification: NotificationService,
  ) {
    this.carregarTipos();
    this.carregar();
  }

  ngOnDestroy() {
    this.clearFilterDebounce();
  }

  private emptyForm(): CompanyFormState {
    return {
      id_company_type: null,
      cnpj: '',
      company_name: '',
      fancy_name: '',
      contacts: [],
    };
  }

  carregarTipos() {
    this.companyService.listTypes().subscribe({
      next: (res) => this.types.set(res.types),
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de empresa.'),
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.companyService
      .list(page, this.pagination().limit, {
        cnpj: this.appliedCnpj || undefined,
        name: this.appliedName || undefined,
        id_company_type: this.appliedTypeId ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.companies.set(res.companies);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.cdr.markForCheck();
          this.notification.error(this.extractError(err) || 'Falha ao carregar empresas.');
        },
      });
  }

  onTextFilterChange() {
    this.clearFilterDebounce();
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
  }

  aplicarFiltros() {
    this.clearFilterDebounce();
    this.appliedCnpj = this.filterCnpj.trim();
    this.appliedName = this.filterName.trim();
    this.appliedTypeId = this.filterTypeId;
    this.carregar(1);
  }

  limparFiltros() {
    this.clearFilterDebounce();
    this.filterCnpj = '';
    this.filterName = '';
    this.filterTypeId = null;
    this.appliedCnpj = '';
    this.appliedName = '';
    this.appliedTypeId = null;
    this.carregar(1);
  }

  private clearFilterDebounce() {
    if (this.filterDebounceTimer !== null) {
      clearTimeout(this.filterDebounceTimer);
      this.filterDebounceTimer = null;
    }
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  novaEmpresa() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    if (this.types().length > 0) {
      this.form.id_company_type = this.types()[0].id_company_type;
    }
    this.showModal.set(true);
  }

  editar(c: CompanyItem) {
    this.editingId.set(c.id_company);
    this.loading.set(true);
    this.companyService.get(c.id_company).subscribe({
      next: (res) => {
        const company = res.company;
        this.form = {
          id_company_type: company.id_company_type,
          cnpj: formatCnpj(company.cnpj),
          company_name: company.company_name,
          fancy_name: company.fancy_name || '',
          contacts: (company.contacts || []).map((ct) => ({
            name: ct.name,
            department: ct.department || '',
            phone: ct.phone || '',
            email: ct.email || '',
          })),
        };
        this.loading.set(false);
        this.showModal.set(true);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao carregar empresa.');
      },
    });
  }

  fecharModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.form = this.emptyForm();
  }

  adicionarContato() {
    this.form.contacts.push({
      name: '',
      department: '',
      phone: '',
      email: '',
    });
  }

  removerContato(index: number) {
    this.form.contacts.splice(index, 1);
  }

  salvar() {
    if (!this.form.id_company_type) {
      this.notification.error('Selecione o tipo de empresa.');
      return;
    }
    const cnpj = normalizeCnpjInput(this.form.cnpj);
    if (cnpj.length !== 14) {
      this.notification.error('CNPJ deve conter 14 dígitos.');
      return;
    }
    if (!this.form.company_name.trim()) {
      this.notification.error('Razão social é obrigatória.');
      return;
    }

    const contacts = this.form.contacts
      .filter((c) => c.name?.trim())
      .map((c) => ({
        name: c.name.trim(),
        department: c.department?.trim() || null,
        phone: c.phone?.trim() || null,
        email: c.email?.trim() || null,
      }));

    const payload = {
      id_company_type: this.form.id_company_type,
      cnpj,
      company_name: this.form.company_name.trim(),
      fancy_name: this.form.fancy_name.trim() || null,
      contacts,
    };

    this.saving.set(true);
    const id = this.editingId();
    const req = id
      ? this.companyService.update(id, payload)
      : this.companyService.create(payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success(id ? 'Empresa atualizada.' : 'Empresa criada.');
        this.fecharModal();
        this.carregar(id ? this.pagination().page : 1);
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar empresa.');
      },
    });
  }

  alterarStatus(c: CompanyItem, ativar: boolean) {
    const titulo = ativar ? 'Ativar empresa?' : 'Desativar empresa?';
    const texto = ativar
      ? `A empresa "${c.company_name}" voltará a ficar ativa no sistema.`
      : `A empresa "${c.company_name}" será inativada (sem exclusão física).`;

    Swal.fire({
      title: titulo,
      text: texto,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ativar ? 'Ativar' : 'Desativar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: ativar ? '#059669' : '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.companyService.patchStatus(c.id_company, ativar).subscribe({
        next: () => {
          this.notification.success(ativar ? 'Empresa ativada.' : 'Empresa desativada.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao alterar status.');
        },
      });
    });
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
