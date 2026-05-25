import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { UserItem, UserService } from '../../../services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionBtnComponent, ActionMenuComponent],
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Buscar</label>
            <input
              [(ngModel)]="searchInput"
              name="search"
              placeholder="Nome ou e-mail"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Perfil</label>
            <select
              [(ngModel)]="filterPerfil"
              name="filterPerfil"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="ADMIN">Administrador</option>
              <option value="USER">Usuário</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="aplicarFiltros()" class="btn-primary text-sm py-1.5 px-4">
            Filtrar
          </button>
          <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-1.5 px-4">
            Limpar
          </button>
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
                    [class.bg-violet-100]="u.role === 'ADMIN'"
                    [class.text-violet-800]="u.role === 'ADMIN'"
                    [class.bg-slate-100]="u.role === 'USER'"
                    [class.text-slate-700]="u.role === 'USER'"
                  >
                    {{ u.role === 'ADMIN' ? 'Admin' : 'Usuário' }}
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
                      <app-action-btn
                        icon="delete"
                        title="Bloquear acesso"
                        variant="danger"
                        [disabled]="u.id === currentUserId"
                        (action)="bloquearUsuario(u)"
                      />
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

    <div
      *ngIf="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Fechar" (click)="fecharModal()"></button>
      <div class="relative w-full max-w-md card-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-slate-800 mb-1">
          {{ editingUser?.is_ad_user ? 'Editar perfil' : 'Editar usuário local' }}
        </h3>
        <p class="text-sm text-slate-500 mb-4">{{ editingUser?.nome_completo }}</p>
        <form (ngSubmit)="salvarEdicao()">
          <ng-container *ngIf="!editingUser?.is_ad_user">
            <div class="mb-4">
              <label class="text-xs font-bold text-slate-500 uppercase">Nome completo</label>
              <input
                [(ngModel)]="editNome"
                name="editNome"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
              />
            </div>
            <div class="mb-4">
              <label class="text-xs font-bold text-slate-500 uppercase">Departamento</label>
              <input
                [(ngModel)]="editDepartamento"
                name="editDepartamento"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
              />
            </div>
            <div class="mb-4">
              <label class="text-xs font-bold text-slate-500 uppercase">E-mail</label>
              <input
                type="email"
                [(ngModel)]="editEmail"
                name="editEmail"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
              />
            </div>
            <div class="mb-4">
              <label class="text-xs font-bold text-slate-500 uppercase">Nova senha</label>
              <input
                type="password"
                [(ngModel)]="editPassword"
                name="editPassword"
                autocomplete="new-password"
                placeholder="Deixe vazio para manter a atual"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
              />
              <p class="text-xs text-slate-500 mt-1">Mínimo 6 caracteres. Ao alterar, a sessão do usuário é encerrada.</p>
            </div>
          </ng-container>
          <p *ngIf="editingUser?.is_ad_user" class="text-xs text-slate-500 mb-4">
            E-mail: {{ editingUser?.email }} (gerenciado pelo Azure AD)
          </p>
          <label class="text-xs font-bold text-slate-500 uppercase">Perfil de acesso</label>
          <select
            [(ngModel)]="editRole"
            name="editRole"
            class="w-full mt-1 mb-4 border border-[var(--app-border)] rounded-xl px-3 py-2 bg-white"
          >
            <option value="USER">Usuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <div class="flex justify-end gap-2">
            <button type="button" (click)="fecharModal()" class="btn-secondary">Cancelar</button>
            <button type="submit" [disabled]="saving()" class="btn-primary disabled:opacity-50">
              {{ saving() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class UserListComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly notification = inject(NotificationService);

  users = signal<UserItem[]>([]);
  loading = signal(true);
  saving = signal(false);
  syncing = signal(false);
  pagination = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  stats = signal({ total: 0, admins: 0, users: 0 });

  searchInput = '';
  filterPerfil = '';
  appliedSearch = '';
  appliedPerfil = '';

  currentUserId: number | null = null;

  showEditModal = false;
  editingUser: UserItem | null = null;
  editRole: 'ADMIN' | 'USER' = 'USER';
  editNome = '';
  editEmail = '';
  editDepartamento = '';
  editPassword = '';

  constructor() {
    this.init();
  }

  private async init() {
    const current = await this.authService.getCurrentUser();
    this.currentUserId = current?.id ?? null;
    this.carregarStats();
    this.carregar(1);
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

  aplicarFiltros() {
    this.appliedSearch = this.searchInput.trim();
    this.appliedPerfil = this.filterPerfil;
    this.carregar(1);
  }

  limparFiltros() {
    this.searchInput = '';
    this.filterPerfil = '';
    this.appliedSearch = '';
    this.appliedPerfil = '';
    this.carregar(1);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  editarUsuario(user: UserItem) {
    this.editingUser = user;
    this.editRole = user.role;
    this.editNome = user.nome_completo;
    this.editEmail = user.email;
    this.editDepartamento = user.departamento || '';
    this.editPassword = '';
    this.showEditModal = true;
  }

  fecharModal() {
    this.showEditModal = false;
    this.editingUser = null;
    this.editPassword = '';
  }

  salvarEdicao() {
    if (!this.editingUser) return;

    const payload: {
      perfil: 'ADMIN' | 'USER';
      email?: string;
      password?: string;
      nome_completo?: string;
      departamento?: string;
    } = { perfil: this.editRole };

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
      next: () => {
        this.saving.set(false);
        this.notification.success('Usuário atualizado.');
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
    forkJoin({
      total: this.userService.list(1, 1, {}),
      admins: this.userService.list(1, 1, { perfil: 'ADMIN' }),
      users: this.userService.list(1, 1, { perfil: 'USER' }),
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
        perfil: this.appliedPerfil || undefined,
      })
      .subscribe({
        next: (res) => {
          this.users.set(res.users);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading.set(false);
          this.notification.error('Falha ao carregar usuários.');
          this.cdr.markForCheck();
        },
      });
  }
}
