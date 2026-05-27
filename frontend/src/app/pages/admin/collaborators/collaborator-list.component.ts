import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  CollaboratorBulkUploadResult,
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
  formatCpf,
  isCpfDocumentType,
  normalizeCpfInput,
} from '../../../services/collaborator.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';

interface CollaboratorFormState {
  id_collaborator_document_type: number | null;
  id_collaborator_role: number | null;
  document: string;
  name: string;
  rg: string;
  phone: string;
}

@Component({
  selector: 'app-collaborator-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionBtnComponent, ActionMenuComponent],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Colaboradores</h2>
          <p class="page-section-subtitle">
            Cadastro global de pessoas físicas (equipe, prestadores e operação de eventos).
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-secondary disabled:opacity-50">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" (click)="abrirBulkModal()" class="btn-secondary">
            Upload em Lote (Excel/CSV)
          </button>
          <button type="button" (click)="novoColaborador()" class="btn-primary">+ Novo colaborador</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Total (página)</p>
          <p class="text-2xl font-bold text-slate-800 mt-1">{{ stats().total }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Ativos</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ stats().ativos }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Inativos</p>
          <p class="text-2xl font-bold text-slate-600 mt-1">{{ stats().inativos }}</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs font-bold text-slate-500 uppercase">Na blacklist</p>
          <p class="text-2xl font-bold text-rose-700 mt-1">{{ stats().blacklist }}</p>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Documento</label>
            <input
              [(ngModel)]="filterDocument"
              name="filterDocument"
              placeholder="CPF, RG ou passaporte"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="filterName"
              name="filterName"
              placeholder="Nome completo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo doc.</label>
            <select
              [(ngModel)]="filterDocTypeId"
              name="filterDocTypeId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todos</option>
              <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                {{ t.description }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Função</label>
            <select
              [(ngModel)]="filterRoleId"
              name="filterRoleId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todas</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Status</label>
            <select
              [(ngModel)]="filterStatus"
              name="filterStatus"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="aplicarFiltros()" class="btn-primary text-sm py-1.5 px-4">Filtrar</button>
          <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-1.5 px-4">Limpar</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Documento</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Função</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Restrição</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let c of collaborators()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ c.name }}</td>
                <td class="px-4 py-3 font-mono text-slate-600">{{ formatDocument(c) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.document_type?.description || '—' }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.role?.description || '—' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="c.status"
                    [class.text-emerald-800]="c.status"
                    [class.bg-slate-100]="!c.status"
                    [class.text-slate-600]="!c.status"
                  >
                    {{ c.status ? 'Ativo' : 'Inativo' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span
                    *ngIf="c.is_blacklisted"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800"
                  >
                    Blacklist
                  </span>
                  <span *ngIf="!c.is_blacklisted" class="text-slate-400 text-xs">—</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                      <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(c)" />
                      <app-action-btn
                        *ngIf="c.status"
                        icon="delete"
                        title="Desativar"
                        variant="danger"
                        (action)="alterarStatus(c, false)"
                      />
                      <app-action-btn
                        *ngIf="!c.status"
                        icon="send"
                        title="Ativar"
                        variant="primary"
                        (action)="alterarStatus(c, true)"
                      />
                      <app-action-btn
                        *ngIf="!c.is_blacklisted"
                        icon="delete"
                        title="Incluir na blacklist"
                        variant="danger"
                        (action)="incluirBlacklist(c)"
                      />
                      <app-action-btn
                        *ngIf="c.is_blacklisted"
                        icon="send"
                        title="Remover da blacklist"
                        variant="primary"
                        (action)="removerBlacklist(c)"
                      />
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="collaborators().length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhum colaborador encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">Carregando colaboradores...</td>
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

    <div
      *ngIf="showModal()"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Fechar" (click)="fecharModal()"></button>
      <div class="relative w-full max-w-2xl card-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-4 mb-4">
          <h3 class="text-lg font-bold text-slate-800">
            {{ editingId() ? 'Editar colaborador' : 'Novo colaborador' }}
          </h3>
          <button type="button" (click)="fecharModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form class="space-y-4" (ngSubmit)="salvar()">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Tipo de documento</label>
              <select
                [(ngModel)]="form.id_collaborator_document_type"
                name="id_collaborator_document_type"
                required
                (ngModelChange)="onDocTypeChange()"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option [ngValue]="null" disabled>Selecione</option>
                <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                  {{ t.description }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Documento</label>
              <input
                [(ngModel)]="form.document"
                name="document"
                required
                [placeholder]="documentPlaceholder()"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Nome completo</label>
              <input
                [(ngModel)]="form.name"
                name="name"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Função / cargo</label>
              <select
                [(ngModel)]="form.id_collaborator_role"
                name="id_collaborator_role"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option [ngValue]="null" disabled>Selecione</option>
                <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">RG (opcional)</label>
              <input
                [(ngModel)]="form.rg"
                name="rg"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Telefone (opcional)</label>
              <input
                [(ngModel)]="form.phone"
                name="phone"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div *ngIf="editingId()" class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">Foto</label>
              <div class="mt-1 flex items-center gap-4">
                <img
                  *ngIf="picturePreviewUrl()"
                  [src]="picturePreviewUrl()"
                  alt="Preview"
                  class="w-16 h-16 rounded-full object-cover border border-slate-200"
                />
                <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onPictureSelected($event)" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" (click)="fecharModal()" class="btn-secondary">Cancelar</button>
            <button type="submit" [disabled]="saving()" class="btn-primary disabled:opacity-50">
              {{ saving() ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div *ngIf="showBulkModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="fecharBulkModal()"></button>
      <div class="relative card-surface p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-slate-800 mb-2">Upload em lote</h3>
        <p class="text-sm text-slate-500 mb-4">
          Colunas: document, id_collaborator_document_type, name, id_collaborator_role (rg, phone opcionais).
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          (change)="onBulkFileSelected($event)"
          class="w-full text-sm"
        />
        <div *ngIf="bulkUploading()" class="mt-4 text-sm text-slate-600">Processando arquivo...</div>
        <table *ngIf="bulkResult()?.errors?.length" class="w-full text-sm mt-4 border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Linha</th>
              <th class="px-3 py-2 text-left">Erro</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let e of bulkResult()!.errors" class="border-t border-slate-100">
              <td class="px-3 py-2">{{ e.line }}</td>
              <td class="px-3 py-2 text-rose-700">{{ e.reason }}</td>
            </tr>
          </tbody>
        </table>
        <div class="flex justify-end gap-2 mt-4">
          <button type="button" class="btn-secondary" (click)="fecharBulkModal()">Fechar</button>
          <button
            type="button"
            class="btn-primary disabled:opacity-50"
            [disabled]="!bulkFile() || bulkUploading()"
            (click)="enviarBulk()"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CollaboratorListComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  collaborators = signal<CollaboratorItem[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  showBulkModal = signal(false);
  bulkUploading = signal(false);
  bulkFile = signal<File | null>(null);
  bulkResult = signal<CollaboratorBulkUploadResult | null>(null);
  picturePreviewUrl = signal<string | null>(null);
  pendingPictureFile = signal<File | null>(null);
  editingId = signal<number | null>(null);

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterDocument = '';
  filterName = '';
  filterDocTypeId: number | null = null;
  filterRoleId: number | null = null;
  filterStatus = '';

  appliedDocument = '';
  appliedName = '';
  appliedDocTypeId: number | null = null;
  appliedRoleId: number | null = null;
  appliedStatus: boolean | undefined = undefined;

  form: CollaboratorFormState = this.emptyForm();

  stats = computed(() => {
    const list = this.collaborators();
    return {
      total: list.length,
      ativos: list.filter((c) => c.status).length,
      inativos: list.filter((c) => !c.status).length,
      blacklist: list.filter((c) => c.is_blacklisted).length,
    };
  });

  constructor(
    private collaboratorService: CollaboratorService,
    private notification: NotificationService,
  ) {
    this.carregarDominios();
    this.carregar();
  }

  private emptyForm(): CollaboratorFormState {
    return {
      id_collaborator_document_type: null,
      id_collaborator_role: null,
      document: '',
      name: '',
      rg: '',
      phone: '',
    };
  }

  carregarDominios() {
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types),
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de documento.'),
    });
    this.collaboratorService.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar funções.'),
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.collaboratorService
      .list(page, this.pagination().limit, {
        document: this.appliedDocument || undefined,
        name: this.appliedName || undefined,
        id_collaborator_document_type: this.appliedDocTypeId ?? undefined,
        id_collaborator_role: this.appliedRoleId ?? undefined,
        status: this.appliedStatus,
      })
      .subscribe({
        next: (res) => {
          this.collaborators.set(res.collaborators);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.cdr.markForCheck();
          this.notification.error(this.extractError(err) || 'Falha ao carregar colaboradores.');
        },
      });
  }

  aplicarFiltros() {
    this.appliedDocument = this.filterDocument.trim();
    this.appliedName = this.filterName.trim();
    this.appliedDocTypeId = this.filterDocTypeId;
    this.appliedRoleId = this.filterRoleId;
    if (this.filterStatus === 'true') this.appliedStatus = true;
    else if (this.filterStatus === 'false') this.appliedStatus = false;
    else this.appliedStatus = undefined;
    this.carregar(1);
  }

  limparFiltros() {
    this.filterDocument = '';
    this.filterName = '';
    this.filterDocTypeId = null;
    this.filterRoleId = null;
    this.filterStatus = '';
    this.appliedDocument = '';
    this.appliedName = '';
    this.appliedDocTypeId = null;
    this.appliedRoleId = null;
    this.appliedStatus = undefined;
    this.carregar(1);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  formatDocument(c: CollaboratorItem): string {
    if (isCpfDocumentType(c.document_type?.description)) {
      return formatCpf(c.document);
    }
    return c.document;
  }

  documentPlaceholder(): string {
    const type = this.documentTypes().find(
      (t) => t.id_collaborator_document_type === this.form.id_collaborator_document_type,
    );
    if (isCpfDocumentType(type?.description)) return '000.000.000-00';
    return 'Documento alfanumérico';
  }

  onDocTypeChange() {
    this.form.document = '';
  }

  novoColaborador() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    if (this.documentTypes().length > 0) {
      this.form.id_collaborator_document_type = this.documentTypes()[0].id_collaborator_document_type;
    }
    if (this.roles().length > 0) {
      this.form.id_collaborator_role = this.roles()[0].id_collaborator_role;
    }
    this.showModal.set(true);
  }

  editar(c: CollaboratorItem) {
    this.editingId.set(c.id_collaborator);
    this.loading.set(true);
    this.collaboratorService.get(c.id_collaborator).subscribe({
      next: (res) => {
        const col = res.collaborator;
        this.form = {
          id_collaborator_document_type: col.id_collaborator_document_type,
          id_collaborator_role: col.id_collaborator_role,
          document: isCpfDocumentType(col.document_type?.description)
            ? formatCpf(col.document)
            : col.document,
          name: col.name,
          rg: col.rg || '',
          phone: col.phone || '',
        };
        this.loading.set(false);
        this.revokePicturePreview();
        this.pendingPictureFile.set(null);
        if (col.picture) {
          this.collaboratorService.getPictureBlob(col.picture).subscribe({
            next: (blob) => this.picturePreviewUrl.set(URL.createObjectURL(blob)),
            error: () => this.picturePreviewUrl.set(null),
          });
        }
        this.showModal.set(true);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao carregar colaborador.');
      },
    });
  }

  fecharModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.revokePicturePreview();
    this.pendingPictureFile.set(null);
  }

  abrirBulkModal() {
    this.bulkFile.set(null);
    this.bulkResult.set(null);
    this.showBulkModal.set(true);
  }

  fecharBulkModal() {
    this.showBulkModal.set(false);
    this.bulkFile.set(null);
    this.bulkResult.set(null);
  }

  onBulkFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.bulkFile.set(input.files?.[0] ?? null);
    this.bulkResult.set(null);
  }

  enviarBulk() {
    const file = this.bulkFile();
    if (!file) return;
    this.bulkUploading.set(true);
    this.collaboratorService.bulkUpload(file).subscribe({
      next: (res) => {
        this.bulkUploading.set(false);
        this.bulkResult.set(res);
        if (res.errors.length === 0) {
          Swal.fire({
            icon: 'success',
            title: 'Importação concluída',
            text: `${res.successCount} colaborador(es) cadastrado(s).`,
            timer: 2500,
            showConfirmButton: false,
          });
          this.fecharBulkModal();
          this.carregar(1);
        } else {
          this.notification.success(
            `${res.successCount} de ${res.totalProcessed} importado(s). Verifique os erros.`,
          );
          if (res.successCount > 0) this.carregar(1);
        }
      },
      error: (err) => {
        this.bulkUploading.set(false);
        this.notification.error(this.extractError(err) || 'Falha no upload em lote.');
      },
    });
  }

  onPictureSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.revokePicturePreview();
    this.pendingPictureFile.set(file);
    this.picturePreviewUrl.set(URL.createObjectURL(file));
  }

  private revokePicturePreview() {
    const url = this.picturePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.picturePreviewUrl.set(null);
  }

  private uploadPictureIfNeeded(id: number, onDone: () => void) {
    const file = this.pendingPictureFile();
    if (!file) {
      onDone();
      return;
    }
    this.collaboratorService.uploadPicture(id, file).subscribe({
      next: () => onDone(),
      error: (err) => {
        this.notification.error(this.extractError(err) || 'Colaborador salvo, mas falha ao enviar foto.');
        onDone();
      },
    });
  }

  salvar() {
    if (!this.form.id_collaborator_document_type) {
      this.notification.error('Selecione o tipo de documento.');
      return;
    }
    if (!this.form.id_collaborator_role) {
      this.notification.error('Selecione a função.');
      return;
    }
    if (!this.form.name.trim()) {
      this.notification.error('Nome é obrigatório.');
      return;
    }

    const type = this.documentTypes().find(
      (t) => t.id_collaborator_document_type === this.form.id_collaborator_document_type,
    );
    let document = this.form.document.trim();
    if (isCpfDocumentType(type?.description)) {
      document = normalizeCpfInput(document);
      if (document.length !== 11) {
        this.notification.error('CPF deve conter 11 dígitos.');
        return;
      }
    } else {
      document = document.replace(/\s+/g, '').toUpperCase();
      if (document.length < 5) {
        this.notification.error('Documento deve ter ao menos 5 caracteres.');
        return;
      }
    }

    const payload = {
      id_collaborator_document_type: this.form.id_collaborator_document_type,
      id_collaborator_role: this.form.id_collaborator_role,
      document,
      name: this.form.name.trim(),
      rg: this.form.rg.trim() || null,
      phone: this.form.phone.trim() || null,
    };

    this.saving.set(true);
    const id = this.editingId();
    const req = id
      ? this.collaboratorService.update(id, payload)
      : this.collaboratorService.create(payload);

    req.subscribe({
      next: (res) => {
        const savedId = id ?? res.collaborator.id_collaborator;
        this.uploadPictureIfNeeded(savedId, () => {
          this.saving.set(false);
          this.notification.success(id ? 'Colaborador atualizado.' : 'Colaborador criado.');
          this.fecharModal();
          this.carregar(id ? this.pagination().page : 1);
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar colaborador.');
      },
    });
  }

  alterarStatus(c: CollaboratorItem, ativar: boolean) {
    const titulo = ativar ? 'Ativar colaborador?' : 'Desativar colaborador?';
    const texto = ativar
      ? `"${c.name}" voltará a ficar ativo no sistema.`
      : `"${c.name}" será inativado (sem exclusão física).`;

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
      this.collaboratorService.patchStatus(c.id_collaborator, ativar).subscribe({
        next: () => {
          this.notification.success(ativar ? 'Colaborador ativado.' : 'Colaborador desativado.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao alterar status.');
        },
      });
    });
  }

  incluirBlacklist(c: CollaboratorItem) {
    Swal.fire({
      title: 'Incluir na lista de restrição?',
      html: `<p class="text-sm text-slate-600 mb-3">Colaborador: <strong>${c.name}</strong></p>`,
      input: 'textarea',
      inputLabel: 'Motivo (mín. 10 caracteres)',
      inputPlaceholder: 'Descreva o motivo da restrição global...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Incluir na blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'Informe um motivo com pelo menos 10 caracteres.';
        }
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      this.collaboratorService.addBlacklist(c.id_collaborator, result.value.trim()).subscribe({
        next: () => {
          this.notification.success('Colaborador incluído na blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao incluir na blacklist.');
        },
      });
    });
  }

  removerBlacklist(c: CollaboratorItem) {
    Swal.fire({
      title: 'Remover da lista de restrição?',
      text: `"${c.name}" poderá voltar a ser credenciado globalmente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.collaboratorService.removeBlacklist(c.id_collaborator).subscribe({
        next: () => {
          this.notification.success('Colaborador removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao remover da blacklist.');
        },
      });
    });
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
