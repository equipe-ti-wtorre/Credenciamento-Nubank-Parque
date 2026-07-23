import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import {
  EventCompanyVehicleItem,
  EventDayCompanyBrief,
  EventDetail,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import { CompanyItem } from '../../../services/company.service';
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
  STATUS_NEGADO,
  statusBadgeClass,
} from '../../../services/credential.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalComponent } from '../../../shared/modal/modal.component';
import {
  PeriodoRangePickerComponent,
  PeriodoRangeValue,
} from '../../../shared/periodo-range-picker';
import {
  BulkImportApiAdapter,
  ServiceAccessBulkImportWizardComponent,
} from '../../patrimonial/service-access-bulk-import-wizard.component';

type CredStatusSummary = 'aprovado' | 'aguardando' | 'rascunho';
type DrawerSeg = 'lote' | 'ind';

interface AggregatedCompany {
  id_company: number;
  company_name: string;
  company_type_description: string;
  phases: string[];
  linkIds: number[];
  producerIds: number[];
  credentials: CredentialItem[];
  credStatus: CredStatusSummary;
  isResponsavel: boolean;
  collaboratorCount: number;
  vehicleCount: number;
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
  selector: 'app-event-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ModalComponent,
    PeriodoRangePickerComponent,
    ServiceAccessBulkImportWizardComponent,
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
                  {{ headerStats().credRequested }}
                  <span class="evstat__sub">de <b>{{ headerStats().companies }}</b> com credencial solicitada</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div *ngIf="event()!.days.length === 0" class="empty">
          <p>Este evento não possui dias cadastrados.</p>
          <p class="mt-2 text-sm">Os dias são definidos na criação do evento.</p>
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
                    type="button"
                    class="btn btn--primary btn--sm"
                    [disabled]="aggregatedCompanies().length === 0 || !event()!.ativo"
                    (click)="abrirDrawer()"
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
                    <th>Credencial</th>
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
                    <td class="td-center"><span class="colnum">{{ row.collaboratorCount }}</span></td>
                    <td class="td-center"><span class="colnum">{{ row.vehicleCount }}</span></td>
                    <td>
                      <span class="credstatus" [ngClass]="'cs-' + row.credStatus">
                        {{ credStatusLabel(row.credStatus) }}
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
                        <button type="button" class="btn btn--ghost btn--sm" (click)="abrirDrawer(row.id_company)">
                          Colaboradores
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
                              : event()!.notified_complete_at
                                ? 'Renotificar término'
                                : 'Notificar término'
                          }}
                        </button>
                        <button
                          *ngIf="canRequestCredentialForCompany(row)"
                          type="button"
                          class="btn btn--primary btn--sm"
                          (click)="abrirDrawer(row.id_company, 'ind')"
                        >
                          Solicitar
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

      <!-- Modal editar (período + responsável) -->
      <app-modal
        [open]="showEditModal()"
        title="Editar evento"
        size="sm"
        (close)="fecharModalEditar()"
      >
        <form id="event-edit-form" class="event-edit-form" (ngSubmit)="salvarEdicao()">
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
        </form>
        <div modal-footer class="modal-footer">
          <button type="button" class="btn-action-secondary" (click)="fecharModalEditar()">Cancelar</button>
          <button type="submit" form="event-edit-form" class="btn-action-primary" [disabled]="editSaving()">
            {{ editSaving() ? 'Salvando...' : 'Salvar alterações' }}
          </button>
        </div>
      </app-modal>

      <!-- Drawer colaboradores -->
      <div class="overlay" [class.open]="showDrawer()" (click)="fecharDrawer()"></div>
      <div class="drawer" [class.open]="showDrawer()">
        <div class="drawer__head">
          <div class="drawer__top">
            <div>
              <h3 class="drawer__title">Colaboradores e veículos</h3>
              <p class="drawer__sub" *ngIf="drawerAggregatedCompany() as dc">
                {{ dc.company_name }} · {{ dc.collaboratorCount }} colab. · {{ dc.vehicleCount }} veíc.
              </p>
              <p class="drawer__sub" *ngIf="!drawerAggregatedCompany()">Selecione a empresa</p>
              <div class="drawer__phases" *ngIf="drawerAggregatedCompany() as dc">
                <span *ngFor="let ph of dc.phases" class="miniphase" [ngClass]="phaseClass(ph)">
                  <span class="dot"></span>{{ ph }}
                </span>
              </div>
            </div>
            <button type="button" class="iconbtn" (click)="fecharDrawer()" aria-label="Fechar">✕</button>
          </div>
          <div class="field mt-3" *ngIf="!drawerCompanyId() && aggregatedCompanies().length > 0">
            <label class="label" for="drawer-company">Empresa</label>
            <select
              id="drawer-company"
              class="select"
              [ngModel]="drawerCompanyId()"
              (ngModelChange)="onDrawerCompanyChange($event)"
              name="drawerCompany"
            >
              <option [ngValue]="null">Selecione</option>
              <option *ngFor="let c of aggregatedCompanies()" [ngValue]="c.id_company">
                {{ c.company_name }}
              </option>
            </select>
          </div>
        </div>

        <div class="drawer__body" *ngIf="drawerAggregatedCompany(); else drawerPickCompany">
          <div class="seg">
            <button type="button" [class.on]="drawerSeg() === 'lote'" (click)="setDrawerSeg('lote')">
              Importar em lote
            </button>
            <button type="button" [class.on]="drawerSeg() === 'ind'" (click)="setDrawerSeg('ind')">
              Adicionar individual
            </button>
          </div>

          <!-- Lote unificado (padrão SA) -->
          <ng-container *ngIf="drawerSeg() === 'lote'">
            <ng-container *ngIf="canManageDrawerCompany(); else loteReadonly">
              <app-service-access-bulk-import-wizard
                [open]="true"
                [embedded]="true"
                [apiAdapter]="eventBulkAdapter"
                [accessName]="event()?.name || 'Evento'"
                [companyName]="drawerAggregatedCompany()?.company_name || ''"
                (completed)="onEventBulkCompleted()"
                (closed)="setDrawerSeg('ind')"
              />
            </ng-container>
            <ng-template #loteReadonly>
              <p class="text-sm text-slate-500">Somente visualização — sem permissão para importar.</p>
            </ng-template>
          </ng-container>

          <!-- Individual: busca tipada + cadastro -->
          <ng-container *ngIf="drawerSeg() === 'ind'">
            <ng-container *ngIf="canManageDrawerCompany(); else indReadonly">
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
                      <button type="button" class="search-dd__btn" (click)="selecionarColaboradorBusca(c)">
                        <span class="font-medium">{{ c.name }}</span>
                        <span class="meta">{{ maskDocument(c.document) }}</span>
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
                  <button
                    type="button"
                    class="btn btn--primary w-full mt-3"
                    [disabled]="individualSubmitting()"
                    (click)="vincularColaboradorSelecionado()"
                  >
                    {{ individualSubmitting() ? 'Vinculando...' : 'Solicitar credencial' }}
                  </button>
                </div>
                <button type="button" class="btn btn--ghost w-full mt-2" (click)="abrirModalNovoColab()">
                  Novo colaborador
                </button>
              </div>

              <div class="card-box mt-3">
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
                      <button type="button" class="search-dd__btn" (click)="vincularVeiculoExistente(v)">
                        <span class="font-medium font-mono">{{ v.plate }}</span>
                        <span class="meta">{{ v.brand || '—' }} {{ v.model || '' }}</span>
                      </button>
                    </li>
                  </ul>
                </div>
                <button type="button" class="btn btn--ghost w-full mt-2" (click)="abrirModalNovoVeic()">
                  Novo veículo
                </button>
              </div>
            </ng-container>
            <ng-template #indReadonly>
              <p class="text-sm text-slate-500">Somente visualização — sem permissão para adicionar.</p>
            </ng-template>
          </ng-container>

          <p class="listhead">Credenciais existentes</p>
          <div class="clist" *ngIf="drawerCredentials().length > 0; else noDrawerCreds">
            <div *ngFor="let cred of drawerCredentials()" class="cli">
              <div class="cli__av">{{ initials(cred.collaborator.name) }}</div>
              <div class="cli__body">
                <div class="cli__name">{{ cred.collaborator.name }}</div>
                <div class="cli__meta">
                  {{ cred.role_description }} · {{ maskDocument(cred.collaborator.document) }}
                </div>
              </div>
              <span class="cli__st" [ngClass]="statusBadgeClass(cred.id_access_status)">
                {{ cred.access_status_description }}
              </span>
              <div class="flex flex-col gap-1">
                <button
                  *ngIf="canProdutoraAct(cred)"
                  type="button"
                  class="btn btn--ghost btn--sm"
                  (click)="aprovarProdutora(cred)"
                >
                  Aprovar
                </button>
                <button
                  *ngIf="canProdutoraAct(cred)"
                  type="button"
                  class="btn btn--ghost btn--sm"
                  (click)="negarCredencial(cred)"
                >
                  Negar
                </button>
                <button
                  *ngIf="canFinalApproveAct(cred)"
                  type="button"
                  class="btn btn--primary btn--sm"
                  (click)="aprovarAdmin(cred)"
                >
                  Aprovar
                </button>
                <button
                  *ngIf="canFinalApproveAct(cred)"
                  type="button"
                  class="btn btn--ghost btn--sm"
                  (click)="negarCredencial(cred)"
                >
                  Negar
                </button>
              </div>
            </div>
          </div>
          <ng-template #noDrawerCreds>
            <p class="text-sm text-slate-500 mt-2">Nenhuma credencial cadastrada para esta empresa.</p>
          </ng-template>

          <p class="listhead">Veículos vinculados</p>
          <div class="clist" *ngIf="drawerVehicles().length > 0; else noDrawerVeics">
            <div *ngFor="let v of drawerVehicles()" class="cli">
              <div class="cli__av">{{ (v.plate || '?').slice(0, 2) }}</div>
              <div class="cli__body">
                <div class="cli__name font-mono">{{ v.plate }}</div>
                <div class="cli__meta">{{ v.brand || '—' }} {{ v.model || '' }} · {{ v.color || '—' }}</div>
              </div>
              <span class="cli__st">{{ v.access_status_description }}</span>
              <button
                *ngIf="canManageDrawerCompany()"
                type="button"
                class="btn btn--ghost btn--sm"
                (click)="removerVeiculoEvento(v)"
              >
                Remover
              </button>
            </div>
          </div>
          <ng-template #noDrawerVeics>
            <p class="text-sm text-slate-500 mt-2">Nenhum veículo vinculado a esta empresa.</p>
          </ng-template>
        </div>

        <ng-template #drawerPickCompany>
          <div class="drawer__body">
            <p class="text-sm text-slate-500">Selecione uma empresa acima para gerenciar colaboradores e veículos.</p>
          </div>
        </ng-template>

        <div class="drawer__foot" *ngIf="drawerAggregatedCompany() as dc">
          <span class="text-sm text-slate-600 flex-1">
            {{ dc.collaboratorCount }} colab. · {{ dc.vehicleCount }} veíc. ·
            {{ drawerPendingCount() }} aguardando aprovação
          </span>
          <button type="button" class="btn btn--ghost btn--sm" (click)="fecharDrawer()">Fechar</button>
        </div>
      </div>

      <!-- Modal novo colaborador -->
      <app-modal
        [open]="showColabModal()"
        title="Novo colaborador"
        subtitle="Cadastro completo e vínculo ao evento."
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
            {{ colabSaving() ? 'Salvando...' : 'Cadastrar e vincular' }}
          </button>
        </div>
      </app-modal>

      <!-- Modal novo veículo -->
      <app-modal
        [open]="showVeicModal()"
        title="Novo veículo"
        subtitle="Cadastro completo e vínculo ao evento."
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
            {{ veicSaving() ? 'Salvando...' : 'Cadastrar e vincular' }}
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
  readonly statusBadgeClass = statusBadgeClass;
  readonly maskDocument = maskDocument;

  event = signal<EventDetail | null>(null);
  companies = signal<CompanyItem[]>([]);
  producers = signal<EventDayCompanyBrief[]>([]);
  credentials = signal<CredentialItem[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  loading = signal(true);
  activeTab = signal('Todas');

  showVincularModal = signal(false);
  vincularEditCompanyId = signal<number | null>(null);
  vincularSelectedCompanyId = signal<number | null>(null);
  vincularSelectedPhases = signal<string[]>([]);
  vincularSaving = signal(false);

  showDrawer = signal(false);
  drawerCompanyId = signal<number | null>(null);
  drawerSeg = signal<DrawerSeg>('lote');

  showEditModal = signal(false);
  editSaving = signal(false);
  editPeriodTouched = signal(false);
  editPeriodRange: PeriodoRangeValue | null = null;
  statusToggling = signal(false);
  prefSaving = signal(false);
  submitApprovalSaving = signal(false);
  notifyCompleteSaving = signal(false);
  notifyCompleteCompanyId = signal<number | null>(null);

  individualSubmitting = signal(false);
  colabSearching = signal(false);
  colabResults = signal<CollaboratorItem[]>([]);
  selectedColab = signal<CollaboratorItem | null>(null);
  selectedColabRoleId: number | null = null;
  colabSearchQuery = '';
  private colabTimer: ReturnType<typeof setTimeout> | null = null;

  veicSearching = signal(false);
  veicResults = signal<VehicleItem[]>([]);
  veicSearchQuery = '';
  private veicTimer: ReturnType<typeof setTimeout> | null = null;

  drawerVehicles = signal<EventCompanyVehicleItem[]>([]);
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
  veicForm = {
    plate: '',
    brand: '',
    model: '',
    color: '',
    type: '',
    description: '',
  };

  responsavelFormId: number | null = null;

  isAdmin = false;
  userRole = '';
  userCompanyId: number | null = null;
  isPartnerCompanyUser = false;

  eventBulkAdapter: BulkImportApiAdapter = {
    downloadTemplate: () => {
      const ev = this.event();
      const companyId = this.drawerCompanyId();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      return this.eventService.downloadCompanyBulkTemplate(ev.id_event, companyId);
    },
    preview: (file: File) => {
      const ev = this.event();
      const companyId = this.drawerCompanyId();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      return this.eventService.previewCompanyBulkImport(ev.id_event, companyId, file);
    },
    confirm: (previewToken, decisoes) => {
      const ev = this.event();
      const companyId = this.drawerCompanyId();
      if (!ev || companyId == null) throw new Error('Contexto inválido');
      return this.eventService.confirmCompanyBulkImport(ev.id_event, companyId, previewToken, decisoes);
    },
    templateFilename: 'template-evento-colaboradores-veiculos.xlsx',
    confirmLabel: 'Importar para o evento',
  };

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
    let credRequested = 0;
    for (const c of companies) {
      vehicles += c.vehicleCount || 0;
      if (c.credStatus !== 'rascunho') credRequested += 1;
      for (const cred of c.credentials) {
        collabIds.add(cred.id_collaborator);
      }
    }
    return {
      companies: companies.length,
      collaborators: collabIds.size,
      vehicles,
      credRequested,
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

  drawerAggregatedCompany = computed(() => {
    const id = this.drawerCompanyId();
    if (id == null) return null;
    return this.aggregatedCompanies().find((c) => c.id_company === id) ?? null;
  });

  drawerCredentials = computed(() => {
    const agg = this.drawerAggregatedCompany();
    if (!agg) return [];
    const map = new Map<number, CredentialItem>();
    for (const cred of agg.credentials) {
      const existing = map.get(cred.id_collaborator);
      if (!existing || cred.id_access_status === STATUS_APROVADO) {
        map.set(cred.id_collaborator, cred);
      }
    }
    return [...map.values()].sort((a, b) => a.collaborator.name.localeCompare(b.collaborator.name));
  });

  drawerPendingCount = computed(() => {
    const agg = this.drawerAggregatedCompany();
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
    this.userCompanyId = user?.id_company != null ? Number(user.id_company) : null;
    this.isPartnerCompanyUser =
      this.userRole === 'PADRAO' ||
      this.userRole === 'EMPRESA_GESTOR' ||
      this.userRole === 'EMPRESA_SOLICITANTE';

    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tipos de documento.'),
    });

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

  credStatusLabel(status: CredStatusSummary): string {
    switch (status) {
      case 'aprovado':
        return 'Aprovado';
      case 'aguardando':
        return 'Aguardando';
      default:
        return 'Rascunho';
    }
  }

  setActiveTab(tab: string) {
    this.activeTab.set(tab);
  }

  countForTab(tab: string): number {
    if (tab === 'Todas') return this.aggregatedCompanies().length;
    return this.aggregatedCompanies().filter((c) => c.phases.includes(tab)).length;
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
    if (this.isAdmin) return true;
    if (!this.canManageCompanies() && this.event()?.is_solicitante) return false;
    if (this.userCompanyId == null) return false;
    const cid = this.userCompanyId;
    return row.id_company === cid || row.producerIds.includes(cid);
  }

  canProdutoraAct(cred: CredentialItem): boolean {
    const responsavelId = this.event()?.id_company_responsavel;
    const isProdutoraActor = this.userRole === 'PRODUTORA' || this.canManageCompanies();
    return (
      isProdutoraActor &&
      cred.id_access_status === STATUS_AGUARDANDO_PRODUTORA &&
      (cred.event_day_company.id_producer === this.userCompanyId || responsavelId === this.userCompanyId)
    );
  }

  canFinalApproveAct(cred: CredentialItem): boolean {
    return (
      !!this.event()?.can_approve_credentials &&
      cred.id_access_status === STATUS_AGUARDANDO_APROVACAO
    );
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

  abrirDrawer(companyId?: number, seg?: DrawerSeg) {
    if (this.event()?.ativo === false) {
      this.notification.error('Evento desativado. Reative-o para gerenciar colaboradores.');
      return;
    }
    const resolvedId =
      companyId ??
      (this.isPartnerScopedView() ? this.userCompanyId : null);
    this.drawerCompanyId.set(resolvedId);
    this.drawerSeg.set(seg ?? 'lote');
    this.resetIndividualState();
    this.showDrawer.set(true);
    this.ensureRolesLoaded();
    if (resolvedId != null) this.carregarVeiculosEmpresa(resolvedId);
  }

  fecharDrawer() {
    this.showDrawer.set(false);
    this.drawerCompanyId.set(null);
    this.resetIndividualState();
    this.drawerVehicles.set([]);
  }

  onDrawerCompanyChange(companyId: number | null) {
    this.drawerCompanyId.set(companyId);
    this.resetIndividualState();
    if (companyId != null) this.carregarVeiculosEmpresa(companyId);
    else this.drawerVehicles.set([]);
  }

  setDrawerSeg(seg: DrawerSeg) {
    this.drawerSeg.set(seg);
    if (seg === 'ind') this.ensureRolesLoaded();
  }

  canManageDrawerCompany(): boolean {
    const row = this.drawerAggregatedCompany();
    if (!row) return false;
    return this.canRequestCredentialForCompany(row);
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
        this.colabResults.set(res.collaborators.filter((c) => !c.is_blacklisted));
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
    if (item.is_blacklisted) {
      this.notification.error('Colaborador está na blacklist.');
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

  vincularColaboradorSelecionado() {
    const col = this.selectedColab();
    const roleId = this.selectedColabRoleId;
    if (!col) return;
    if (roleId == null) {
      this.notification.error('Selecione a função.');
      return;
    }
    this.vincularColaboradorEmFases(col.id_collaborator, roleId, () => {
      this.limparColabSelecionado();
    });
  }

  private vincularColaboradorEmFases(
    idCollaborator: number,
    roleId: number,
    onSuccess?: () => void,
  ) {
    const agg = this.drawerAggregatedCompany();
    if (!agg?.linkIds.length) {
      this.notification.error('Empresa sem vínculos de fase.');
      return;
    }
    this.individualSubmitting.set(true);
    let done = 0;
    let ok = 0;
    const finish = () => {
      done += 1;
      if (done >= agg.linkIds.length) {
        this.individualSubmitting.set(false);
        if (ok > 0) {
          this.notification.success('Credencial solicitada.');
          onSuccess?.();
          const eventId = this.event()?.id_event;
          if (eventId) this.carregarCredenciais(eventId);
        } else {
          this.notification.error('Este colaborador já possui credencial para todas as fases.');
        }
        this.cdr.markForCheck();
      }
    };
    for (const linkId of agg.linkIds) {
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
    const companyId = this.drawerCompanyId();
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
          this.veicResults.set(res.vehicles.filter((v) => !v.is_blacklisted));
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

  vincularVeiculoExistente(item: VehicleItem) {
    const ev = this.event();
    const companyId = this.drawerCompanyId();
    if (!ev || companyId == null) return;
    if (item.is_blacklisted) {
      this.notification.error('Veículo está na blacklist.');
      return;
    }
    this.veicResults.set([]);
    this.veicSearchQuery = '';
    this.eventService.addCompanyVehicle(ev.id_event, companyId, item.id_vehicle).subscribe({
      next: () => {
        this.notification.success('Veículo vinculado ao evento.');
        this.carregarVeiculosEmpresa(companyId);
        this.refreshVehicleCounts(ev.id_event);
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao vincular veículo.'),
    });
  }

  removerVeiculoEvento(v: EventCompanyVehicleItem) {
    const ev = this.event();
    const companyId = this.drawerCompanyId();
    if (!ev || companyId == null) return;
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

  carregarVeiculosEmpresa(companyId: number) {
    const ev = this.event();
    if (!ev) return;
    this.eventService.listCompanyVehicles(ev.id_event, companyId).subscribe({
      next: (res) => {
        this.drawerVehicles.set(res.vehicles || []);
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
    const ev = this.event();
    const companyId = this.drawerCompanyId();
    if (!ev) return;
    this.carregarCredenciais(ev.id_event);
    if (companyId != null) this.carregarVeiculosEmpresa(companyId);
    this.refreshVehicleCounts(ev.id_event);
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
    this.showColabModal.set(true);
  }

  fecharModalNovoColab() {
    this.showColabModal.set(false);
  }

  salvarNovoColaborador() {
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
          this.colabSaving.set(false);
          this.fecharModalNovoColab();
          this.vincularColaboradorEmFases(
            res.collaborator.id_collaborator,
            form.id_collaborator_role!,
          );
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
    const companyId = this.drawerCompanyId();
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
          this.eventService.addCompanyVehicle(ev.id_event, companyId, res.vehicle.id_vehicle).subscribe({
            next: () => {
              this.notification.success('Veículo cadastrado e vinculado.');
              this.carregarVeiculosEmpresa(companyId);
              this.refreshVehicleCounts(ev.id_event);
            },
            error: (err) =>
              this.notification.notifyHttpError(err, 'Veículo criado, mas falhou o vínculo ao evento.'),
          });
        },
        error: (err) => {
          this.veicSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar veículo.');
        },
      });
  }

  abrirModalEditar() {
    const ev = this.event();
    if (!ev || !this.canEditEvent() || !ev.ativo) return;
    const start = String(ev.start || '').slice(0, 10);
    const end = String(ev.end || '').slice(0, 10);
    this.editPeriodRange = start && end ? { inicio: start, fim: end } : null;
    this.editPeriodTouched.set(false);
    this.responsavelFormId = ev.id_company_responsavel ?? null;
    this.showEditModal.set(true);
    if (this.canChangeResponsavel() && this.producers().length === 0) {
      this.carregarProdutoras();
    }
  }

  fecharModalEditar() {
    this.showEditModal.set(false);
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

    if (!periodChanged && !responsavelChanged) {
      this.fecharModalEditar();
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
      if (reloadLinks) {
        this.carregarCredenciais(ev.id_event);
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
      this.eventService
        .updatePeriod(ev.id_event, {
          start: periodStart,
          end: periodEnd,
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
                ? 'Período atualizado. Evento enviado novamente para aprovação.'
                : 'Período atualizado.',
              false,
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
        .updateStatus(cred.id_event_day_company_collaborator, { id_access_status: STATUS_APROVADO })
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
          id_access_status: STATUS_NEGADO,
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
