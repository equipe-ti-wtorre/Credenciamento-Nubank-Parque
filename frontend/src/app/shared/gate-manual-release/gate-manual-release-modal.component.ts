import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ModalComponent } from '../modal/modal.component';
import { NotificationService } from '../../core/services/notification.service';
import {
  GateManualReleaseCollaborator,
  GateManualReleaseCompany,
  GateManualReleaseMeta,
  GateManualReleasePayload,
  GateManualReleaseResult,
  GateManualReleaseSector,
  GateService,
} from '../../services/gate.service';

type ManualReleaseStep = 'dados' | 'colaborador' | 'confirmar';
type ColabMode = 'search' | 'create';

/** Novo cadastro ainda não persistido, aguardando envio. */
interface PendingCreate {
  key: string;
  id_collaborator_document_type: number;
  id_collaborator_role: number;
  document: string;
  name: string;
  rg: string | null;
  phone: string | null;
  role_description: string;
}

@Component({
  selector: 'app-gate-manual-release-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './gate-manual-release-modal.component.html',
  styleUrl: './gate-manual-release-modal.component.scss',
})
export class GateManualReleaseModalComponent implements OnChanges {
  @Input() open = false;

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<GateManualReleaseResult>();

  private gateService = inject(GateService);
  private notify = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  step = signal<ManualReleaseStep>('dados');
  colabMode = signal<ColabMode>('search');
  loadingMeta = signal(false);
  searching = signal(false);
  submitting = signal(false);

  sectors = signal<GateManualReleaseSector[]>([]);
  companies = signal<GateManualReleaseCompany[]>([]);
  documentTypes = signal<{ id_collaborator_document_type: number; description: string }[]>([]);
  roles = signal<{ id_collaborator_role: number; description: string }[]>([]);

  idCompany: number | null = null;
  idSetor: number | null = null;
  finalidade = '';
  observacao = '';

  searchTerm = '';
  searchResults = signal<GateManualReleaseCollaborator[]>([]);
  selected = signal<GateManualReleaseCollaborator[]>([]);
  pendingCreates = signal<PendingCreate[]>([]);

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private pendingKeySeq = 0;

