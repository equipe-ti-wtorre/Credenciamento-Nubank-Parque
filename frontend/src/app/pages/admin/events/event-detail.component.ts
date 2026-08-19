import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import {
  EventDayCompanyBrief,
  EventDayType,
  EventDetail,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import { CompanyItem } from '../../../services/company.service';
import {
  CredentialItem,
  CredentialService,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_APROVADO,
} from '../../../services/credential.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalComponent } from '../../../shared/modal/modal.component';
import {
  PeriodoRangePickerComponent,
  PeriodoRangeValue,
} from '../../../shared/periodo-range-picker';
import { NovoEventoStepDiasComponent } from './novo-evento-modal/steps/step-dias.component';
import { eachIsoInRange } from './novo-evento-modal/ui/calendar.util';

type CollaboratorsSeg = 'lote' | 'ind';
type ViewerProfile = 'solicitante' | 'responsavel' | 'parceira';
type FlowChipKind = 'waiting' | 'progress' | 'done' | 'error' | 'muted';

interface CompanyDayLink {
  id_event_day_company: number;
  date: string;
  phase: string;
}

interface AggregatedCompany {
  id_company: number;
  company_name: string;
  company_type_description: string;
  phases: string[];
  linkIds: number[];
  links: CompanyDayLink[];
  producerIds: number[];
  credentials: CredentialItem[];
  notified_complete_at: string | null;
  isResponsavel: boolean;
  collaboratorCount: number;
  vehicleCount: number;
}

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ModalComponent,
    PeriodoRangePickerComponent,
    NovoEventoStepDiasComponent,
  ],
  styleUrl: './event-detail.component.scss',
  template: `
    <div class="ev-page">
      <a routerLink="/admin/eventos" class="back">← Voltar para lista</a>

      <ng-container *ngIf="!loading() && event(); else loadingState">
        <header class="evhead">
          <div class="evhead__top">
            <h1 class="evhead__name">{{ event()!.name }}</h1>
            <div class="evhead__actions">
              <button
                type="button"
                class="pref-toggle"
                [class.is-on]="!!event()!.notificar_portaria"
                title="Receber alerta no Teams quando um colaborador entrar na portaria neste evento"
                [attr.aria-label]="
                  event()!.notificar_portaria
                    ? 'Desativar alerta de portaria'
                    : 'Ativar alerta de portaria'
                "
                [attr.aria-pressed]="!!event()!.notificar_portaria"
                [disabled]="prefSaving() || !event()!.ativo"
                (click)="toggleNotifyPortaria()"
              >
                <svg
                  class="pref-toggle__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>
                <span class="pref-toggle__label">Alerta portaria</span>
                <span class="switch" [class.is-on]="!!event()!.notificar_portaria"></span>
              </button>

              <button
                *ngIf="canEditEvent()"
                type="button"
                class="btn btn--ghost"
                [disabled]="!event()!.ativo"
                (click)="abrirModalEditar()"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Editar
              </button>

              <button
                *ngIf="canSubmitApproval()"
                type="button"
                class="btn btn--primary"
                [disabled]="!event()!.ativo || submitApprovalSaving()"
                (click)="notificarSetor()"
              >
                {{ submitApprovalSaving() ? 'Notificando...' : 'Notificar' }}
              </button>

              <button type="button" class="btn btn--ghost" (click)="carregar()">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                Atualizar
              </button>

              <button
                *ngIf="canToggleActive()"
                type="button"
                class="status-toggle"
                [class.is-on]="event()!.ativo"
                role="switch"
                [attr.aria-checked]="event()!.ativo"
                [attr.aria-label]="event()!.ativo ? 'Desativar evento' : 'Ativar evento'"
                [disabled]="statusToggling()"
                (click)="toggleEventActive()"
              >
                <span class="switch" [class.is-on]="event()!.ativo"></span>
                <span class="status-toggle__label">{{ event()!.ativo ? 'Ativo' : 'Inativo' }}</span>
              </button>
            </div>
          </div>

          <div class="evhead__meta-row">
            <div class="evhead__meta">
              <span>
                Período:
                <b>{{ formatDateBr(event()!.start) }} – {{ formatDateBr(event()!.end) }}</b>
              </span>
              <ng-container *ngIf="event()!.company_responsavel">
                <span class="evhead__sep" aria-hidden="true"></span>
                <span>
                  Responsável:
                  <b>{{ event()!.company_responsavel!.company_name }}</b>
                </span>
              </ng-container>
            </div>
            <div class="evhead__badges">
              <span
                *ngIf="event()!.access_status_description"
                class="badge"
                [ngClass]="eventStatusClass(event()!.id_access_status)"
              >
                <svg
                  *ngIf="isWaitingStatus(event()!.id_access_status)"
                  class="badge__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {{ event()!.access_status_description }}
              </span>
            </div>
          </div>

          <div class="evhead__stats">
            <div class="evstat">
              <div class="evstat__icon evstat__icon--blue" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                  <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
                </svg>
              </div>
              <div class="evstat__body">
                <div class="evstat__value">{{ headerStats().companies }}</div>
                <div class="evstat__label">Empresas parceiras</div>
              </div>
            </div>

            <div class="evstat">
              <div class="evstat__icon evstat__icon--green" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </svg>
              </div>
              <div class="evstat__body">
                <div class="evstat__value">{{ headerStats().collaborators }}</div>
                <div class="evstat__label">Colaboradores cadastrados</div>
              </div>
            </div>

            <div class="evstat">
              <div class="evstat__icon evstat__icon--purple" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 17h13v-5H3z" />
                  <path d="M16 12h3l2 3v2h-5z" />
                  <circle cx="6.5" cy="17.5" r="1.5" />
                  <circle cx="17.5" cy="17.5" r="1.5" />
                </svg>
              </div>
              <div class="evstat__body">
                <div class="evstat__value">{{ headerStats().vehicles }}</div>
                <div class="evstat__label">Veículos cadastrados</div>
              </div>
            </div>

            <div class="evstat">
              <div class="evstat__icon evstat__icon--orange" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  <path d="M14 3v5h5" />
                  <path d="M9 13h6M9 17h4" />
                </svg>
              </div>
              <div class="evstat__body">
                <div class="evstat__value evstat__value--inline">
                  {{ headerStats().partnersComplete }}
                  <span class="evstat__sub">de <b>{{ headerStats().partnersTotal }}</b> com cadastro concluído</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div *ngIf="event()!.days.length === 0" class="empty">
          <p>Este evento não possui dias cadastrados.</p>
          <p class="mt-2 text-sm" *ngIf="canAdjustPeriod()">
            Use <b>Editar</b> para definir o período e marcar os dias/fases do evento.
          </p>
          <p class="mt-2 text-sm" *ngIf="!canAdjustPeriod()">
            Os dias podem ser definidos ao editar o período do evento.
          </p>
        </div>

        <ng-container *ngIf="event()!.days.length > 0">
          <div class="tablecard">
            <div class="tablecard__head">
              <div class="tablecard__title-row">
                <h2 class="section__title">
                  Empresas parceiras
                  <span class="count-pill">{{ aggregatedCompanies().length }}</span>
                </h2>
                <div class="flex gap-2 flex-wrap">
                  <button
                    *ngIf="canAddCollaborators()"
                    type="button"
                    class="btn btn--primary btn--sm"
                    [disabled]="writableCompanies().length === 0 || !event()!.ativo"
                    (click)="irParaColaboradores()"
                  >
                    Adicionar colaboradores
                  </button>
                  <button
                    *ngIf="canManageCompanies()"
                    type="button"
                    class="btn btn--ghost btn--sm"
                    [disabled]="!event()!.ativo"
                    (click)="abrirVincularModal()"
                  >
                    Vincular empresa
                  </button>
                </div>
              </div>
              <div class="tabs">
                <button
                  type="button"
                  class="tab"
                  [class.on]="activeTab() === 'Todas'"
                  (click)="setActiveTab('Todas')"
                >
                  Todas
                  <span class="cnt">{{ countForTab('Todas') }}</span>
                </button>
                <button
                  *ngFor="let phase of availablePhases()"
                  type="button"
                  class="tab"
                  [ngClass]="tabOpClass(phase)"
                  [class.on]="activeTab() === phase"
                  (click)="setActiveTab(phase)"
                >
                  <span class="dot"></span>
                  {{ phase }}
                  <span class="cnt">{{ countForTab(phase) }}</span>
                </button>
              </div>
            </div>

            <div class="tbl-scroll" *ngIf="filteredCompanies().length > 0; else emptyTable">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Tipo</th>
                    <th>Fases</th>
                    <th class="center">Colab.</th>
                    <th class="center">Veíc.</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of filteredCompanies()">
                    <td>
                      <div class="tcell-emp">
                        <div class="tbl-av">{{ initials(row.company_name) }}</div>
                        <div>
                          <div class="tname">
                            {{ row.company_name }}
                            <span *ngIf="row.isResponsavel" class="resp-tag">Responsável</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span class="role">{{ row.company_type_description || '—' }}</span></td>
                    <td>
                      <div class="minis">
                        <span
                          *ngFor="let ph of row.phases"
                          class="miniphase"
                          [ngClass]="phaseClass(ph)"
                        >
                          <span class="dot"></span>
                          {{ ph }}
                        </span>
                      </div>
                    </td>
                    <td class="td-center"><span class="colnum">{{ collaboratorCountForRow(row) }}</span></td>
                    <td class="td-center"><span class="colnum">{{ row.vehicleCount }}</span></td>
                    <td>
                      <span class="flowstatus" [ngClass]="'fs-' + companyFlowChip(row)">
                        {{ companyFlowStatusLabel(row) }}
                      </span>
                    </td>
                    <td>
                      <div class="acts">
                        <button
                          *ngIf="canEditCompanyPhases(row)"
                          type="button"
                          class="iconbtn"
                          title="Editar fases"
                          (click)="abrirVincularModal(row)"
                        >
                          ✎
                        </button>
                        <button
                          *ngIf="canEditCompanyPhases(row)"
                          type="button"
                          class="iconbtn iconbtn--danger"
                          title="Remover empresa parceira"
                          (click)="removerEmpresaParceira(row)"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.75"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          class="btn btn--ghost btn--sm"
                          (click)="irParaColaboradores(row.id_company)"
                        >
                          {{ canRequestCredentialForCompany(row) ? 'Colaboradores' : 'Ver' }}
                        </button>
                        <button
                          *ngIf="canNotifyCompleteForCompany(row)"
                          type="button"
                          class="btn btn--ghost btn--sm"
                          [disabled]="notifyCompleteSaving()"
                          (click)="notificarTermino(row)"
                        >
                          {{
                            notifyCompleteSaving() && notifyCompleteCompanyId() === row.id_company
                              ? 'Enviando...'
                              : row.notified_complete_at
                                ? 'Renotificar término'
                                : 'Notificar término'
                          }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ng-template #emptyTable>
              <div class="empty">
                <p *ngIf="aggregatedCompanies().length === 0">Nenhuma empresa vinculada a este evento.</p>
                <p *ngIf="aggregatedCompanies().length > 0">Nenhuma empresa nesta fase.</p>
                <button
                  *ngIf="canManageCompanies() && aggregatedCompanies().length === 0"
                  type="button"
                  class="btn btn--primary btn--sm mt-3"
                  (click)="abrirVincularModal()"
                >
                  Vincular empresa
                </button>
              </div>
            </ng-template>
          </div>
        </ng-container>
      </ng-container>

      <ng-template #loadingState>
        <div class="empty">
          {{ loading() ? 'Carregando evento...' : 'Evento não encontrado.' }}
        </div>
      </ng-template>

      <!-- Modal vincular / editar empresa -->
      <app-modal
        [open]="showVincularModal()"
        [title]="vincularEditCompanyId() ? 'Editar fases da empresa' : 'Vincular empresa'"
        subtitle="Selecione a empresa e as fases em que ela participará."
        size="md"
        (close)="fecharVincularModal()"
      >
        <div class="field">
          <label class="label" for="vincular-empresa">Empresa</label>
          <select
            id="vincular-empresa"
            class="select"
            [ngModel]="vincularSelectedCompanyId()"
            (ngModelChange)="vincularSelectedCompanyId.set($event)"
            [disabled]="!!vincularEditCompanyId()"
            name="vincularEmpresa"
          >
            <option [ngValue]="null">Selecione</option>
            <option *ngFor="let c of vincularCompanyOptions()" [ngValue]="c.id_company">
              {{ c.company_name }}
            </option>
          </select>
        </div>
        <div class="field">
          <span class="label">Fases</span>
          <div class="phasepick">
            <label
              *ngFor="let ph of availablePhases()"
              class="phaseopt"
              [class.on]="vincularSelectedPhases().includes(ph)"
            >
              <input
                type="checkbox"
                class="sr-only"
                [checked]="vincularSelectedPhases().includes(ph)"
                (change)="toggleVincularPhase(ph)"
              />
              <span class="phaseopt__check">✓</span>
              <span>
                <div class="phaseopt__t">{{ ph }}</div>
              </span>
            </label>
          </div>
        </div>
        <div modal-footer class="modal-footer">
          <button type="button" class="btn-action-secondary" (click)="fecharVincularModal()">Cancelar</button>
          <button
            type="button"
            class="btn-action-primary"
            [disabled]="vincularSaving()"
            (click)="confirmarVincular()"
          >
            {{ vincularSaving() ? 'Salvando...' : 'Confirmar' }}
          </button>
        </div>
      </app-modal>

      <!-- Modal editar (wizard: período → dias/fases) -->
      <app-modal
        [open]="showEditModal()"
        title="Editar evento"
        [subtitle]="editModalSubtitle()"
        [size]="editStep() === 2 ? '2xl' : 'sm'"
        (close)="fecharModalEditar()"
      >
        <form
          id="event-edit-form"
          class="event-edit-form"
          [class.event-edit-form--dias]="editStep() === 2"
          (ngSubmit)="onEditFormSubmit()"
        >
          <div *ngIf="canAdjustPeriod()" class="edit-stepper" aria-label="Progresso da edição">
            <div class="edit-stitem" [class.is-active]="editStep() === 1" [class.is-done]="editStep() > 1">
              <span class="edit-sdot">1</span>
              <span class="edit-slabel">Período</span>
            </div>
            <span class="edit-sline" [class.is-done]="editStep() > 1"></span>
            <div class="edit-stitem" [class.is-active]="editStep() === 2">
              <span class="edit-sdot">2</span>
              <span class="edit-slabel">Dias / fases</span>
            </div>
          </div>

          <ng-container *ngIf="editStep() === 1">
            <div class="field" *ngIf="canChangeResponsavel()">
              <label class="label" for="event-responsavel">Empresa responsável</label>
              <select
                id="event-responsavel"
                class="select"
                [(ngModel)]="responsavelFormId"
                name="eventResponsavel"
                required
              >
                <option [ngValue]="null">Selecione</option>
                <option *ngFor="let p of producers()" [ngValue]="p.id_company">
                  {{ p.company_name }}
                </option>
              </select>
            </div>
            <app-periodo-range-picker
              *ngIf="canAdjustPeriod()"
              [(ngModel)]="editPeriodRange"
              name="editPeriodRange"
              label="Período do evento"
              inputId="event-edit-range"
              [inline]="true"
              [controlInvalid]="editPeriodTouched() && !editPeriodRange?.inicio"
              [controlTouched]="editPeriodTouched()"
            />
          </ng-container>

          <ng-container *ngIf="editStep() === 2">
            <div *ngIf="editOrphanDays().length" class="edit-orphan-banner" role="status">
              <p>
                {{ editOrphanDays().length }}
                dia{{ editOrphanDays().length > 1 ? 's' : '' }}
                fora do novo período
                {{ editOrphanDays().length > 1 ? 'serão removidos' : 'será removido' }}:
                <b>{{ editOrphanDaysLabel() }}</b>
              </p>
            </div>
            <p *ngIf="editDaysLoading()" class="edit-days-loading">Carregando tipos de dia…</p>
            <app-novo-evento-step-dias
              *ngIf="!editDaysLoading()"
              [dataInicio]="editPeriodRange?.inicio || null"
              [dataFim]="editPeriodRange?.fim || null"
              [types]="editDayTypes()"
              [dias]="editDias()"
              [(brushTypeId)]="editBrushTypeId"
              [calViewKey]="editCalViewKey()"
              (tagDay)="onEditTagDay($event)"
              (fillPeriod)="onEditFillPeriod()"
              (changeType)="onEditChangeDayType($event)"
              (removeDay)="onEditRemoveDay($event)"
            />
          </ng-container>
        </form>
        <div modal-footer class="modal-footer">
          <button
            type="button"
            class="btn-action-secondary"
            (click)="editStep() === 2 ? voltarEditStep() : fecharModalEditar()"
            [disabled]="editSaving()"
          >
            {{ editStep() === 2 ? 'Voltar' : 'Cancelar' }}
          </button>
          <button
            type="submit"
            form="event-edit-form"
            class="btn-action-primary"
            [disabled]="editSaving() || editDaysLoading()"
          >
            {{ editPrimaryButtonLabel() }}
          </button>
        </div>
      </app-modal>
    </div>
  `,
})
export class EventDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  readonly formatDateBr = formatDateBr;

  event = signal<EventDetail | null>(null);
  companies = signal<CompanyItem[]>([]);
  producers = signal<EventDayCompanyBrief[]>([]);
  credentials = signal<CredentialItem[]>([]);
  loading = signal(true);
  activeTab = signal('Todas');

  showVincularModal = signal(false);
  vincularEditCompanyId = signal<number | null>(null);
  vincularSelectedCompanyId = signal<number | null>(null);
  vincularSelectedPhases = signal<string[]>([]);
  vincularSaving = signal(false);

  showEditModal = signal(false);
  editSaving = signal(false);
  editPeriodTouched = signal(false);
  editPeriodRange: PeriodoRangeValue | null = null;
  editStep = signal<1 | 2>(1);
  editDias = signal(new Map<string, number>());
  editDayTypes = signal<EventDayType[]>([]);
  editBrushTypeId = signal(0);
  editCalViewKey = signal(0);
  editOrphanDays = signal<string[]>([]);
  editDaysLoading = signal(false);
  statusToggling = signal(false);
  prefSaving = signal(false);
  submitApprovalSaving = signal(false);
  notifyCompleteSaving = signal(false);
  notifyCompleteCompanyId = signal<number | null>(null);

  vehicleCounts = signal<Record<number, number>>({});

  responsavelFormId: number | null = null;

  isAdmin = false;
  userRole = '';
  userCompanyId: number | null = null;
  isPartnerCompanyUser = false;

  /** Parceira sem gestão do evento: só a própria empresa/fases. Responsável e admin veem tudo. */
  private isPartnerScopedView(): boolean {
    return (
      this.isPartnerCompanyUser &&
      this.userCompanyId != null &&
      !this.canManageCompanies()
    );
  }

  availablePhases = computed(() => {
    if (this.isPartnerScopedView()) {
      const own = this.aggregatedCompanies().find((c) => c.id_company === this.userCompanyId);
      return own ? [...own.phases] : [];
    }
    const ev = this.event();
    if (!ev) return [];
    const set = new Set<string>();
    for (const day of ev.days) {
      if (day.type?.description) set.add(day.type.description);
    }
    return [...set];
  });

  aggregatedCompanies = computed(() => {
    const all = this.buildAggregatedCompanies();
    if (this.isPartnerScopedView()) {
      return all.filter((c) => c.id_company === this.userCompanyId);
    }
    return all;
  });

  headerStats = computed(() => {
    const companies = this.aggregatedCompanies();
    const collabIds = new Set<number>();
    let vehicles = 0;
    let partnersTotal = 0;
    let partnersComplete = 0;
    for (const c of companies) {
      vehicles += c.vehicleCount || 0;
      if (!c.isResponsavel) {
        partnersTotal += 1;
        if (c.notified_complete_at) partnersComplete += 1;
      }
      for (const cred of c.credentials) {
        collabIds.add(cred.id_collaborator);
      }
    }
    return {
      companies: companies.length,
      collaborators: collabIds.size,
      vehicles,
      partnersTotal,
      partnersComplete,
    };
  });

  filteredCompanies = computed(() => {
    const tab = this.activeTab();
    const all = this.aggregatedCompanies();
    if (tab === 'Todas') return all;
    return all.filter((c) => c.phases.includes(tab));
  });

  vincularCompanyOptions = computed(() => {
    const linked = new Set(this.aggregatedCompanies().map((c) => c.id_company));
    const editing = this.vincularEditCompanyId();
    return this.companies().filter((c) => !linked.has(c.id_company) || c.id_company === editing);
  });

  constructor(
    private eventService: EventService,
    private credentialService: CredentialService,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.userRole = String(user?.role || user?.perfil || '').toUpperCase();
    this.isAdmin = this.userRole === 'ADMIN';
    this.userCompanyId = user?.id_company != null ? Number(user.id_company) : null;
    this.isPartnerCompanyUser =
      this.userRole === 'PADRAO' ||
      this.userRole === 'EMPRESA_GESTOR' ||
      this.userRole === 'EMPRESA_SOLICITANTE';

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!id || Number.isNaN(id)) {
        void this.router.navigate(['/admin/eventos']);
        return;
      }
      this.carregar(id);
    });
  }

  initials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  phaseClass(phase: string): string {
    const p = String(phase || '').toLowerCase();
    if (p.includes('montagem')) return 'p-Montagem';
    if (p.includes('show')) return 'p-Show';
    if (p.includes('desmontagem')) return 'p-Desmontagem';
    return 'p-Generic';
  }

  tabOpClass(phase: string): string {
    const p = String(phase || '').toLowerCase();
    if (p.includes('montagem')) return 'op-Montagem';
    if (p.includes('show')) return 'op-Show';
    if (p.includes('desmontagem')) return 'op-Desmontagem';
    return '';
  }

  eventStatusClass(status?: number | null): string {
    switch (Number(status)) {
      case 3:
        return 'badge--ok';
      case 4:
        return 'badge--err';
      case 5:
        return 'badge--muted';
      case 2:
        return 'badge--warn';
      default:
        return 'badge--muted';
    }
  }

  isWaitingStatus(status?: number | null): boolean {
    const n = Number(status);
    return n === 1 || n === 2;
  }

  private companyNotifiedAt(
    ev: EventDetail,
    idCompany: number,
    fromLink?: string | null,
  ): string | null {
    if (fromLink) return String(fromLink);
    const map = ev.companies_notify as Record<string | number, string | null> | undefined;
    if (map) {
      const raw = map[idCompany] ?? map[String(idCompany)];
      if (raw) return String(raw);
    }
    if (this.userCompanyId === idCompany && ev.notified_complete_at) {
      return String(ev.notified_complete_at);
    }
    return null;
  }

  /** Perfil do usuário logado para rótulos da coluna Status. */
  private viewerProfile(): ViewerProfile {
    if (this.isPartnerScopedView()) return 'parceira';
    const ev = this.event();
    const responsavelId = ev?.id_company_responsavel ?? null;
    if (
      this.isAdmin ||
      this.canManageCompanies() ||
      (this.userCompanyId != null &&
        responsavelId != null &&
        this.userCompanyId === responsavelId)
    ) {
      return 'responsavel';
    }
    if (ev?.is_solicitante) return 'solicitante';
    if (
      this.userCompanyId != null &&
      responsavelId != null &&
      this.userCompanyId !== responsavelId
    ) {
      return 'parceira';
    }
    return 'responsavel';
  }

  companyFlowStatusLabel(row: AggregatedCompany): string {
    const profile = this.viewerProfile();
    const ev = this.event();
    if (row.isResponsavel) {
      const status = Number(ev?.id_access_status);
      if (status === STATUS_AGUARDANDO_PRODUTORA) {
        return profile === 'responsavel'
          ? 'Pronto para notificar'
          : 'Aguardando Empresa Responsável';
      }
      if (status === STATUS_AGUARDANDO_APROVACAO) return 'Aguardando aprovação';
      if (status === STATUS_APROVADO) return 'Aprovado';
      return (ev?.access_status_description || '—').trim() || '—';
    }
    if (row.notified_complete_at) return 'Cadastro concluído';
    return profile === 'parceira' ? 'Cadastro em andamento' : 'Aguardando Empresa Parceira';
  }

  companyFlowChip(row: AggregatedCompany): FlowChipKind {
    const ev = this.event();
    if (row.isResponsavel) {
      const status = Number(ev?.id_access_status);
      if (status === STATUS_APROVADO) return 'done';
      if (status === STATUS_AGUARDANDO_APROVACAO) return 'waiting';
      if (status === STATUS_AGUARDANDO_PRODUTORA) return 'progress';
      if (status === 4) return 'error';
      return 'muted';
    }
    if (row.notified_complete_at) return 'done';
    return this.viewerProfile() === 'parceira' ? 'progress' : 'waiting';
  }

  setActiveTab(tab: string) {
    this.activeTab.set(tab);
  }

  countForTab(tab: string): number {
    if (tab === 'Todas') return this.aggregatedCompanies().length;
    return this.aggregatedCompanies().filter((c) => c.phases.includes(tab)).length;
  }

  /** Contagem de colaboradores da empresa; com aba de fase, só os daquela fase. */
  collaboratorCountForRow(row: AggregatedCompany): number {
    const tab = this.activeTab();
    if (tab === 'Todas') return row.collaboratorCount;
    const linkIds = new Set(
      row.links.filter((l) => l.phase === tab).map((l) => l.id_event_day_company),
    );
    if (!linkIds.size) return 0;
    const collabIds = new Set<number>();
    for (const cred of row.credentials) {
      if (linkIds.has(cred.id_event_day_company)) {
        collabIds.add(cred.id_collaborator);
      }
    }
    return collabIds.size;
  }

  canManageCompanies(): boolean {
    return !!(this.event()?.can_manage_companies || this.isAdmin);
  }

  canChangeResponsavel(): boolean {
    return !!(this.event()?.can_change_responsavel || this.isAdmin);
  }

  canToggleActive(): boolean {
    return !!(this.event()?.can_toggle_active || this.isAdmin);
  }

  canAdjustPeriod(): boolean {
    return this.canManageCompanies() && !!this.event()?.ativo;
  }

  canEditEvent(): boolean {
    return this.canChangeResponsavel() || this.canManageCompanies();
  }

  canSubmitApproval(): boolean {
    return !!(this.event()?.can_submit_approval);
  }

  canNotifyCompleteForCompany(row: AggregatedCompany): boolean {
    if (row.isResponsavel || this.event()?.ativo === false) return false;
    if (!this.event()?.can_notify_complete) return false;
    return this.userCompanyId != null && row.id_company === this.userCompanyId && row.collaboratorCount > 0;
  }

  canEditCompanyPhases(row: AggregatedCompany): boolean {
    return this.canManageCompanies() && !row.isResponsavel && this.event()?.ativo !== false;
  }

  canRequestCredentialForCompany(row: AggregatedCompany): boolean {
    if (this.event()?.ativo === false) return false;
    if (!this.canManageCompanies() && this.event()?.is_solicitante) return false;
    if (this.userCompanyId == null) return false;
    // Cada empresa indica só os próprios colaboradores (admin/responsável não escrevem pela parceira).
    return Number(row.id_company) === Number(this.userCompanyId);
  }

  /** Empresas nas quais o usuário pode incluir colaboradores/veículos. */
  writableCompanies = computed(() =>
    this.aggregatedCompanies().filter((c) => this.canRequestCredentialForCompany(c)),
  );

  canAddCollaborators(): boolean {
    return this.event()?.ativo !== false && this.writableCompanies().length > 0;
  }

  private buildAggregatedCompanies(): AggregatedCompany[] {
    const ev = this.event();
    if (!ev) return [];

    const map = new Map<number, AggregatedCompany>();
    const responsavelId = ev.id_company_responsavel ?? null;

    for (const day of ev.days) {
      const phaseDesc = day.type?.description || '';
      for (const link of day.companies) {
        const id = link.company.id_company;
        let agg = map.get(id);
        if (!agg) {
          const notified = this.companyNotifiedAt(
            ev,
            id,
            link.company.notified_complete_at,
          );
          agg = {
            id_company: id,
            company_name: link.company.company_name,
            company_type_description: link.company.company_type_description || '',
            phases: [],
            linkIds: [],
            links: [],
            producerIds: [],
            credentials: [],
            notified_complete_at: notified,
            isResponsavel: responsavelId != null && id === responsavelId,
            collaboratorCount: 0,
            vehicleCount: 0,
          };
          map.set(id, agg);
        } else if (!agg.notified_complete_at && link.company.notified_complete_at) {
          agg.notified_complete_at = String(link.company.notified_complete_at);
        }
        if (phaseDesc && !agg.phases.includes(phaseDesc)) {
          agg.phases.push(phaseDesc);
        }
        if (!agg.linkIds.includes(link.id_event_day_company)) {
          agg.linkIds.push(link.id_event_day_company);
          agg.links.push({
            id_event_day_company: link.id_event_day_company,
            date: day.date,
            phase: phaseDesc || '—',
          });
        }
        const prodId = link.producer?.id_company;
        if (prodId != null && !agg.producerIds.includes(prodId)) {
          agg.producerIds.push(prodId);
        }
      }
    }

    const allCreds = this.credentials();
    for (const agg of map.values()) {
      agg.credentials = allCreds.filter((c) => agg.linkIds.includes(c.id_event_day_company));
      const collabIds = new Set(agg.credentials.map((c) => c.id_collaborator));
      agg.collaboratorCount = collabIds.size;
      agg.vehicleCount = this.vehicleCounts()[agg.id_company] || 0;
    }

    return [...map.values()].sort((a, b) => {
      if (a.isResponsavel && !b.isResponsavel) return -1;
      if (!a.isResponsavel && b.isResponsavel) return 1;
      return a.company_name.localeCompare(b.company_name);
    });
  }

  abrirVincularModal(row?: AggregatedCompany) {
    if (row) {
      this.vincularEditCompanyId.set(row.id_company);
      this.vincularSelectedCompanyId.set(row.id_company);
      this.vincularSelectedPhases.set([...row.phases]);
    } else {
      this.vincularEditCompanyId.set(null);
      this.vincularSelectedCompanyId.set(null);
      this.vincularSelectedPhases.set([]);
    }
    this.showVincularModal.set(true);
  }

  fecharVincularModal() {
    this.showVincularModal.set(false);
    this.vincularEditCompanyId.set(null);
    this.vincularSelectedCompanyId.set(null);
    this.vincularSelectedPhases.set([]);
    this.vincularSaving.set(false);
  }

  toggleVincularPhase(phase: string) {
    const current = this.vincularSelectedPhases();
    if (current.includes(phase)) {
      this.vincularSelectedPhases.set(current.filter((p) => p !== phase));
    } else {
      this.vincularSelectedPhases.set([...current, phase]);
    }
  }

  confirmarVincular() {
    const ev = this.event();
    const companyId = this.vincularSelectedCompanyId();
    const phases = this.vincularSelectedPhases();
    if (!ev) return;
    if (companyId == null) {
      this.notification.error('Selecione a empresa.');
      return;
    }
    if (!phases.length) {
      this.notification.error('Selecione ao menos uma fase.');
      return;
    }
    const wasEdit = !!this.vincularEditCompanyId();
    this.vincularSaving.set(true);
    this.eventService.syncCompanyPhases(ev.id_event, companyId, phases).subscribe({
      next: (res) => {
        this.vincularSaving.set(false);
        this.event.set(res.event);
        this.fecharVincularModal();
        this.notification.success(
          wasEdit ? 'Fases atualizadas.' : 'Empresa vinculada ao evento.',
        );
        this.carregarCredenciais(ev.id_event);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.vincularSaving.set(false);
        this.notification.notifyHttpError(err, 'Falha ao vincular empresa.');
        this.cdr.markForCheck();
      },
    });
  }

  removerEmpresaParceira(row: AggregatedCompany) {
    const ev = this.event();
    if (!ev || !this.canEditCompanyPhases(row)) return;

    Swal.fire({
      title: 'Remover empresa parceira?',
      text: `Remover ${row.company_name} deste evento? A empresa será desvinculada de todas as fases.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover empresa',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.eventService.removeCompanyFromEvent(ev.id_event, row.id_company).subscribe({
        next: () => {
          this.notification.success('Empresa parceira removida do evento.');
          this.carregar(ev.id_event);
        },
        error: (err) =>
          this.notification.notifyHttpError(err, 'Falha ao remover empresa parceira.'),
      });
    });
  }

  irParaColaboradores(companyId?: number, seg?: CollaboratorsSeg) {
    const ev = this.event();
    if (!ev) return;
    if (ev.ativo === false) {
      this.notification.error('Evento desativado. Reative-o para gerenciar colaboradores.');
      return;
    }
    void this.router.navigate(['/admin/eventos', ev.id_event, 'colaboradores'], {
      queryParams: {
        ...(companyId != null ? { companyId } : {}),
        ...(seg ? { seg } : {}),
      },
    });
  }

  private refreshVehicleCounts(eventId: number) {
    this.eventService.listVehicleCounts(eventId).subscribe({
      next: (res) => {
        const normalized: Record<number, number> = {};
        for (const [k, v] of Object.entries(res.counts || {})) {
          normalized[Number(k)] = Number(v) || 0;
        }
        this.vehicleCounts.set(normalized);
        this.cdr.markForCheck();
      },
    });
  }

  editModalSubtitle(): string {
    if (this.editStep() === 2) {
      return 'Marque os dias e fases que farão parte do novo período.';
    }
    if (this.canAdjustPeriod()) {
      return 'Ajuste o período. Se ele mudar, você poderá redefinir os dias/fases.';
    }
    return 'Atualize a empresa responsável do evento.';
  }

  editOrphanDaysLabel(): string {
    return this.editOrphanDays()
      .map((iso) => formatDateBr(iso))
      .join(', ');
  }

  editPrimaryButtonLabel(): string {
    if (this.editSaving()) return 'Salvando...';
    if (this.editStep() === 2) return 'Salvar alterações';
    if (this.canAdjustPeriod() && this.isEditPeriodChanged()) return 'Continuar';
    return 'Salvar alterações';
  }

  private isEditPeriodChanged(): boolean {
    const ev = this.event();
    if (!ev || !this.canAdjustPeriod()) return false;
    const periodStart = this.editPeriodRange?.inicio || '';
    const periodEnd = this.editPeriodRange?.fim || '';
    return (
      periodStart !== String(ev.start || '').slice(0, 10) ||
      periodEnd !== String(ev.end || '').slice(0, 10)
    );
  }

  abrirModalEditar() {
    const ev = this.event();
    if (!ev || !this.canEditEvent() || !ev.ativo) return;
    const start = String(ev.start || '').slice(0, 10);
    const end = String(ev.end || '').slice(0, 10);
    this.editPeriodRange = start && end ? { inicio: start, fim: end } : null;
    this.editPeriodTouched.set(false);
    this.responsavelFormId = ev.id_company_responsavel ?? null;
    this.editStep.set(1);
    this.editDias.set(new Map());
    this.editOrphanDays.set([]);
    this.editDaysLoading.set(false);
    this.showEditModal.set(true);
    if (this.canChangeResponsavel() && this.producers().length === 0) {
      this.carregarProdutoras();
    }
  }

  fecharModalEditar() {
    if (this.editSaving()) return;
    this.showEditModal.set(false);
    this.editStep.set(1);
    this.editDias.set(new Map());
    this.editOrphanDays.set([]);
  }

  voltarEditStep() {
    if (this.editSaving()) return;
    this.editStep.set(1);
  }

  carregarProdutoras() {
    this.eventService.listProducers().subscribe({
      next: (res) => {
        this.producers.set(res.producers || []);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar produtoras.'),
    });
  }

  private ensureEditDayTypes(done: () => void) {
    if (this.editDayTypes().length) {
      if (!this.editBrushTypeId() && this.editDayTypes().length) {
        this.editBrushTypeId.set(this.editDayTypes()[0].id_event_day_type);
      }
      done();
      return;
    }
    this.editDaysLoading.set(true);
    this.eventService.listTypes().subscribe({
      next: (res) => {
        const list = res.types || [];
        this.editDayTypes.set(list);
        if (list.length && !this.editBrushTypeId()) {
          this.editBrushTypeId.set(list[0].id_event_day_type);
        }
        this.editDaysLoading.set(false);
        done();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.editDaysLoading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de dia.');
        this.cdr.markForCheck();
      },
    });
  }

  private prepareEditDaysStep() {
    const ev = this.event();
    const start = this.editPeriodRange?.inicio || '';
    const end = this.editPeriodRange?.fim || '';
    if (!ev || !start || !end) return;

    const orphans: string[] = [];
    const next = new Map<string, number>();
    for (const day of ev.days || []) {
      const iso = String(day.date || '').slice(0, 10);
      const typeId = Number(day.type?.id_event_day_type || 0);
      if (!iso || !typeId) continue;
      if (iso < start || iso > end) {
        orphans.push(iso);
        continue;
      }
      next.set(iso, typeId);
    }
    orphans.sort();
    this.editOrphanDays.set(orphans);
    this.editDias.set(next);
    this.editCalViewKey.update((n) => n + 1);
    this.editStep.set(2);
    this.cdr.markForCheck();
  }

  onEditFormSubmit() {
    if (this.editStep() === 1) {
      this.avancarOuSalvarEdicao();
      return;
    }
    this.salvarEdicao();
  }

  avancarOuSalvarEdicao() {
    const ev = this.event();
    if (!ev) return;

    const savePeriod = this.canAdjustPeriod();
    const saveResponsavel = this.canChangeResponsavel();
    if (!savePeriod && !saveResponsavel) return;

    const periodStart = this.editPeriodRange?.inicio || '';
    const periodEnd = this.editPeriodRange?.fim || '';

    if (savePeriod) {
      this.editPeriodTouched.set(true);
      if (!periodStart || !periodEnd) {
        this.notification.error('Informe o período do evento.');
        return;
      }
      if (periodEnd < periodStart) {
        this.notification.error('Data fim deve ser igual ou posterior à data início.');
        return;
      }
    }
    if (saveResponsavel && !this.responsavelFormId) {
      this.notification.error('Selecione a empresa responsável.');
      return;
    }

    const periodChanged = this.isEditPeriodChanged();
    const responsavelChanged =
      saveResponsavel && this.responsavelFormId !== (ev.id_company_responsavel ?? null);

    if (!periodChanged && !responsavelChanged) {
      this.fecharModalEditar();
      return;
    }

    if (periodChanged) {
      this.ensureEditDayTypes(() => this.prepareEditDaysStep());
      return;
    }

    this.salvarEdicao();
  }

  onEditTagDay(iso: string) {
    const brush = this.editBrushTypeId();
    if (!brush) return;
    const next = new Map(this.editDias());
    if (next.get(iso) === brush) next.delete(iso);
    else next.set(iso, brush);
    this.editDias.set(next);
  }

  onEditFillPeriod() {
    const start = this.editPeriodRange?.inicio || '';
    const end = this.editPeriodRange?.fim || '';
    const brush = this.editBrushTypeId();
    if (!start || !end || !brush) return;
    const next = new Map(this.editDias());
    for (const iso of eachIsoInRange(start, end)) {
      if (!next.has(iso)) next.set(iso, brush);
    }
    this.editDias.set(next);
  }

  onEditChangeDayType(ev: { iso: string; id_type: number }) {
    const next = new Map(this.editDias());
    next.set(ev.iso, ev.id_type);
    this.editDias.set(next);
  }

  onEditRemoveDay(iso: string) {
    const next = new Map(this.editDias());
    next.delete(iso);
    this.editDias.set(next);
  }

  salvarEdicao() {
    const ev = this.event();
    if (!ev) return;

    const savePeriod = this.canAdjustPeriod();
    const saveResponsavel = this.canChangeResponsavel();
    if (!savePeriod && !saveResponsavel) return;

    const periodStart = this.editPeriodRange?.inicio || '';
    const periodEnd = this.editPeriodRange?.fim || '';

    if (savePeriod) {
      this.editPeriodTouched.set(true);
      if (!periodStart || !periodEnd) {
        this.notification.error('Informe o período do evento.');
        return;
      }
      if (periodEnd < periodStart) {
        this.notification.error('Data fim deve ser igual ou posterior à data início.');
        return;
      }
    }
    if (saveResponsavel && !this.responsavelFormId) {
      this.notification.error('Selecione a empresa responsável.');
      return;
    }

    const periodChanged =
      savePeriod &&
      (periodStart !== String(ev.start || '').slice(0, 10) ||
        periodEnd !== String(ev.end || '').slice(0, 10));
    const responsavelChanged =
      saveResponsavel && this.responsavelFormId !== (ev.id_company_responsavel ?? null);
    const syncingDays = periodChanged && this.editStep() === 2;

    if (!periodChanged && !responsavelChanged) {
      this.fecharModalEditar();
      return;
    }

    if (periodChanged && !syncingDays) {
      this.ensureEditDayTypes(() => this.prepareEditDaysStep());
      return;
    }

    this.editSaving.set(true);
    let approvalReopened = false;

    const finishOk = (message: string, reloadLinks: boolean) => {
      this.editSaving.set(false);
      this.fecharModalEditar();
      this.notification.success(message);
      if (reloadLinks && (this.event()?.can_manage_companies || this.isAdmin)) {
        this.carregarEmpresas(ev.id_event);
      }
      if (reloadLinks || syncingDays) {
        this.carregarCredenciais(ev.id_event);
      }
      if (syncingDays && (this.event()?.can_manage_companies || this.isAdmin)) {
        this.carregarEmpresas(ev.id_event);
      }
      this.cdr.markForCheck();
    };

    const fail = (err: unknown, fallback: string) => {
      this.editSaving.set(false);
      this.notification.notifyHttpError(err, fallback);
      this.cdr.markForCheck();
    };

    const runResponsavel = () => {
      this.eventService.updateResponsavel(ev.id_event, this.responsavelFormId!).subscribe({
        next: (res) => {
          this.event.set(res.event);
          if (periodChanged) {
            finishOk(
              approvalReopened
                ? 'Alterações salvas. Evento enviado novamente para aprovação.'
                : 'Alterações salvas.',
              true,
            );
          } else {
            finishOk('Empresa responsável atualizada.', true);
          }
        },
        error: (err) => fail(err, 'Falha ao trocar responsável.'),
      });
    };

    if (periodChanged) {
      const days = [...this.editDias().entries()]
        .map(([date, id_type]) => ({ date, id_type }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));

      this.eventService
        .updatePeriod(ev.id_event, {
          start: periodStart,
          end: periodEnd,
          days,
        })
        .subscribe({
          next: (res) => {
            this.event.set(res.event);
            approvalReopened = !!res.event.approvalReopened;
            if (responsavelChanged) {
              runResponsavel();
              return;
            }
            finishOk(
              approvalReopened
                ? 'Período e fases atualizados. Evento enviado novamente para aprovação.'
                : 'Período e fases atualizados.',
              true,
            );
          },
          error: (err) => fail(err, 'Falha ao ajustar período.'),
        });
      return;
    }

    runResponsavel();
  }

  carregarEmpresas(eventId: number) {
    this.eventService.listLinkableCompanies(eventId).subscribe({
      next: (res) => {
        this.companies.set(
          (res.companies || []).map((c) => ({
            id_company: c.id_company,
            company_name: c.company_name,
            fancy_name: c.fancy_name ?? null,
            cnpj: '',
            status: true,
            id_company_type: c.id_company_type || 0,
            criado_em: '',
            atualizado_em: '',
            company_type: c.company_type_description
              ? {
                  id_company_type: c.id_company_type || 0,
                  description: c.company_type_description,
                }
              : null,
            contacts: [],
          })),
        );
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
        if (res.event.can_manage_companies || this.isAdmin) {
          this.carregarEmpresas(eventId);
        }
        this.carregarCredenciais(eventId);
        this.refreshVehicleCounts(eventId);
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

  toggleNotifyPortaria(): void {
    const ev = this.event();
    if (!ev?.id_event || this.prefSaving()) return;
    if (ev.ativo === false) return;
    const checked = !ev.notificar_portaria;
    this.prefSaving.set(true);
    this.eventService.updatePreferences(ev.id_event, { notificar_portaria: checked }).subscribe({
      next: (res) => {
        this.event.set(res.event);
        this.prefSaving.set(false);
        this.notification.success(
          res.event.notificar_portaria
            ? 'Você receberá alertas de entrada na portaria deste evento.'
            : 'Alertas de portaria desativados para este evento.',
        );
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.prefSaving.set(false);
        this.event.set({ ...ev, notificar_portaria: !checked });
        this.notification.notifyHttpError(err, 'Não foi possível salvar a preferência.');
        this.cdr.markForCheck();
      },
    });
  }

  notificarSetor() {
    const ev = this.event();
    if (!ev?.id_event || !this.canSubmitApproval() || this.submitApprovalSaving()) return;
    Swal.fire({
      title: 'Notificar setor de aprovação?',
      text: `O evento "${ev.name}" será enviado para aprovação do setor. A empresa responsável deve ter concluído o vínculo das parceiras.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Notificar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1d54e6',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.submitApprovalSaving.set(true);
      this.eventService.submitApproval(ev.id_event).subscribe({
        next: (res) => {
          this.submitApprovalSaving.set(false);
          this.event.set(res.event);
          this.notification.success('Setor de aprovação notificado.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.submitApprovalSaving.set(false);
          this.notification.notifyHttpError(err, 'Não foi possível notificar o setor.');
          this.cdr.markForCheck();
        },
      });
    });
  }

  notificarTermino(row: AggregatedCompany) {
    const ev = this.event();
    if (!ev?.id_event || !this.canNotifyCompleteForCompany(row) || this.notifyCompleteSaving()) {
      return;
    }
    Swal.fire({
      title: 'Notificar término do cadastro?',
      text: `A empresa responsável será avisada por e-mail que "${row.company_name}" concluiu o cadastro de colaboradores.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Notificar término',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1d54e6',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.notifyCompleteSaving.set(true);
      this.notifyCompleteCompanyId.set(row.id_company);
      this.eventService.notifyCompanyComplete(ev.id_event, row.id_company).subscribe({
        next: (res) => {
          this.notifyCompleteSaving.set(false);
          this.notifyCompleteCompanyId.set(null);
          this.event.set(res.event);
          this.notification.success('Empresa responsável notificada por e-mail.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.notifyCompleteSaving.set(false);
          this.notifyCompleteCompanyId.set(null);
          this.notification.notifyHttpError(err, 'Não foi possível notificar o término.');
          this.cdr.markForCheck();
        },
      });
    });
  }

  toggleEventActive() {
    const ev = this.event();
    if (!ev?.id_event || !this.canToggleActive() || this.statusToggling()) return;
    const ativar = ev.ativo === false;
    Swal.fire({
      title: ativar ? 'Habilitar evento?' : 'Desabilitar evento?',
      text: ativar
        ? `Habilitar "${ev.name}"? Novas solicitações e a portaria voltarão a funcionar.`
        : `Desabilitar "${ev.name}"? Novas solicitações e acessos na portaria ficarão bloqueados.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: ativar ? 'Habilitar' : 'Desabilitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: ativar ? '#059669' : '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.statusToggling.set(true);
      this.eventService.patchStatus(ev.id_event, ativar).subscribe({
        next: (res) => {
          this.statusToggling.set(false);
          this.event.set(res.event);
          this.notification.success(ativar ? 'Evento habilitado.' : 'Evento desabilitado.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.statusToggling.set(false);
          this.notification.notifyHttpError(err, 'Não foi possível alterar o status do evento.');
          this.cdr.markForCheck();
        },
      });
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

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
