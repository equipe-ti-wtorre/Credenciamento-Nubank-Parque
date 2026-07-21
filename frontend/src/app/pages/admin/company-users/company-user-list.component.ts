import { ChangeDetectorRef, Component, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  CompanyUserItem,
  CompanyUsersService,
} from '../../../services/company-users.service';
import { CompanyItem, CompanyService } from '../../../services/company.service';
import { AuthService, hasPermission } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../../shared/modal/modal.component';

@Component({
  selector: 'app-company-user-list',
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
          <h2 class="page-section-title">Usuários Empresas</h2>
          <p class="page-section-subtitle">
            Gestores e solicitantes vinculados às empresas cadastradas.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-secondary disabled:opacity-50">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button *ngIf="canCreate()" type="button" (click)="novo()" class="btn-primary">+ Novo usuário</button>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Buscar</label>
            <input
              [(ngModel)]="searchInput"
              (ngModelChange)="onFilterChange()"
              name="search"
              placeholder="Nome ou e-mail"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div *ngIf="isAdminView()">
            <label class="text-xs font-bold text-slate-500 uppercase">Empresa</label>
            <select
              [(ngModel)]="filterCompanyId"
              (ngModelChange)="aplicarFiltros()"
              name="filterCompanyId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todas</option>
              <option *ngFor="let c of companies()" [ngValue]="c.id_company">
                {{ c.company_name }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Perfil</label>
            <select
              [(ngModel)]="filterProfile"
              (ngModelChange)="aplicarFiltros()"
              name="filterProfile"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todos</option>
              <option value="EMPRESA_GESTOR">Gestor da Empresa</option>
              <option value="EMPRESA_SOLICITANTE">Solicitante da Empresa</option>
            </select>
          </div>
          <div>
            <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-2 px-4">
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">E-mail</th>
              <th class="px-4 py-3 text-left">Empresa</th>
              <th class="px-4 py-3 text-left">Perfil</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let u of users()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ u.nome_completo }}</td>
                <td class="px-4 py-3 text-slate-600">{{ u.email }}</td>
                <td class="px-4 py-3 text-slate-600">{{ u.company_name || '—' }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    {{ u.profile?.nome || u.role || '—' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="u.ativo"
                    [class.text-emerald-800]="u.ativo"
                    [class.bg-slate-100]="!u.ativo"
                    [class.text-slate-600]="!u.ativo"
                  >
                    {{ u.ativo ? 'Ativo' : 'Pendente / Inativo' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end" *ngIf="canEdit()">
                    <app-action-menu>
                      <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(u)" />
                      <app-action-dropdown>
                        <button
                          appActionDropdownItem
                          type="button"
                          (click)="reenviarConvite(u)"
                        >
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
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <path d="m22 6-10 7L2 6" />
                          </svg>
                          Reenviar convite
                        </button>
                        <button
                          appActionDropdownItem
                          type="button"
                          (click)="alternarAtivo(u)"
                        >
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
                          {{ u.ativo ? 'Desativar' : 'Ativar' }}
                        </button>
                        @if (u.can_delete) {
                          <hr class="action-dropdown__divider" />
                          <button
                            appActionDropdownItem
                            type="button"
                            [danger]="true"
                            (click)="excluir(u)"
                          >
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
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            Excluir
                          </button>
                        }
                      </app-action-dropdown>
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="users().length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                  Nenhum usuário de empresa encontrado.
                </td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">Carregando...</td>
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
      [title]="editingId() ? 'Editar usuário' : 'Novo usuário da empresa'"
      subtitle="Usuários com perfil de solicitações da empresa."
      size="md"
      (close)="fecharModal()"
    >
      <form id="company-user-form" class="space-y-4" (ngSubmit)="salvar()">
        <div *ngIf="isAdminView() && !editingId()">
          <label class="form-label" for="cu-company">Empresa</label>
          <select
            id="cu-company"
            [(ngModel)]="form.id_company"
            name="id_company"
            required
            class="form-select"
          >
            <option [ngValue]="null" disabled>Selecione</option>
            <option *ngFor="let c of companies()" [ngValue]="c.id_company">
              {{ c.company_name }}
            </option>
          </select>
        </div>
        <div>
          <label class="form-label" for="cu-nome">Nome completo</label>
          <input id="cu-nome" [(ngModel)]="form.nome_completo" name="nome_completo" required class="form-field" />
        </div>
        <div>
          <label class="form-label" for="cu-email">E-mail</label>
          <input
            id="cu-email"
            type="email"
            [(ngModel)]="form.email"
            name="email"
            required
            class="form-field"
          />
        </div>
        <div *ngIf="isAdminView()">
          <label class="form-label" for="cu-perfil">Perfil</label>
          <select id="cu-perfil" [(ngModel)]="form.profile_codigo" name="profile_codigo" class="form-select">
            <option value="EMPRESA_SOLICITANTE">Solicitante da Empresa</option>
            <option value="EMPRESA_GESTOR">Gestor da Empresa</option>
          </select>
        </div>
        <div *ngIf="!editingId()" class="flex items-center gap-2">
          <input
            id="cu-invite"
            type="checkbox"
            [(ngModel)]="form.send_invite"
            name="send_invite"
            class="rounded border-slate-300"
          />
          <label for="cu-invite" class="text-sm text-slate-700">Enviar convite por e-mail</label>
        </div>
        <div *ngIf="editingId() || !form.send_invite">
          <label class="form-label" for="cu-password">
            {{ editingId() ? 'Nova senha (opcional)' : 'Senha' }}
          </label>
          <input
            id="cu-password"
            type="password"
            [(ngModel)]="form.password"
            name="password"
            [required]="!editingId() && !form.send_invite"
            autocomplete="new-password"
            class="form-field"
          />
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary">Cancelar</button>
        <button type="submit" form="company-user-form" [disabled]="saving()" class="btn-action-primary">
          {{ saving() ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class CompanyUserListComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly companyUsers = inject(CompanyUsersService);
  private readonly companyService = inject(CompanyService);
  private readonly notification = inject(NotificationService);

  users = signal<CompanyUserItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);
  isAdminView = signal(false);
  canCreate = signal(false);
  canEdit = signal(false);

  pagination = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  searchInput = '';
  filterCompanyId: number | null = null;
  filterProfile: string | null = null;
  appliedSearch = '';
  appliedCompanyId: number | null = null;
  appliedProfile: string | null = null;

  form = {
    id_company: null as number | null,
    nome_completo: '',
    email: '',
    profile_codigo: 'EMPRESA_SOLICITANTE' as 'EMPRESA_GESTOR' | 'EMPRESA_SOLICITANTE',
    send_invite: true,
    password: '',
  };

  private filterTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.init();
  }

  private async init() {
    const user = await this.auth.getCurrentUser();
    this.isAdminView.set(
      !!(user && (user.profile?.is_super_admin || hasPermission(user, 'companies', 'view'))),
    );
    this.canCreate.set(hasPermission(user, 'company_users', 'create'));
    this.canEdit.set(hasPermission(user, 'company_users', 'edit'));
    if (this.isAdminView()) {
      this.carregarEmpresas();
    }
    this.carregar();
  }

  ngOnDestroy() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
  }

  carregarEmpresas() {
    this.companyService.list(1, 200).subscribe({
      next: (res) => this.companies.set(res.companies),
      error: () => undefined,
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.companyUsers
      .list(page, this.pagination().limit, {
        search: this.appliedSearch || undefined,
        id_company: this.appliedCompanyId ?? undefined,
        profile_codigo: this.appliedProfile ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.users.set(res.users);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar usuários de empresas.');
        },
      });
  }

  onFilterChange() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.aplicarFiltros(), 500);
  }

  aplicarFiltros() {
    this.appliedSearch = this.searchInput.trim();
    this.appliedCompanyId = this.filterCompanyId;
    this.appliedProfile = this.filterProfile;
    this.carregar(1);
  }

  limparFiltros() {
    this.searchInput = '';
    this.filterCompanyId = null;
    this.filterProfile = null;
    this.aplicarFiltros();
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  async novo() {
    const user = await this.auth.getCurrentUser();
    this.editingId.set(null);
    this.form = {
      id_company: user?.id_company ?? null,
      nome_completo: '',
      email: '',
      profile_codigo: 'EMPRESA_SOLICITANTE',
      send_invite: true,
      password: '',
    };
    this.showModal.set(true);
  }

  editar(u: CompanyUserItem) {
    this.editingId.set(u.id);
    this.form = {
      id_company: u.id_company,
      nome_completo: u.nome_completo,
      email: u.email,
      profile_codigo: (u.role as 'EMPRESA_GESTOR' | 'EMPRESA_SOLICITANTE') || 'EMPRESA_SOLICITANTE',
      send_invite: false,
      password: '',
    };
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  salvar() {
    if (!this.form.nome_completo.trim() || !this.form.email.trim()) {
      this.notification.error('Nome e e-mail são obrigatórios.');
      return;
    }

    const id = this.editingId();
    this.saving.set(true);

    if (id) {
      const payload: {
        nome_completo: string;
        email: string;
        profile_codigo?: 'EMPRESA_GESTOR' | 'EMPRESA_SOLICITANTE';
        password?: string;
      } = {
        nome_completo: this.form.nome_completo.trim(),
        email: this.form.email.trim(),
      };
      if (this.isAdminView()) {
        payload.profile_codigo = this.form.profile_codigo;
      }
      if (this.form.password) payload.password = this.form.password;

      this.companyUsers.update(id, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success('Usuário atualizado.');
          this.fecharModal();
          this.carregar();
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao atualizar usuário.');
        },
      });
      return;
    }

    if (this.isAdminView() && !this.form.id_company) {
      this.saving.set(false);
      this.notification.error('Selecione a empresa.');
      return;
    }

    this.companyUsers
      .create({
        id_company: this.form.id_company ?? undefined,
        nome_completo: this.form.nome_completo.trim(),
        email: this.form.email.trim(),
        profile_codigo: this.isAdminView()
          ? this.form.profile_codigo
          : 'EMPRESA_SOLICITANTE',
        send_invite: this.form.send_invite,
        password: this.form.send_invite ? undefined : this.form.password,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success(
            this.form.send_invite ? 'Convite enviado.' : 'Usuário criado.',
          );
          this.fecharModal();
          this.carregar();
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao criar usuário.');
        },
      });
  }

  reenviarConvite(u: CompanyUserItem) {
    Swal.fire({
      title: 'Reenviar convite?',
      text: `Um novo e-mail será enviado para ${u.email}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.companyUsers.resendInvite(u.id).subscribe({
        next: () => this.notification.success('Convite reenviado.'),
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao reenviar convite.'),
      });
    });
  }

  alternarAtivo(u: CompanyUserItem) {
    const next = !u.ativo;
    this.companyUsers.update(u.id, { ativo: next }).subscribe({
      next: () => {
        this.notification.success(next ? 'Usuário ativado.' : 'Usuário desativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }

  excluir(u: CompanyUserItem) {
    if (!u.can_delete) return;
    Swal.fire({
      title: 'Excluir usuário?',
      text: `Excluir "${u.nome_completo}"? Só é permitido quando não há dados vinculados.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.companyUsers.remove(u.id).subscribe({
        next: () => {
          this.notification.success('Usuário excluído.');
          this.carregar();
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao excluir usuário.'),
      });
    });
  }
}
