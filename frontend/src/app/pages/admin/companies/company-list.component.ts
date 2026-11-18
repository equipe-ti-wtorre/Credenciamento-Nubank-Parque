import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NavigationStateService } from '../../../core/services/navigation-state.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import {
  CompanyContact,
  CompanyInviteError,
  CompanyInviteResult,
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
import { FaceCropModalComponent } from '../../../shared/face-crop/face-crop-modal.component';

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
    FaceCropModalComponent,
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
          <button type="button" (click)="abrirConviteCadastro()" class="btn-action-secondary">
            Enviar link de cadastro
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
              <th class="px-4 py-3 text-left w-24 whitespace-nowrap">Logo</th>
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
                <td class="px-4 py-3 w-24">
                  <div
                    class="w-16 h-16 min-w-16 min-h-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <img
                      *ngIf="thumbnailUrls()[c.id_company] as url"
                      [src]="url"
                      [alt]="'Logo de ' + c.company_name"
                      class="w-full h-full object-cover"
                    />
                    <div
                      *ngIf="!thumbnailUrls()[c.id_company]"
                      class="w-full h-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center"
                      aria-hidden="true"
                    >
                      {{ initials(c.fancy_name || c.company_name) }}
                    </div>
                  </div>
                </td>
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
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhuma empresa encontrada.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">Carregando empresas...</td>
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
          <div>
            <label class="form-label">Logo</label>
            <input
              #logoInput
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              class="hidden"
              (change)="onLogoSelected($event)"
            />
            <div
              class="upload-dropzone upload-dropzone--banner"
              [class.upload-dropzone--dragover]="logoDragOver()"
              [class.upload-dropzone--selected]="!!logoPreviewUrl()"
              tabindex="0"
              role="button"
              (click)="logoInput.click()"
              (keydown.enter)="logoInput.click()"
              (keydown.space)="$event.preventDefault(); logoInput.click()"
              (dragover)="onLogoDragOver($event)"
              (dragleave)="onLogoDragLeave($event)"
              (drop)="onLogoDrop($event)"
            >
              <div class="upload-dropzone__main">
                <span *ngIf="!logoPreviewUrl()" class="upload-dropzone__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 16V4M6 10l6-6 6 6" />
                    <path d="M4 20h16" />
                  </svg>
                </span>
                <span *ngIf="logoPreviewUrl()" class="upload-dropzone__preview upload-dropzone__preview--lg" aria-hidden="true">
                  <img [src]="logoPreviewUrl()!" alt="" />
                </span>
                <span class="upload-dropzone__text">
                  <span class="upload-dropzone__title">
                    Arraste o logo aqui ou
                    <span class="upload-dropzone__link">clique para procurar</span>
                  </span>
                  <span class="upload-dropzone__hint">
                    {{
                      pendingLogoFile()
                        ? pendingLogoFile()!.name
                        : 'JPEG, PNG ou WebP · máx. 2 MB'
                    }}
                  </span>
                </span>
              </div>
            </div>
            <button
              *ngIf="logoPreviewUrl()"
              type="button"
              class="mt-2 text-sm font-semibold text-[var(--wtorre)] underline underline-offset-2"
              (click)="ajustarLogoEnquadramento()"
            >
              Ajustar enquadramento
            </button>
          </div>

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
        <button
          *ngIf="editingId()"
          type="button"
          (click)="enviarAcesso()"
          [disabled]="saving() || inviting()"
          class="btn-action-tonal"
        >
          {{ inviting() ? 'Enviando...' : 'Enviar acesso' }}
        </button>
        <button type="submit" form="company-form" [disabled]="saving()" class="btn-action-primary">
          {{ saving() ? 'Salvando...' : (editingId() ? 'Salvar alterações' : 'Salvar empresa') }}
        </button>
      </div>
    </app-modal>

    <app-face-crop-modal
      [open]="showLogoCropModal()"
      [imageUrl]="logoCropSourceUrl()"
      [fileName]="logoCropSourceName()"
      title="Ajustar logo"
      subtitle="Afaste o zoom para caber o logo inteiro. Aproxime para recortar."
      hint="Use − para afastar se o quadro estiver cortando. Arraste os cantos para ajustar. O preview mostra o tamanho da lista."
      [initialAspectH]="1"
      [initialSizeRatio]="1"
      [lockAspectRatio]="1"
      [centerInitialCrop]="true"
      [showOutputPreview]="true"
      [minZoom]="0.25"
      [allowCropOutside]="true"
      previewLabel="Na lista"
      outputSuffix="-logo"
      (cancel)="cancelLogoCrop()"
      (cropped)="onLogoCropped($event)"
    />

    <app-modal
      [open]="showInviteModal()"
      title="Enviar link de cadastro"
      subtitle="A empresa preenche os dados pelo e-mail e conclui o cadastro."
      size="md"
      (close)="fecharConviteCadastro()"
    >
      <form id="self-register-invite-form" class="space-y-4" (ngSubmit)="enviarLinkCadastro()">
        <div>
          <label class="form-label" for="invite-name">Nome do responsável</label>
          <input
            id="invite-name"
            class="form-field"
            type="text"
            name="inviteName"
            required
            maxlength="200"
            [(ngModel)]="inviteForm.name"
            [disabled]="invitingLink()"
          />
        </div>
        <div>
          <label class="form-label" for="invite-email">E-mail</label>
          <input
            id="invite-email"
            class="form-field"
            type="email"
            name="inviteEmail"
            required
            maxlength="200"
            [(ngModel)]="inviteForm.email"
            [disabled]="invitingLink()"
          />
        </div>
        <div>
          <label class="form-label" for="invite-type">Tipo de empresa</label>
          <select
            id="invite-type"
            class="form-select"
            name="inviteType"
            required
            [(ngModel)]="inviteForm.id_company_type"
            [disabled]="invitingLink()"
          >
            <option [ngValue]="null">Selecione</option>
            <option *ngFor="let t of types()" [ngValue]="t.id_company_type">{{ t.description }}</option>
          </select>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharConviteCadastro()">Cancelar</button>
        <button
          type="submit"
          form="self-register-invite-form"
          class="btn-action-primary"
          [disabled]="invitingLink() || !inviteFormValido()"
        >
          {{ invitingLink() ? 'Enviando...' : 'Enviar e-mail' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class CompanyListComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly formatCnpj = formatCnpj;

  companies = signal<CompanyItem[]>([]);
  types = signal<CompanyType[]>([]);
  loading = signal(false);
  saving = signal(false);
  inviting = signal(false);
  invitingLink = signal(false);
  showModal = signal(false);
  showInviteModal = signal(false);
  editingId = signal<number | null>(null);
  private readonly nav = inject(NavigationStateService);
  logoPreviewUrl = signal<string | null>(null);
  pendingLogoFile = signal<File | null>(null);
  logoDragOver = signal(false);
  thumbnailUrls = signal<Record<number, string>>({});
  showLogoCropModal = signal(false);
  logoCropSourceUrl = signal<string | null>(null);
  logoCropSourceName = signal('logo.jpg');
  private logoCropSourceOwned = false;

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

  private readonly filterDebounceMs = 500;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbnailLoadId = 0;
  private routeSub?: Subscription;
  private readonly logoAcceptMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly logoAcceptExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  private readonly logoMaxBytes = 2 * 1024 * 1024;

  form: CompanyFormState = this.emptyForm();
  inviteForm = this.emptyInviteForm();

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

  ngOnInit() {
    const aberto = this.nav.obter('/admin/empresas');
    if (aberto?.public_id) this.consumeOpenQuery(aberto.public_id as never);
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('open');
      if (!raw) return;
      if (!/^[0-9a-f-]{36}$/i.test(raw)) return;
      this.consumeOpenQuery(raw as never);
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.clearFilterDebounce();
    this.revokeLogoCropSource();
    this.revokeLogoPreview();
    this.revokeThumbnails();
  }

  logoUrl(c: CompanyItem): string | null {
    return this.thumbnailUrls()[c.id_company] ?? null;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
          this.loadThumbnails(res.companies);
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

  private consumeOpenQuery(id: number) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { open: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.editar({ id_company: id } as CompanyItem);
  }

  novaEmpresa() {
    this.editingId.set(null);
    this.nav.remover('/admin/empresas');
    this.form = this.emptyForm();
    this.resetLogoState();
    if (this.types().length > 0) {
      this.form.id_company_type = this.types()[0].id_company_type;
    }
    this.showModal.set(true);
  }

  editar(c: CompanyItem) {
    this.editingId.set(c.id_company);
    this.resetLogoState();
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
            id_company_contact: ct.id_company_contact,
            name: ct.name,
            department: ct.department || '',
            phone: ct.phone || '',
            email: ct.email || '',
          })),
        };
        if (company.logo) {
          this.loadLogoPreview(company.logo);
        }
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
    this.nav.remover('/admin/empresas');
    this.form = this.emptyForm();
    this.resetLogoState();
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.applyLogoFile(file);
  }

  onLogoDragOver(event: DragEvent) {
    event.preventDefault();
    this.logoDragOver.set(true);
  }

  onLogoDragLeave(event: DragEvent) {
    event.preventDefault();
    this.logoDragOver.set(false);
  }

  onLogoDrop(event: DragEvent) {
    event.preventDefault();
    this.logoDragOver.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (!file) return;
    this.applyLogoFile(file);
  }

  private applyLogoFile(file: File) {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    const mimeOk = this.logoAcceptMime.has(file.type);
    const extOk = this.logoAcceptExt.has(ext);
    if (!mimeOk && !extOk) {
      this.notification.error('Imagem inválida. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > this.logoMaxBytes) {
      this.notification.error('Logo excede o limite de 2 MB.');
      return;
    }

    this.openLogoCrop(URL.createObjectURL(file), file.name || 'logo.jpg', true);
  }

  ajustarLogoEnquadramento() {
    const url = this.logoPreviewUrl();
    if (!url) return;
    const name = this.pendingLogoFile()?.name || 'logo.jpg';
    this.openLogoCrop(url, name, false);
  }

  cancelLogoCrop() {
    this.showLogoCropModal.set(false);
    this.revokeLogoCropSource();
  }

  onLogoCropped(file: File) {
    this.showLogoCropModal.set(false);
    this.revokeLogoCropSource();
    if (file.size > this.logoMaxBytes) {
      this.notification.error('O recorte excede 2 MB. Tente um enquadramento menor.');
      return;
    }
    this.pendingLogoFile.set(file);
    this.revokeLogoPreview();
    this.logoPreviewUrl.set(URL.createObjectURL(file));
  }

  private openLogoCrop(url: string, name: string, owned: boolean) {
    this.revokeLogoCropSource();
    this.logoCropSourceOwned = owned;
    this.logoCropSourceName.set(name);
    this.logoCropSourceUrl.set(url);
    this.showLogoCropModal.set(true);
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
      next: (res) => {
        const company = res.company;
        this.editingId.set(company.id_company);
        this.form = {
          id_company_type: company.id_company_type,
          cnpj: formatCnpj(company.cnpj),
          company_name: company.company_name,
          fancy_name: company.fancy_name || '',
          contacts: (company.contacts || []).map((ct) => ({
            id_company_contact: ct.id_company_contact,
            name: ct.name,
            department: ct.department || '',
            phone: ct.phone || '',
            email: ct.email || '',
          })),
        };

        this.uploadLogoIfNeeded(company.id_company, () => {
          this.saving.set(false);
          if (id) {
            this.notification.success('Empresa atualizada.');
          } else {
            const created = res as {
              invites?: CompanyInviteResult[];
              invite_errors?: CompanyInviteError[];
            };
            this.notifyCreateInvites(created.invites || [], created.invite_errors || []);
          }
          this.carregar(id ? this.pagination().page : 1);
          this.cdr.markForCheck();
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar empresa.');
      },
    });
  }

  private notifyCreateInvites(invites: CompanyInviteResult[], errors: CompanyInviteError[]) {
    if (invites.length === 0 && errors.length === 0) {
      this.notification.success('Empresa criada. Você já pode enviar o acesso.');
      return;
    }

    if (invites.length > 0) {
      const list = invites.map((invite) => invite.email).join(', ');
      this.notification.success(`Empresa criada. Convite de senha enviado para ${list}.`);
    } else {
      this.notification.success('Empresa criada.');
    }

    if (errors.length > 0) {
      const detail = errors.map((item) => `${item.email}: ${item.message}`).join(' ');
      this.notification.warning('Alguns convites não foram enviados.', detail);
    }
  }

  private uploadLogoIfNeeded(id: number, onDone: () => void) {
    const file = this.pendingLogoFile();
    if (!file) {
      onDone();
      return;
    }
    this.companyService.uploadLogo(id, file).subscribe({
      next: (res) => {
        this.pendingLogoFile.set(null);
        if (res.company.logo) {
          this.loadLogoPreview(res.company.logo);
        }
        onDone();
      },
      error: (err) => {
        this.notification.error(
          this.extractError(err) || 'Empresa salva, mas falhou o envio do logo.',
        );
        onDone();
      },
    });
  }

  private loadLogoPreview(filename: string) {
    this.companyService.getLogoBlob(filename).subscribe({
      next: (url) => {
        this.revokeLogoPreview();
        this.logoPreviewUrl.set(url);
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  private resetLogoState() {
    this.showLogoCropModal.set(false);
    this.pendingLogoFile.set(null);
    this.logoDragOver.set(false);
    this.revokeLogoCropSource();
    this.revokeLogoPreview();
  }

  private revokeLogoCropSource() {
    const url = this.logoCropSourceUrl();
    if (url && this.logoCropSourceOwned) URL.revokeObjectURL(url);
    this.logoCropSourceUrl.set(null);
    this.logoCropSourceOwned = false;
  }

  private revokeLogoPreview() {
    const url = this.logoPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.logoPreviewUrl.set(null);
  }

  private loadThumbnails(list: CompanyItem[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.logo) continue;
      this.companyService.getLogoBlob(c.logo).subscribe({
        next: (url) => {
          if (loadId !== this.thumbnailLoadId) return;
          this.thumbnailUrls.update((map) => ({ ...map, [c.id_company]: url }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    this.thumbnailUrls.set({});
  }

  private emptyInviteForm() {
    return {
      name: '',
      email: '',
      id_company_type: null as number | null,
    };
  }

  inviteFormValido(): boolean {
    return (
      !!this.inviteForm.name.trim() &&
      !!this.inviteForm.email.trim() &&
      this.inviteForm.id_company_type != null &&
      this.inviteForm.id_company_type > 0
    );
  }

  abrirConviteCadastro() {
    this.inviteForm = this.emptyInviteForm();
    if (this.types().length === 1) {
      this.inviteForm.id_company_type = this.types()[0].id_company_type;
    }
    this.showInviteModal.set(true);
  }

  fecharConviteCadastro() {
    if (this.invitingLink()) return;
    this.showInviteModal.set(false);
  }

  enviarLinkCadastro() {
    if (!this.inviteFormValido() || this.invitingLink()) return;
    const payload = {
      name: this.inviteForm.name.trim(),
      email: this.inviteForm.email.trim(),
      id_company_type: this.inviteForm.id_company_type as number,
    };
    this.invitingLink.set(true);
    this.companyService.inviteSelfRegister(payload).subscribe({
      next: (res) => {
        this.invitingLink.set(false);
        this.showInviteModal.set(false);
        this.notification.success(`Link de cadastro enviado para ${res.invite.email}.`);
      },
      error: (err) => {
        this.invitingLink.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao enviar o link de cadastro.');
      },
    });
  }

  enviarAcesso() {
    const companyId = this.editingId();
    if (!companyId) {
      this.notification.error('Salve a empresa antes de enviar o acesso.');
      return;
    }

    const withEmail = this.form.contacts.filter((c) => c.email?.trim() && c.name?.trim());
    if (withEmail.length === 0) {
      this.notification.error('Adicione e salve ao menos um contato com e-mail.');
      return;
    }

    const inputOptions: Record<string, string> = {};
    withEmail.forEach((c, idx) => {
      const key = String(c.id_company_contact || `email:${idx}`);
      inputOptions[key] = `${c.name} <${c.email}>`;
    });

    Swal.fire({
      title: 'Enviar acesso',
      text: 'Selecione o contato que receberá o e-mail de cadastro do gestor.',
      input: 'select',
      inputOptions,
      inputPlaceholder: 'Selecione um contato',
      showCancelButton: true,
      confirmButtonText: 'Enviar e-mail',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => (!value ? 'Selecione um contato' : null),
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;

      const selectedKey = String(result.value);
      let payload: { id_company_contact?: number | string; email?: string; name?: string };

      if (selectedKey.startsWith('email:')) {
        const idx = Number(selectedKey.replace('email:', ''));
        const contact = withEmail[idx];
        payload = { email: contact.email!.trim(), name: contact.name.trim() };
      } else {
        // id público (UUID) do contato; a API converte para o id interno.
        payload = { id_company_contact: selectedKey };
      }

      this.inviting.set(true);
      this.companyService.inviteAccess(companyId, payload).subscribe({
        next: (res) => {
          this.inviting.set(false);
          this.notification.success(`Convite enviado para ${res.invite.email}.`);
        },
        error: (err) => {
          this.inviting.set(false);
          this.notification.error(this.extractError(err) || 'Falha ao enviar acesso.');
        },
      });
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