  createDocTypeId: number | null = null;
  createDocument = '';
  createName = '';
  createRoleId: number | null = null;
  createRg = '';
  createPhone = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.reset();
      this.loadMeta();
    }
  }

  private reset(): void {
    this.step.set('dados');
    this.colabMode.set('search');
    this.idCompany = null;
    this.idSetor = null;
    this.finalidade = '';
    this.observacao = '';
    this.searchTerm = '';
    this.searchResults.set([]);
    this.selected.set([]);
    this.pendingCreates.set([]);
    this.createDocument = '';
    this.createName = '';
    this.createRg = '';
    this.createPhone = '';
    this.searching.set(false);
    this.submitting.set(false);
  }

  private loadMeta(): void {
    this.loadingMeta.set(true);
    this.gateService.getManualReleaseMeta().subscribe({
      next: (meta: GateManualReleaseMeta) => {
        this.sectors.set(meta.sectors || []);
        this.companies.set(meta.companies || []);
        this.documentTypes.set(meta.document_types || []);
        this.roles.set(meta.roles || []);
        const firstType = meta.document_types?.[0];
        if (firstType) {
          this.createDocTypeId = firstType.id_collaborator_document_type;
        }
        const firstRole = meta.roles?.[0];
        if (firstRole) {
          this.createRoleId = firstRole.id_collaborator_role;
        }
        this.loadingMeta.set(false);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.loadingMeta.set(false);
        this.notify.error(err.error?.message || 'Não foi possível carregar os dados.');
        this.cdr.markForCheck();
      },
    });
  }

  onClose(): void {
    if (this.submitting()) return;
    this.close.emit();
  }

  setColabMode(mode: ColabMode): void {
    this.colabMode.set(mode);
    this.searchResults.set([]);
    this.searchTerm = '';
  }

  goDados(): void {
    this.step.set('dados');
  }

  goColaborador(): void {
    if (!this.idCompany) {
      this.notify.error('Selecione a empresa.');
      return;
    }
    if (!this.idSetor) {
      this.notify.error('Selecione o setor aprovador.');
      return;
    }
    if (!this.finalidade.trim()) {
      this.notify.error('Informe o nome do evento.');
      return;
    }
    if (!this.observacao.trim()) {
      this.notify.error('Informe a descrição do serviço.');
      return;
    }
    this.step.set('colaborador');
  }

  totalSelected(): number {
    return this.selected().length + this.pendingCreates().length;
  }

  goConfirmar(): void {
    if (!this.totalSelected()) {
      this.notify.error('Selecione ao menos um colaborador.');
      return;
    }
    if (this.selected().some((c) => c.is_blacklisted)) {
      this.notify.error('Remova colaboradores da lista de restrição antes de continuar.');
      return;
    }
    this.step.set('confirmar');
  }

  onSearchTermChange(term: string): void {
    this.searchTerm = term;
    if (this.searchDebounce) clearTimeout(this.searchDebounce);

    const q = term.trim();
    if (q.length < 2) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }

    this.searchDebounce = setTimeout(() => this.runSearch(q), 300);
  }

  private runSearch(q: string): void {
    const requestId = ++this.searchRequestId;
    this.searching.set(true);
    this.gateService.searchManualReleaseCollaborators(q).subscribe({
      next: (res) => {
        if (requestId !== this.searchRequestId) return;
        this.searching.set(false);
        const selectedIds = new Set(this.selected().map((c) => c.id_collaborator));
        this.searchResults.set(
          (res.results || []).filter((r) => !selectedIds.has(r.id_collaborator)),
        );
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        if (requestId !== this.searchRequestId) return;
        this.searching.set(false);
        this.searchResults.set([]);
        this.notify.error(err.error?.message || 'Falha ao buscar colaboradores.');
        this.cdr.markForCheck();
      },
    });
  }

  selectCandidate(found: GateManualReleaseCollaborator): void {
    if (found.is_blacklisted) {
      this.notify.error('Colaborador na lista de restrição. Sem possibilidade de liberar.');
      return;
    }
    if (!found.role?.id_collaborator_role) {
      this.notify.error('Colaborador sem função cadastrada.');
      return;
    }
    if (this.selected().some((c) => c.id_collaborator === found.id_collaborator)) {
      return;
    }
    this.selected.update((list) => [...list, found]);
    this.searchResults.update((list) =>
      list.filter((r) => r.id_collaborator !== found.id_collaborator),
    );
    this.searchTerm = '';
    this.searchResults.set([]);
  }

  removeSelected(id: number): void {
    this.selected.update((list) => list.filter((c) => c.id_collaborator !== id));
  }

  addPendingCreate(): void {
    if (!this.createDocTypeId || !this.createDocument.trim() || !this.createName.trim()) {
      this.notify.error('Preencha tipo de documento, documento e nome.');
      return;
    }
    if (!this.createRoleId) {
      this.notify.error('Selecione a função do colaborador.');
      return;
    }
    const role = this.roles().find((r) => r.id_collaborator_role === this.createRoleId);
    const draft: PendingCreate = {
      key: `new-${++this.pendingKeySeq}`,
      id_collaborator_document_type: this.createDocTypeId,
      id_collaborator_role: this.createRoleId,
      document: this.createDocument.trim(),
      name: this.createName.trim(),
      rg: this.createRg.trim() || null,
      phone: this.createPhone.trim() || null,
      role_description: role?.description || '—',
    };
    this.pendingCreates.update((list) => [...list, draft]);
    this.createDocument = '';
    this.createName = '';
    this.createRg = '';
    this.createPhone = '';
    this.colabMode.set('search');
    this.notify.success(`${draft.name} adicionado à lista.`);
  }

  removePendingCreate(key: string): void {
    this.pendingCreates.update((list) => list.filter((p) => p.key !== key));
  }

  companyLabel(): string {
    const c = this.companies().find((x) => x.id_company === this.idCompany);
    return c?.fancy_name || '—';
  }

  sectorLabel(): string {
    const s = this.sectors().find((x) => x.id === this.idSetor);
    return s?.nome || '—';
  }

  submit(): void {
    if (this.submitting() || !this.idCompany || !this.idSetor) return;
    if (!this.totalSelected()) {
      this.notify.error('Selecione ao menos um colaborador.');
      return;
    }

    const payload: GateManualReleasePayload = {
      id_company: this.idCompany,
      id_setor: this.idSetor,
      finalidade: this.finalidade.trim(),
      observacao: this.observacao.trim(),
    };

    const ids = this.selected().map((c) => c.id_collaborator);
    if (ids.length) payload.id_collaborators = ids;

    const creates = this.pendingCreates().map((p) => ({
      id_collaborator_document_type: p.id_collaborator_document_type,
      id_collaborator_role: p.id_collaborator_role,
      document: p.document,
      name: p.name,
      rg: p.rg,
      phone: p.phone,
    }));
    if (creates.length) payload.collaborators = creates;

    this.submitting.set(true);
    this.gateService.createManualRelease(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        const n = res.release.collaborators?.length || 1;
        this.notify.success(
          n > 1
            ? `Solicitação com ${n} colaboradores enviada ao setor ${res.release.setor_nome}.`
            : `Solicitação enviada ao setor ${res.release.setor_nome}. Aguardando aprovação.`,
        );
        this.submitted.emit(res.release);
        this.close.emit();
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.notify.error(err.error?.message || 'Não foi possível enviar a solicitação.', undefined, err);
        this.cdr.markForCheck();
      },
    });
  }
}
