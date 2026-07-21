import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  AccessProfile,
  ModulesCatalog,
  ProfilePermission,
  ProfileService,
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
                <td class="px-4 py-3 text-slate-600">{{ p.user_count || 0 }}</td>
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
        <button type="submit" form="profile-form" [disabled]="saving()" class="btn-action-primary">
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
    this.showModal = true;
  }

  editarPerfil(profile: AccessProfile) {
    this.editingProfile = profile;
    this.formNome = profile.nome;
    this.formDescricao = profile.descricao || '';
    this.formRequiresCompany = profile.requires_company;
    this.selectedPermissions = new Set(
      profile.permissions.map((p) => permissionKey(p.modulo, p.acao)),
    );
    this.showModal = true;
  }

  fecharModal() {
    this.showModal = false;
    this.editingProfile = null;
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

    this.saving.set(true);
    const payload = {
      nome,
      descricao: this.formDescricao.trim() || null,
      requires_company: this.formRequiresCompany,
      permissions,
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
