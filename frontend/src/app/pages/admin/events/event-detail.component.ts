import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import {
  EventDay,
  EventDayCompanyLink,
  EventDetail,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import { CompanyItem, CompanyService } from '../../../services/company.service';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
} from '../../../services/collaborator.service';
import {
  CredentialItem,
  CredentialService,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  statusBadgeClass,
} from '../../../services/credential.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentChangeService } from '../../../services/document-change.service';
import { ModalComponent } from '../../../shared/modal/modal.component';

const TYPE_PRODUTORA = 'Produtora';
const TYPE_EMPRESA_PADRAO = 'Empresa Padrão';

function maskDocument(document: string): string {
  const raw = String(document || '').trim();
  if (!raw) return '—';
  if (raw.includes('*')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (raw.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, ModalComponent],
  template: `
    <div class="w-full">
      <div class="mb-4">
        <a routerLink="/admin/eventos" class="text-sm text-[var(--color-primary)] hover:underline">← Voltar para lista</a>
      </div>

      <ng-container *ngIf="!loading() && event(); else loadingState">
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
          <div>
            <h2 class="page-section-title">{{ event()!.name }}</h2>
            <p class="page-section-subtitle">
              Período: {{ formatDateBr(event()!.start) }} — {{ formatDateBr(event()!.end) }}
            </p>
            <p class="mt-1" *ngIf="event()!.access_status_description">
              <span
                class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                [ngClass]="eventStatusClass(event()!.id_access_status)"
              >
                {{ event()!.access_status_description }}
              </span>
            </p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              class="btn-secondary"
              (click)="abrirModalPeriodo()"
            >
              Ajustar período
            </button>
            <button type="button" (click)="carregar()" class="btn-secondary">Atualizar</button>
          </div>
        </div>

        <div *ngIf="event()!.days.length === 0" class="card-surface p-6 text-slate-600 text-sm">
          Este evento não possui dias cadastrados. Os dias são definidos na criação do evento; não é possível
          adicioná-los depois por esta tela.
        </div>

        <div *ngFor="let day of event()!.days" class="card-surface p-5 mb-4">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <h3 class="text-base font-bold text-slate-800">{{ formatDateBr(day.date) }}</h3>
            <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              {{ day.type.description }}
            </span>
          </div>

          <div *ngFor="let link of day.companies" class="border border-slate-100 rounded-lg mb-3 overflow-hidden">
            <div class="bg-slate-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div class="text-sm">
                <span class="font-semibold text-slate-800">{{ link.company.company_name }}</span>
                <span class="text-slate-500 ml-2">{{ link.company.company_type_description || '—' }}</span>
                <span *ngIf="link.producer" class="text-slate-500 ml-2">· Prod.: {{ link.producer.company_name }}</span>
              </div>
              <div class="flex gap-2 items-center">
                <button
                  type="button"
                  (click)="toggleCredentials(link.id_event_day_company)"
                  class="text-xs text-slate-600 hover:underline"
                >
                  {{ isLinkExpanded(link.id_event_day_company) ? 'Ocultar credenciais' : 'Ver credenciais' }}
                  ({{ credentialsForLink(link.id_event_day_company).length }})
                </button>
                <button
                  *ngIf="canRequestCredentialForLink(link)"
                  type="button"
                  (click)="abrirModalCredencial(link)"
                  class="text-xs text-[var(--color-primary)] hover:underline font-medium"
                >
                  Solicitar credencial
                </button>
                <button
                  *ngIf="isAdmin"
                  type="button"
                  (click)="removerVinculo(day, link)"
                  class="text-xs text-[var(--danger)] hover:underline"
                >
                  Remover vínculo
                </button>
              </div>
            </div>

            <div *ngIf="isLinkExpanded(link.id_event_day_company)" class="px-3 py-2">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-slate-500">
                    <th class="text-left py-1">Colaborador</th>
                    <th class="text-left py-1">Função</th>
                    <th class="text-left py-1">Status</th>
                    <th class="text-left py-1">Acesso</th>
                    <th class="text-right py-1">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    *ngFor="let cred of credentialsForLink(link.id_event_day_company)"
                    class="border-t border-slate-50"
                  >
                    <td class="py-2">
                      <span class="font-medium block">{{ cred.collaborator.name }}</span>
                      <span class="text-slate-400 text-[11px]">{{ maskDocument(cred.collaborator.document) }}</span>
                    </td>
                    <td class="py-2 text-slate-600">{{ cred.role_description }}</td>
                    <td class="py-2">
                      <span
                        class="inline-flex px-2 py-0.5 rounded-full font-semibold"
                        [ngClass]="statusBadgeClass(cred.id_access_status)"
                      >
                        {{ cred.access_status_description }}
                      </span>
                    </td>
                    <td class="py-2 font-mono text-slate-600">{{ cred.access_id || '—' }}</td>
                    <td class="py-2 text-right space-x-2">
                      <button
                        *ngIf="canProdutoraAct(cred)"
                        type="button"
                        (click)="aprovarProdutora(cred)"
                        class="btn-action-primary text-xs py-1 px-2.5"
                      >
                        Aprovar credencial
                      </button>
                      <button
                        *ngIf="canProdutoraAct(cred)"
                        type="button"
                        (click)="negarCredencial(cred)"
                        class="btn-action-secondary text-xs py-1 px-2.5"
                      >
                        Negar credencial
                      </button>
                      <button
                        *ngIf="canAdminAct(cred)"
                        type="button"
                        (click)="aprovarAdmin(cred)"
                        class="btn-action-primary text-xs py-1 px-2.5"
                      >
                        Aprovar credencial
                      </button>
                      <button
                        *ngIf="canAdminAct(cred)"
                        type="button"
                        (click)="negarCredencial(cred)"
                        class="btn-action-secondary text-xs py-1 px-2.5"
                      >
                        Negar credencial
                      </button>
                    </td>
                  </tr>
                  <tr *ngIf="credentialsForLink(link.id_event_day_company).length === 0">
                    <td colspan="5" class="py-3 text-center text-slate-400">Nenhuma credencial.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p *ngIf="day.companies.length === 0" class="text-sm text-slate-500 mb-4">Nenhuma empresa vinculada.</p>

          <div *ngIf="isAdmin" class="border-t border-slate-100 pt-4">
            <h4 class="text-xs font-bold text-slate-500 uppercase mb-3">Vincular empresa</h4>
            <form
              class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
              (ngSubmit)="vincularEmpresa(day)"
            >
              <div>
                <label class="text-xs text-slate-500">Empresa</label>
                <select
                  [ngModel]="getLinkForm(day.id_event_day).id_company"
                  (ngModelChange)="onCompanyChange(day.id_event_day, $event)"
                  [name]="'company_' + day.id_event_day"
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-2 text-sm bg-white"
                >
                  <option [ngValue]="null">Selecione</option>
                  <option *ngFor="let c of companies()" [ngValue]="c.id_company">
                    {{ c.company_name }} ({{ c.company_type?.description }})
                  </option>
                </select>
              </div>
              <div *ngIf="needsProducer(day.id_event_day)">
                <label class="text-xs text-slate-500">Produtora responsável</label>
                <select
                  [(ngModel)]="getLinkForm(day.id_event_day).id_producer"
                  [name]="'producer_' + day.id_event_day"
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-2 text-sm bg-white"
                >
                  <option [ngValue]="null">Selecione</option>
                  <option *ngFor="let p of producersForDay(day)" [ngValue]="p.company.id_company">
                    {{ p.company.company_name }}
                  </option>
                </select>
              </div>
              <div>
                <button
                  type="submit"
                  [disabled]="linkingDayId() === day.id_event_day"
                  class="btn-primary text-sm py-2 px-4 w-full md:w-auto disabled:opacity-50"
                >
                  {{ linkingDayId() === day.id_event_day ? 'Vinculando...' : 'Vincular' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ng-container>

      <ng-template #loadingState>
        <div class="card-surface p-8 text-center text-slate-500">
          {{ loading() ? 'Carregando evento...' : 'Evento não encontrado.' }}
        </div>
      </ng-template>

      <app-modal
        [open]="showCredentialModal()"
        title="Solicitar credencial"
        [subtitle]="selectedLink()?.company?.company_name || ''"
        size="md"
        (close)="fecharModalCredencial()"
      >
        <form
          id="credential-request-form"
          [formGroup]="credentialRequestForm"
          (ngSubmit)="onCredentialModalSubmit()"
        >
          <ng-container *ngIf="credentialModalStep() === 'search'">
            <div class="space-y-3">
              <div>
                <label class="form-label" for="cred-doc-type">Tipo de documento</label>
                <select
                  id="cred-doc-type"
                  formControlName="id_collaborator_document_type"
                  class="form-select"
                >
                  <option [ngValue]="null">Selecione</option>
                  <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                    {{ t.description }}
                  </option>
                </select>
              </div>
              <div>
                <label class="form-label" for="cred-document">Documento</label>
                <input
                  id="cred-document"
                  formControlName="document"
                  placeholder="CPF ou documento"
                  class="form-field"
                />
              </div>
            </div>
          </ng-container>

          <ng-container *ngIf="credentialModalStep() === 'confirm'">
            <div *ngIf="foundCollaborator() as col" class="bg-slate-50 rounded-xl p-4 mb-4 text-sm">
              <p class="font-semibold text-slate-800">{{ col.name }}</p>
              <p class="text-slate-500 mt-1">Documento: {{ col.document }}</p>
              <p *ngIf="col.phone" class="text-slate-500">Telefone: {{ col.phone }}</p>
              <p *ngIf="col.role" class="text-slate-500">Função cadastrada: {{ col.role.description }}</p>
            </div>
            <div>
              <label class="form-label" for="cred-role">Função no evento</label>
              <select
                id="cred-role"
                formControlName="id_collaborator_role"
                class="form-select"
              >
                <option [ngValue]="null">Selecione</option>
                <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">
                  {{ r.description }}
                </option>
              </select>
            </div>
            <button
              *ngIf="canRequestDocumentChange()"
              type="button"
              class="btn-action-tonal w-full text-sm mt-3"
              (click)="solicitarCorrecaoDocumento()"
            >
              Corrigir documento
            </button>
          </ng-container>
        </form>
        <div modal-footer class="modal-footer">
          <ng-container *ngIf="credentialModalStep() === 'search'">
            <button type="button" (click)="fecharModalCredencial()" class="btn-action-secondary">Cancelar</button>
            <button
              type="submit"
              form="credential-request-form"
              [disabled]="searchingCollaborator()"
              class="btn-action-primary"
            >
              {{ searchingCollaborator() ? 'Buscando...' : 'Buscar colaborador' }}
            </button>
          </ng-container>
          <ng-container *ngIf="credentialModalStep() === 'confirm'">
            <button type="button" (click)="voltarParaBusca()" class="btn-action-secondary">Voltar</button>
            <button
              type="submit"
              form="credential-request-form"
              [disabled]="submittingCredential()"
              class="btn-action-primary"
            >
              {{ submittingCredential() ? 'Enviando...' : 'Confirmar solicitação' }}
            </button>
          </ng-container>
        </div>
      </app-modal>

      <app-modal
        [open]="showPeriodModal()"
        title="Ajustar período"
        subtitle="Ao alterar as datas de um evento aprovado, a solicitação volta para o fluxo de aprovação."
        size="sm"
        (close)="fecharModalPeriodo()"
      >
        <form id="event-period-form" (ngSubmit)="salvarPeriodo()" class="space-y-4">
          <div>
            <label class="form-label" for="event-period-start">Data início</label>
            <input
              id="event-period-start"
              type="date"
              class="form-field"
              [(ngModel)]="periodForm.start"
              name="eventPeriodStart"
              required
            />
          </div>
          <div>
            <label class="form-label" for="event-period-end">Data fim</label>
            <input
              id="event-period-end"
              type="date"
              class="form-field"
              [(ngModel)]="periodForm.end"
              name="eventPeriodEnd"
              required
            />
          </div>
        </form>
        <div modal-footer class="modal-footer">
          <button type="button" class="btn-action-secondary" (click)="fecharModalPeriodo()">Cancelar</button>
          <button
            type="submit"
            form="event-period-form"
            class="btn-action-primary"
            [disabled]="periodSaving()"
          >
            {{ periodSaving() ? 'Salvando...' : 'Salvar período' }}
          </button>
        </div>
      </app-modal>
    </div>
  `,
})
export class EventDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;
  readonly maskDocument = maskDocument;
  readonly STATUS_AGUARDANDO_APROVACAO = STATUS_AGUARDANDO_APROVACAO;
  readonly STATUS_AGUARDANDO_PRODUTORA = STATUS_AGUARDANDO_PRODUTORA;

  event = signal<EventDetail | null>(null);
  companies = signal<CompanyItem[]>([]);
  credentials = signal<CredentialItem[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  loading = signal(true);
  linkingDayId = signal<number | null>(null);

  showCredentialModal = signal(false);
  credentialModalStep = signal<'search' | 'confirm'>('search');
  selectedLink = signal<EventDayCompanyLink | null>(null);
  foundCollaborator = signal<CollaboratorItem | null>(null);
  searchingCollaborator = signal(false);
  submittingCredential = signal(false);
  showPeriodModal = signal(false);
  periodSaving = signal(false);
  periodForm = { start: '', end: '' };

  isAdmin = false;
  userRole = '';
  userCompanyId: number | null = null;

  private expandedLinks = new Set<number>();
  private linkForms = new Map<number, { id_company: number | null; id_producer: number | null }>();

  credentialRequestForm = this.fb.group({
    id_collaborator_document_type: this.fb.control<number | null>(null, Validators.required),
    document: this.fb.control('', Validators.required),
    id_collaborator_role: this.fb.control<number | null>(null),
  });

  constructor(
    private eventService: EventService,
    private companyService: CompanyService,
    private credentialService: CredentialService,
    private collaboratorService: CollaboratorService,
    private authService: AuthService,
    private documentChangeService: DocumentChangeService,
    private notification: NotificationService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.userRole = String(user?.role || user?.perfil || '').toUpperCase();
    this.isAdmin = this.userRole === 'ADMIN';
    this.userCompanyId = user?.id_company != null ? Number(user.id_company) : null;

    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types),
      error: () => {},
    });

    if (this.isAdmin) {
      this.carregarEmpresas();
    }

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!id || Number.isNaN(id)) {
        void this.router.navigate(['/admin/eventos']);
        return;
      }
      this.carregar(id);
    });
  }

  canRequestCredentialForLink(link: EventDayCompanyLink): boolean {
    if (this.isAdmin) return true;
    if (this.userCompanyId == null) return false;
    const cid = this.userCompanyId;
    return link.company.id_company === cid || link.producer?.id_company === cid;
  }

  canProdutoraAct(cred: CredentialItem): boolean {
    return (
      this.userRole === 'PRODUTORA' &&
      cred.id_access_status === STATUS_AGUARDANDO_PRODUTORA &&
      cred.event_day_company.id_producer === this.userCompanyId
    );
  }

  canAdminAct(cred: CredentialItem): boolean {
    return this.isAdmin && cred.id_access_status === STATUS_AGUARDANDO_APROVACAO;
  }

  eventStatusClass(status?: number | null): string {
    switch (Number(status)) {
      case 3:
        return 'bg-emerald-100 text-emerald-800';
      case 4:
        return 'bg-red-100 text-red-800';
      case 2:
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  abrirModalPeriodo() {
    const ev = this.event();
    if (!ev) return;
    this.periodForm = {
      start: String(ev.start || '').slice(0, 10),
      end: String(ev.end || '').slice(0, 10),
    };
    this.showPeriodModal.set(true);
  }

  fecharModalPeriodo() {
    this.showPeriodModal.set(false);
  }

  salvarPeriodo() {
    const ev = this.event();
    if (!ev) return;
    if (!this.periodForm.start || !this.periodForm.end) {
      this.notification.error('Informe as datas de início e fim.');
      return;
    }
    if (this.periodForm.end < this.periodForm.start) {
      this.notification.error('Data fim deve ser igual ou posterior à data início.');
      return;
    }
    this.periodSaving.set(true);
    this.eventService
      .updatePeriod(ev.id_event, {
        start: this.periodForm.start,
        end: this.periodForm.end,
      })
      .subscribe({
        next: (res) => {
          this.periodSaving.set(false);
          this.event.set(res.event);
          this.fecharModalPeriodo();
          if (res.event.approvalReopened) {
            this.notification.success('Período atualizado. Evento enviado novamente para aprovação.');
          } else {
            this.notification.success('Período atualizado.');
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.periodSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao ajustar período.');
          this.cdr.markForCheck();
        },
      });
  }

  isLinkExpanded(idEventDayCompany: number): boolean {
    return this.expandedLinks.has(idEventDayCompany);
  }

  toggleCredentials(idEventDayCompany: number) {
    if (this.expandedLinks.has(idEventDayCompany)) {
      this.expandedLinks.delete(idEventDayCompany);
    } else {
      this.expandedLinks.add(idEventDayCompany);
    }
    this.cdr.markForCheck();
  }

  credentialsForLink(idEventDayCompany: number): CredentialItem[] {
    return this.credentials().filter((c) => c.id_event_day_company === idEventDayCompany);
  }

  getLinkForm(dayId: number) {
    if (!this.linkForms.has(dayId)) {
      this.linkForms.set(dayId, { id_company: null, id_producer: null });
    }
    return this.linkForms.get(dayId)!;
  }

  abrirModalCredencial(link: EventDayCompanyLink) {
    this.selectedLink.set(link);
    this.foundCollaborator.set(null);
    this.credentialModalStep.set('search');

    const types = this.documentTypes();
    this.credentialRequestForm.reset({
      id_collaborator_document_type: types[0]?.id_collaborator_document_type ?? null,
      document: '',
      id_collaborator_role: null,
    });
    this.credentialRequestForm.get('id_collaborator_role')?.clearValidators();
    this.credentialRequestForm.get('id_collaborator_role')?.updateValueAndValidity();

    if (this.roles().length === 0) {
      this.collaboratorService.listRoles().subscribe({
        next: (res) => this.roles.set(res.roles),
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar funções.'),
      });
    }

    this.showCredentialModal.set(true);
  }

  fecharModalCredencial() {
    this.showCredentialModal.set(false);
    this.selectedLink.set(null);
    this.foundCollaborator.set(null);
    this.credentialModalStep.set('search');
    this.searchingCollaborator.set(false);
    this.submittingCredential.set(false);
  }

  voltarParaBusca() {
    this.credentialModalStep.set('search');
    this.foundCollaborator.set(null);
    this.credentialRequestForm.get('id_collaborator_role')?.clearValidators();
    this.credentialRequestForm.get('id_collaborator_role')?.updateValueAndValidity();
  }

  canRequestDocumentChange(): boolean {
    const col = this.foundCollaborator();
    return !!col && (this.userRole === 'PADRAO' || this.userRole === 'PRODUTORA');
  }

  solicitarCorrecaoDocumento() {
    const col = this.foundCollaborator();
    if (!col) return;
    Swal.fire({
      title: 'Corrigir documento',
      html: `<p class="text-sm text-slate-600 mb-2">Colaborador: <strong>${col.name}</strong></p>`,
      input: 'text',
      inputLabel: 'Novo documento (correto)',
      inputPlaceholder: 'CPF ou documento',
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      inputValidator: (v) => {
        if (!v?.trim()) return 'Informe o novo documento.';
        return null;
      },
    }).then((step1) => {
      if (!step1.isConfirmed || !step1.value) return;
      Swal.fire({
        title: 'Motivo da correção',
        input: 'textarea',
        inputLabel: 'Mínimo 10 caracteres',
        showCancelButton: true,
        confirmButtonText: 'Solicitar',
        inputValidator: (v) => {
          if (!v || v.trim().length < 10) return 'Descreva o motivo (mín. 10 caracteres).';
          return null;
        },
      }).then((step2) => {
        if (!step2.isConfirmed || !step2.value) return;
        this.documentChangeService
          .create(col.id_collaborator, {
            new_document: String(step1.value),
            reason: step2.value.trim(),
          })
          .subscribe({
            next: () => {
              this.notification.success('Solicitação enviada para aprovação do administrador.');
              this.fecharModalCredencial();
            },
            error: (err) =>
              this.notification.notifyHttpError(err, 'Falha ao solicitar correção de documento.'),
          });
      });
    });
  }

  onCredentialModalSubmit() {
    if (this.credentialModalStep() === 'search') {
      this.buscarColaborador();
      return;
    }
    this.confirmarSolicitacao();
  }

  private buscarColaborador() {
    const docType = this.credentialRequestForm.get('id_collaborator_document_type')?.value;
    const document = String(this.credentialRequestForm.get('document')?.value || '').trim();

    if (docType == null || !document) {
      this.notification.error('Informe o tipo e o documento.');
      return;
    }

    this.searchingCollaborator.set(true);
    this.collaboratorService.searchByDocument(document, docType).subscribe({
      next: (res) => {
        this.searchingCollaborator.set(false);
        if (!res.found || !res.collaborator) {
          this.notification.error('Colaborador não cadastrado. Procure o RH/Admin.');
          return;
        }
        this.foundCollaborator.set(res.collaborator);
        this.credentialModalStep.set('confirm');
        this.credentialRequestForm.patchValue({
          id_collaborator_role: res.collaborator.id_collaborator_role,
        });
        this.credentialRequestForm.get('id_collaborator_role')?.setValidators(Validators.required);
        this.credentialRequestForm.get('id_collaborator_role')?.updateValueAndValidity();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.searchingCollaborator.set(false);
        if (err instanceof HttpErrorResponse && err.status === 403) {
          this.notification.error('Sem permissão para consultar colaboradores.');
          return;
        }
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.notification.error('Colaborador não cadastrado. Procure o RH/Admin.');
          return;
        }
        this.notification.error(this.extractError(err) || 'Falha na busca do colaborador.');
      },
    });
  }

  private confirmarSolicitacao() {
    const link = this.selectedLink();
    const collaborator = this.foundCollaborator();
    const roleId = this.credentialRequestForm.get('id_collaborator_role')?.value;

    if (!link || !collaborator) return;
    if (roleId == null) {
      this.notification.error('Selecione a função.');
      return;
    }

    this.submittingCredential.set(true);
    this.credentialService
      .create({
        id_event_day_company: link.id_event_day_company,
        id_collaborator: collaborator.id_collaborator,
        id_collaborator_role: roleId,
      })
      .subscribe({
        next: () => {
          this.submittingCredential.set(false);
          this.notification.success('Credencial solicitada.');
          this.fecharModalCredencial();
          this.expandedLinks.add(link.id_event_day_company);
          const eventId = this.event()?.id_event;
          if (eventId) this.carregarCredenciais(eventId);
        },
        error: (err) => {
          this.submittingCredential.set(false);
          if (err instanceof HttpErrorResponse && err.status === 409) {
            this.notification.error(
              'Este colaborador já possui uma solicitação para este dia de evento.',
            );
            return;
          }
          this.notification.error(this.extractError(err) || 'Falha ao solicitar credencial.');
        },
      });
  }

  carregarEmpresas() {
    this.companyService.list(1, 100, {}).subscribe({
      next: (res) => {
        const allowed = res.companies.filter((c) => {
          const desc = c.company_type?.description || '';
          return desc === TYPE_PRODUTORA || desc === TYPE_EMPRESA_PADRAO;
        });
        this.companies.set(allowed);
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
  }

  carregar(id?: number) {
    const eventId = id ?? this.event()?.id_event;
    if (!eventId) return;

    this.loading.set(true);
    this.eventService.get(eventId).subscribe({
      next: (res) => {
        this.event.set(res.event);
        this.loading.set(false);
        this.carregarCredenciais(eventId);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.cdr.markForCheck();
        this.notification.error(this.extractError(err) || 'Falha ao carregar evento.');
        void this.router.navigate(['/admin/eventos']);
      },
    });
  }

  carregarCredenciais(idEvent: number) {
    this.credentialService.list(1, 200, { id_event: idEvent }).subscribe({
      next: (res) => {
        this.credentials.set(res.credentials);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar credenciais.'),
    });
  }

  onCompanyChange(dayId: number, companyId: number | null) {
    const form = this.getLinkForm(dayId);
    form.id_company = companyId;
    if (!this.needsProducer(dayId)) {
      form.id_producer = null;
    }
  }

  needsProducer(dayId: number): boolean {
    const form = this.getLinkForm(dayId);
    if (!form.id_company) return false;
    const company = this.companies().find((c) => c.id_company === form.id_company);
    return company?.company_type?.description === TYPE_EMPRESA_PADRAO;
  }

  producersForDay(day: EventDay): EventDayCompanyLink[] {
    return day.companies.filter(
      (link) => link.company.company_type_description === TYPE_PRODUTORA,
    );
  }

  vincularEmpresa(day: EventDay) {
    const form = this.getLinkForm(day.id_event_day);
    if (!form.id_company) {
      this.notification.error('Selecione a empresa.');
      return;
    }

    const company = this.companies().find((c) => c.id_company === form.id_company);
    const isPadrao = company?.company_type?.description === TYPE_EMPRESA_PADRAO;

    const payload: { id_company: number; id_producer?: number | null } = {
      id_company: form.id_company,
    };

    if (isPadrao) {
      if (!form.id_producer) {
        this.notification.error('Selecione a produtora responsável.');
        return;
      }
      payload.id_producer = form.id_producer;
    }

    this.linkingDayId.set(day.id_event_day);
    this.eventService.addCompanyToDay(day.id_event_day, payload).subscribe({
      next: () => {
        this.linkingDayId.set(null);
        this.notification.success('Empresa vinculada.');
        form.id_company = null;
        form.id_producer = null;
        this.carregar();
      },
      error: (err) => {
        this.linkingDayId.set(null);
        this.notification.error(this.extractError(err) || 'Falha ao vincular empresa.');
      },
    });
  }

  removerVinculo(day: EventDay, link: EventDayCompanyLink) {
    Swal.fire({
      title: 'Remover vínculo?',
      text: `Remover "${link.company.company_name}" do dia ${formatDateBr(day.date)}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.eventService.removeCompanyFromDay(link.id_event_day_company).subscribe({
        next: () => {
          this.notification.success('Vínculo removido.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao remover vínculo.');
        },
      });
    });
  }

  aprovarProdutora(cred: CredentialItem) {
    Swal.fire({
      title: 'Aprovar acesso?',
      text: `Deseja aprovar o acesso de ${cred.collaborator.name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aprovar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.credentialService
        .updateStatus(cred.id_event_day_company_collaborator, {
          id_access_status: STATUS_AGUARDANDO_APROVACAO,
        })
        .subscribe({
          next: () => {
            this.notification.success('Enviado para validação administrativa.');
            this.refreshCredentials();
          },
          error: (err) => this.notification.error(this.extractError(err) || 'Falha ao aprovar.'),
        });
    });
  }

  aprovarAdmin(cred: CredentialItem) {
    Swal.fire({
      title: 'Aprovar acesso?',
      text: `Deseja aprovar o acesso de ${cred.collaborator.name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Aprovar',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.credentialService
        .updateStatus(cred.id_event_day_company_collaborator, { id_access_status: 3 })
        .subscribe({
          next: () => {
            this.notification.success('Credencial aprovada.');
            this.refreshCredentials();
          },
          error: (err) => this.notification.error(this.extractError(err) || 'Falha ao aprovar.'),
        });
    });
  }

  negarCredencial(cred: CredentialItem) {
    Swal.fire({
      title: 'Motivo da recusa',
      input: 'textarea',
      inputPlaceholder: 'Descreva o motivo (mín. 3 caracteres)',
      showCancelButton: true,
      confirmButtonText: 'Recusar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value || value.trim().length < 3) return 'Informe o motivo da recusa.';
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;

      this.credentialService
        .updateStatus(cred.id_event_day_company_collaborator, {
          id_access_status: 4,
          reason: String(result.value).trim(),
        })
        .subscribe({
          next: () => {
            this.notification.success('Credencial recusada.');
            this.refreshCredentials();
          },
          error: (err) => this.notification.error(this.extractError(err) || 'Falha ao recusar.'),
        });
    });
  }

  private refreshCredentials() {
    const eventId = this.event()?.id_event;
    if (eventId) this.carregarCredenciais(eventId);
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
