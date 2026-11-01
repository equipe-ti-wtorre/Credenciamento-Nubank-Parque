import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NavigationStateService } from '../../../core/services/navigation-state.service';
import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import {
  EventCompanyVehicleItem,
  EventDetail,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
} from '../../../services/collaborator.service';
import { VehicleItem, VehicleService } from '../../../services/vehicle.service';
import {
  CredentialItem,
  CredentialService,
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_APROVADO,
  statusBadgeClass,
} from '../../../services/credential.service';
import { NotificationService } from '../../../core/services/notification.service';
import { formatBlocklistNotice } from '../../../shared/blocklist-notice';
import { AuthService } from '../../../core/services/auth.service';
import { CollaboratorPhotoComponent } from '../../../shared/collaborator-photo/collaborator-photo.component';
import { ModalComponent } from '../../../shared/modal/modal.component';
import { ActionBtnComponent } from '../../../shared/actions';
import {
  BulkImportApiAdapter,
  ServiceAccessBulkImportWizardComponent,
} from '../../patrimonial/service-access-bulk-import-wizard.component';

type CredStatusSummary = 'aprovado' | 'aguardando' | 'rascunho';
type PageSeg = 'lote' | 'ind';
type WizardStep = 1 | 2 | 3;
type BulkInnerStep = 'upload' | 'review' | 'result';

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
  credStatus: CredStatusSummary;
  isResponsavel: boolean;
  collaboratorCount: number;
  vehicleCount: number;
}

