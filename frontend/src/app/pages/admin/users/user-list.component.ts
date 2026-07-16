import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { UserItem, UserService } from '../../../services/user.service';
import { AccessProfile, ProfileService } from '../../../services/profile.service';
import { CompanyItem, CompanyService } from '../../../services/company.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SystemSettingsService } from '../../../services/system-settings.service';
import { SessionIdleService } from '../../../core/services/session-idle.service';
import { StorageService } from '../../../core/services/storage.service';
import { SettingsReloadable } from '../settings-reloadable';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../../shared/modal/modal.component';

@Component({
  selector: 'app-user-list',
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
          <h2 class="page-section-title">Usuários</h2>
          <p class="page-section-subtitle">
            Apenas usuários ativos com departamento cadastrado. Bloqueados não são exibidos.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="sincronizarAd()" [disabled]="syncing()" class="btn-secondary disabled:opacity-50">
            {{ syncing() ? 'Sincronizando AD...' : 'Importar do Azure AD' }}
          </button>
          <button type="button" (click)="reloadPage()" class="btn-primary">Atualizar</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Ativos</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ stats().total }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Administradores</p>
          <p class="text-2xl font-bold text-[var(--color-primary-dark)] mt-1">{{ stats().admins }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Usuários</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stats().users }}</p>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Buscar</label>
            <input
              [(ngModel)]="searchInput"
              (ngModelChange)="aplicarFiltros()"
              name="search"
              placeholder="Nome ou e-mail"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-2 px-4">
              Limpar
            </button>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Perfil</label>
            <select
              [(ngModel)]="filterPerfilId"
              (ngModelChange)="aplicarFiltros()"
              name="filterPerfilId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todos</option>
              <option *ngFor="let p of availableProfiles" [ngValue]="p.id">{{ p.nome }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">E-mail</th>
              <th class="px-4 py-3 text-left">Departamento</th>
              <th class="px-4 py-3 text-left">Perfil</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let u of users()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ u.nome_completo }}</td>
                <td class="px-4 py-3 text-slate-600">{{ u.email }}</td>
                <td class="px-4 py-3 text-slate-600">{{ u.departamento || '—' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-violet-100]="u.profile?.is_super_admin"
                    [class.text-violet-800]="u.profile?.is_super_admin"
                    [class.bg-slate-100]="!u.profile?.is_super_admin"
                    [class.text-slate-700]="!u.profile?.is_super_admin"
                  >
                    {{ profileLabel(u) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-xs text-slate-600">
                  {{ u.is_ad_user ? 'Microsoft' : 'Local' }}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                      <app-action-btn
                        icon="edit"
                        [title]="u.is_ad_user ? 'Editar perfil' : 'Editar usuário'"
                        variant="neutral"
                        (action)="editarUsuario(u)"
                      />
                      <app-action-dropdown>
                        <button
                          appActionDropdownItem
                          type="button"
                          [disabled]="u.id === currentUserId"
                          [danger]="true"
                          (click)="bloquearUsuario(u)"
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
                          Bloquear acesso
                        </button>
                      </app-action-dropdown>
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="users().length === 0 && !loading()">
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">Nenhum usuário encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-slate-500">Carregando usuários...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>

        <div
          *ngIf="pagination().totalPages > 1"
          class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
        >
          <span class="text-xs text-slate-500">
            Página {{ pagination().page }} de {{ pagination().totalPages }} ({{ pagination().total }}
            registros)
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
      [open]="showEditModal"
      [title]="editingUser?.is_ad_user ? 'Editar perfil' : 'Editar usuário local'"
      [subtitle]="editingUser?.nome_completo || ''"
      size="md"
      (close)="fecharModal()"
    >
      <form id="user-edit-form" (ngSubmit)="salvarEdicao()">
        <ng-container *ngIf="!editingUser?.is_ad_user">
          <div class="mb-4">
            <label class="form-label" for="edit-nome">Nome completo</label>
            <input
              id="edit-nome"
              [(ngModel)]="editNome"
              name="editNome"
              required
              class="form-field"
            />
          </div>
          <div class="mb-4">
            <label class="form-label" for="edit-dept">Departamento</label>
            <input
              id="edit-dept"
              [(ngModel)]="editDepartamento"
              name="editDepartamento"
              required
              class="form-field"
            />
          </div>
          <div class="mb-4">
            <label class="form-label" for="edit-email">E-mail</label>
            <input
              id="edit-email"
              type="email"
              [(ngModel)]="editEmail"
              name="editEmail"
              required
              class="form-field"
            />
          </div>
          <div class="mb-4">
            <label class="form-label" for="edit-password">Nova senha</label>
            <input
              id="edit-password"
              type="password"
              [(ngModel)]="editPassword"
              name="editPassword"
              autocomplete="new-password"
              placeholder="Deixe vazio para manter a atual"
              class="form-field"
            />
            <p class="text-xs text-slate-500 mt-1">Mínimo 6 caracteres. Ao alterar, a sessão do usuário é encerrada.</p>
          </div>
        </ng-container>
        <p *ngIf="editingUser?.is_ad_user" class="text-xs text-slate-500 mb-4">
          E-mail: {{ editingUser?.email }} (gerenciado pelo Azure AD)
        </p>
        <label class="form-label" for="edit-role">Perfil de acesso</label>
        <select
          id="edit-role"
          [(ngModel)]="editIdPerfil"
          name="editIdPerfil"
          class="form-select mb-4"
        >
          <option *ngFor="let p of availableProfiles" [ngValue]="p.id">{{ p.nome }}</option>
        </select>
        <div class="mb-4" *ngIf="selectedEditProfile?.requires_company">
          <label class="form-label" for="edit-company">Empresa vinculada</label>
          <select
            id="edit-company"
            [(ngModel)]="editIdCompany"
            name="editIdCompany"
            class="form-select"
          >
            <option [ngValue]="null">Selecione...</option>
            <option *ngFor="let c of companies" [ngValue]="c.id_company">
              {{ c.fancy_name || c.company_name }}
            </option>
          </select>
        </div>
        <div class="mb-4">
          <label class="form-label" for="edit-idle-mode">Logout por inatividade</label>
          <select
            id="edit-idle-mode"
            [(ngModel)]="editSessionIdleMode"
            name="editSessionIdleMode"
            class="form-select"
          >
            <option value="default">Padrão do sistema ({{ systemDefaultIdleMinutes }} min)</option>
            <option value="custom">Personalizado</option>
            <option value="disabled">Desativado</option>
          </select>
          <div *ngIf="editSessionIdleMode === 'custom'" class="mt-2">
            <input
              type="number"
              [(ngModel)]="editSessionIdleMinutes"
              name="editSessionIdleMinutes"
              [min]="minSessionIdleMinutes"
              [max]="maxSessionIdleMinutes"
              required
              class="form-field"
            />
            <p class="text-xs text-slate-500 mt-1">
              Entre {{ minSessionIdleMinutes }} e {{ maxSessionIdleMinutes }} minutos.
            </p>
          </div>
          <p *ngIf="editSessionIdleMode === 'disabled'" class="text-xs text-slate-500 mt-1">
            O usuário não será deslogado por inatividade no navegador.
          </p>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary">Cancelar</button>
        <button
          type="submit"
          form="user-edit-form"
          [disabled]="saving()"
          class="btn-action-primary"
        >
          {{ saving() ? 'Salvando...' : 'Salvar alterações' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class UserListComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly userService = inject(UserService);
  private readonly profileService = inject(ProfileService);
  private readonly companyService = inject(CompanyService);
  private readonly authService = inject(AuthService);
  private readonly notification = inject(NotificationService);
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly sessionIdle = inject(SessionIdleService);
  private readonly storage = inject(StorageService);

  readonly minSessionIdleMinutes = 5;
  readonly maxSessionIdleMinutes = 480;

  users = signal<UserItem[]>([]);
  loading = signal(true);
  saving = signal(false);
  syncing = signal(false);
  pagination = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  stats = signal({ total: 0, admins: 0, users: 0 });

  searchInput = '';
  filterPerfilId: number | null = null;
  appliedSearch = '';
  appliedPerfilId: number | null = null;
  availableProfiles: AccessProfile[] = [];
  companies: CompanyItem[] = [];

  currentUserId: number | null = null;

  showEditModal = false;
  editingUser: UserItem | null = null;
  editIdPerfil: number | null = null;
  editIdCompany: number | null = null;
  editNome = '';
  editEmail = '';
  editDepartamento = '';
  editPassword = '';
  editSessionIdleMode: 'default' | 'custom' | 'disabled' = 'default';
  editSessionIdleMinutes = 30;
  systemDefaultIdleMinutes = 30;

  constructor() {
    this.init();
  }

  private async init() {
    const current = await this.authService.getCurrentUser();
    this.currentUserId = current?.id ?? null;
    this.carregarSessionDefault();
    this.carregarPerfis();
    this.carregarEmpresas();
    this.carregar(1);
  }

  get selectedEditProfile(): AccessProfile | null {
    return this.availableProfiles.find((p) => p.id === this.editIdPerfil) || null;
  }

  private carregarPerfis() {
    this.profileService.list().subscribe({
      next: (res) => {
        this.availableProfiles = res.profiles.filter((p) => p.ativo);
        this.carregarStats();
        this.cdr.markForCheck();
      },
    });
  }

  private carregarEmpresas() {
    this.companyService.list(1, 200).subscribe({
      next: (res) => {
        this.companies = res.companies.filter((c) => c.status);
        this.cdr.markForCheck();
      },
    });
  }

  private carregarSessionDefault() {
    this.systemSettings.getSessionSettings().subscribe({
      next: (res) => {
        this.systemDefaultIdleMinutes = res.settings.session_idle_minutes;
        this.cdr.markForCheck();
      },
    });
  }

  reloadPage() {
    this.carregarStats();
    this.carregar(this.pagination().page);
  }

  sincronizarAd() {
    this.syncing.set(true);
    this.userService.syncAdUsers().subscribe({
      next: (res) => {
        this.syncing.set(false);
        if (res.alreadyRunning) {
          this.notification.warning('Sincronização já em andamento. Aguarde a conclusão.');
          return;
        }
        const total = (res.created || 0) + (res.updated || 0) + (res.linked || 0);
        if (total === 0) {
          this.notification.info('Nenhuma alteração — usuários AD já estão atualizados.');
        } else {
          this.notification.success(
            `Azure AD: ${res.created || 0} novo(s), ${res.updated || 0} atualizado(s), ${res.linked || 0} vinculado(s).`,
          );
        }
        this.carregarStats();
        this.carregar(this.pagination().page);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.syncing.set(false);
        this.notification.error(err.error?.message || 'Falha ao importar usuários do Azure AD.');
        this.cdr.markForCheck();
      },
    });
  }

  profileLabel(user: UserItem): string {
    return user.profile?.nome || user.role || 'Usuário';
  }

  aplicarFiltros() {
    this.appliedSearch = this.searchInput.trim();
    this.appliedPerfilId = this.filterPerfilId;
    this.carregar(1);
  }

  limparFiltros() {
    this.searchInput = '';
    this.filterPerfilId = null;
    this.appliedSearch = '';
    this.appliedPerfilId = null;
    this.carregar(1);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  editarUsuario(user: UserItem) {
    this.editingUser = user;
    this.editIdPerfil = user.id_perfil;
    this.editIdCompany = user.id_company ?? null;
    this.editNome = user.nome_completo;
    this.editEmail = user.email;
    this.editDepartamento = user.departamento || '';
    this.editPassword = '';
    if (user.session_idle_minutes === 0) {
      this.editSessionIdleMode = 'disabled';
      this.editSessionIdleMinutes = this.systemDefaultIdleMinutes;
    } else if (user.session_idle_minutes != null && user.session_idle_minutes > 0) {
      this.editSessionIdleMode = 'custom';
      this.editSessionIdleMinutes = user.session_idle_minutes;
    } else {
      this.editSessionIdleMode = 'default';
      this.editSessionIdleMinutes = this.systemDefaultIdleMinutes;
    }
    this.showEditModal = true;
  }

  fecharModal() {
    this.showEditModal = false;
    this.editingUser = null;
    this.editPassword = '';
  }

  salvarEdicao() {
    if (!this.editingUser) return;

    let sessionIdleMinutes: number | null;
    if (this.editSessionIdleMode === 'disabled') {
      sessionIdleMinutes = 0;
    } else if (this.editSessionIdleMode === 'custom') {
      const minutes = Number(this.editSessionIdleMinutes);
      if (
        !Number.isFinite(minutes) ||
        minutes < this.minSessionIdleMinutes ||
        minutes > this.maxSessionIdleMinutes
      ) {
        this.notification.warning(
          'Valor inválido',
          `Informe um tempo entre ${this.minSessionIdleMinutes} e ${this.maxSessionIdleMinutes} minutos.`,
        );
        return;
      }
      sessionIdleMinutes = minutes;
    } else {
      sessionIdleMinutes = null;
    }

    const payload: {
      id_perfil?: number;
      id_company?: number | null;
      email?: string;
      password?: string;
      nome_completo?: string;
      departamento?: string;
      session_idle_minutes?: number | null;
    } = {
      id_perfil: this.editIdPerfil || undefined,
      id_company: this.editIdCompany,
      session_idle_minutes: sessionIdleMinutes,
    };

    if (!this.editingUser.is_ad_user) {
      payload.nome_completo = this.editNome.trim();
      payload.email = this.editEmail.trim();
      payload.departamento = this.editDepartamento.trim();
      if (this.editPassword.trim()) {
        payload.password = this.editPassword;
      }
    }

    this.saving.set(true);
    this.userService.update(this.editingUser.id, payload).subscribe({
      next: async (res) => {
        this.saving.set(false);
        this.notification.success('Usuário atualizado.');
        if (this.editingUser?.id === this.currentUserId) {
          const current = await this.authService.getCurrentUser();
          if (current) {
            const updatedUser = { ...current, session_idle_minutes: res.user.session_idle_minutes ?? null };
            await this.storage.set('currentUser', JSON.stringify(updatedUser));
            await this.sessionIdle.applyUserPreference(updatedUser.session_idle_minutes);
          }
        }
        this.fecharModal();
        this.reloadPage();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(err.error?.message || 'Falha ao atualizar usuário.');
        this.cdr.markForCheck();
      },
    });
  }

  async bloquearUsuario(user: UserItem) {
    const result = await Swal.fire({
      title: 'Bloquear usuário?',
      text: `${user.nome_completo} (${user.email}) perderá o acesso e sairá desta lista.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Bloquear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;

    this.userService.update(user.id, { ativo: false }).subscribe({
      next: () => {
        this.notification.success('Usuário bloqueado.');
        this.reloadPage();
      },
      error: (err) => {
        this.notification.error(err.error?.message || 'Falha ao bloquear usuário.');
      },
    });
  }

  private carregarStats() {
    const adminProfile = this.availableProfiles.find((p) => p.codigo === 'ADMIN');
    const userProfile = this.availableProfiles.find((p) => p.codigo === 'USER');
    forkJoin({
      total: this.userService.list(1, 1, {}),
      admins: this.userService.list(1, 1, {
        id_perfil: adminProfile?.id,
      }),
      users: this.userService.list(1, 1, {
        id_perfil: userProfile?.id,
      }),
    }).subscribe({
      next: (res) => {
        this.stats.set({
          total: res.total.pagination.total,
          admins: res.admins.pagination.total,
          users: res.users.pagination.total,
        });
        this.cdr.markForCheck();
      },
    });
  }

  private carregar(page = 1) {
    this.loading.set(true);
    this.userService
      .list(page, this.pagination().limit, {
        search: this.appliedSearch || undefined,
        id_perfil: this.appliedPerfilId || undefined,
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
          this.notification.notifyHttpError(err, 'Falha ao carregar usuários.');
          this.cdr.markForCheck();
        },
      });
  }
}
