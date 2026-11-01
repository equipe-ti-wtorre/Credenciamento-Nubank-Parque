import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  AccessProfile,
  ModulesCatalog,
  ProfileLookupTeam,
  ProfileLookupUser,
  ProfilePermission,
  ProfileService,
  ProfileTeam,
  ProfileUser,
} from '../../../services/profile.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService, hasPermission } from '../../../core/services/auth.service';
import {
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  PermissionAction,
  permissionKey,
} from '../../../config/modules.config';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../../shared/modal/modal.component';

@Component({
  selector: 'app-profile-list',
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
          <h2 class="page-section-title">Perfis de acesso</h2>
          <p class="page-section-subtitle">
            Configure perfis e defina permissões por módulo e ação.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" class="btn-secondary">Atualizar</button>
          <button
            *ngIf="canCreate"
            type="button"
            (click)="novoPerfil()"
            class="btn-primary"
          >
            + Novo perfil
          </button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Código</th>
              <th class="px-4 py-3 text-left">Usuários</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let p of profiles()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ p.nome }}</td>
                <td class="px-4 py-3 text-slate-600">{{ p.codigo }}</td>
                <td class="px-4 py-3 text-slate-600">
                {{ p.user_count || 0 }}
                <span *ngIf="p.team_count" class="text-xs text-slate-500">
                  · {{ p.team_count }} {{ p.team_count === 1 ? 'time' : 'times' }}
                </span>
              </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-violet-100]="p.is_system"
                    [class.text-violet-800]="p.is_system"
                    [class.bg-slate-100]="!p.is_system"
                    [class.text-slate-700]="!p.is_system"
                  >
                    {{ p.is_system ? 'Sistema' : 'Customizado' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                      <app-action-btn
                        *ngIf="canEdit"
                        icon="edit"
                        title="Editar perfil"
                        variant="neutral"
                        (action)="editarPerfil(p)"
                      />
                      <app-action-dropdown *ngIf="canDelete && !p.is_system">
                        <button
                          appActionDropdownItem
                          type="button"
                          [danger]="true"
                          (click)="excluirPerfil(p)"
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
                      </app-action-dropdown>
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="profiles().length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum perfil encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Carregando perfis...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>
      </div>
    </div>

    <app-modal
      [open]="showModal"
      [title]="editingProfile ? 'Editar perfil' : 'Novo perfil'"
      [subtitle]="editingProfile?.nome || 'Defina nome e permissões de acesso'"
      size="xl"
      (close)="fecharModal()"
    >
      <form id="profile-form" (ngSubmit)="salvar()">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="form-label" for="profile-name">Nome</label>
            <input id="profile-name" [(ngModel)]="formNome" name="formNome" required class="form-field" />
          </div>
          <div>
            <label class="form-label" for="profile-desc">Descrição</label>
            <input id="profile-desc" [(ngModel)]="formDescricao" name="formDescricao" class="form-field" />
          </div>
        </div>

        <label class="inline-flex items-center gap-2 mb-4 text-sm text-slate-700" *ngIf="!editingProfile?.is_super_admin">
          <input type="checkbox" [(ngModel)]="formRequiresCompany" name="formRequiresCompany" />
          Exige empresa vinculada ao usuário
        </label>

        <div class="mb-4">
          <p class="form-label">Vínculos deste perfil</p>
          <p class="text-xs text-slate-500 mb-3">
            O usuário passa a usar este perfil. O time soma estas permissões ao perfil individual de cada membro.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-3 mb-3">
            <div>
              <label class="form-label" for="profile-link-type">Tipo</label>
              <select
                id="profile-link-type"
                class="form-select"
                [(ngModel)]="linkTipo"
                name="linkTipo"
                (ngModelChange)="onLinkTipoChange()"
              >
                <option value="usuario">Usuário</option>
                <option value="time" [disabled]="editingProfile?.is_super_admin">Time</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="profile-link-search">Buscar</label>
              <input
                id="profile-link-search"
                class="form-field"
                type="text"
                [(ngModel)]="linkQuery"
                name="linkQuery"
                (ngModelChange)="onLinkSearchChange($event)"
                [placeholder]="linkTipo === 'usuario' ? 'Nome, e-mail ou login' : 'Nome do time'"
                autocomplete="off"
              />
              <p class="text-xs text-slate-500 mt-1">Mínimo de 2 caracteres.</p>
              <p *ngIf="editingProfile?.is_super_admin" class="text-xs text-slate-500 mt-1">
                Times não podem ser vinculados ao perfil de super administrador.
              </p>
              <p *ngIf="linkLoading" class="text-sm text-slate-500 py-2">Buscando...</p>
              <ul
                *ngIf="!linkLoading && linkTipo === 'usuario' && userResults.length > 0"
                class="mt-1 border border-[var(--app-border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto"
                role="listbox"
              >
                <li *ngFor="let u of userResults" class="border-t border-slate-100 first:border-t-0">
                  <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50" (click)="adicionarUsuario(u)">
                    <p class="text-sm font-medium text-slate-800">{{ u.nome_completo }}</p>
                    <p class="text-xs text-slate-500">
                      {{ u.email }}
                      <ng-container *ngIf="u.perfil_nome"> · {{ u.perfil_nome }}</ng-container>
                    </p>
                  </button>
                </li>
              </ul>
              <ul
                *ngIf="!linkLoading && linkTipo === 'time' && teamResults.length > 0"
                class="mt-1 border border-[var(--app-border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto"
                role="listbox"
              >
                <li *ngFor="let t of teamResults" class="border-t border-slate-100 first:border-t-0">
                  <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50" (click)="adicionarTime(t)">
                    <p class="text-sm font-medium text-slate-800">{{ t.nome }}</p>
                    <p class="text-xs text-slate-500">
                      {{ t.membros_ativos }} {{ t.membros_ativos === 1 ? 'membro' : 'membros' }}
                    </p>
                  </button>
                </li>
              </ul>
              <p
                *ngIf="linkQuery.trim().length >= 2 && !linkLoading && semResultadosBusca"
                class="text-sm text-slate-500 py-2"
              >
                Nenhum resultado encontrado.
              </p>
            </div>
          </div>

          <div class="mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="form-label mb-0">Times neste perfil</span>
              <span class="text-xs text-slate-500">{{ profileTeams.length }}</span>
            </div>
            <p *ngIf="profileTeams.length === 0" class="text-sm text-slate-500 py-2">
              Nenhum time vinculado a este perfil.
            </p>
            <ul
              *ngIf="profileTeams.length > 0"
              class="border border-[var(--app-border)] rounded-xl overflow-y-auto max-h-48 divide-y divide-slate-100"
              role="list"
            >
              <li *ngFor="let t of profileTeams" class="flex items-center gap-3 px-3 py-2">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-slate-800 truncate">{{ t.nome }}</p>
                  <p class="text-xs text-slate-500">
                    {{ t.membros_ativos }} {{ t.membros_ativos === 1 ? 'membro ativo' : 'membros ativos' }}
                  </p>
                </div>
                <app-action-btn
                  icon="delete"
                  [title]="'Remover time ' + t.nome"
                  variant="danger"
                  (action)="removerTime(t)"
                />
              </li>
            </ul>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="form-label mb-0">Usuários neste perfil</span>
              <span *ngIf="!loadingUsers" class="text-xs text-slate-500">{{ profileUsers.length }}</span>
            </div>
            <p *ngIf="loadingUsers" class="text-sm text-slate-500 py-2">Carregando usuários...</p>
            <p *ngIf="!loadingUsers && profileUsers.length === 0" class="text-sm text-slate-500 py-2">
              Nenhum usuário vinculado a este perfil.
            </p>
            <ul
              *ngIf="!loadingUsers && profileUsers.length > 0"
              class="border border-[var(--app-border)] rounded-xl overflow-y-auto max-h-48 divide-y divide-slate-100"
              role="list"
            >
              <li *ngFor="let u of profileUsers" class="flex items-center gap-3 px-3 py-2">
                <span
                  class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
                  aria-hidden="true"
                >
                  {{ iniciais(u.nome_completo) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-slate-800 truncate">{{ u.nome_completo }}</p>
                  <p class="text-xs text-slate-500 truncate">
                    {{ u.email }}
                    <ng-container *ngIf="u.departamento"> · {{ u.departamento }}</ng-container>
                    <ng-container *ngIf="u.company_nome"> · {{ u.company_nome }}</ng-container>
                  </p>
                  <p *ngIf="u.perfil_anterior" class="text-xs text-slate-500">
                    Sairá do perfil {{ u.perfil_anterior }}.
                  </p>
                </div>
                <app-action-btn
                  icon="delete"
                  [title]="'Remover usuário ' + u.nome_completo"
                  variant="danger"
                  (action)="removerUsuario(u)"
                />
              </li>
            </ul>
          </div>
        </div>

        <div class="mb-3 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary text-xs py-1 px-3" (click)="marcarTodasAcoes('view')">
            Marcar todos: Visualizar
          </button>
          <button type="button" class="btn-secondary text-xs py-1 px-3" (click)="desmarcarTodas()">
            Limpar seleção
          </button>
        </div>

        <div class="border border-[var(--app-border)] rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">Módulo</th>
                <th *ngFor="let action of actions" class="px-2 py-2 text-center">{{ actionLabels[action] }}</th>
                <th class="px-2 py-2 text-center">Linha</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngFor="let group of catalog?.groups || []">
                <tr class="bg-slate-100">
                  <td [attr.colspan]="actions.length + 2" class="px-3 py-2 font-semibold text-slate-700">
                    {{ group.name }}
                  </td>
                </tr>
                <tr *ngFor="let mod of group.modules" class="border-t border-slate-100">
                  <td class="px-3 py-2 text-slate-800">{{ mod.label }}</td>
                  <td *ngFor="let action of actions" class="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      [checked]="isChecked(mod.key, action)"
                      (change)="togglePermission(mod.key, action, $event)"
                    />
                  </td>
                  <td class="px-2 py-2 text-center">
                    <button type="button" class="text-[var(--color-primary)]" (click)="toggleRow(mod.key)">
                      ⇄
                    </button>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary">Cancelar</button>
        <button type="submit" form="profile-form" [disabled]="saving() || !podeSalvarVinculos" class="btn-action-primary">
          {{ saving() ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ProfileListComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly profileService = inject(ProfileService);
  private readonly notification = inject(NotificationService);
  private readonly authService = inject(AuthService);

  readonly actions = PERMISSION_ACTIONS;
  readonly actionLabels = ACTION_LABELS;

  profiles = signal<AccessProfile[]>([]);
  loading = signal(true);
  saving = signal(false);
  canCreate = false;
  canEdit = false;
  canDelete = false;

  showModal = false;
  editingProfile: AccessProfile | null = null;
  catalog: ModulesCatalog | null = null;
  formNome = '';
  formDescricao = '';
  formRequiresCompany = false;
  selectedPermissions = new Set<string>();
  profileUsers: ProfileUser[] = [];
  profileTeams: ProfileTeam[] = [];
  loadingUsers = false;
  assigneesReady = true;
  linkTipo: 'usuario' | 'time' = 'usuario';
  linkQuery = '';
  linkLoading = false;
  userResults: ProfileLookupUser[] = [];
  teamResults: ProfileLookupTeam[] = [];
  private linkTimer: ReturnType<typeof setTimeout> | null = null;
  private linkRequest = 0;
  private readonly linkDebounceMs = 500;

  get podeSalvarVinculos(): boolean {
    return !this.editingProfile || this.assigneesReady;
  }

  get semResultadosBusca(): boolean {
    return this.linkTipo === 'usuario' ? this.userResults.length === 0 : this.teamResults.length === 0;
  }

  constructor() {
    void this.init();
  }

  private async init() {
    const user = await this.authService.getCurrentUser();
    this.canCreate = hasPermission(user, 'profiles', 'create');
    this.canEdit = hasPermission(user, 'profiles', 'edit');
    this.canDelete = hasPermission(user, 'profiles', 'delete');
    this.profileService.getModulesCatalog().subscribe({
      next: (catalog) => {
        this.catalog = catalog;
        this.cdr.markForCheck();
      },
    });
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.profileService.list().subscribe({
      next: (res) => {
        this.profiles.set(res.profiles);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.error(err.error?.message || 'Falha ao carregar perfis.');
        this.cdr.markForCheck();
      },
    });
  }

  novoPerfil() {
    this.editingProfile = null;
    this.formNome = '';
    this.formDescricao = '';
    this.formRequiresCompany = false;
    this.selectedPermissions = new Set([permissionKey('dashboard', 'view')]);
    this.profileUsers = [];
    this.profileTeams = [];
    this.loadingUsers = false;
    this.assigneesReady = true;
    this.limparBuscaVinculo();
    this.showModal = true;
  }

  editarPerfil(profile: AccessProfile) {
    this.aplicarPerfilNoForm(profile);
    this.profileUsers = [];
    this.profileTeams = [];
    this.loadingUsers = true;
    this.assigneesReady = false;
    this.limparBuscaVinculo();
    this.showModal = true;

    this.profileService.getById(profile.id).subscribe({
      next: (res) => {
        if (this.editingProfile?.id !== profile.id) return;
        this.aplicarPerfilNoForm(res.profile);
        this.profileUsers = res.profile.users || [];
        this.profileTeams = res.profile.teams || [];
        this.loadingUsers = false;
        this.assigneesReady = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (this.editingProfile?.id !== profile.id) return;
        this.loadingUsers = false;
        this.assigneesReady = false;
        this.notification.error(err.error?.message || 'Falha ao carregar usuários do perfil.');
        this.cdr.markForCheck();
      },
    });
  }

  fecharModal() {
    this.showModal = false;
    this.editingProfile = null;
    this.profileUsers = [];
    this.profileTeams = [];
    this.loadingUsers = false;
    this.assigneesReady = true;
    this.limparBuscaVinculo();
  }

  onLinkTipoChange() {
    if (this.linkTipo === 'time' && this.editingProfile?.is_super_admin) {
      this.linkTipo = 'usuario';
    }
    this.linkQuery = '';
    this.userResults = [];
    this.teamResults = [];
    this.linkLoading = false;
    this.linkRequest += 1;
  }

  onLinkSearchChange(value: string) {
    if (this.linkTimer !== null) clearTimeout(this.linkTimer);
    const term = value.trim();
    if (term.length < 2) {
      this.userResults = [];
      this.teamResults = [];
      this.linkLoading = false;
      this.linkRequest += 1;
      return;
    }
    this.linkLoading = true;
    const tipo = this.linkTipo;
    this.linkTimer = setTimeout(() => this.buscarVinculos(tipo, term), this.linkDebounceMs);
  }

  adicionarUsuario(user: ProfileLookupUser) {
    if (this.profileUsers.some((item) => item.id === user.id)) return;
    const mesmoPerfil = this.editingProfile != null && user.id_perfil === this.editingProfile.id;
    this.profileUsers = [
      ...this.profileUsers,
      {
        id: user.id,
        nome_completo: user.nome_completo,
        email: user.email,
        departamento: user.departamento,
        company_nome: null,
        perfil_anterior: !mesmoPerfil && user.perfil_nome ? user.perfil_nome : null,
      },
    ];
    this.limparBuscaVinculo();
  }

  adicionarTime(team: ProfileLookupTeam) {
    if (this.editingProfile?.is_super_admin) return;
    if (this.profileTeams.some((item) => item.id === team.id)) return;
    this.profileTeams = [
      ...this.profileTeams,
      { id: team.id, nome: team.nome, membros_ativos: team.membros_ativos },
    ];
    this.limparBuscaVinculo();
  }

  removerUsuario(user: ProfileUser) {
    this.profileUsers = this.profileUsers.filter((item) => item.id !== user.id);
  }

  removerTime(team: ProfileTeam) {
    this.profileTeams = this.profileTeams.filter((item) => item.id !== team.id);
  }

  private limparBuscaVinculo() {
    if (this.linkTimer !== null) {
      clearTimeout(this.linkTimer);
      this.linkTimer = null;
    }
    this.linkRequest += 1;
    this.linkTipo = 'usuario';
    this.linkQuery = '';
    this.linkLoading = false;
    this.userResults = [];
    this.teamResults = [];
  }

  private buscarVinculos(tipo: 'usuario' | 'time', term: string) {
    const request = ++this.linkRequest;
    if (tipo === 'usuario') {
      this.profileService.lookupUsers(term).subscribe({
        next: (res) => {
          if (request !== this.linkRequest || this.linkTipo !== tipo) return;
          const vinculados = new Set(this.profileUsers.map((user) => user.id));
          this.userResults = res.results.filter((user) => !vinculados.has(user.id));
          this.teamResults = [];
          this.linkLoading = false;
          this.cdr.markForCheck();
        },
        error: () => this.falhaBuscaVinculo(request),
      });
      return;
    }

    this.profileService.lookupTeams(term).subscribe({
      next: (res) => {
        if (request !== this.linkRequest || this.linkTipo !== tipo) return;
        const vinculados = new Set(this.profileTeams.map((team) => team.id));
        this.teamResults = res.results.filter((team) => !vinculados.has(team.id));
        this.userResults = [];
        this.linkLoading = false;
        this.cdr.markForCheck();
      },
      error: () => this.falhaBuscaVinculo(request),
    });
  }

  private falhaBuscaVinculo(request: number) {
    if (request !== this.linkRequest) return;
    this.userResults = [];
    this.teamResults = [];
    this.linkLoading = false;
    this.cdr.markForCheck();
  }

  iniciais(nome: string): string {
    return nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0].toUpperCase())
      .join('');
  }

  private aplicarPerfilNoForm(profile: AccessProfile) {
    this.editingProfile = profile;
    this.formNome = profile.nome;
    this.formDescricao = profile.descricao || '';
    this.formRequiresCompany = profile.requires_company;
    this.selectedPermissions = new Set(
      profile.permissions.map((p) => permissionKey(p.modulo, p.acao)),
    );
  }

  isChecked(module: string, action: PermissionAction): boolean {
    return this.selectedPermissions.has(permissionKey(module, action));
  }

  togglePermission(module: string, action: PermissionAction, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const key = permissionKey(module, action);
    if (checked) this.selectedPermissions.add(key);
    else this.selectedPermissions.delete(key);
  }

  toggleRow(module: string) {
    const allSelected = this.actions.every((action) => this.isChecked(module, action));
    for (const action of this.actions) {
      const key = permissionKey(module, action);
      if (allSelected) this.selectedPermissions.delete(key);
      else this.selectedPermissions.add(key);
    }
  }

  marcarTodasAcoes(action: PermissionAction) {
    for (const group of this.catalog?.groups || []) {
      for (const mod of group.modules) {
        this.selectedPermissions.add(permissionKey(mod.key, action));
      }
    }
  }

  desmarcarTodas() {
    this.selectedPermissions.clear();
  }

  private buildPermissionsPayload(): ProfilePermission[] {
    return Array.from(this.selectedPermissions).map((key) => {
      const [modulo, acao] = key.split(':');
      return { modulo, acao: acao as PermissionAction };
    });
  }

  salvar() {
    const nome = this.formNome.trim();
    if (!nome) {
      this.notification.warning('Informe o nome do perfil.');
      return;
    }

    const permissions = this.buildPermissionsPayload();
    if (permissions.length === 0) {
      this.notification.warning('Selecione ao menos uma permissão.');
      return;
    }
    if (!this.podeSalvarVinculos) {
      this.notification.warning('Aguarde o carregamento dos vínculos.');
      return;
    }

    this.saving.set(true);
    const payload = {
      nome,
      descricao: this.formDescricao.trim() || null,
      requires_company: this.formRequiresCompany,
      permissions,
      usuarios_ids: this.profileUsers.map((user) => user.id),
      setores_ids: this.profileTeams.map((team) => team.id),
    };

    const request = this.editingProfile
      ? this.profileService.update(this.editingProfile.id, payload)
      : this.profileService.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success('Perfil salvo com sucesso.');
        this.fecharModal();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(err.error?.message || 'Falha ao salvar perfil.');
        this.cdr.markForCheck();
      },
    });
  }

  excluirPerfil(profile: AccessProfile) {
    Swal.fire({
      title: 'Excluir perfil?',
      text: `O perfil "${profile.nome}" será removido permanentemente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.profileService.remove(profile.id).subscribe({
        next: () => {
          this.notification.success('Perfil excluído.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(err.error?.message || 'Não foi possível excluir o perfil.');
        },
      });
    });
  }
}