interface PhaseDayGroup {
  phase: string;
  days: CompanyDayLink[];
}

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
  selector: 'app-event-collaborators',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    CollaboratorPhotoComponent,
    ActionBtnComponent,
    ServiceAccessBulkImportWizardComponent,
  ],
  styleUrl: './event-collaborators.component.scss',
  template: `
    <div class="ec-page">
      <a
        *ngIf="event()"
        (click)="voltarAoEvento()"
        class="back"
      >
        ← Voltar ao evento
      </a>

      <ng-container *ngIf="!loading() && event(); else loadingState">
        <header class="ec-head">
          <div class="ec-head__top">
            <div>
              <p class="ec-head__eyebrow">Colaboradores e veículos</p>
              <h1 class="ec-head__title">{{ event()!.name }}</h1>
              <p class="ec-head__sub" *ngIf="selectedCompany() as dc">
                {{ dc.company_name }} · {{ dc.collaboratorCount }} colab. ·
                {{ dc.vehicleCount }} veíc. · {{ pendingCount() }} aguardando aprovação
              </p>
              <p class="ec-head__sub" *ngIf="!selectedCompany()">Selecione a empresa para gerenciar</p>
              <div class="ec-head__phases" *ngIf="selectedCompany() as dc">
                <span *ngFor="let ph of dc.phases" class="miniphase" [ngClass]="phaseClass(ph)">
                  <span class="dot"></span>{{ ph }}
                </span>
              </div>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" (click)="carregar()">
              Atualizar
            </button>
          </div>

        </header>

        <ng-container *ngIf="selectedCompany(); else pickCompany">
          <p class="ec-hint" *ngIf="!canManageCompany()">
            Somente visualização e aprovação — a inclusão de colaboradores é feita pela própria empresa.
          </p>

          <section class="ec-wizard" *ngIf="canManageCompany()">
            <div class="ec-stepper" aria-label="Progresso da indicação">
              <div
                class="ec-stitem"
                [class.is-active]="wizardStep() === 1"
                [class.is-done]="wizardStep() > 1"
              >
                <span class="ec-sdot">1</span>
                <span class="ec-slabel">Dias e fases</span>
              </div>
              <span class="ec-sline" [class.is-done]="wizardStep() > 1"></span>
              <div
                class="ec-stitem"
                [class.is-active]="wizardStep() === 2"
                [class.is-done]="wizardStep() > 2"
              >
                <span class="ec-sdot">2</span>
                <span class="ec-slabel">Importar</span>
              </div>
              <span class="ec-sline" [class.is-done]="wizardStep() > 2"></span>
              <div class="ec-stitem" [class.is-active]="wizardStep() === 3">
                <span class="ec-sdot">3</span>
                <span class="ec-slabel">Validar e importar</span>
              </div>
            </div>

            <!-- Passo 1: dias / fases -->
            <div class="card-box day-picker" *ngIf="wizardStep() === 1">
              <p class="ind-label">Dias / fases para indicação</p>
              <p class="day-picker__hint">Selecione a fase e os dias em que a equipe será vinculada.</p>
              <div class="day-picker__grid" *ngIf="phaseGroups().length > 0; else noPhases">
                <div class="day-picker__phase" *ngFor="let group of phaseGroups()">
                  <label class="day-picker__phase-head">
                    <input
                      type="checkbox"
                      [checked]="isPhaseFullySelected(group)"
                      [indeterminate]="isPhasePartiallySelected(group)"
                      (change)="togglePhaseSelection(group, $any($event.target).checked)"
                    />
                    <span class="miniphase" [ngClass]="phaseClass(group.phase)">
                      <span class="dot"></span>{{ group.phase }}
                    </span>
                    <span class="day-picker__count">{{ selectedCountInPhase(group) }}/{{ group.days.length }}</span>
                  </label>
                  <div class="day-picker__days">
                    <label class="day-picker__day" *ngFor="let day of group.days">
                      <input
                        type="checkbox"
                        [checked]="isLinkSelected(day.id_event_day_company)"
                        (change)="toggleLinkSelection(day.id_event_day_company, $any($event.target).checked)"
                      />
                      <span>{{ formatDateBr(day.date) }}</span>
                    </label>
                  </div>
                </div>
              </div>
              <ng-template #noPhases>
                <p class="day-picker__warn">Esta empresa não possui dias/fases vinculados.</p>
              </ng-template>
              <p class="day-picker__warn" *ngIf="phaseGroups().length > 0 && selectedLinkIds().length === 0">
                Selecione ao menos um dia para continuar.
              </p>
              <div class="ec-nav">
                <span></span>
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="selectedLinkIds().length === 0"
                  (click)="goWizardStep(2)"
                >
                  Continuar
                </button>
              </div>
            </div>

            <!-- Passos 2–3: importar / validar (lote mantém a mesma instância do wizard) -->
            <ng-container *ngIf="wizardStep() >= 2">
              <div class="ec-toolbar" *ngIf="wizardStep() === 2">
                <div class="seg">
                  <button type="button" [class.on]="seg() === 'lote'" (click)="setSeg('lote')">
                    Importar em lote
                  </button>
                  <button type="button" [class.on]="seg() === 'ind'" (click)="setSeg('ind')">
                    Adicionar individual
                  </button>
                </div>
              </div>

              <section class="ec-main" *ngIf="seg() === 'lote'">
                <app-service-access-bulk-import-wizard
                  [open]="true"
                  [embedded]="true"
                  [hideInternalStepper]="true"
                  [apiAdapter]="eventBulkAdapter"
                  [accessName]="event()?.name || 'Evento'"
                  [companyName]="selectedCompany()?.company_name || ''"
                  (stepChange)="onBulkStepChange($event)"
                  (completed)="onEventBulkCompleted()"
                  (closed)="onBulkClosed()"
                />
              </section>

              <section class="ec-main ec-ind" *ngIf="seg() === 'ind' && wizardStep() === 2">
                <div class="card-box">
                  <p class="ind-label">Colaborador</p>
                  <div class="field relative">
                    <label class="label" for="ind-colab-q">Buscar por nome ou documento</label>
                    <input
                      id="ind-colab-q"
                      class="input"
                      type="text"
                      autocomplete="off"
                      [ngModel]="colabSearchQuery"
                      (ngModelChange)="onColabSearch($event)"
                      name="colabSearchQuery"
                      placeholder="Digite ao menos 2 caracteres..."
                    />
                    <div *ngIf="colabSearching()" class="search-dd muted">Buscando...</div>
                    <ul *ngIf="!colabSearching() && colabResults().length > 0" class="search-dd">
                      <li *ngFor="let c of colabResults()">
                        <button
                          type="button"
                          class="search-dd__btn"
                          [disabled]="c.is_blocklisted"
                          (click)="selecionarColaboradorBusca(c)"
                        >
                          <span class="font-medium">{{ c.name }}</span>
                          <span class="meta">
                            {{ maskDocument(c.document) }}
                            <span *ngIf="c.is_blocklisted" class="text-rose-600"> · bloqueado</span>
                          </span>
                        </button>
                      </li>
                    </ul>
                  </div>
                  <div class="field" *ngIf="selectedColab() as col">
                    <div class="picked">
                      <div>
                        <p class="font-semibold">{{ col.name }}</p>
                        <p class="text-slate-500 text-sm">{{ maskDocument(col.document) }}</p>
                      </div>
                      <button type="button" class="btn--link" (click)="limparColabSelecionado()">Trocar</button>
                    </div>
                    <label class="label" for="ind-role-pick">Função no evento</label>
                    <select id="ind-role-pick" class="select" [(ngModel)]="selectedColabRoleId" name="selectedColabRoleId">
                      <option [ngValue]="null">Selecione</option>
                      <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                    </select>
                  </div>
                  <button type="button" class="btn btn--ghost mt-2" (click)="abrirModalNovoColab()">
                    Novo colaborador
                  </button>
                </div>

                <div class="card-box">
                  <p class="ind-label">Veículo</p>
                  <div class="field relative">
                    <label class="label" for="ind-veic-q">Buscar por placa, marca ou modelo</label>
                    <input
                      id="ind-veic-q"
                      class="input"
                      type="text"
                      autocomplete="off"
                      [ngModel]="veicSearchQuery"
                      (ngModelChange)="onVeicSearch($event)"
                      name="veicSearchQuery"
                      placeholder="Digite ao menos 2 caracteres..."
                    />
                    <div *ngIf="veicSearching()" class="search-dd muted">Buscando...</div>
                    <ul *ngIf="!veicSearching() && veicResults().length > 0" class="search-dd">
                      <li *ngFor="let v of veicResults()">
                        <button type="button" class="search-dd__btn" (click)="selecionarVeiculoBusca(v)">
                          <span class="font-medium font-mono">{{ v.plate }}</span>
                          <span class="meta">{{ v.brand || '—' }} {{ v.model || '' }}</span>
                        </button>
                      </li>
                    </ul>
                  </div>
                  <div class="field" *ngIf="selectedVeic() as veic">
                    <div class="picked">
                      <div>
                        <p class="font-semibold font-mono">{{ veic.plate }}</p>
                        <p class="text-slate-500 text-sm">{{ veic.brand || '—' }} {{ veic.model || '' }}</p>
                      </div>
                      <button type="button" class="btn--link" (click)="limparVeicSelecionado()">Trocar</button>
                    </div>
                  </div>
                  <button type="button" class="btn btn--ghost mt-2" (click)="abrirModalNovoVeic()">
                    Novo veículo
                  </button>
                </div>
              </section>

              <div class="card-box" *ngIf="seg() === 'ind' && wizardStep() === 3">
                <p class="ind-label">Validar informações</p>
                <p class="day-picker__hint">Confira os dados antes de solicitar o vínculo ao evento.</p>
                <dl class="ec-summary">
                  <div>
                    <dt>Empresa</dt>
                    <dd>{{ selectedCompany()?.company_name }}</dd>
                  </div>
                  <div>
                    <dt>Dias / fases</dt>
                    <dd>
                      <ul class="ec-summary__list">
                        <li *ngFor="let label of selectedDaysLabels()">{{ label }}</li>
                      </ul>
                    </dd>
                  </div>
                  <div *ngIf="selectedColab() as col">
                    <dt>Colaborador</dt>
                    <dd>
                      {{ col.name }} · {{ maskDocument(col.document) }}
                      <ng-container *ngIf="selectedRoleLabel() as role"> · {{ role }}</ng-container>
                    </dd>
                  </div>
                  <div *ngIf="selectedVeic() as veic">
                    <dt>Veículo</dt>
                    <dd class="font-mono">{{ veic.plate }} · {{ veic.brand || '—' }} {{ veic.model || '' }}</dd>
                  </div>
                </dl>
              </div>

              <div class="ec-nav" *ngIf="seg() === 'ind' && wizardStep() === 2">
                <button type="button" class="btn btn--ghost" (click)="goWizardStep(1)">Voltar</button>
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="!canContinueIndividual()"
                  (click)="goWizardStep(3)"
                >
                  Continuar
                </button>
              </div>
              <div class="ec-nav" *ngIf="seg() === 'ind' && wizardStep() === 3">
                <button type="button" class="btn btn--ghost" (click)="goWizardStep(2)">Voltar</button>
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="individualSubmitting() || !canContinueIndividual()"
                  (click)="confirmarIndividual()"
                >
                  {{ individualSubmitting() ? 'Vinculando...' : 'Confirmar e importar' }}
                </button>
              </div>
              <div class="ec-nav" *ngIf="seg() === 'lote' && wizardStep() === 2">
                <button type="button" class="btn btn--ghost" (click)="goWizardStep(1)">Voltar</button>
                <span class="ec-nav__hint">Envie a planilha para analisar colaboradores e veículos.</span>
              </div>
              <div class="ec-nav" *ngIf="seg() === 'lote' && wizardStep() === 3">
                <button type="button" class="btn btn--ghost" (click)="backFromBulkStep3()">Voltar</button>
                <span class="ec-nav__hint">Revise as linhas e confirme a importação no painel acima.</span>
              </div>
            </ng-container>
          </section>

          <section class="ec-tables">
            <div class="tablecard">
              <div class="tablecard__head">
                <h2 class="section__title">
                  Credenciais
                  <span class="count-pill">{{ companyCredentials().length }}</span>
                </h2>
                <button
                  *ngIf="canManageCompany()"
                  type="button"
                  class="btn-action-secondary"
                  [disabled]="companyCredentials().length === 0"
                  (click)="removerTodasCredenciais()"
                >
                  Remover todos
                </button>
              </div>
              <div class="tbl-scroll" *ngIf="companyCredentials().length > 0; else noCreds">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Documento</th>
                      <th>Dia / fase</th>
                      <th>Função</th>
                      <th>Status</th>
                      <th *ngIf="canManageCompany()"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let cred of companyCredentials()">
                      <td>
                        <div class="tcell-emp">
                          <div class="tbl-av">{{ initials(cred.collaborator.name) }}</div>
                          <span class="tname">{{ cred.collaborator.name }}</span>
                        </div>
                      </td>
                      <td>{{ maskDocument(cred.collaborator.document) }}</td>
                      <td>{{ credDayLabel(cred) }}</td>
                      <td>{{ cred.role_description || '—' }}</td>
                      <td>
                        <span class="status-pill" [ngClass]="statusBadgeClass(cred.id_access_status)">
                          {{ cred.access_status_description }}
                        </span>
                      </td>
                      <td *ngIf="canManageCompany()" class="td-actions">
                        <app-action-btn
                          icon="delete"
                          title="Remover"
                          variant="danger"
                          (action)="removerCredencial(cred)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ng-template #noCreds>
                <p class="empty-inline">Nenhuma credencial cadastrada para esta empresa.</p>
              </ng-template>
            </div>

            <div class="tablecard">
              <div class="tablecard__head">
                <h2 class="section__title">
                  Veículos vinculados
                  <span class="count-pill">{{ companyVehicles().length }}</span>
                </h2>
                <button
                  *ngIf="canManageCompany()"
                  type="button"
                  class="btn-action-secondary"
                  [disabled]="companyVehicles().length === 0"
                  (click)="removerTodosVeiculos()"
                >
                  Remover todos
                </button>
              </div>
              <div class="tbl-scroll" *ngIf="companyVehicles().length > 0; else noVeics">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Marca / modelo</th>
                      <th>Cor</th>
                      <th>Status</th>
                      <th *ngIf="canManageCompany()"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let v of companyVehicles()">
                      <td class="font-mono font-semibold">{{ v.plate }}</td>
                      <td>{{ v.brand || '—' }} {{ v.model || '' }}</td>
                      <td>{{ v.color || '—' }}</td>
                      <td>{{ v.access_status_description || '—' }}</td>
                      <td *ngIf="canManageCompany()" class="td-actions">
                        <app-action-btn
                          icon="delete"
                          title="Remover"
                          variant="danger"
                          (action)="removerVeiculoEvento(v)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ng-template #noVeics>
                <p class="empty-inline">Nenhum veículo vinculado a esta empresa.</p>
              </ng-template>
            </div>
          </section>
        </ng-container>

        <ng-template #pickCompany>
          <div class="empty">
            <p>Sua empresa não está vinculada a este evento ou não há empresa para exibir.</p>
          </div>
        </ng-template>

        <div class="ec-footer">
          <a
            (click)="voltarAoEvento()"
            class="btn btn--ghost"
          >
            Voltar
          </a>
        </div>
      </ng-container>

      <ng-template #loadingState>
        <div class="empty">
          <p>Carregando...</p>
        </div>
      </ng-template>

      <app-modal
        [open]="showColabModal()"
        title="Novo colaborador"
        subtitle="Cadastro para seleção no passo de importação."
        size="md"
        (close)="fecharModalNovoColab()"
      >
        <form id="event-colab-form" class="space-y-3" (ngSubmit)="salvarNovoColaborador()">
          <div class="field">
            <label class="label" for="nc-type">Tipo de documento</label>
            <select id="nc-type" class="select" [(ngModel)]="colabForm.id_collaborator_document_type" name="ncType">
              <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">{{ t.description }}</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="nc-doc">Documento</label>
            <input id="nc-doc" class="input" [(ngModel)]="colabForm.document" name="ncDoc" />
          </div>
          <div class="field">
            <label class="label" for="nc-name">Nome completo</label>
            <input id="nc-name" class="input" [(ngModel)]="colabForm.name" name="ncName" />
          </div>
          <div class="field">
            <label class="label">Foto (opcional)</label>
            <app-collaborator-photo
              size="md"
              mode="deferred"
              [name]="colabForm.name"
              (fileReady)="pendingColabPicture = $event"
            />
          </div>
          <div class="field">
            <label class="label" for="nc-role">Função</label>
            <select id="nc-role" class="select" [(ngModel)]="colabForm.id_collaborator_role" name="ncRole">
              <option [ngValue]="null">Selecione</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
            </select>
          </div>
          <div class="grid2">
            <div class="field">
              <label class="label" for="nc-rg">RG (opcional)</label>
              <input id="nc-rg" class="input" [(ngModel)]="colabForm.rg" name="ncRg" />
            </div>
            <div class="field">
              <label class="label" for="nc-phone">Telefone (opcional)</label>
              <input id="nc-phone" class="input" [(ngModel)]="colabForm.phone" name="ncPhone" />
            </div>
          </div>
        </form>
        <div modal-footer class="modal-footer">
          <button type="button" class="btn-action-secondary" (click)="fecharModalNovoColab()">Cancelar</button>
          <button type="submit" form="event-colab-form" class="btn-action-primary" [disabled]="colabSaving()">
            {{ colabSaving() ? 'Salvando...' : 'Cadastrar' }}
          </button>
        </div>
      </app-modal>

      <app-modal
        [open]="showVeicModal()"
        title="Novo veículo"
        subtitle="Cadastro para seleção no passo de importação."
        size="md"
        (close)="fecharModalNovoVeic()"
      >
        <form id="event-veic-form" class="space-y-3" (ngSubmit)="salvarNovoVeiculo()">
          <div class="field">
            <label class="label" for="nv-plate">Placa</label>
            <input id="nv-plate" class="input font-mono" [(ngModel)]="veicForm.plate" name="nvPlate" />
          </div>
          <div class="grid2">
            <div class="field">
              <label class="label" for="nv-brand">Marca</label>
              <input id="nv-brand" class="input" [(ngModel)]="veicForm.brand" name="nvBrand" />
            </div>
            <div class="field">
              <label class="label" for="nv-model">Modelo</label>
              <input id="nv-model" class="input" [(ngModel)]="veicForm.model" name="nvModel" />
            </div>
          </div>
          <div class="grid2">
            <div class="field">
              <label class="label" for="nv-color">Cor</label>
              <input id="nv-color" class="input" [(ngModel)]="veicForm.color" name="nvColor" />
            </div>
            <div class="field">
              <label class="label" for="nv-type">Tipo</label>
              <input id="nv-type" class="input" [(ngModel)]="veicForm.type" name="nvType" placeholder="Passeio, utilitário..." />
            </div>
          </div>
          <div class="field">
            <label class="label" for="nv-desc">Descrição (opcional)</label>
            <input id="nv-desc" class="input" [(ngModel)]="veicForm.description" name="nvDesc" />
          </div>
        </form>
        <div modal-footer class="modal-footer">
          <button type="button" class="btn-action-secondary" (click)="fecharModalNovoVeic()">Cancelar</button>
          <button type="submit" form="event-veic-form" class="btn-action-primary" [disabled]="veicSaving()">
            {{ veicSaving() ? 'Salvando...' : 'Cadastrar' }}
          </button>
        </div>
      </app-modal>
    </div>
  `,
})
export class EventCollaboratorsComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly nav = inject(NavigationStateService);
  @ViewChild(ServiceAccessBulkImportWizardComponent)
  private bulkWizard?: ServiceAccessBulkImportWizardComponent;

  readonly formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;
  readonly maskDocument = maskDocument;

  event = signal<EventDetail | null>(null);
  credentials = signal<CredentialItem[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  loading = signal(true);

  companyId = signal<number | null>(null);
  seg = signal<PageSeg>('lote');
  wizardStep = signal<WizardStep>(1);
  selectedLinkIds = signal<number[]>([]);

  individualSubmitting = signal(false);
  colabSearching = signal(false);
  colabResults = signal<CollaboratorItem[]>([]);
  selectedColab = signal<CollaboratorItem | null>(null);
  selectedColabRoleId: number | null = null;
  colabSearchQuery = '';
  private colabTimer: ReturnType<typeof setTimeout> | null = null;

  veicSearching = signal(false);
  veicResults = signal<VehicleItem[]>([]);
  selectedVeic = signal<VehicleItem | null>(null);
  veicSearchQuery = '';
  private veicTimer: ReturnType<typeof setTimeout> | null = null;

  companyVehicles = signal<EventCompanyVehicleItem[]>([]);
  vehicleCounts = signal<Record<number, number>>({});

  showColabModal = signal(false);
  showVeicModal = signal(false);
  colabSaving = signal(false);
  veicSaving = signal(false);
  colabForm = {
    id_collaborator_document_type: null as number | null,
    id_collaborator_role: null as number | null,
    document: '',
    name: '',
    rg: '',
    phone: '',
  };
  pendingColabPicture: File | null = null;
  veicForm = {
    plate: '',
    brand: '',
    model: '',
    color: '',
    type: '',
    description: '',
  };

  isAdmin = false;
  userRole = '';
  userCompanyId: number | null = null;
  isPartnerCompanyUser = false;
  private pendingQueryCompanyId: number | null = null;
  private pendingQuerySeg: PageSeg | null = null;

  eventBulkAdapter: BulkImportApiAdapter = {
    downloadTemplate: () => {
      const ev = this.event();
      const companyId = this.companyId();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      return this.eventService.downloadCompanyBulkTemplate(ev.id_event, companyId);
    },
    preview: (file: File) => {
      const ev = this.event();
      const companyId = this.companyId();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      return this.eventService.previewCompanyBulkImport(ev.id_event, companyId, file);
    },
    confirm: (previewToken, decisoes) => {
      const ev = this.event();
      const companyId = this.companyId();
      const linkIds = this.selectedLinkIds();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      if (!linkIds.length) {
        this.notification.error('Selecione ao menos um dia para importar.');
        throw new Error('Selecione ao menos um dia para importar.');
      }
      return this.eventService.confirmCompanyBulkImport(
        ev.id_event,
        companyId,
        previewToken,
        decisoes,
        linkIds,
      );
    },
    templateFilename: 'template-evento-colaboradores-veiculos.xlsx',
    confirmLabel: 'Importar para o evento',
  };

  private isPartnerScopedView(): boolean {
    return (
      this.isPartnerCompanyUser &&
      this.userCompanyId != null &&
      !this.canManageCompanies()
    );
  }

  aggregatedCompanies = computed(() => {
    const all = this.buildAggregatedCompanies();
    if (this.isPartnerScopedView()) {
      return all.filter((c) => c.id_company === this.userCompanyId);
    }
    return all;
  });

  selectedCompany = computed(() => {
    const id = this.companyId();
    if (id == null) return null;
    return this.aggregatedCompanies().find((c) => c.id_company === id) ?? null;
  });

  phaseGroups = computed((): PhaseDayGroup[] => {
    const agg = this.selectedCompany();
    if (!agg?.links.length) return [];
    const byPhase = new Map<string, CompanyDayLink[]>();
    for (const link of agg.links) {
      const list = byPhase.get(link.phase) || [];
      list.push(link);
      byPhase.set(link.phase, list);
    }
    return [...byPhase.entries()].map(([phase, days]) => ({
      phase,
      days: [...days].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  });

  companyCredentials = computed(() => {
    const agg = this.selectedCompany();
    if (!agg) return [];
    return [...agg.credentials].sort((a, b) => {
      const byName = a.collaborator.name.localeCompare(b.collaborator.name);
      if (byName !== 0) return byName;
      return String(a.event_day?.date || '').localeCompare(String(b.event_day?.date || ''));
    });
  });

  pendingCount = computed(() => {
    const agg = this.selectedCompany();
    if (!agg) return 0;
    const pending = new Set<number>();
    for (const cred of agg.credentials) {
      if (
        cred.id_access_status === STATUS_AGUARDANDO_PRODUTORA ||
        cred.id_access_status === STATUS_AGUARDANDO_APROVACAO
      ) {
        pending.add(cred.id_collaborator);
      }
    }
    return pending.size;
  });

  selectedDaysLabels = computed(() => {
    const selected = new Set(this.selectedLinkIds());
    const labels: string[] = [];
    for (const group of this.phaseGroups()) {
      for (const day of group.days) {
        if (!selected.has(day.id_event_day_company)) continue;
        labels.push(`${group.phase} · ${formatDateBr(day.date)}`);
      }
    }
    return labels;
  });

  selectedRoleLabel(): string | null {
    const roleId = this.selectedColabRoleId;
    if (roleId == null) return null;
    return this.roles().find((r) => r.id_collaborator_role === roleId)?.description ?? null;
  }

  constructor(
    private eventService: EventService,
    private credentialService: CredentialService,
    private collaboratorService: CollaboratorService,
    private vehicleService: VehicleService,
    private authService: AuthService,
    private notification: NotificationService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.userRole = String(user?.role || user?.perfil || '').toUpperCase();
    this.isAdmin = this.userRole === 'ADMIN';
    this.userCompanyId = user?.id_company != null ? user.id_company : null;
    this.isPartnerCompanyUser =
      this.userRole === 'PADRAO' ||
      this.userRole === 'EMPRESA_GESTOR' ||
      this.userRole === 'EMPRESA_SOLICITANTE';

    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tipos de documento.'),
    });

    const navCompany = this.nav.obter('/admin/eventos/colaboradores')?.company_id || null;
    this.route.queryParamMap.subscribe((qp) => {
      const rawCompany = navCompany || qp.get('companyId');
      this.pendingQueryCompanyId = (rawCompany || null) as never;
      const rawSeg = qp.get('seg');
      this.pendingQuerySeg = rawSeg === 'ind' || rawSeg === 'lote' ? rawSeg : null;
      if (this.event()) this.applyPendingSelection();
    });

    const id = this.nav.obter('/admin/eventos/colaboradores')?.public_id;
    if (!id) {
      void this.router.navigate(['/admin/eventos']);
      return;
    }
    this.carregar(id as never);
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

  canManageCompanies(): boolean {
    return !!(this.event()?.can_manage_companies || this.isAdmin);
  }

  canRequestCredentialForCompany(row: AggregatedCompany): boolean {
    if (this.event()?.ativo === false) return false;
    if (!this.canManageCompanies() && this.event()?.is_solicitante) return false;
    if (this.userCompanyId == null) return false;
    return String(row.id_company) === String(this.userCompanyId);
  }

  canManageCompany(): boolean {
    const row = this.selectedCompany();
    if (!row) return false;
    return this.canRequestCredentialForCompany(row);
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
          agg = {
            id_company: id,
            company_name: link.company.company_name,
            company_type_description: link.company.company_type_description || '',
            phases: [],
            linkIds: [],
            links: [],
            producerIds: [],
            credentials: [],
            credStatus: 'rascunho',
            isResponsavel: responsavelId != null && id === responsavelId,
            collaboratorCount: 0,
            vehicleCount: 0,
          };
          map.set(id, agg);
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
      agg.credStatus = this.computeCredStatus(agg.credentials);
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

  private computeCredStatus(credentials: CredentialItem[]): CredStatusSummary {
    if (!credentials.length) return 'rascunho';
    if (credentials.some((c) => c.id_access_status === STATUS_APROVADO)) return 'aprovado';
    if (
      credentials.some(
        (c) =>
          c.id_access_status === STATUS_AGUARDANDO_PRODUTORA ||
          c.id_access_status === STATUS_AGUARDANDO_APROVACAO,
      )
    ) {
      return 'aguardando';
    }
    return 'rascunho';
  }

  private applyPendingSelection() {
    if (this.event()?.ativo === false) {
      this.notification.error('Evento desativado. Reative-o para gerenciar colaboradores.');
    }

    const companies = this.aggregatedCompanies();
    const ownId =
      this.userCompanyId != null && companies.some((c) => c.id_company === this.userCompanyId)
        ? this.userCompanyId
        : null;

    // Indicação: sempre a empresa do usuário. Query companyId só para visualização só-leitura.
    let resolvedId = ownId;
    if (ownId == null && this.pendingQueryCompanyId != null) {
      const fromQuery = companies.find((c) => c.id_company === this.pendingQueryCompanyId);
      if (fromQuery && !this.canRequestCredentialForCompany(fromQuery)) {
        resolvedId = fromQuery.id_company;
      }
    }

    this.companyId.set(resolvedId);
    const canWrite =
      resolvedId != null &&
      !!companies.find((c) => c.id_company === resolvedId && this.canRequestCredentialForCompany(c));
    this.seg.set(canWrite ? (this.pendingQuerySeg ?? 'lote') : 'ind');
    this.wizardStep.set(1);
    this.resetIndividualState();
    this.selectedLinkIds.set([]);
    if (canWrite) this.ensureRolesLoaded();
    if (resolvedId != null) this.carregarVeiculosEmpresa(resolvedId);
    else this.companyVehicles.set([]);
  }

  goWizardStep(step: WizardStep) {
    if (step === 2 && this.selectedLinkIds().length === 0) {
      this.notification.error('Selecione ao menos um dia.');
      return;
    }
    if (step === 3 && this.seg() === 'ind' && !this.canContinueIndividual()) {
      this.notification.error('Selecione um colaborador com função ou um veículo.');
      return;
    }
    if (step === 2 && this.seg() === 'ind') this.ensureRolesLoaded();
    this.wizardStep.set(step);
  }

  canContinueIndividual(): boolean {
    const hasColab = !!this.selectedColab() && this.selectedColabRoleId != null;
    const hasVeic = !!this.selectedVeic();
    return hasColab || hasVeic;
  }

  onBulkStepChange(step: BulkInnerStep) {
    if (step === 'review' || step === 'result') {
      this.wizardStep.set(3);
      return;
    }
    if (step === 'upload' && this.wizardStep() === 3) {
      this.wizardStep.set(2);
    }
  }

  backFromBulkStep3() {
    this.bulkWizard?.resetToUpload();
    this.wizardStep.set(2);
  }

  onBulkClosed() {
    if (this.wizardStep() >= 2) {
      this.setSeg('ind');
      this.wizardStep.set(2);
    }
  }

  isLinkSelected(linkId: number): boolean {
    return this.selectedLinkIds().includes(linkId);
  }

  toggleLinkSelection(linkId: number, checked: boolean) {
    const current = this.selectedLinkIds();
    if (checked) {
      if (!current.includes(linkId)) this.selectedLinkIds.set([...current, linkId]);
      return;
    }
    this.selectedLinkIds.set(current.filter((id) => id !== linkId));
  }

  selectedCountInPhase(group: PhaseDayGroup): number {
    const selected = new Set(this.selectedLinkIds());
    return group.days.filter((d) => selected.has(d.id_event_day_company)).length;
  }

  isPhaseFullySelected(group: PhaseDayGroup): boolean {
    return group.days.length > 0 && this.selectedCountInPhase(group) === group.days.length;
  }

  isPhasePartiallySelected(group: PhaseDayGroup): boolean {
    const n = this.selectedCountInPhase(group);
    return n > 0 && n < group.days.length;
  }

  togglePhaseSelection(group: PhaseDayGroup, checked: boolean) {
    const ids = group.days.map((d) => d.id_event_day_company);
    const current = new Set(this.selectedLinkIds());
    if (checked) {
      for (const id of ids) current.add(id);
    } else {
      for (const id of ids) current.delete(id);
    }
    this.selectedLinkIds.set([...current]);
  }

  credDayLabel(cred: CredentialItem): string {
    const agg = this.selectedCompany();
    const link = agg?.links.find((l) => l.id_event_day_company === cred.id_event_day_company);
    const phase = link?.phase || '';
    const date = cred.event_day?.date || link?.date || '';
    const dateBr = date ? formatDateBr(date) : '';
    if (phase && dateBr) return `${phase} · ${dateBr}`;
    return phase || dateBr || '—';
  }

  private requireSelectedLinkIds(): number[] | null {
    const ids = this.selectedLinkIds();
    if (!ids.length) {
      this.notification.error('Selecione ao menos um dia.');
      return null;
    }
    return ids;
  }

  setSeg(seg: PageSeg) {
    if (seg !== this.seg()) {
      this.bulkWizard?.reset();
      if (this.wizardStep() > 2) this.wizardStep.set(2);
    }
    this.seg.set(seg);
    if (seg === 'ind') this.ensureRolesLoaded();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { seg },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private ensureRolesLoaded() {
    if (this.roles().length === 0) {
      this.collaboratorService.listRoles().subscribe({
        next: (res) => this.roles.set(res.roles),
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar funções.'),
      });
    }
  }

  private resetIndividualState() {
    this.individualSubmitting.set(false);
    this.colabSearching.set(false);
    this.colabResults.set([]);
    this.selectedColab.set(null);
    this.selectedColabRoleId = null;
    this.colabSearchQuery = '';
    this.veicSearching.set(false);
    this.veicResults.set([]);
    this.selectedVeic.set(null);
    this.veicSearchQuery = '';
    if (this.colabTimer) clearTimeout(this.colabTimer);
    if (this.veicTimer) clearTimeout(this.veicTimer);
  }

  onColabSearch(term: string) {
    this.colabSearchQuery = term;
    if (this.colabTimer) clearTimeout(this.colabTimer);
    this.selectedColab.set(null);
    const q = term.trim();
    if (q.length < 2) {
      this.colabResults.set([]);
      this.colabSearching.set(false);
      return;
    }
    this.colabTimer = setTimeout(() => this.buscarColaboradores(q), 300);
  }

  private buscarColaboradores(term: string) {
    this.colabSearching.set(true);
    this.collaboratorService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.colabSearching.set(false);
        this.colabResults.set(res.collaborators);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.colabSearching.set(false);
        this.colabResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar colaboradores.');
        this.cdr.markForCheck();
      },
    });
  }

  selecionarColaboradorBusca(item: CollaboratorItem) {
    if (item.is_blocklisted) {
      this.notification.error(formatBlocklistNotice(item));
      return;
    }
    this.selectedColab.set(item);
    this.selectedColabRoleId = item.id_collaborator_role || this.roles()[0]?.id_collaborator_role || null;
    this.colabResults.set([]);
    this.colabSearchQuery = '';
    this.ensureRolesLoaded();
  }

  limparColabSelecionado() {
    this.selectedColab.set(null);
    this.selectedColabRoleId = null;
  }

  selecionarVeiculoBusca(item: VehicleItem) {
    if (item.is_blocklisted) {
      this.notification.error('Veículo está na blocklist.');
      return;
    }
    this.selectedVeic.set(item);
    this.veicResults.set([]);
    this.veicSearchQuery = '';
  }

  limparVeicSelecionado() {
    this.selectedVeic.set(null);
  }

  confirmarIndividual() {
    if (!this.canManageCompany()) {
      this.notification.error('Sem permissão para indicar nesta empresa.');
      return;
    }
    if (!this.canContinueIndividual()) {
      this.notification.error('Selecione um colaborador com função ou um veículo.');
      return;
    }
    const col = this.selectedColab();
    const roleId = this.selectedColabRoleId;
    const veic = this.selectedVeic();
    const linkIds = this.requireSelectedLinkIds();
    if (!linkIds) return;

    const afterColab = () => {
      if (veic) {
        this.vincularVeiculoSelecionado(veic, () => this.finishIndividualSuccess());
      } else {
        this.finishIndividualSuccess();
      }
    };

    if (col) {
      if (roleId == null) {
        this.notification.error('Selecione a função.');
        return;
      }
      this.vincularColaboradorEmFases(col.id_collaborator, roleId, afterColab);
      return;
    }
    if (veic) {
      this.vincularVeiculoSelecionado(veic, () => this.finishIndividualSuccess());
    }
  }

  private finishIndividualSuccess() {
    this.leaveWizardToEvent();
  }

  voltarAoEvento(): void {
    const ev = this.event();
    const publicId = ev?.public_id || ev?.id_event;
    if (!publicId) {
      void this.router.navigate(['/admin/eventos']);
      return;
    }
    void this.nav.navegar('/admin/eventos/detalhe', { public_id: String(publicId) });
  }

  private leaveWizardToEvent() {
    const eventId = this.event()?.id_event;
    if (!eventId) {
      void this.router.navigate(['/admin/eventos']);
      return;
    }
    void this.nav.navegar('/admin/eventos/detalhe', { public_id: String(this.event()?.public_id || eventId) });
  }

  private vincularColaboradorEmFases(
    idCollaborator: number,
    roleId: number,
    onSuccess?: () => void,
  ) {
    if (!this.canManageCompany()) {
      this.notification.error('Sem permissão para indicar colaboradores nesta empresa.');
      return;
    }
    const agg = this.selectedCompany();
    const linkIds = this.requireSelectedLinkIds();
    if (!agg?.links.length) {
      this.notification.error('Empresa sem vínculos de fase.');
      return;
    }
    if (!linkIds) return;
    this.individualSubmitting.set(true);
    let done = 0;
    let ok = 0;
    const finish = () => {
      done += 1;
      if (done >= linkIds.length) {
        this.individualSubmitting.set(false);
        if (ok > 0) {
          this.notification.success('Credencial solicitada.');
          onSuccess?.();
          const eventId = this.event()?.id_event;
          if (eventId) this.carregarCredenciais(eventId);
        } else {
          this.notification.error('Este colaborador já possui credencial nos dias selecionados.');
        }
        this.cdr.markForCheck();
      }
    };
    for (const linkId of linkIds) {
      this.credentialService
        .create({
          id_event_day_company: linkId,
          id_collaborator: idCollaborator,
          id_collaborator_role: roleId,
        })
        .subscribe({
          next: () => {
            ok += 1;
            finish();
          },
          error: (err) => {
            if (err instanceof HttpErrorResponse && err.status === 409) {
              finish();
              return;
            }
            this.notification.error(this.extractError(err) || 'Falha ao solicitar credencial.');
            finish();
          },
        });
    }
  }

  onVeicSearch(term: string) {
    this.veicSearchQuery = term;
    if (this.veicTimer) clearTimeout(this.veicTimer);
    const q = term.trim();
    if (q.length < 2) {
      this.veicResults.set([]);
      this.veicSearching.set(false);
      return;
    }
    this.veicTimer = setTimeout(() => this.buscarVeiculos(q), 300);
  }

  private buscarVeiculos(term: string) {
    const companyId = this.companyId();
    this.veicSearching.set(true);
    this.vehicleService
      .list(1, 15, {
        q: term,
        status: true,
        ...(companyId != null ? { id_company: companyId } : {}),
      })
      .subscribe({
        next: (res) => {
          this.veicSearching.set(false);
          this.veicResults.set(res.vehicles.filter((v) => !v.is_blocklisted));
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.veicSearching.set(false);
          this.veicResults.set([]);
          this.notification.notifyHttpError(err, 'Falha ao buscar veículos.');
          this.cdr.markForCheck();
        },
      });
  }

  private vincularVeiculoSelecionado(item: VehicleItem, onSuccess?: () => void) {
    if (!this.canManageCompany()) {
      this.notification.error('Sem permissão para vincular veículos nesta empresa.');
      return;
    }
    const ev = this.event();
    const companyId = this.companyId();
    const linkIds = this.requireSelectedLinkIds();
    if (!ev || companyId == null || !linkIds) return;
    if (item.is_blocklisted) {
      this.notification.error('Veículo está na blocklist.');
      return;
    }
    this.individualSubmitting.set(true);
    this.eventService.addCompanyVehicle(ev.id_event, companyId, item.id_vehicle, linkIds).subscribe({
      next: () => {
        this.individualSubmitting.set(false);
        this.notification.success('Veículo vinculado ao evento.');
        this.carregarVeiculosEmpresa(companyId);
        this.refreshVehicleCounts(ev.id_event);
        onSuccess?.();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.individualSubmitting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao vincular veículo.');
        this.cdr.markForCheck();
      },
    });
  }

  removerCredencial(cred: CredentialItem) {
    if (!this.canManageCompany()) return;
    const name = cred.collaborator?.name || 'colaborador';
    const day = this.credDayLabel(cred);
    Swal.fire({
      title: 'Remover colaborador?',
      text: `Remover ${name} de ${day}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.credentialService.delete(cred.id_event_day_company_collaborator).subscribe({
        next: () => {
          this.notification.success('Colaborador removido.');
          const eventId = this.event()?.id_event;
          if (eventId) this.carregarCredenciais(eventId);
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover colaborador.'),
      });
    });
  }

  removerTodasCredenciais() {
    const ev = this.event();
    const companyId = this.companyId();
    const n = this.companyCredentials().length;
    if (!ev || companyId == null || n === 0 || !this.canManageCompany()) return;
    Swal.fire({
      title: 'Remover todos?',
      text: `Remover ${n} credencial${n > 1 ? 'is' : ''} desta empresa no evento?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover todos',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.eventService.removeCompanyCredentials(ev.id_event, companyId).subscribe({
        next: (res) => {
          if (res.removed > 0 && res.skipped > 0) {
            this.notification.success(
              `${res.removed} removida${res.removed > 1 ? 's' : ''}. ${res.skipped} não puderam ser removidas (já no local).`,
            );
          } else if (res.removed > 0) {
            this.notification.success(
              res.removed === 1
                ? 'Colaborador removido.'
                : `${res.removed} colaboradores removidos.`,
            );
          } else if (res.skipped > 0) {
            this.notification.error(
              'Nenhum colaborador pôde ser removido: há pessoas no local.',
            );
          }
          this.carregarCredenciais(ev.id_event);
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover colaboradores.'),
      });
    });
  }

  removerVeiculoEvento(v: EventCompanyVehicleItem) {
    const ev = this.event();
    const companyId = this.companyId();
    if (!ev || companyId == null || !this.canManageCompany()) return;
    Swal.fire({
      title: 'Remover veículo?',
      text: `Remover ${v.plate} deste evento?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.eventService.removeCompanyVehicle(ev.id_event, companyId, v.id_vehicle).subscribe({
        next: () => {
          this.notification.success('Veículo removido.');
          this.carregarVeiculosEmpresa(companyId);
          this.refreshVehicleCounts(ev.id_event);
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover veículo.'),
      });
    });
  }

  removerTodosVeiculos() {
    const ev = this.event();
    const companyId = this.companyId();
    const n = this.companyVehicles().length;
    if (!ev || companyId == null || n === 0 || !this.canManageCompany()) return;
    Swal.fire({
      title: 'Remover todos?',
      text: `Remover ${n} veículo${n > 1 ? 's' : ''} desta empresa no evento?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover todos',
      cancelButtonText: 'Cancelar',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.eventService.removeCompanyVehicles(ev.id_event, companyId).subscribe({
        next: (res) => {
          if (res.removed > 0) {
            this.notification.success(
              res.removed === 1
                ? 'Veículo removido.'
                : `${res.removed} veículos removidos.`,
            );
          }
          this.carregarVeiculosEmpresa(companyId);
          this.refreshVehicleCounts(ev.id_event);
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover veículos.'),
      });
    });
  }

  carregarVeiculosEmpresa(companyId: number) {
    const ev = this.event();
    if (!ev) return;
    this.eventService.listCompanyVehicles(ev.id_event, companyId).subscribe({
      next: (res) => {
        this.companyVehicles.set(res.vehicles || []);
        this.vehicleCounts.update((m) => ({
          ...m,
          [companyId]: (res.vehicles || []).length,
        }));
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar veículos.'),
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

  onEventBulkCompleted() {
    this.leaveWizardToEvent();
  }

  abrirModalNovoColab() {
    this.ensureRolesLoaded();
    const types = this.documentTypes();
    this.colabForm = {
      id_collaborator_document_type: types[0]?.id_collaborator_document_type ?? null,
      id_collaborator_role: this.roles()[0]?.id_collaborator_role ?? null,
      document: '',
      name: '',
      rg: '',
      phone: '',
    };
    this.pendingColabPicture = null;
    this.showColabModal.set(true);
  }

  fecharModalNovoColab() {
    this.showColabModal.set(false);
    this.pendingColabPicture = null;
  }

  salvarNovoColaborador() {
    if (!this.canManageCompany()) {
      this.notification.error('Sem permissão para indicar colaboradores nesta empresa.');
      return;
    }
    const form = this.colabForm;
    if (
      !form.id_collaborator_document_type ||
      !form.id_collaborator_role ||
      !form.document.trim() ||
      !form.name.trim()
    ) {
      this.notification.error('Preencha tipo de documento, documento, nome e função.');
      return;
    }
    this.colabSaving.set(true);
    this.collaboratorService
      .create({
        id_collaborator_document_type: form.id_collaborator_document_type,
        id_collaborator_role: form.id_collaborator_role,
        document: form.document.trim(),
        name: form.name.trim(),
        rg: form.rg.trim() || null,
        phone: form.phone.trim() || null,
        status: true,
      })
      .subscribe({
        next: (res) => {
          const finish = (col: CollaboratorItem) => {
            this.colabSaving.set(false);
            this.fecharModalNovoColab();
            this.selectedColab.set(col);
            this.selectedColabRoleId = form.id_collaborator_role;
            this.notification.success('Colaborador cadastrado. Confirme no próximo passo.');
            this.cdr.markForCheck();
          };
          const file = this.pendingColabPicture;
          if (!file) {
            finish(res.collaborator);
            return;
          }
          this.collaboratorService.uploadPicture(res.collaborator.id_collaborator, file).subscribe({
            next: (up) => finish(up.collaborator || res.collaborator),
            error: (err) => {
              this.notification.notifyHttpError(err, 'Colaborador salvo, mas a foto não foi enviada.');
              finish(res.collaborator);
            },
          });
        },
        error: (err) => {
          this.colabSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar colaborador.');
        },
      });
  }

  abrirModalNovoVeic() {
    this.veicForm = { plate: '', brand: '', model: '', color: '', type: '', description: '' };
    this.showVeicModal.set(true);
  }

  fecharModalNovoVeic() {
    this.showVeicModal.set(false);
  }

  salvarNovoVeiculo() {
    if (!this.canManageCompany()) {
      this.notification.error('Sem permissão para vincular veículos nesta empresa.');
      return;
    }
    const companyId = this.companyId();
    const ev = this.event();
    const form = this.veicForm;
    if (
      !ev ||
      companyId == null ||
      !form.plate.trim() ||
      !form.brand.trim() ||
      !form.model.trim() ||
      !form.color.trim() ||
      !form.type.trim()
    ) {
      this.notification.error('Preencha placa, marca, modelo, cor e tipo.');
      return;
    }
    this.veicSaving.set(true);
    this.vehicleService
      .create({
        id_company: companyId,
        plate: form.plate.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        type: form.type.trim(),
        description: form.description.trim() || null,
        status: true,
      })
      .subscribe({
        next: (res) => {
          this.veicSaving.set(false);
          this.fecharModalNovoVeic();
          this.selectedVeic.set(res.vehicle);
          this.notification.success('Veículo cadastrado. Confirme no próximo passo.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.veicSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar veículo.');
        },
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
        this.refreshVehicleCounts(eventId);
        this.applyPendingSelection();
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

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
