import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { entityId } from '../../core/public-id.adapter';
import { NavigationStateService } from '../../core/services/navigation-state.service';
import { redirecionarSeAcessoNegado } from '../../core/utils/acesso-negado';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { NotificationService } from '../../core/services/notification.service';
import { extractBlocklistNotice, formatBlocklistNotice } from '../../shared/blocklist-notice';
import {
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
  formatCpf,
} from '../../services/collaborator.service';
import { STATUS_APROVADO, STATUS_NEGADO } from '../../services/credential.service';
import { CompanyService, formatCnpj } from '../../services/company.service';
import { MicrosoftProfileService } from '../../core/services/microsoft-profile.service';
import {
  AccreditationCompany,
  AccreditationCompanyBrief,
  AccreditationSector,
  AccreditationCollaborator,
  AccreditationInternal,
  BLOCK_REASONS,
  BraceletType,
  EventAccreditationItem,
  EventAccreditationKpis,
  EventAccreditationService,
  formatDateBr,
  formatDateTimeBr,
  formatEventDatesBr,
  normalizeEventDates,
  isCollaboratorApproved,
  isCollaboratorBlocked,
  isCollaboratorPending,
  kindLabel,
} from '../../services/event-accreditation.service';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
} from '../../shared/actions';
import { BraceletChipComponent, BraceletSelectComponent, normalizeBraceletColor } from '../../shared/bracelet-chip';
import { CollaboratorPhotoComponent } from '../../shared/collaborator-photo/collaborator-photo.component';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  BulkImportApiAdapter,
  ServiceAccessBulkImportWizardComponent,
} from '../patrimonial/service-access-bulk-import-wizard.component';
import {
  MonthCalendarComponent,
  MonthCalendarTick,
  formatIsoBr,
} from '../../shared/month-calendar';

function emptyKpis(): EventAccreditationKpis {
  return {
    companies_total: 0,
    companies_pending: 0,
    companies_waiting: 0,
    companies_approved: 0,
    companies_denied: 0,
    collaborators_total: 0,
    collaborators_waiting: 0,
    collaborators_approved: 0,
    collaborators_denied: 0,
    internals_total: 0,
    internals_waiting: 0,
    internals_approved: 0,
    internals_denied: 0,
  };
}

function fromIsoToSp(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '00:00' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '00:00' };
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date, time };
}

@Component({
  selector: 'app-event-accreditation-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MonthCalendarComponent,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    BraceletChipComponent,
    BraceletSelectComponent,
    ModalComponent,
    CollaboratorPhotoComponent,
    ServiceAccessBulkImportWizardComponent,
  ],
  template: `
    <div class="ead">
      <a class="ead-back" routerLink="/admin/credenciamento-eventos">← Voltar para a lista</a>

      @if (loading()) {
        <p class="ead-loading">Carregando...</p>
      } @else if (item(); as ev) {
        <section class="ead-hero">
          <div class="ead-hero__cover">
            @if (coverSrc()) {
              <img [src]="coverSrc()" [alt]="'Arte do evento ' + ev.name" />
            }
          </div>
          <div class="ead-hero__panel">
            <div class="ead-hero__row">
              <div>
                <h2 class="ead-hero__title">{{ ev.name }}</h2>
                <div class="ead-hero__meta">
                  <span class="ead-chip ead-chip--tipo ead-chip--plain">{{ kindLabel(ev.event_kind) }}</span>
                  <span class="ead-chip" [ngClass]="'ead-chip--' + statusChip(ev.id_access_status)">
                    {{ eventStatusLabel(ev) }}
                  </span>
                  @if (ev.can_decide && pendingTotal(ev)) {
                    <button
                      type="button"
                      class="ead-chip ead-chip--wait ead-chip--btn"
                      [disabled]="acting()"
                      (click)="aprovarTodosPendentes()"
                    >
                      {{ pendingChipLabel(ev) }}
                    </button>
                  } @else {
                    <span class="ead-chip" [class.ead-chip--ok]="!pendingTotal(ev)" [class.ead-chip--wait]="pendingTotal(ev)">
                      {{ pendingChipLabel(ev) }}
                    </span>
                  }
                  <span class="ead-chip ead-chip--quiet ead-chip--plain">{{ formatEventDatesBr(ev.event_dates, ev.start, ev.end) }}</span>
                </div>
              </div>
              @if (!isInternalOnlyView(ev)) {
                <div class="ead-hero__actions">
                  <button
                    type="button"
                    class="ead-hero__action ead-hero__action--primary"
                    [disabled]="!ev.can_export || exporting()"
                    (click)="exportar()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M12 15V3" />
                    </svg>
                    {{ exporting() ? 'Exportando...' : 'Exportar lista e fotos' }}
                  </button>
                  @if (ev.can_notify) {
                    <button
                      type="button"
                      class="ead-hero__action ead-hero__action--ghost"
                      [disabled]="acting() || !hasCompaniesInIndication(ev)"
                      (click)="notificar()"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      Notificar empresas
                    </button>
                  }
                  @if (showHeroMenu(ev)) {
                    <div class="ead-hero__kebab">
                    <app-action-dropdown>
                      @if (ev.can_manage && !editing()) {
                        <button appActionDropdownItem type="button" (click)="beginEdit()">
                          <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                          Editar evento
                        </button>
                      }
                      @if (ev.can_manage) {
                        <button
                          appActionDropdownItem
                          type="button"
                          [disabled]="acting()"
                          (click)="duplicarCredenciamento()"
                        >
                          <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Duplicar evento
                        </button>
                      }
                      @if ((ev.can_delete || ev.can_manage) && !editing()) {
                        @if (ev.can_manage) {
                          <hr class="action-dropdown__divider" />
                        }
                        <button
                          appActionDropdownItem
                          type="button"
                          [danger]="true"
                          [disabled]="acting()"
                          (click)="excluirCredenciamento()"
                        >
                          <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                          Excluir evento
                        </button>
                      }
                    </app-action-dropdown>
                    </div>
                  }
                </div>
              }
            </div>
            <div class="ead-hero__facts">
              <div class="ead-hero__facts-grid">
                <div>
                  <p class="ead-fact__k">Prazo de indicação</p>
                  <p class="ead-fact__v">
                    {{ formatShortRange(ev.inscription_start, ev.inscription_end) }}
                    <span class="ead-fact__aside">{{ prazoHeroLabel(ev) }}</span>
                  </p>
                  <div class="ead-bar" aria-hidden="true"><i [style.width.%]="prazoPct(ev)"></i></div>
                </div>
                <div>
                  <p class="ead-fact__k">
                    Setores participantes
                    <span class="ead-fact__aside">{{ setoresSummary(ev) }}</span>
                  </p>
                  <ul class="ead-hero__setores">
                    @for (s of visibleHeroSetores(ev); track s.id_setor) {
                      <li>
                        <span class="ead-setor-chip">
                          {{ s.nome }}
                          <span class="ead-setor-chip__count">{{ s.approvers_count ?? 0 }} aprov.</span>
                        </span>
                      </li>
                    }
                    @if (heroSetores(ev).length > heroSetorLimit) {
                      <li>
                        <button
                          type="button"
                          class="ead-setor-chip ead-setor-chip--more"
                          [attr.aria-expanded]="sectorsExpanded()"
                          (click)="toggleHeroSetores()"
                        >
                          {{ sectorsExpanded() ? 'ver menos' : '+' + hiddenHeroSetoresCount(ev) }}
                        </button>
                      </li>
                    }
                  </ul>
                </div>
              </div>
              <div>
                <p class="ead-fact__k">
                  Pulseiras liberadas
                  <span class="ead-fact__aside">
                    {{ heroBracelets(ev).length }} {{ heroBracelets(ev).length === 1 ? 'tipo' : 'tipos' }}
                  </span>
                </p>
                <ul class="ead-hero__bracelet-list">
                  @for (b of heroBracelets(ev); track b.id_bracelet_type) {
                    <li class="ead-hero__bracelet">
                      <i aria-hidden="true"></i>
                      <span [style.background]="braceletColor(b)">{{ b.name }}</span>
                    </li>
                  }
                </ul>
              </div>
            </div>
          </div>
        </section>

        @if (editing()) {
          <section class="ead-edit">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
              <div>
                <h3 class="ead-edit__h">Editar credenciamento</h3>
                <p class="ead-edit__sub">Nome, foto, período de indicação, dia do evento, pulseiras e setores participantes. Empresas são indicadas por cada setor.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="ead-btn" [disabled]="saving()" (click)="cancelEdit()">Cancelar</button>
                <button type="button" class="ead-btn ead-btn--primary" [disabled]="saving() || !canSaveEdit()" (click)="salvarEdicao()">
                  {{ saving() ? 'Salvando...' : 'Salvar' }}
                </button>
              </div>
            </div>

            <section class="mb-5">
              <label class="ead-edit__field ead-edit__field--name" for="ead-edit-name">
                <span>Nome do evento</span>
                <input
                  id="ead-edit-name"
                  type="text"
                  maxlength="200"
                  name="ead_edit_name"
                  placeholder="Ex.: Showday — Setembro"
                  [ngModel]="editName()"
                  (ngModelChange)="editName.set($event)"
                />
              </label>
            </section>

            <section class="mb-5">
              <h4 class="ead-edit__h">Foto do evento</h4>
              <p class="ead-edit__sub">Identifica o evento na lista e no e-mail. JPEG, PNG ou WebP, até 2 MB.</p>
              <div class="ead-cover-edit">
                <div class="ead-cover-edit__preview" [class.empty]="!editCoverPreview()">
                  @if (editCoverPreview()) {
                    <img [src]="editCoverPreview()" alt="Prévia da capa" />
                  } @else {
                    <span>Sem foto</span>
                  }
                </div>
                <div class="ead-cover-edit__actions">
                  <label class="ead-cover-edit__pick">
                    <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onEditCoverPick($event)" />
                    {{ editCoverPreview() ? 'Trocar foto' : 'Escolher foto' }}
                  </label>
                  @if (editCoverFile) {
                    <button type="button" class="ead-cover-edit__clear" (click)="clearEditCover()">
                      Desfazer troca
                    </button>
                  }
                </div>
              </div>
            </section>

            <div class="ead-edit__grid">
              <section>
                <h4 class="ead-edit__h">Janela de indicação</h4>
                <p class="ead-edit__sub">Quando as empresas podem indicar colaboradores.</p>
                <div class="ead-edit__value" [class.empty]="!insStart()" [class.bad]="!!dateConflict() && !!insWindowEnd()">
                  {{ insValueLabel() }}
                </div>
                <app-month-calendar
                  mode="range"
                  [rangeStart]="insStart()"
                  [rangeEnd]="insEnd()"
                  [ticks]="insTicks()"
                  [footerText]="insFooter()"
                  (daySelect)="onInsDay($event)"
                  (cleared)="clearIns()"
                />
                <div class="ead-edit__times">
                  <label class="ead-edit__field">
                    <span>Abre às</span>
                    <input type="time" [(ngModel)]="insTimeStart" name="ead_ins_start" />
                  </label>
                  <label class="ead-edit__field">
                    <span>Fecha às</span>
                    <input type="time" [(ngModel)]="insTimeEnd" name="ead_ins_end" />
                  </label>
                </div>
              </section>

              <section>
                <h4 class="ead-edit__h">Dias do evento</h4>
                <p class="ead-edit__sub">Datas em que os credenciados entram no parque.</p>
                <div class="ead-edit__value" [class.empty]="!eventDays().size">
                  {{ eventValueLabel() }}
                </div>
                <app-month-calendar
                  mode="multi"
                  [selectedDates]="sortedEventDays()"
                  [ticks]="eventTicks()"
                  [footerText]="eventFooter()"
                  (daySelect)="onEventDay($event)"
                  (cleared)="clearEventDay()"
                />
              </section>
            </div>

            @if (dateConflict(); as bad) {
              <p class="ead-edit__alert">{{ bad }}</p>
            }

            <section class="mt-5 ead-edit__switches">
              <label class="ead-switch">
                <input
                  type="checkbox"
                  role="switch"
                  [checked]="editInternalEnabled()"
                  [attr.aria-checked]="editInternalEnabled()"
                  (change)="editInternalEnabled.set(($any($event.target).checked))"
                />
                <span class="ead-switch__ui" aria-hidden="true"></span>
                <span class="ead-switch__txt">Credenciamento interno</span>
              </label>
              <label class="ead-switch">
                <input
                  type="checkbox"
                  role="switch"
                  [checked]="editPhotoRequired()"
                  [attr.aria-checked]="editPhotoRequired()"
                  (change)="editPhotoRequired.set(($any($event.target).checked))"
                />
                <span class="ead-switch__ui" aria-hidden="true"></span>
                <span class="ead-switch__txt">Foto do colaborador obrigatória</span>
              </label>
              <p class="ead-edit__sub">O setor só avisa o responsável depois que todos os indicados tiverem foto. A importação não exige foto.</p>
            </section>

            <section class="mt-5">
              <h4 class="ead-edit__h">Tipos de pulseira</h4>
              <p class="ead-edit__sub">Somente tipos compatíveis com {{ kindLabel(ev.event_kind) }}. Tipos já usados em colaboradores não podem ser removidos.</p>
              <div class="ead-chips">
                @for (b of catalogBracelets(); track b.id_bracelet_type) {
                  <button
                    type="button"
                    class="ead-br-pick"
                    [class.on]="isBraceletOn(b.id_bracelet_type)"
                    [class.locked]="isBraceletLocked(b.id_bracelet_type)"
                    (click)="toggleBracelet(b.id_bracelet_type)"
                  >
                    <app-bracelet-chip
                      [name]="b.name"
                      [icon]="b.icon"
                      [color]="b.color"
                      [selectable]="true"
                      [selected]="isBraceletOn(b.id_bracelet_type)"
                    />
                  </button>
                } @empty {
                  <p class="text-sm text-[var(--app-text-muted)]">Nenhum tipo de pulseira disponível para este evento.</p>
                }
              </div>
            </section>

            @if (editInternalEnabled()) {
              <section class="mt-5">
                <h4 class="ead-edit__h">Pulseiras dos colaboradores internos</h4>
                <p class="ead-edit__sub">Tipos já usados por inscritos AD não podem ser removidos.</p>
                <div class="ead-chips">
                  @for (b of catalogBracelets(); track b.id_bracelet_type) {
                    <button
                      type="button"
                      class="ead-br-pick"
                      [class.on]="isInternalBraceletOn(b.id_bracelet_type)"
                      [class.locked]="isInternalBraceletLocked(b.id_bracelet_type)"
                      (click)="toggleInternalBracelet(b.id_bracelet_type)"
                    >
                      <app-bracelet-chip
                        [name]="b.name"
                        [icon]="b.icon"
                        [color]="b.color"
                        [selectable]="true"
                        [selected]="isInternalBraceletOn(b.id_bracelet_type)"
                      />
                    </button>
                  }
                </div>
              </section>
            }

            <section class="mt-5">
              <h4 class="ead-edit__h">Setores participantes</h4>
              <p class="ead-edit__sub">Setores com empresas em andamento ou aprovadas não podem ser removidos.</p>
              <div class="ead-chips">
                @for (s of catalogSectors(); track s.id) {
                  <label class="ead-setor-pick" [class.on]="selectedSectorIds().has(s.id)">
                    <input
                      type="checkbox"
                      [checked]="selectedSectorIds().has(s.id)"
                      (change)="toggleEditSector(s.id)"
                    />
                    <span>{{ s.nome }}</span>
                  </label>
                } @empty {
                  <p class="text-sm text-[var(--app-text-muted)]">Nenhum setor ativo.</p>
                }
              </div>
            </section>
          </section>
        }

        @if (!isInternalOnlyView(ev)) {
          @if (kpisOf(ev); as k) {
            <div class="ead-kpis">
              <div class="ead-kpi">
                <div class="ead-kpi__k">Empresas convidadas</div>
                <div class="ead-kpi__v">{{ k.companies_total }}</div>
              </div>
              <div class="ead-kpi">
                <div class="ead-kpi__k">Concluíram indicação</div>
                <div class="ead-kpi__v">{{ companiesCompleted(k) }} <small>de {{ k.companies_total }}</small></div>
                <div class="ead-kpi__bar"><i [style.width.%]="pct(companiesCompleted(k), k.companies_total)"></i></div>
              </div>
              <div class="ead-kpi">
                <div class="ead-kpi__k">Colaboradores indicados</div>
                <div class="ead-kpi__v">{{ k.collaborators_total }}</div>
              </div>
              <div class="ead-kpi ead-kpi--accent">
                <div class="ead-kpi__k">Aprovados</div>
                <div class="ead-kpi__v">{{ k.collaborators_approved }} <small>de {{ k.collaborators_total }}</small></div>
                <div class="ead-kpi__bar"><i [style.width.%]="pct(k.collaborators_approved, k.collaborators_total)"></i></div>
              </div>
              <div class="ead-kpi">
                <div class="ead-kpi__k">Aguardando aprovação</div>
                <div class="ead-kpi__v">{{ k.collaborators_waiting }}</div>
              </div>
              <div class="ead-kpi">
                <div class="ead-kpi__k">Bloqueados</div>
                <div class="ead-kpi__v">{{ k.collaborators_denied }}</div>
              </div>
            </div>
          }
        }

        @if (ev.can_register_internal) {
          <article class="ead-empresa ead-self">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo" aria-hidden="true">AD</div>
                <div>
                  <h3 class="ead-empresa__nome">Inscrever-me neste evento</h3>
                  <p class="ead-self__d">Escolha uma ou mais pulseiras disponíveis para colaboradores internos.</p>
                </div>
              </div>
            </div>
            <div class="ead-indicate ead-indicate--internal">
              <div class="ead-pick-chips" role="group" aria-label="Pulseiras">
                @for (b of ev.internal_bracelet_types || []; track b.id_bracelet_type) {
                  <button
                    type="button"
                    class="ead-br-pick"
                    role="checkbox"
                    [attr.aria-checked]="pickedInternalBracelets().has(b.id_bracelet_type)"
                    [class.on]="pickedInternalBracelets().has(b.id_bracelet_type)"
                    (click)="togglePickInternalBracelet(b.id_bracelet_type)"
                  >
                    <app-bracelet-chip
                      [name]="b.name"
                      [icon]="b.icon"
                      [color]="b.color"
                      [selectable]="true"
                      [selected]="pickedInternalBracelets().has(b.id_bracelet_type)"
                    />
                  </button>
                }
              </div>
              <button
                type="button"
                class="ead-btn ead-btn--primary"
                [disabled]="acting() || pickedInternalBracelets().size === 0"
                (click)="inscreverInterno()"
              >
                Inscrever-me
              </button>
            </div>
          </article>
        } @else if (myInternalsOf(ev).length && !ev.can_manage && !ev.can_decide_internal) {
          <article class="ead-empresa ead-self">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo">
                  @if (ownInternalPhoto(ev); as url) {
                    <img [src]="url" alt="" />
                  } @else {
                    AD
                  }
                </div>
                <div>
                  <h3 class="ead-empresa__nome">Sua inscrição</h3>
                  <p class="ead-self__d">
                    @for (row of myInternalsOf(ev); track row.id_event_accreditation_internal) {
                      <app-bracelet-chip
                        [name]="row.bracelet_name"
                        [icon]="row.bracelet_icon"
                        [color]="row.bracelet_color"
                      />
                      <span class="ead-chip" [ngClass]="'ead-chip--' + internalPillClass(row)">
                        {{ internalPillLabel(row) }}
                      </span>
                    }
                  </p>
                </div>
              </div>
              @if (ev.inscription_open && hasPendingOwnInternal(ev)) {
                <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="cancelarInterno()">
                  Cancelar inscrição
                </button>
              }
            </div>
          </article>
        }

        @if (ev.internal_enabled && (ev.can_manage || ev.can_decide_internal)) {
          <div class="ead-listbar">
            <h2>Colaboradores internos <span>· {{ (ev.internals || []).length }}</span></h2>
          </div>
          <article class="ead-empresa">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo" aria-hidden="true">AD</div>
                <div>
                  <h3 class="ead-empresa__nome">Usuários AD</h3>
                  <div class="ead-empresa__counts">
                    <span class="ead-count ead-count--ind"><b>{{ (ev.internals || []).length }}</b> inscritos</span>
                    <span class="ead-count ead-count--apr"><b>{{ countInternalApproved(ev) }}</b> aprovados</span>
                    <span class="ead-count ead-count--pen"><b>{{ countInternalPending(ev) }}</b> pendentes</span>
                    <span class="ead-count ead-count--blo"><b>{{ countInternalBlocked(ev) }}</b> bloqueados</span>
                  </div>
                </div>
                @if (countInternalPending(ev)) {
                  <span class="ead-chip ead-chip--wait">{{ countInternalPending(ev) }} aguardando você</span>
                } @else if (!(ev.internals || []).length) {
                  <span class="ead-chip ead-chip--idle ead-chip--plain">Sem inscrições</span>
                }
              </div>
              @if (ev.can_manage || ev.can_decide_internal) {
                <div class="ead-empresa__actions">
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm ead-btn--primary"
                    [disabled]="acting() || !countInternalPending(ev)"
                    (click)="aprovarInternosPendentes(ev)"
                  >
                    Aprovar pendentes
                  </button>
                </div>
              }
            </div>
            @if ((ev.can_manage || ev.can_decide_internal) && countInternalPending(ev) > 0) {
              <div class="ead-bulk" [class.on]="pickedInternalCount() > 0">
                <span><b>{{ pickedInternalCount() }}</b> selecionados</span>
                <span class="ead-bulk-acts">
                  <app-bracelet-select
                    [options]="ev.internal_bracelet_types || []"
                    [value]="bulkInternalBracelet"
                    placeholder="Definir pulseira"
                    [allowEmpty]="true"
                    [disabled]="acting()"
                    ariaLabel="Pulseira em massa"
                    (valueChange)="bulkInternalBracelet = $event"
                  />
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [disabled]="acting() || !bulkInternalBracelet"
                    (click)="aplicarPulseiraInternos()"
                  >
                    Aplicar pulseira
                  </button>
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivoInterno(pickedInternalIds())">
                    Bloquear selecionados
                  </button>
                  <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="aprovarInternosSelecionados()">
                    Aprovar selecionados
                  </button>
                </span>
              </div>
            }
            @if (!(ev.internals || []).length) {
              <div class="ead-empty">
                <div class="ead-empty__badge" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.4"/><path d="M18 8h4M20 6v4"/></svg>
                </div>
                <p class="ead-empty__t">Nenhum usuário AD inscrito</p>
                <p class="ead-empty__d">Quando o credenciamento interno está ligado, os usuários AD se inscrevem sozinhos.</p>
              </div>
            } @else {
              <div class="tabela-rolavel">
                <table class="ead-tabela">
                  <thead>
                    <tr>
                      @if (ev.can_manage || ev.can_decide_internal) {
                        <th class="ead-chk-col">
                          <input
                            type="checkbox"
                            class="ead-chk"
                            [checked]="allPendingInternalsPicked(ev)"
                            [disabled]="!countInternalPending(ev)"
                            (change)="toggleAllInternals(ev, $event)"
                            aria-label="Selecionar todos os internos pendentes"
                          />
                        </th>
                      }
                      <th>Colaborador</th>
                      <th>Departamento</th>
                      <th>Pulseira</th>
                      <th>Situação</th>
                      <th class="ead-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of ev.internals || []; track c.id_event_accreditation_internal) {
                      <tr>
                        @if (ev.can_manage || ev.can_decide_internal) {
                          <td>
                            @if (isPendingInternal(c)) {
                              <input
                                type="checkbox"
                                class="ead-chk"
                                [checked]="isInternalPicked(c.id_event_accreditation_internal)"
                                (change)="toggleInternalPick(c.id_event_accreditation_internal, $event)"
                                [attr.aria-label]="'Selecionar ' + c.nome_completo"
                              />
                            }
                          </td>
                        }
                        <td>
                          <div class="ead-pessoa">
                            <div class="ead-avatar">
                              @if (userPhoto(c.id_usuario); as url) {
                                <img [src]="url" alt="" />
                              } @else {
                                {{ personInitials(c.nome_completo) }}
                              }
                            </div>
                            <span class="ead-pessoa__meta">
                              <span>{{ c.nome_completo }}</span>
                              <span class="ead-doc">{{ c.email }}</span>
                            </span>
                          </div>
                        </td>
                        <td>{{ c.departamento || '—' }}</td>
                        <td>
                          @if ((ev.can_manage || ev.can_decide_internal) && isPendingInternal(c)) {
                            <app-bracelet-select
                              [options]="ev.internal_bracelet_types || []"
                              [value]="c.id_bracelet_type"
                              [disabled]="acting()"
                              [ariaLabel]="'Pulseira de ' + c.nome_completo"
                              (valueChange)="onPickBracelet('internal', c.id_event_accreditation_internal, $event)"
                            />
                          } @else {
                            <app-bracelet-chip
                              [name]="c.bracelet_name"
                              [icon]="c.bracelet_icon"
                              [color]="c.bracelet_color"
                            />
                          }
                        </td>
                        <td>
                          <span class="ead-chip" [ngClass]="'ead-chip--' + internalPillClass(c)">{{ internalPillLabel(c) }}</span>
                        </td>
                        <td class="ead-acoes">
                          @if ((ev.can_manage || ev.can_decide_internal) && isPendingInternal(c)) {
                            <div class="ead-acoes__row">
                              <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivoInterno([c.id_event_accreditation_internal])">
                                Recusar
                              </button>
                              <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_internal], 'approve', undefined, undefined, 'internal')">
                                Aprovar
                              </button>
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @if (reasonFor()?.target === 'internal') {
              <div class="ead-reason-wrap">
                <span class="ead-reason-msg">
                  <b>Bloquear {{ reasonFor()?.ids?.length || 0 }} colaborador(es) interno(s).</b>
                </span>
                <select [(ngModel)]="blockReason" name="intBlockReason" class="form-select">
                  @for (r of blockReasons; track r) {
                    <option [ngValue]="r">{{ r }}</option>
                  }
                </select>
                <input [(ngModel)]="blockNote" name="intBlockNote" class="form-field" placeholder="Observação (opcional)" />
                <button type="button" class="ead-btn ead-btn--sm" (click)="fecharMotivo()">Cancelar</button>
                <button type="button" class="ead-btn ead-btn--sm ead-btn--danger" [disabled]="acting()" (click)="confirmarBloqueio()">
                  Confirmar bloqueio
                </button>
              </div>
            }
          </article>
        }

        @if (!isInternalOnlyView(ev)) {
        <div class="ead-listbar">
          <h2>Empresas por setor <span>· {{ (ev.companies || []).length }}</span></h2>
          <div class="ead-listbar__right">
            <div class="ead-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input
                type="search"
                [ngModel]="companyQuery()"
                (ngModelChange)="companyQuery.set($event)"
                name="eadCompanyQuery"
                placeholder="Buscar empresa ou colaborador"
                aria-label="Buscar empresa ou colaborador"
              />
            </div>
            <div class="ead-seg" role="group" aria-label="Filtrar empresas">
              <button type="button" [attr.aria-pressed]="companyFilter() === 'all'" (click)="companyFilter.set('all')">Todas</button>
              <button type="button" [attr.aria-pressed]="companyFilter() === 'pending'" (click)="companyFilter.set('pending')">Pendentes de aprovação</button>
              <button type="button" [attr.aria-pressed]="companyFilter() === 'empty'" (click)="companyFilter.set('empty')">Sem indicações</button>
            </div>
          </div>
        </div>

        @for (setor of ev.setores || []; track setor.id_setor) {
          <div class="ead-setor-bar">
            <div>
              <b>{{ setor.nome }}</b>
              <small>{{ companiesOfSector(ev, setor.id_setor).length }} empresa(s)</small>
            </div>
            <div class="ead-setor-bar__acts">
              @if (setor.can_add_companies) {
                <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirAddEmpresas(setor)">
                  Adicionar empresas
                </button>
              }
              @if (setor.can_notify_companies) {
                <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="reenviarConvitesSetor(setor)">
                  Reenviar convites
                </button>
              }
            </div>
          </div>
        }

        @for (company of filteredCompanies(ev); track company.id_event_accreditation_company) {
          <article class="ead-empresa">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo">
                  @if (companyLogo(company); as url) {
                    <img [src]="url" [alt]="company.fancy_name || company.company_name" />
                  } @else {
                    {{ companyInitials(company) }}
                  }
                </div>
                <div>
                  <h3 class="ead-empresa__nome">{{ company.fancy_name || company.company_name }}</h3>
                  @if (company.setor_nome) {
                    <p class="ead-empresa__setor">{{ company.setor_nome }}</p>
                  }
                  <div class="ead-empresa__counts">
                    <span class="ead-count ead-count--ind"><b>{{ company.collaborators.length }}</b> indicados</span>
                    <span class="ead-count ead-count--apr"><b>{{ countApproved(company) }}</b> aprovados</span>
                    <span class="ead-count ead-count--pen"><b>{{ countPending(company) }}</b> {{ countPending(company) === 1 ? 'pendente' : 'pendentes' }}</span>
                    <span class="ead-count ead-count--blo"><b>{{ countBlocked(company) }}</b> {{ countBlocked(company) === 1 ? 'bloqueado' : 'bloqueados' }}</span>
                    @if (ev.photo_required) {
                      <span class="ead-count ead-count--foto"><b>{{ countMissingPhotos(company) }}</b> sem foto</span>
                    }
                  </div>
                </div>
                <span class="ead-chip" [ngClass]="'ead-chip--' + companyPillClass(company)" [class.ead-chip--plain]="companyPillClass(company) === 'idle'">
                  {{ companyPillLabel(company) }}
                </span>
              </div>
              <div class="ead-empresa__actions">
                @if (canAddCollaborators(ev, company)) {
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirBulkImport(company)">
                    Importar planilha
                  </button>
                }
                @if (company.can_complete) {
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [disabled]="acting() || photoBlocksSectorNotify(ev, company)"
                    [title]="notifySectorTitle(ev, company)"
                    (click)="concluir(company)"
                  >
                    Concluir indicação
                  </button>
                }
                @if (company.can_notify_sector) {
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [disabled]="acting() || photoBlocksSectorNotify(ev, company)"
                    [title]="notifySectorTitle(ev, company)"
                    (click)="reenviarAvisoSetor(company)"
                  >
                    Reenviar aviso ao setor
                  </button>
                }
                @if (canShowNotifyOwner(company)) {
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [disabled]="acting() || hasMissingPhotos(company)"
                    [title]="notifyOwnerTitle(company)"
                    (click)="reenviarAvisoResponsavel(company)"
                  >
                    Reenviar aviso ao responsável
                  </button>
                }
                @if ((ev.can_notify || companySectorCanNotify(ev, company)) && company.indication_status === 'INDICACAO') {
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="notificar(company.id_company)">
                    Notificar empresa
                  </button>
                }
                @if (company.can_remove) {
                  <button type="button" class="ead-btn ead-btn--sm ead-btn--danger" [disabled]="acting()" (click)="removerEmpresa(company)">
                    Remover empresa
                  </button>
                }
                @if (company.can_decide) {
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm ead-btn--primary"
                    [disabled]="acting() || !countPending(company)"
                    (click)="aprovarEmpresa(company)"
                    [title]="countPending(company) ? '' : 'Não há indicações para aprovar'"
                  >
                    Aprovar pendentes
                  </button>
                }
              </div>
            </div>

            @if (company.can_decide && countPending(company) > 0) {
              <div class="ead-bulk" [class.on]="pickedCount(company) > 0">
                <span><b>{{ pickedCount(company) }}</b> selecionados</span>
                <span class="ead-bulk-acts">
                  <app-bracelet-select
                    [options]="ev.bracelet_types || []"
                    [value]="bulkCompanyBracelet[company.id_event_accreditation_company] ?? null"
                    placeholder="Definir pulseira"
                    [allowEmpty]="true"
                    [disabled]="acting()"
                    ariaLabel="Pulseira em massa"
                    (valueChange)="bulkCompanyBracelet[company.id_event_accreditation_company] = $event"
                  />
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [disabled]="acting() || !bulkCompanyBracelet[company.id_event_accreditation_company]"
                    (click)="aplicarPulseiraEmpresa(company)"
                  >
                    Aplicar pulseira
                  </button>
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivo(company, pickedIds(company))">
                    Bloquear selecionados
                  </button>
                  <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="aprovarSelecionados(company)">
                    Aprovar selecionados
                  </button>
                </span>
              </div>
            }

            @if (canAddCollaborators(ev, company)) {
              <div class="ead-indicate">
                <div class="ead-typeahead">
                  @if (pickedSearchItem()[company.id_company]; as picked) {
                    <div class="ead-typeahead__picked">
                      <span>
                        <b>{{ picked.name }}</b>
                        <small>{{ formatCpf(picked.document) }}{{ picked.is_blocklisted ? ' · bloqueado' : '' }}</small>
                      </span>
                      <button type="button" class="ead-typeahead__clear" (click)="limparColaboradorBusca(company)">
                        Trocar
                      </button>
                    </div>
                  } @else {
                    <input
                      [(ngModel)]="search[company.id_company]"
                      [name]="'q' + company.id_company"
                      (ngModelChange)="buscarColaboradores(company)"
                      placeholder="Buscar colaborador"
                      aria-label="Buscar colaborador"
                      autocomplete="off"
                      class="form-field"
                    />
                    @if (searching()[company.id_company]) {
                      <p class="ead-typeahead__dd ead-typeahead__dd--msg">Buscando...</p>
                    } @else if ((searchResults()[company.id_company] || []).length) {
                      <ul class="ead-typeahead__dd" role="listbox">
                        @for (c of searchResults()[company.id_company]; track c.id_collaborator) {
                          <li>
                            <button
                              type="button"
                              [disabled]="c.is_blocklisted"
                              (click)="selecionarColaboradorBusca(company, c)"
                            >
                              <b>{{ c.name }}</b>
                              <small>
                                {{ formatCpf(c.document) }}{{ c.is_blocklisted ? ' · bloqueado' : '' }}
                              </small>
                            </button>
                          </li>
                        }
                      </ul>
                    } @else if ((search[company.id_company] || '').trim().length >= 2) {
                      <p class="ead-typeahead__dd ead-typeahead__dd--msg">Nenhum colaborador encontrado.</p>
                    }
                  }
                </div>
                <select
                  class="form-select"
                  [name]="'role' + company.id_company"
                  [ngModel]="pickRole()[company.id_company] ?? null"
                  (ngModelChange)="setPickRole(company.id_company, $event)"
                  aria-label="Função"
                >
                  <option [ngValue]="null">Função</option>
                  @for (r of roles(); track r.id_collaborator_role) {
                    <option [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                  }
                </select>
                <app-bracelet-select
                  [options]="bracelets()"
                  [value]="pickBracelet[company.id_company] ?? null"
                  placeholder="Pulseira"
                  [allowEmpty]="true"
                  [disabled]="acting()"
                  ariaLabel="Pulseira"
                  (valueChange)="pickBracelet[company.id_company] = $event"
                />
                <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="adicionar(company)">
                  Indicar
                </button>
              </div>
            }

            @if (!company.collaborators.length) {
              <div class="ead-empty">
                <div class="ead-empty__badge" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.4"/><path d="M18 8h4M20 6v4"/></svg>
                </div>
                <p class="ead-empty__t">Nenhum colaborador indicado ainda</p>
                <p class="ead-empty__d">
                  @if (ev.inscription_end) {
                    A empresa pode indicar até {{ formatDateTimeBr(ev.inscription_end) }} — {{ prazoLabel(ev) }}.
                  } @else {
                    A empresa foi convidada e ainda não enviou indicações.
                  }
                </p>
                @if (ev.can_notify && company.indication_status === 'INDICACAO') {
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="notificar(company.id_company)">
                    Enviar lembrete por e-mail
                  </button>
                }
              </div>
            } @else {
              <div class="ead-tablebar">
                <select
                  class="form-select"
                  [ngModel]="filterRole[company.id_company] ?? null"
                  (ngModelChange)="filterRole[company.id_company] = $event"
                  [name]="'frole' + company.id_company"
                  aria-label="Filtrar por função"
                >
                  <option [ngValue]="null">Todas as funções</option>
                  @for (r of companyRoleOptions(company); track r.id) {
                    <option [ngValue]="r.id">{{ r.label }}</option>
                  }
                </select>
                <app-bracelet-select
                  [options]="companyBraceletOptions(company)"
                  [value]="filterBracelet[company.id_company] ?? null"
                  placeholder="Todas as pulseiras"
                  [allowEmpty]="true"
                  ariaLabel="Filtrar por pulseira"
                  (valueChange)="filterBracelet[company.id_company] = $event"
                />
              </div>
              @let rows = filteredCollaborators(company);
              <div class="tabela-rolavel">
                <table class="ead-tabela">
                  <thead>
                    <tr>
                      @if (company.can_decide) {
                        <th class="ead-chk-col">
                          <input
                            type="checkbox"
                            class="ead-chk"
                            [checked]="allPendingPicked(company)"
                            [disabled]="!countPending(company)"
                            (change)="toggleAll(company, $event)"
                            aria-label="Selecionar todos"
                          />
                        </th>
                      }
                      <th>Colaborador</th>
                      <th>CPF</th>
                      <th>Função</th>
                      <th>Pulseira</th>
                      <th>Situação</th>
                      <th class="ead-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of rows; track c.id_event_accreditation_collaborator) {
                      <tr [class.blocked]="isBlocked(c)">
                        @if (company.can_decide) {
                          <td>
                            @if (isPending(c)) {
                              <input
                                type="checkbox"
                                class="ead-chk"
                                [checked]="isPicked(company, c.id_event_accreditation_collaborator)"
                                (change)="togglePick(company, c.id_event_accreditation_collaborator, $event)"
                                [attr.aria-label]="'Selecionar ' + c.collaborator_name"
                              />
                            }
                          </td>
                        }
                        <td>
                          <div class="ead-pessoa">
                            <app-collaborator-photo
                              size="sm"
                              mode="immediate"
                              [name]="c.collaborator_name"
                              [picture]="c.collaborator_picture"
                              [collaboratorId]="c.id_collaborator"
                              [editable]="canAddCollaborators(ev, company) || !!company.can_decide"
                              (pictureChange)="onCollaboratorPhotoChanged(company, c, $event)"
                            />
                            <span>{{ c.collaborator_name }}</span>
                          </div>
                        </td>
                        <td class="ead-doc">{{ c.collaborator_document }}</td>
                        <td>{{ c.role_description }}</td>
                        <td>
                          @if (canEditCompanyBracelet(ev, company, c)) {
                            <app-bracelet-select
                              [options]="ev.bracelet_types || []"
                              [value]="c.id_bracelet_type"
                              [disabled]="acting()"
                              [ariaLabel]="'Pulseira de ' + c.collaborator_name"
                              (valueChange)="onPickBracelet('company', c.id_event_accreditation_collaborator, $event)"
                            />
                          } @else {
                            <app-bracelet-chip
                              [name]="c.bracelet_name"
                              [icon]="c.bracelet_icon"
                              [color]="c.bracelet_color"
                            />
                          }
                        </td>
                        <td>
                          <div class="ead-sit">
                            <span class="ead-chip" [ngClass]="'ead-chip--' + collabPillClass(c)">{{ collabPillLabel(c) }}</span>
                            @if (showsMissingPhoto(ev, c)) {
                              <span class="ead-chip ead-chip--wait">Sem foto</span>
                            }
                            @if (c.decided_by_name && (isApproved(c) || isBlocked(c))) {
                              <span class="ead-audit">
                                por {{ c.decided_by_name }} · {{ formatAuditAt(c.decided_at) }}
                                @if (c.decision_reason) {
                                  · <span class="why">{{ c.decision_reason }}</span>
                                }
                              </span>
                            }
                          </div>
                        </td>
                        <td class="ead-acoes">
                          <div class="ead-acoes__row">
                            @if (company.can_decide && isPending(c)) {
                              <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivo(company, [c.id_event_accreditation_collaborator])">
                                Recusar
                              </button>
                              <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_collaborator], 'approve')">
                                Aprovar
                              </button>
                            }
                            @if (company.can_decide && isApproved(c)) {
                              <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivo(company, [c.id_event_accreditation_collaborator])">
                                Bloquear
                              </button>
                            }
                            @if (company.can_decide && isBlocked(c)) {
                              <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_collaborator], 'unblock')">
                                Desbloquear
                              </button>
                            }
                            @if (canAddCollaborators(ev, company) && (company.indication_status === 'INDICACAO' || isPending(c))) {
                              <app-action-btn icon="delete" title="Remover" variant="danger" (action)="remover(company, c.id_event_accreditation_collaborator)" />
                            }
                          </div>
                        </td>
                      </tr>
                    }
                    @if (!rows.length) {
                      <tr>
                        <td [attr.colspan]="company.can_decide ? 7 : 6">
                          <div class="ead-empty ead-empty--inline">
                            <p class="ead-empty__t">Nenhum indicado neste filtro</p>
                            <p class="ead-empty__d">Ajuste função ou pulseira para ver outros colaboradores.</p>
                          </div>
                        </td>
                      </tr>
                    }
                    @if (reasonFor()?.companyId === company.id_event_accreditation_company) {
                      <tr class="ead-reason">
                        <td [attr.colspan]="company.can_decide ? 7 : 6">
                          <div class="ead-reason-wrap">
                            <span class="ead-reason-msg">
                              <b>Bloquear {{ reasonFor()?.ids?.length || 0 }} colaborador(es).</b>
                              O motivo fica registrado e é visível para a empresa.
                            </span>
                            <select class="form-select" [(ngModel)]="blockReason" name="ead_block_reason" aria-label="Motivo do bloqueio">
                              @for (m of blockReasons; track m) {
                                <option [ngValue]="m">{{ m }}</option>
                              }
                            </select>
                            <input class="form-field" [(ngModel)]="blockNote" name="ead_block_note" placeholder="Observação (opcional)" aria-label="Observação" />
                            <button type="button" class="ead-btn ead-btn--sm" (click)="fecharMotivo()">Cancelar</button>
                            <button type="button" class="ead-btn ead-btn--sm ead-btn--danger" [disabled]="acting()" (click)="confirmarBloqueio()">
                              Confirmar bloqueio
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (company.indicated_complete_at) {
                <div class="ead-rodape">
                  <p>Indicação enviada em {{ formatDateTimeBr(company.indicated_complete_at) }}</p>
                </div>
              }
            }
          </article>
        } @empty {
          <article class="ead-empresa">
            <div class="ead-empty">
              <div class="ead-empty__badge" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.4"/></svg>
              </div>
              <p class="ead-empty__t">Nenhuma empresa neste filtro</p>
              <p class="ead-empty__d">Ajuste a busca ou o segmento para ver outras empresas convidadas.</p>
            </div>
          </article>
        }
        }
      }
    </div>

    <app-modal
      [open]="showAddCompanies()"
      title="Adicionar empresas"
      [subtitle]="addCompaniesSetor()?.nome || ''"
      size="lg"
      (close)="fecharAddEmpresas()"
    >
      <div class="ead-co">
        <div class="ead-co__col">
          <input
            type="search"
            class="form-field ead-co__search"
            placeholder="Buscar empresa"
            aria-label="Buscar empresa"
            [ngModel]="addCompanySearch()"
            (ngModelChange)="addCompanySearch.set($event)"
          />
          @if (availableAddCompanies().length) {
            <ul class="ead-co__list">
              @for (c of availableAddCompanies(); track c.id_company) {
                <li [class.ead-co__item--on]="addSelectedCompanyIds().has(c.id_company)">
                  <span class="ead-co__info">
                    <b>{{ c.fancy_name || c.company_name }}</b>
                    @if (c.company_name && c.company_name !== (c.fancy_name || '')) {
                      <small>{{ c.company_name }}</small>
                    }
                  </span>
                  <button
                    type="button"
                    class="ead-btn ead-btn--sm"
                    [class.ead-btn--remove]="addSelectedCompanyIds().has(c.id_company)"
                    (click)="toggleAddCompany(c.id_company)"
                  >
                    {{ addSelectedCompanyIds().has(c.id_company) ? 'Remover' : 'Incluir' }}
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="ead-co__empty">Nenhuma empresa disponível.</p>
          }
        </div>
      </div>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharAddEmpresas()">Cancelar</button>
        <button
          type="button"
          class="btn-action-primary"
          [disabled]="acting() || addSelectedCompanyIds().size === 0"
          (click)="confirmarAddEmpresas()"
        >
          Convidar {{ addSelectedCompanyIds().size }} empresa(s)
        </button>
      </div>
    </app-modal>

    @if (showBulkModal()) {
    <app-modal
      [open]="true"
      title="Importar em lote"
      subtitle="Indique colaboradores desta empresa por planilha — revise e confirme."
      size="xl"
      [closeOnBackdrop]="false"
      [focusFirstField]="false"
      (close)="fecharBulkModal()"
    >
      <app-service-access-bulk-import-wizard
        [open]="true"
        [embedded]="true"
        [hideVehicles]="true"
        [apiAdapter]="accreditationBulkAdapter"
        [bracelets]="bracelets()"
        [accessName]="item()?.name || 'Credenciamento'"
        [companyName]="bulkCompany()?.fancy_name || bulkCompany()?.company_name || ''"
        (closed)="fecharBulkModal()"
        (completed)="onBulkCompleted()"
      />
    </app-modal>
    }
  `,
  styles: [
    `
      .ead {
        --ead-purple: #8d0de3;
        --ead-purple-900: #420465;
        --ead-green-200: #c9e2bf;
        --ead-green-300: #a7d296;
        --ead-bg: #f6f4f9;
        --ead-surface: #ffffff;
        --ead-line: #e9e4f0;
        --ead-line-soft: #f1ecf7;
        --ead-ink: #1e002f;
        --ead-muted: #6b5b78;
        --ead-amber-bg: #fdf1dc;
        --ead-amber-ink: #8a5300;
        --ead-r-card: 16px;
        --ead-r-ctl: 10px;
        width: 100%;
        color: var(--ead-ink);
        font-family: var(--font-body);
        padding-bottom: 4.5rem;
      }
      .ead-back {
        display: inline-block;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--ead-purple);
        text-decoration: none;
        margin: 0 0 14px;
      }
      .ead-back:hover {
        text-decoration: underline;
      }
      .ead-loading {
        color: var(--ead-muted);
        padding: 2rem 0;
      }
      .ead-btn {
        height: 38px;
        padding: 0 16px;
        border-radius: var(--ead-r-ctl);
        border: 1px solid var(--ead-line);
        background: var(--ead-surface);
        color: var(--ead-ink);
        font-family: var(--font-body);
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .ead-btn:hover {
        border-color: #d6c9e6;
      }
      .ead-btn--primary {
        background: var(--ead-purple);
        border-color: var(--ead-purple);
        color: #fff;
      }
      .ead-btn--primary:hover {
        background: #7a0bc6;
        border-color: #7a0bc6;
      }
      .ead-btn--light {
        background: #fff;
        border-color: #fff;
        color: var(--ead-purple-900);
      }
      .ead-btn--light:hover {
        background: #f3e4fd;
        border-color: #f3e4fd;
      }
      .ead-btn--ghost {
        background: transparent;
        border-color: rgba(255, 255, 255, 0.38);
        color: #fff;
      }
      .ead-btn--ghost:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.65);
      }
      .ead-btn--sm {
        height: 34px;
        padding: 0 13px;
        font-size: 13px;
      }
      .ead-btn--danger {
        background: #8c2a2a;
        border-color: #8c2a2a;
        color: #fff;
      }
      .ead-btn[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ead-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 12px;
        border-radius: 999px;
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
      }
      .ead-chip::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        flex: 0 0 7px;
      }
      .ead-chip--plain::before {
        display: none;
      }
      .ead-chip--tipo {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        font-weight: 500;
      }
      .ead-chip--quiet {
        background: transparent;
        color: rgba(255, 255, 255, 0.72);
        padding-left: 2px;
        font-weight: 500;
      }
      .ead-chip--ok {
        background: var(--ead-green-200);
        color: #1f3a16;
      }
      .ead-chip--ok::before {
        background: #2f7a18;
      }
      .ead-chip--wait {
        background: var(--ead-amber-bg);
        color: var(--ead-amber-ink);
      }
      .ead-chip--idle {
        background: var(--ead-bg);
        border: 1px solid var(--ead-line);
        color: var(--ead-muted);
        font-weight: 500;
      }
      .ead-chip--bad {
        background: #fbe7e7;
        color: #8c2a2a;
      }
      .ead-chip--pulseira {
        background: rgba(255, 255, 255, 0.14);
        color: #f3e9fb;
        font-weight: 500;
      }
      .ead-hero {
        border-radius: var(--ead-r-card);
        overflow: hidden;
        display: grid;
        grid-template-columns: minmax(280px, 34%) 1fr;
        background: var(--ead-purple-900);
      }
      .ead-hero__cover {
        position: relative;
        min-height: 260px;
        background: var(--ead-green-300);
      }
      .ead-hero__cover img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 38%;
        display: block;
      }
      .ead-hero__panel {
        padding: 22px 26px 24px;
        color: #fff;
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }
      .ead-hero__row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
      }
      .ead-hero__title {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 30px;
        line-height: 1.15;
        margin: 0;
        letter-spacing: -0.015em;
      }
      .ead-hero__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .ead-hero__meta--chips {
        margin-top: 9px;
      }
      .ead-hero__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .ead-hero__action {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 38px;
        padding: 0 16px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: #fff;
        font-family: var(--font-body);
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .ead-hero__action svg {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
      }
      .ead-hero__action--primary {
        background: #fff;
        color: var(--ead-purple-900);
      }
      .ead-hero__action--primary:hover:not(:disabled) {
        background: #f1e7fa;
      }
      .ead-hero__action--ghost {
        border-color: rgba(255, 255, 255, 0.22);
        color: #fff;
      }
      .ead-hero__action--ghost:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.4);
      }
      .ead-hero__action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ead-hero__kebab {
        display: inline-flex;
      }
      :host ::ng-deep .ead-hero__kebab .action-btn {
        width: 38px;
        height: 38px;
        background: transparent;
        border-color: rgba(255, 255, 255, 0.22);
        color: #fff;
      }
      :host ::ng-deep .ead-hero__kebab .action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.4);
        color: #fff;
      }
      .ead-hero__facts {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.22);
        padding-top: 18px;
      }
      .ead-hero__facts-grid {
        display: grid;
        grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
        gap: 18px 40px;
        align-items: start;
      }
      .ead-hero__setores {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .ead-setor-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 11px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 12.5px;
        font-weight: 500;
        white-space: nowrap;
      }
      .ead-setor-chip__count {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.72);
      }
      .ead-setor-chip--more {
        background: transparent;
        cursor: pointer;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        color: #fff;
        appearance: none;
      }
      .ead-setor-chip--more:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .ead-hero__bracelet-list {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .ead-hero__bracelet {
        display: inline-flex;
        align-items: center;
        height: 26px;
        border-radius: 6px;
        overflow: hidden;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .ead-hero__bracelet i {
        width: 26px;
        height: 26px;
        background: #fff;
        opacity: 0.9;
        flex: 0 0 26px;
      }
      .ead-hero__bracelet span {
        display: grid;
        place-items: center;
        height: 26px;
        padding: 0 11px;
        color: #fff;
      }
      .ead-chip--btn {
        border: 0;
        cursor: pointer;
        font-family: inherit;
      }
      .ead-chip--btn:hover:not(:disabled) {
        filter: brightness(0.97);
      }
      .ead-chip--btn:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }
      .ead-fact__k {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.72);
        font-weight: 500;
        margin: 0 0 5px;
      }
      .ead-fact__v {
        margin: 0;
        font-family: var(--font-display);
        font-size: 15px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .ead-fact__aside {
        font-family: var(--font-body);
        font-weight: 400;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
      }
      .ead-fact__v .ead-fact__aside {
        margin-left: 6px;
      }
      .ead-bar {
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        overflow: hidden;
        margin-top: 9px;
        max-width: 280px;
      }
      .ead-bar i {
        display: block;
        height: 100%;
        background: var(--ead-green-300);
        border-radius: 999px;
      }
      .ead-kpis {
        margin-top: 12px;
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-card);
        display: grid;
        grid-template-columns: repeat(6, 1fr);
      }
      .ead-kpi {
        padding: 16px 18px;
        border-left: 1px solid var(--ead-line);
      }
      .ead-kpi:first-child {
        border-left: 0;
      }
      .ead-kpi__k {
        font-size: 12px;
        color: var(--ead-muted);
        font-weight: 500;
        margin-bottom: 6px;
      }
      .ead-kpi__v {
        font-family: var(--font-display);
        font-size: 24px;
        font-weight: 600;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .ead-kpi__v small {
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 500;
        color: var(--ead-muted);
      }
      .ead-kpi--accent .ead-kpi__v {
        color: var(--ead-purple);
      }
      .ead-kpi__bar {
        height: 4px;
        border-radius: 2px;
        background: #efe9f5;
        margin-top: 10px;
        overflow: hidden;
      }
      .ead-kpi__bar i {
        display: block;
        height: 100%;
        background: var(--ead-green-300);
      }
      .ead-listbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin: 34px 0 14px;
      }
      .ead-listbar h2 {
        font-family: var(--font-display);
        font-size: 19px;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.01em;
      }
      .ead-listbar h2 span {
        color: var(--ead-muted);
        font-weight: 500;
      }
      .ead-listbar__right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ead-setor-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        margin: 8px 0 6px;
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-card);
      }
      .ead-setor-bar b {
        display: block;
        font-size: 15px;
      }
      .ead-setor-bar small {
        color: var(--ead-muted);
      }
      .ead-setor-bar__acts {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ead-empresa__setor {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--ead-muted);
      }
      .ead-setor-pick {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 8px 12px;
        border: 1px solid var(--ead-line);
        border-radius: 999px;
        cursor: pointer;
        font-size: 13px;
      }
      .ead-setor-pick input[type='checkbox'] {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--ead-purple, var(--brand));
      }
      .ead-setor-pick.on {
        border-color: var(--ead-purple);
        background: #f6edff;
      }
      .ead-search {
        position: relative;
      }
      .ead-search input {
        width: 260px;
        height: 40px;
        padding: 0 14px 0 38px;
        border-radius: var(--ead-r-ctl);
        border: 1px solid var(--ead-line);
        background: var(--ead-bg);
        color: var(--ead-ink);
        font-family: var(--font-body);
        font-size: 13.5px;
      }
      .ead-search svg {
        position: absolute;
        left: 13px;
        top: 11px;
        color: var(--ead-muted);
      }
      .ead-seg {
        display: flex;
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-ctl);
        padding: 3px;
      }
      .ead-seg button {
        height: 30px;
        padding: 0 13px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        color: var(--ead-muted);
        cursor: pointer;
      }
      .ead-seg button[aria-pressed='true'] {
        background: #f3e4fd;
        color: var(--ead-purple-900);
      }
      .ead-empresa {
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-card);
        margin-bottom: 12px;
        overflow: visible;
      }
      .ead-empresa__head {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .ead-empresa__id {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ead-empresa__logo {
        width: 38px;
        height: 38px;
        border-radius: 9px;
        background: #f3e4fd;
        color: var(--ead-purple-900);
        display: grid;
        place-items: center;
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 14px;
        flex: 0 0 38px;
        overflow: hidden;
      }
      .ead-empresa__logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .ead-empresa__nome {
        font-family: var(--font-display);
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.01em;
      }
      .ead-empresa__counts {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 3px;
      }
      .ead-count {
        font-size: 12.5px;
        color: var(--ead-muted);
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .ead-count b {
        color: var(--ead-ink);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .ead-count::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex: 0 0 6px;
      }
      .ead-count--ind::before {
        background: var(--ead-purple);
      }
      .ead-count--apr::before {
        background: var(--ead-green-300);
      }
      .ead-count--pen::before {
        background: #e9a23b;
      }
      .ead-count--blo::before {
        background: #d45b5b;
      }
      .ead-count--foto::before {
        background: #e9a23b;
      }
      .ead-empresa__actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ead-self__d {
        margin: 3px 0 0;
        font-size: 13.5px;
        color: var(--ead-muted);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .ead-tablebar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid var(--ead-line-soft);
      }
      .ead-tablebar .form-select {
        min-width: 10rem;
        max-width: 16rem;
      }
      .ead-empty {
        border-top: 1px solid var(--ead-line-soft);
        padding: 34px 20px 32px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }
      .ead-empty--inline {
        border-top: 0;
        padding: 18px 8px;
      }
      .ead-empty__badge {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: var(--ead-bg);
        color: var(--ead-purple);
        display: grid;
        place-items: center;
        margin-bottom: 6px;
      }
      .ead-empty__t {
        font-family: var(--font-display);
        font-size: 15px;
        font-weight: 600;
        margin: 0;
      }
      .ead-empty__d {
        font-size: 13.5px;
        color: var(--ead-muted);
        margin: 0;
        max-width: 52ch;
        line-height: 1.5;
      }
      .ead-empty .ead-btn {
        margin-top: 12px;
      }
      .ead-tabela {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }
      .ead-tabela thead th {
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: var(--ead-muted);
        padding: 11px 20px;
        border-top: 1px solid var(--ead-line-soft);
        border-bottom: 1px solid var(--ead-line-soft);
        background: #fbf9fd;
      }
      .ead-tabela td {
        padding: 13px 20px;
        border-bottom: 1px solid var(--ead-line-soft);
        vertical-align: middle;
      }
      .ead-tabela tr:has(app-bracelet-select.brs-host--open) {
        position: relative;
        z-index: 4;
      }
      .ead-sit {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .ead-tabela tbody tr:last-child td {
        border-bottom: 0;
      }
      .ead-tabela tr.blocked td {
        background: #fdf4f4;
      }
      .ead-doc {
        font-variant-numeric: tabular-nums;
        color: var(--ead-muted);
        font-size: 12.5px;
      }
      .ead-pessoa {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .ead-pessoa__meta {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1px;
      }
      .ead-pessoa__meta > span:first-child {
        font-weight: 600;
      }
      .ead-pessoa__meta .ead-doc {
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .ead-pessoa > span {
        font-weight: 600;
      }
      .ead-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #efe9f5;
        color: var(--ead-muted);
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 600;
        flex: 0 0 32px;
        overflow: hidden;
      }
      .ead-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .ead-tabela thead th.ead-acoes,
      .ead-tabela td.ead-acoes {
        text-align: right;
        white-space: nowrap;
      }
      .ead-acoes__row {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ead-rodape {
        padding: 12px 20px;
        border-top: 1px solid var(--ead-line-soft);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ead-rodape p {
        margin: 0;
        font-size: 13px;
        color: var(--ead-muted);
      }
      .ead-bulk {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 20px;
        background: #f3e4fd;
        border-top: 1px solid var(--ead-line-soft);
        font-size: 13px;
        flex-wrap: nowrap;
        overflow-x: auto;
      }
      .ead-bulk.on {
        display: flex;
      }
      .ead-bulk-acts {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .ead-indicate {
        display: grid;
        grid-template-columns: minmax(14rem, 1.8fr) minmax(8rem, 1fr) minmax(10.5rem, 1fr) auto;
        align-items: start;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--ead-line-soft);
      }
      .ead-typeahead {
        position: relative;
        min-width: 0;
      }
      .ead-typeahead__dd {
        position: absolute;
        z-index: 30;
        left: 0;
        right: 0;
        top: calc(100% + 4px);
        margin: 0;
        padding: 6px;
        list-style: none;
        max-height: 240px;
        overflow: auto;
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-ctl);
        box-shadow: 0 10px 28px rgba(30, 0, 47, 0.12);
      }
      .ead-typeahead__dd--msg {
        padding: 10px 12px;
        font-size: 13px;
        color: var(--ead-muted);
      }
      .ead-typeahead__dd li + li {
        border-top: 1px solid var(--ead-line-soft);
      }
      .ead-typeahead__dd button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        border: 0;
        background: transparent;
        padding: 8px 10px;
        border-radius: 8px;
        text-align: left;
        cursor: pointer;
        color: var(--ead-ink);
        font: inherit;
      }
      .ead-typeahead__dd button:hover:not(:disabled) {
        background: var(--brand-tonal-bg);
      }
      .ead-typeahead__dd button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .ead-typeahead__dd b {
        font-size: 13.5px;
        font-weight: 650;
      }
      .ead-typeahead__dd small {
        font-size: 12px;
        color: var(--ead-muted);
      }
      .ead-typeahead__picked {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: var(--form-field-height);
        padding: 6px 12px;
        border: 1px solid var(--app-border);
        border-radius: var(--form-radius);
        background: var(--brand-tonal-bg);
      }
      .ead-typeahead__picked b {
        display: block;
        font-size: 13.5px;
        color: var(--ead-ink);
      }
      .ead-typeahead__picked small {
        display: block;
        font-size: 12px;
        color: var(--ead-muted);
      }
      .ead-typeahead__clear {
        flex: none;
        border: 0;
        background: transparent;
        color: var(--brand);
        font: inherit;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
        padding: 0;
      }
      .ead-indicate > app-bracelet-select {
        min-width: 10.5rem;
      }
      .ead-indicate-row {
        display: flex;
        gap: 8px;
      }
      .ead-indicate-row .form-select {
        flex: 1;
      }
      .ead-indicate--internal {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
      .ead-pick-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .ead-pick {
        border: 1px solid var(--ead-line);
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12.5px;
        font-weight: 600;
        background: var(--ead-surface);
        color: var(--ead-ink);
        cursor: pointer;
      }
      .ead-pick.on {
        background: #f3e4fd;
        border-color: var(--ead-purple);
        color: var(--ead-purple-900);
      }
      .ead-chk-col {
        width: 34px;
      }
      .ead-chk {
        width: 16px;
        height: 16px;
        accent-color: var(--ead-purple);
      }
      .ead-br-select {
        min-width: 10.5rem;
        max-width: 16rem;
        height: 2.15rem;
        padding: 0 0.55rem;
        font-size: 12.5px;
        font-weight: 600;
      }
      .ead-audit {
        font-size: 11.5px;
        color: var(--ead-muted);
        display: block;
        margin-top: 2px;
      }
      .ead-audit .why {
        color: #8c2a2a;
      }
      .ead-reason {
        background: #fdf4f4;
      }
      .ead-reason td {
        padding: 12px 20px;
        border-top: 1px solid #f0c7c7;
      }
      .ead-reason-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        align-items: center;
        padding: 12px 20px 16px;
      }
      .ead-reason-msg {
        font-size: 12.5px;
        color: #8c2a2a;
        flex: 1;
        min-width: 200px;
      }
      .ead-edit {
        background: var(--ead-surface);
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-card);
        padding: 1.25rem;
        margin: 12px 0;
      }
      .ead-edit__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
      }
      .ead-edit__h {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 650;
        color: var(--ead-ink);
      }
      .ead-edit__sub {
        margin: 0.25rem 0 0.75rem;
        font-size: 0.75rem;
        color: var(--ead-muted);
      }
      .ead-edit__value {
        margin-bottom: 0.65rem;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .ead-edit__value.empty {
        color: var(--ead-muted);
        font-weight: 500;
      }
      .ead-edit__value.bad {
        color: #8c2a2a;
      }
      .ead-edit__times {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-top: 0.85rem;
      }
      .ead-edit__field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.75rem;
        font-weight: 650;
        color: var(--ead-muted);
      }
      .ead-edit__field input {
        height: 2.5rem;
        border: 1px solid var(--ead-line);
        border-radius: 0.75rem;
        padding: 0 0.75rem;
        font: inherit;
        font-weight: 500;
        color: var(--ead-ink);
      }
      .ead-edit__field--name {
        max-width: 36rem;
      }
      .ead-cover-edit {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ead-cover-edit__preview {
        width: 72px;
        height: 72px;
        border-radius: 12px;
        overflow: hidden;
        background: var(--ead-bg);
        border: 1px solid var(--ead-line);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ead-muted);
        font-size: 12px;
        flex-shrink: 0;
      }
      .ead-cover-edit__preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .ead-cover-edit__actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ead-cover-edit__pick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--ead-line);
        background: var(--ead-surface);
        border-radius: var(--ead-r-ctl);
        padding: 6px 14px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .ead-cover-edit__pick input {
        display: none;
      }
      .ead-cover-edit__clear {
        border: 0;
        background: none;
        color: var(--ead-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .ead-edit__alert {
        margin: 1rem 0 0;
        padding: 0.65rem 0.85rem;
        border-radius: 0.75rem;
        background: #fbe7e7;
        color: #8c2a2a;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .ead-edit__switches {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
      .ead-switch {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--ead-ink);
        cursor: pointer;
        user-select: none;
      }
      .ead-switch input {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        opacity: 0;
        pointer-events: none;
      }
      .ead-switch__ui {
        flex: 0 0 auto;
        width: 40px;
        height: 22px;
        border-radius: 999px;
        background: #cbd5e1;
        position: relative;
        transition: background 0.15s ease;
      }
      .ead-switch__ui::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
        transition: transform 0.15s ease;
      }
      .ead-switch input:checked + .ead-switch__ui {
        background: var(--brand);
      }
      .ead-switch input:checked + .ead-switch__ui::after {
        transform: translateX(18px);
      }
      .ead-switch:focus-within .ead-switch__ui {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
      }
      .ead-co {
        display: block;
        width: 100%;
        min-width: 0;
      }
      .ead-co__col {
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-ctl);
        background: var(--ead-surface);
        min-height: 280px;
        min-width: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .ead-co__col--on {
        border-color: var(--app-border);
      }
      .ead-co__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 0;
      }
      .ead-co__head h5 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ead-muted);
      }
      .ead-co__head span {
        font-size: 12px;
        color: var(--ead-muted);
      }
      .ead-co__search {
        display: block;
        width: calc(100% - 24px);
        box-sizing: border-box;
        margin: 12px 12px 0;
        flex: none;
      }
      .ead-co__list {
        list-style: none;
        margin: 0;
        padding: 8px 0;
        overflow-x: hidden;
        overflow-y: auto;
        flex: 1;
        max-height: 360px;
        min-width: 0;
      }
      .ead-co__list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 16px;
        min-width: 0;
      }
      .ead-co__list li + li {
        border-top: 1px solid var(--ead-line-soft);
      }
      .ead-co__item--on {
        background: var(--brand-tonal-bg);
      }
      .ead-co__info {
        flex: 1;
        min-width: 0;
      }
      .ead-co__list b {
        display: block;
        font-size: 13.5px;
        color: var(--ead-ink);
        overflow-wrap: anywhere;
      }
      .ead-co__list small {
        display: block;
        font-size: 12px;
        color: var(--ead-muted);
        overflow-wrap: anywhere;
      }
      .ead-co__list .ead-btn {
        flex: 0 0 auto;
        min-width: 92px;
      }
      .ead-btn--remove {
        color: var(--danger);
        border-color: var(--danger-border);
        background: var(--danger-soft-bg);
      }
      .ead-btn--remove:hover {
        border-color: var(--danger);
      }
      .ead-co__empty {
        margin: auto;
        padding: 24px 16px;
        text-align: center;
        font-size: 13px;
        color: var(--ead-muted);
      }
      .ead-co__lock {
        font-size: 11.5px;
        font-weight: 600;
        color: var(--ead-muted);
        white-space: nowrap;
      }
      .ead-br-pick {
        border: 0;
        background: none;
        padding: 0;
        cursor: pointer;
        line-height: 0;
      }
      .ead-br-pick.locked {
        opacity: 0.7;
        cursor: default;
      }
      .ead-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 2px;
      }
      .ead-chip.static,
      .ead-chip.on,
      .ead-chip.locked {
        border: 1px solid var(--ead-line);
        background: var(--ead-surface);
        color: var(--ead-ink);
        cursor: pointer;
        height: auto;
        padding: 4px 10px;
      }
      .ead-chip.static::before,
      .ead-chip.on::before,
      .ead-chip.locked::before {
        display: none;
      }
      .ead-chip.on {
        background: #f3e4fd;
        border-color: var(--ead-purple);
        color: var(--ead-purple-900);
      }
      .ead-chip.locked {
        cursor: default;
      }
      @media (max-width: 1080px) {
        .ead-kpis {
          grid-template-columns: repeat(3, 1fr);
        }
        .ead-kpi:nth-child(4) {
          border-left: 0;
        }
        .ead-kpi:nth-child(n + 4) {
          border-top: 1px solid var(--ead-line);
        }
        .ead-search input {
          width: 210px;
        }
      }
      @media (max-width: 860px) {
        .ead-hero {
          grid-template-columns: 1fr;
        }
        .ead-hero__cover {
          min-height: 0;
          aspect-ratio: 16 / 9;
        }
        .ead-hero__title {
          font-size: 27px;
        }
        .ead-hero__row {
          flex-direction: column;
        }
        .ead-hero__facts-grid {
          grid-template-columns: 1fr;
        }
        .ead-kpis {
          grid-template-columns: repeat(2, 1fr);
        }
        .ead-kpi:nth-child(odd) {
          border-left: 0;
        }
        .ead-kpi:nth-child(n + 3) {
          border-top: 1px solid var(--ead-line);
        }
        .ead-tabela thead {
          display: none;
        }
        .ead-tabela td {
          display: block;
          padding: 8px 20px;
          border-bottom: 0;
        }
        .ead-tabela tbody tr {
          display: block;
          border-bottom: 1px solid var(--ead-line-soft);
          padding: 8px 0;
        }
        .ead-tabela thead th.ead-acoes,
        .ead-tabela td.ead-acoes {
          text-align: left;
        }
        .ead-acoes__row {
          justify-content: flex-start;
        }
        .ead-edit__grid,
        .ead-edit__times,
        .ead-indicate,
        .ead-indicate--internal {
          grid-template-columns: 1fr;
        }
        .ead-tablebar {
          flex-direction: column;
          align-items: stretch;
        }
        .ead-tablebar .form-select {
          max-width: none;
        }
      }
    `,
  ],
})
export class EventAccreditationDetailComponent implements OnInit, OnDestroy {
  private readonly service = inject(EventAccreditationService);
  private readonly companiesApi = inject(CompanyService);
  private readonly profilePhotos = inject(MicrosoftProfileService);
  private readonly collaborators = inject(CollaboratorService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly nav = inject(NavigationStateService);
  private readonly router = inject(Router);

  readonly item = signal<EventAccreditationItem | null>(null);
  readonly coverSrc = signal<string | null>(null);
  readonly companyLogos = signal<Record<string, string>>({});
  readonly userPhotos = signal<Record<string, string>>({});
  private companyLogoLoad = 0;
  private userPhotoLoad = 0;
  readonly editCoverPreview = signal<string | null>(null);
  editCoverFile: File | null = null;
  private editCoverObjectUrl: string | null = null;
  readonly loading = signal(true);
  readonly acting = signal(false);
  readonly exporting = signal(false);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly roles = signal<CollaboratorRole[]>([]);
  readonly bracelets = signal<BraceletType[]>([]);
  readonly catalogBracelets = signal<BraceletType[]>([]);
  readonly catalogCompanies = signal<AccreditationCompanyBrief[]>([]);
  readonly selectedBracelets = signal<Set<number>>(new Set());
  readonly selectedInternalBracelets = signal<Set<number>>(new Set());
  readonly selectedCompanyIds = signal<Set<number>>(new Set());
  readonly selectedSectorIds = signal<Set<number>>(new Set());
  readonly catalogSectors = signal<{ id: number; nome: string }[]>([]);
  readonly showAddCompanies = signal(false);
  readonly addCompaniesSetor = signal<AccreditationSector | null>(null);
  readonly addCompanySearch = signal('');
  readonly addSelectedCompanyIds = signal<Set<number>>(new Set());
  readonly editCompanySearch = signal('');
  readonly editInternalEnabled = signal(false);
  readonly editPhotoRequired = signal(false);
  readonly editName = signal('');
  readonly formatCnpj = formatCnpj;
  readonly insStart = signal<string | null>(null);
  readonly insEnd = signal<string | null>(null);
  readonly eventDays = signal<Set<string>>(new Set());
  readonly now = signal(Date.now());
  readonly picked = signal<Record<number, number[]>>({});
  readonly pickedInternals = signal<number[]>([]);
  readonly companyFilter = signal<'all' | 'pending' | 'empty'>('all');
  readonly companyQuery = signal('');
  readonly sectorsExpanded = signal(false);
  readonly heroSetorLimit = 4;
  bulkInternalBracelet: number | string | null = null;
  bulkCompanyBracelet: Record<number, number | string | null> = {};
  readonly showBulkModal = signal(false);
  readonly bulkCompany = signal<AccreditationCompany | null>(null);
  readonly reasonFor = signal<{ companyId: number; ids: number[]; target?: 'company' | 'internal' } | null>(null);

  accreditationBulkAdapter: BulkImportApiAdapter = {
    downloadTemplate: () => {
      const ev = this.item();
      const company = this.bulkCompany();
      if (!ev || !company) throw new Error('Contexto inválido');
      return this.service.downloadCompanyBulkTemplate(ev.id_event_accreditation, company.id_company);
    },
    preview: (file: File) => {
      const ev = this.item();
      const company = this.bulkCompany();
      if (!ev || !company) throw new Error('Contexto inválido');
      return this.service.bulkImportPreview(ev.id_event_accreditation, company.id_company, file);
    },
    confirm: (previewToken, decisoes) => {
      const ev = this.item();
      const company = this.bulkCompany();
      if (!ev || !company) throw new Error('Contexto inválido');
      return this.service.bulkImportConfirm(
        ev.id_event_accreditation,
        company.id_company,
        previewToken,
        decisoes,
      );
    },
    templateFilename: 'template-credenciamento-evento-colaboradores.xlsx',
    confirmLabel: 'Importar indicações',
  };
  readonly pickedInternalBracelets = signal<Set<number>>(new Set());

  isInternalOnlyView(ev: EventAccreditationItem): boolean {
    return !ev.can_manage && !ev.can_decide && !(ev.companies || []).length;
  }

  companyRoleOptions(company: AccreditationCompany): { id: number; label: string }[] {
    const seen = new Map<number, string>();
    for (const c of company.collaborators || []) {
      if (!c.id_collaborator_role || seen.has(c.id_collaborator_role)) continue;
      seen.set(c.id_collaborator_role, c.role_description || `Função ${c.id_collaborator_role}`);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  companyBraceletOptions(company: AccreditationCompany): BraceletType[] {
    const ev = this.item();
    const byId = new Map<number, BraceletType>();
    for (const b of ev?.bracelet_types || this.bracelets()) {
      byId.set(b.id_bracelet_type, b);
    }
    for (const c of company.collaborators || []) {
      if (!c.id_bracelet_type || byId.has(c.id_bracelet_type)) continue;
      byId.set(c.id_bracelet_type, {
        id_bracelet_type: c.id_bracelet_type,
        name: c.bracelet_name,
        event_kind: c.bracelet_kind,
        icon: c.bracelet_icon,
        color: c.bracelet_color,
        ativo: true,
      });
    }
    return [...byId.values()];
  }

  filteredCollaborators(company: AccreditationCompany): AccreditationCollaborator[] {
    const roleId = this.filterRole[company.id_company] ?? null;
    const braceletId = this.filterBracelet[company.id_company] ?? null;
    const q = this.companyQuery().trim().toLowerCase();
    const companyName = `${company.fancy_name || ''} ${company.company_name}`.toLowerCase();
    const filterByPerson = !!q && !companyName.includes(q);
    return (company.collaborators || []).filter((c) => {
      if (roleId != null && c.id_collaborator_role !== roleId) return false;
      if (braceletId != null && String(c.id_bracelet_type) !== String(braceletId)) return false;
      if (filterByPerson) {
        const name = (c.collaborator_name || '').toLowerCase();
        const doc = (c.collaborator_document || '').toLowerCase();
        const digits = (c.collaborator_document || '').replace(/\D/g, '');
        const qDigits = q.replace(/\D/g, '');
        const docHit = doc.includes(q) || (qDigits.length >= 3 && digits.includes(qDigits));
        if (!name.includes(q) && !docHit) return false;
      }
      return true;
    });
  }

  filteredCompanies(ev: EventAccreditationItem): AccreditationCompany[] {
    const q = this.companyQuery().trim().toLowerCase();
    const filter = this.companyFilter();
    return (ev.companies || []).filter((company) => {
      if (filter === 'pending' && this.countPending(company) === 0) return false;
      if (filter === 'empty' && company.collaborators.length > 0) return false;
      if (!q) return true;
      const name = `${company.fancy_name || ''} ${company.company_name}`.toLowerCase();
      if (name.includes(q)) return true;
      return (company.collaborators || []).some(
        (col) =>
          (col.collaborator_name || '').toLowerCase().includes(q) ||
          (col.collaborator_document || '').toLowerCase().includes(q),
      );
    });
  }

  companyInitials(company: AccreditationCompany): string {
    return this.personInitials(company.fancy_name || company.company_name);
  }

  companyLogo(company: AccreditationCompany): string | null {
    return this.companyLogos()[String(company.id_company)] || null;
  }

  userPhoto(idUsuario: number | string | null | undefined): string | null {
    if (idUsuario == null || idUsuario === '') return null;
    return this.userPhotos()[String(idUsuario)] || null;
  }

  ownInternalPhoto(ev: EventAccreditationItem): string | null {
    const id = this.myInternalsOf(ev)[0]?.id_usuario;
    return this.userPhoto(id);
  }

  private loadCompanyLogos(item: EventAccreditationItem): void {
    const loadId = ++this.companyLogoLoad;
    this.companyLogos.set({});
    for (const company of item.companies || []) {
      if (!company.logo) continue;
      const key = String(company.id_company);
      this.companiesApi.getLogoBlob(company.logo).subscribe({
        next: (url) => {
          if (loadId !== this.companyLogoLoad) return;
          this.companyLogos.update((map) => ({ ...map, [key]: url }));
        },
        error: () => {},
      });
    }
  }

  private loadInternalPhotos(item: EventAccreditationItem): void {
    const loadId = ++this.userPhotoLoad;
    this.userPhotos.set({});
    const ids = new Set<string>();
    for (const row of [...(item.internals || []), ...(item.my_internals || [])]) {
      if (row.id_usuario != null && row.id_usuario !== ('' as never)) ids.add(String(row.id_usuario));
    }
    if (item.my_internal?.id_usuario != null) ids.add(String(item.my_internal.id_usuario));
    for (const id of ids) {
      void this.profilePhotos.fetchUserPhotoObjectUrl(id).then((url) => {
        if (loadId !== this.userPhotoLoad || !url) return;
        this.userPhotos.update((map) => ({ ...map, [id]: url }));
      });
    }
  }

  personInitials(name?: string | null): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  heroBracelets(ev: EventAccreditationItem): BraceletType[] {
    return this.isInternalOnlyView(ev) ? ev.internal_bracelet_types || [] : ev.bracelet_types || [];
  }

  braceletColor(b: BraceletType): string {
    return normalizeBraceletColor(b.color);
  }

  showHeroMenu(ev: EventAccreditationItem): boolean {
    return !!(ev.can_manage || ev.can_delete);
  }

  pendingChipLabel(ev: EventAccreditationItem): string {
    const n = this.pendingTotal(ev);
    if (!n) return 'Nada pendente';
    return n === 1 ? '1 pendente' : `${n} pendentes`;
  }

  prazoHeroLabel(ev: EventAccreditationItem): string {
    if (!ev.inscription_end) return '';
    const fim = new Date(ev.inscription_end).getTime();
    if (Number.isNaN(fim)) return '';
    return this.now() > fim ? 'encerrado' : 'aberta';
  }

  heroSetores(ev: EventAccreditationItem): AccreditationSector[] {
    if (ev.setores?.length) return ev.setores;
    if (ev.id_setor || ev.setor_nome) {
      return [
        {
          id_setor: ev.id_setor || 0,
          nome: ev.setor_nome || '—',
          approvers_count: ev.setor_approvers_count ?? 0,
        },
      ];
    }
    return [];
  }

  visibleHeroSetores(ev: EventAccreditationItem): AccreditationSector[] {
    const all = this.heroSetores(ev);
    if (this.sectorsExpanded() || all.length <= this.heroSetorLimit) return all;
    return all.slice(0, this.heroSetorLimit);
  }

  hiddenHeroSetoresCount(ev: EventAccreditationItem): number {
    return Math.max(0, this.heroSetores(ev).length - this.heroSetorLimit);
  }

  toggleHeroSetores(): void {
    this.sectorsExpanded.update((open) => !open);
  }

  setoresCountLabel(ev: EventAccreditationItem): string {
    const n = this.heroSetores(ev).length;
    if (!n) return 'Nenhum setor';
    return `${n} setor${n === 1 ? '' : 'es'}`;
  }

  setoresSummary(ev: EventAccreditationItem): string {
    return `${this.setoresCountLabel(ev)} · ${this.approversLabel(ev)}`;
  }

  statusChip(status?: number | null): string {
    const st = Number(status);
    if (st === 3) return 'ok';
    if (st === 4 || st === 5) return 'bad';
    if (st === 1 || st === 2) return 'wait';
    return 'idle';
  }

  togglePickInternalBracelet(id: number): void {
    const next = new Set(this.pickedInternalBracelets());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.pickedInternalBracelets.set(next);
  }

  myInternalsOf(ev: EventAccreditationItem): AccreditationInternal[] {
    if (ev.my_internals?.length) return ev.my_internals;
    return ev.my_internal ? [ev.my_internal] : [];
  }

  hasPendingOwnInternal(ev: EventAccreditationItem): boolean {
    return this.myInternalsOf(ev).some((row) => this.isPendingInternal(row));
  }
  insTimeStart = '00:00';
  insTimeEnd = '18:00';
  blockReason: string = BLOCK_REASONS[0];
  blockNote = '';
  readonly blockReasons = BLOCK_REASONS;

  search: Record<number, string> = {};
  readonly searchResults = signal<Record<number, CollaboratorItem[]>>({});
  readonly searching = signal<Record<number, boolean>>({});
  readonly pickedSearchItem = signal<Record<number, CollaboratorItem | null>>({});
  pickCollaborator: Record<number, number | null> = {};
  readonly pickRole = signal<Record<number, number | null>>({});
  pickBracelet: Record<number, number | string | null> = {};
  filterRole: Record<number, number | null> = {};
  filterBracelet: Record<number, number | string | null> = {};
  readonly formatCpf = formatCpf;
  private readonly searchDebounceMs = 500;
  private searchTimers: Record<number, ReturnType<typeof setTimeout> | undefined> = {};
  private nowTimer: ReturnType<typeof setInterval> | undefined;
  private routeSub?: Subscription;

  readonly formatDateBr = formatDateBr;
  readonly formatEventDatesBr = formatEventDatesBr;
  readonly formatDateTimeBr = formatDateTimeBr;
  readonly kindLabel = kindLabel;
  readonly formatIsoBr = formatIsoBr;

  canAddCollaborators(ev: EventAccreditationItem, company: AccreditationCompany): boolean {
    if (!ev.ativo || !ev.inscription_open) return false;
    return !!company.can_indicate || !!ev.can_manage;
  }

  canEditCompanyBracelet(
    ev: EventAccreditationItem,
    company: AccreditationCompany,
    c: AccreditationCollaborator,
  ): boolean {
    if (!this.isPending(c)) return false;
    return !!company.can_decide || this.canAddCollaborators(ev, company);
  }

  isPending(c: AccreditationCollaborator | number): boolean {
    return isCollaboratorPending(typeof c === 'number' ? c : c.id_access_status);
  }

  isApproved(c: AccreditationCollaborator | number): boolean {
    return isCollaboratorApproved(typeof c === 'number' ? c : c.id_access_status);
  }

  isBlocked(c: AccreditationCollaborator | number): boolean {
    return isCollaboratorBlocked(typeof c === 'number' ? c : c.id_access_status);
  }

  readonly insWindowEnd = computed(() => this.insEnd() || this.insStart());
  readonly insTicks = computed<MonthCalendarTick[]>(() => {
    return this.sortedEventDays().map((iso) => ({ iso, kind: 'ev' as const }));
  });
  readonly eventTicks = computed<MonthCalendarTick[]>(() => {
    const a = this.insStart();
    const b = this.insWindowEnd();
    if (!a || !b) return [];
    return this.daysInRange(a, b).map((iso) => ({ iso, kind: 'win' as const }));
  });

  ngOnInit(): void {
    this.collaborators.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles || []),
    });
    const id = this.nav.obter('/admin/credenciamento-eventos/detalhe')?.public_id;
    if (!id) {
      void this.router.navigate(['/admin/credenciamento-eventos']);
      return;
    }
    this.carregar(id as never);
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    if (this.nowTimer) clearInterval(this.nowTimer);
    this.revokeEditCoverObjectUrl();
  }

  carregar(id: number): void {
    this.sectorsExpanded.set(false);
    this.editing.set(false);
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (res) => {
        this.applyItem(res.item);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (redirecionarSeAcessoNegado(err, this.router, this.notification, '/admin/credenciamento-eventos')) return;
        this.notification.notifyHttpError(err, 'Falha ao carregar credenciamento.');
        void this.router.navigate(['/admin/credenciamento-eventos']);
      },
    });
  }

  duplicarCredenciamento(): void {
    const ev = this.item();
    if (!ev?.can_manage) return;
    Swal.fire({
      title: 'Duplicar evento?',
      text: `Uma cópia de "${ev.name}" será criada com as mesmas datas, setores e pulseiras. Empresas e indicações não são copiadas.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Duplicar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor:
        getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#1d54e6',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.acting.set(true);
      this.service.duplicate(ev.id_event_accreditation).subscribe({
        next: (res) => {
          this.acting.set(false);
          this.notification.success('Credenciamento duplicado.');
          void this.nav.navegar('/admin/credenciamento-eventos/detalhe', {
            public_id: String(res.item.public_id || res.item.id_event_accreditation),
          });
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao duplicar credenciamento.');
        },
      });
    });
  }

  excluirCredenciamento(): void {
    const ev = this.item();
    if (!ev || !(ev.can_delete || ev.can_manage)) return;
    Swal.fire({
      title: 'Excluir credenciamento?',
      text: `Excluir "${ev.name}" apaga empresas, indicações, convites e aprovações ligadas. Esta ação não pode ser desfeita.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.acting.set(true);
      this.service.remove(ev.id_event_accreditation).subscribe({
        next: () => {
          this.acting.set(false);
          this.notification.success('Credenciamento excluído.');
          void this.router.navigate(['/admin/credenciamento-eventos']);
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao excluir credenciamento.');
        },
      });
    });
  }

  removerEmpresa(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev || !company.can_remove || company.id_setor == null) return;
    const nome = company.fancy_name || company.company_name;
    Swal.fire({
      title: 'Remover empresa?',
      text: `Remover "${nome}" deste setor também apaga os colaboradores pendentes. Só é possível enquanto a indicação ainda não foi enviada.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.acting.set(true);
      this.service.removeSectorCompany(ev.id_event_accreditation, company.id_setor!, company.id_company).subscribe({
        next: (res) => {
          this.acting.set(false);
          this.applyItem(res.item);
          this.notification.success('Empresa removida do setor.');
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao remover empresa.');
        },
      });
    });
  }

  private applyItem(item: EventAccreditationItem): void {
    this.item.set(item);
    this.loadCompanyLogos(item);
    this.loadInternalPhotos(item);
    this.coverSrc.set(null);
    if (item.cover) {
      this.service.getCoverBlob(item.cover).subscribe({
        next: (url) => this.coverSrc.set(url),
        error: () => {},
      });
    }
    this.picked.set({});
    this.pickedInternals.set([]);
    this.bulkInternalBracelet = null;
    this.bulkCompanyBracelet = {};
    this.reasonFor.set(null);
    const selected = item.bracelet_types || [];
    if (selected.length) {
      this.bracelets.set(selected);
    } else {
      this.service.listBraceletTypes({ event_kind: item.event_kind }).subscribe({
        next: (br) => this.bracelets.set(br.types || []),
      });
    }
  }

  kpisOf(ev: EventAccreditationItem): EventAccreditationKpis {
    return ev.kpis || this.computeKpis(ev.companies || []);
  }

  companiesCompleted(k: EventAccreditationKpis): number {
    return k.companies_waiting + k.companies_approved + k.companies_denied;
  }

  pct(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  pendingTotal(ev: EventAccreditationItem): number {
    const companies = (ev.companies || []).reduce((acc, c) => acc + this.countPending(c), 0);
    const internals = ev.can_decide_internal ? this.countInternalPending(ev) : 0;
    return companies + internals;
  }

  hasCompaniesInIndication(ev: EventAccreditationItem): boolean {
    return (ev.companies || []).some((c) => c.indication_status === 'INDICACAO');
  }

  countPending(company: AccreditationCompany): number {
    return (company.collaborators || []).filter((c) => isCollaboratorPending(c.id_access_status)).length;
  }

  countApproved(company: AccreditationCompany): number {
    return (company.collaborators || []).filter((c) => isCollaboratorApproved(c.id_access_status)).length;
  }

  countBlocked(company: AccreditationCompany): number {
    return (company.collaborators || []).filter((c) => isCollaboratorBlocked(c.id_access_status)).length;
  }

  hasCollaboratorPicture(c: AccreditationCollaborator): boolean {
    return !!(c.collaborator_picture && String(c.collaborator_picture).trim());
  }

  isPhotoGateCollaborator(c: AccreditationCollaborator): boolean {
    return isCollaboratorPending(c.id_access_status) || isCollaboratorApproved(c.id_access_status);
  }

  countMissingPhotos(company: AccreditationCompany): number {
    if (company.missing_photo_count != null) return Number(company.missing_photo_count);
    return (company.collaborators || []).filter(
      (c) => this.isPhotoGateCollaborator(c) && !this.hasCollaboratorPicture(c),
    ).length;
  }

  hasMissingPhotos(company: AccreditationCompany): boolean {
    return this.countMissingPhotos(company) > 0;
  }

  showsMissingPhoto(ev: EventAccreditationItem, c: AccreditationCollaborator): boolean {
    return !!ev.photo_required && this.isPhotoGateCollaborator(c) && !this.hasCollaboratorPicture(c);
  }

  canShowNotifyOwner(company: AccreditationCompany): boolean {
    return (
      !!company.can_decide &&
      (company.collaborators?.length ?? 0) > 0 &&
      (company.indication_status === 'APROVADO' || company.indication_status === 'NEGADO')
    );
  }

  notifyOwnerTitle(company: AccreditationCompany): string {
    const n = this.countMissingPhotos(company);
    if (!n) return '';
    return n === 1
      ? '1 colaborador sem foto. O responsável só pode ser avisado quando todos tiverem foto.'
      : `${n} colaboradores sem foto. O responsável só pode ser avisado quando todos tiverem foto.`;
  }

  photoBlocksSectorNotify(ev: EventAccreditationItem, company: AccreditationCompany): boolean {
    return !!ev.photo_required && this.hasMissingPhotos(company);
  }

  onCollaboratorPhotoChanged(
    company: AccreditationCompany,
    target: AccreditationCollaborator,
    filename: string,
  ): void {
    const ev = this.item();
    if (!ev) return;
    const companies = (ev.companies || []).map((co) => {
      if (co.id_event_accreditation_company !== company.id_event_accreditation_company) return co;
      const collaborators = (co.collaborators || []).map((col) =>
        col.id_collaborator === target.id_collaborator
          ? { ...col, collaborator_picture: filename }
          : col,
      );
      return {
        ...co,
        collaborators,
        missing_photo_count: collaborators.filter(
          (col) => this.isPhotoGateCollaborator(col) && !this.hasCollaboratorPicture(col),
        ).length,
      };
    });
    this.applyItem({ ...ev, companies });
  }

  notifySectorTitle(ev: EventAccreditationItem, company: AccreditationCompany): string {
    if (!this.photoBlocksSectorNotify(ev, company)) return '';
    const n = this.countMissingPhotos(company);
    return n === 1
      ? '1 colaborador sem foto. O setor só pode ser avisado quando todos tiverem foto.'
      : `${n} colaboradores sem foto. O setor só pode ser avisado quando todos tiverem foto.`;
  }

  companyPillClass(company: AccreditationCompany): string {
    if (!company.collaborators.length) return 'idle';
    if (this.countPending(company)) return 'wait';
    if (this.countApproved(company) && !this.countBlocked(company)) return 'ok';
    if (this.countApproved(company)) return 'ok';
    return 'bad';
  }

  companyPillLabel(company: AccreditationCompany): string {
    if (!company.collaborators.length) return 'Sem indicações';
    const pend = this.countPending(company);
    if (pend) return `${pend} aguardando você`;
    if (this.countApproved(company) && !this.countBlocked(company)) return 'Tudo aprovado';
    if (this.countApproved(company)) return 'Concluído';
    return 'Tudo bloqueado';
  }

  eventStatusLabel(ev: EventAccreditationItem): string {
    const st = Number(ev.id_access_status);
    const raw = (ev.access_status_description || '').trim();
    if (st === 1 || /^aguardando produtora$/i.test(raw)) {
      return 'Aguardando empresas';
    }
    return raw || '—';
  }

  statusPillClass(status?: number | null): string {
    const st = Number(status);
    if (st === 3) return 'ok';
    if (st === 4 || st === 5) return 'bad';
    if (st === 1 || st === 2) return 'warn';
    return 'neutral';
  }

  collabPillClass(c: AccreditationCollaborator): string {
    if (isCollaboratorApproved(c.id_access_status)) return 'ok';
    if (isCollaboratorBlocked(c.id_access_status)) return 'bad';
    return 'wait';
  }

  collabPillLabel(c: AccreditationCollaborator): string {
    if (isCollaboratorApproved(c.id_access_status)) return 'Aprovado';
    if (isCollaboratorBlocked(c.id_access_status)) return 'Bloqueado';
    return 'Pendente';
  }

  approversLabel(ev: EventAccreditationItem): string {
    const n = ev.setor_approvers_count ?? 0;
    if (!n) return 'Nenhum aprovador habilitado';
    return `${n} aprovador${n === 1 ? '' : 'es'} habilitado${n === 1 ? '' : 's'}`;
  }

  setoresLabel(ev: EventAccreditationItem): string {
    const names = (ev.setores || []).map((s) => s.nome).filter(Boolean);
    if (names.length) return names.join(', ');
    return ev.setor_nome || '—';
  }

  companiesOfSector(ev: EventAccreditationItem, idSetor: number): AccreditationCompany[] {
    return (ev.companies || []).filter((c) => String(c.id_setor) === String(idSetor));
  }

  companySectorCanNotify(ev: EventAccreditationItem, company: AccreditationCompany): boolean {
    const setor = (ev.setores || []).find((s) => String(s.id_setor) === String(company.id_setor));
    return !!setor?.can_notify_companies;
  }

  prazoPct(ev: EventAccreditationItem): number {
    const now = this.now();
    const ini = ev.inscription_start ? new Date(ev.inscription_start).getTime() : 0;
    const fim = ev.inscription_end ? new Date(ev.inscription_end).getTime() : 0;
    if (!ini || !fim || fim <= ini) return ev.inscription_open ? 0 : 100;
    return Math.min(100, Math.max(0, Math.round(((now - ini) / (fim - ini)) * 100)));
  }

  prazoLabel(ev: EventAccreditationItem): string {
    if (!ev.inscription_end) return '—';
    const fim = new Date(ev.inscription_end).getTime();
    if (Number.isNaN(fim)) return '—';
    const now = this.now();
    if (now > fim) return 'Indicações encerradas';
    const h = Math.floor((fim - now) / 36e5);
    if (h > 24) return `Aberta · faltam ${Math.floor(h / 24)} dia(s)`;
    if (h >= 1) return `Aberta · faltam ${h}h`;
    return 'Aberta · menos de 1h';
  }

  formatShortRange(start?: string | null, end?: string | null): string {
    return `${this.formatShortDateTime(start)} → ${this.formatShortDateTime(end)}`;
  }

  formatShortDateTime(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '');
  }

  formatAuditAt(value?: string | null): string {
    return this.formatShortDateTime(value);
  }

  pickedInternalIds(): number[] {
    return this.pickedInternals();
  }

  pickedInternalCount(): number {
    return this.pickedInternals().length;
  }

  isInternalPicked(id: number): boolean {
    return this.pickedInternals().includes(id);
  }

  pendingInternalIds(ev: EventAccreditationItem): number[] {
    return (ev.internals || [])
      .filter((c) => this.isPendingInternal(c))
      .map((c) => c.id_event_accreditation_internal);
  }

  allPendingInternalsPicked(ev: EventAccreditationItem): boolean {
    const pending = this.pendingInternalIds(ev);
    return pending.length > 0 && pending.every((id) => this.isInternalPicked(id));
  }

  toggleInternalPick(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = new Set(this.pickedInternals());
    if (checked) current.add(id);
    else current.delete(id);
    this.pickedInternals.set([...current]);
  }

  toggleAllInternals(ev: EventAccreditationItem, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.pickedInternals.set(checked ? this.pendingInternalIds(ev) : []);
  }

  aplicarPulseiraInternos(): void {
    const ids = this.pickedInternalIds();
    const braceletId = entityId(this.bulkInternalBracelet);
    if (!ids.length || braceletId == null) return;
    this.trocarPulseira('internal', ids, braceletId);
  }

  aplicarPulseiraEmpresa(company: AccreditationCompany): void {
    const ids = this.pickedIds(company);
    const braceletId = entityId(this.bulkCompanyBracelet[company.id_event_accreditation_company]);
    if (!ids.length || braceletId == null) return;
    this.trocarPulseira('company', ids, braceletId);
  }

  aprovarInternosSelecionados(): void {
    const ids = this.pickedInternalIds();
    if (!ids.length) return;
    this.decidir(ids, 'approve', undefined, undefined, 'internal');
  }

  pickedIds(company: AccreditationCompany): number[] {
    return this.picked()[company.id_event_accreditation_company] || [];
  }

  pickedCount(company: AccreditationCompany): number {
    return this.pickedIds(company).length;
  }

  isPicked(company: AccreditationCompany, id: number): boolean {
    return this.pickedIds(company).includes(id);
  }

  allPendingPicked(company: AccreditationCompany): boolean {
    const pending = this.pendingIds(company);
    return pending.length > 0 && pending.every((id) => this.isPicked(company, id));
  }

  pendingIds(company: AccreditationCompany): number[] {
    return (company.collaborators || [])
      .filter((c) => isCollaboratorPending(c.id_access_status))
      .map((c) => c.id_event_accreditation_collaborator);
  }

  togglePick(company: AccreditationCompany, id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const key = company.id_event_accreditation_company;
    const current = new Set(this.picked()[key] || []);
    if (checked) current.add(id);
    else current.delete(id);
    this.picked.set({ ...this.picked(), [key]: [...current] });
  }

  toggleAll(company: AccreditationCompany, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const key = company.id_event_accreditation_company;
    this.picked.set({
      ...this.picked(),
      [key]: checked ? this.pendingIds(company) : [],
    });
  }

  abrirMotivo(company: AccreditationCompany, ids: number[]): void {
    if (!ids.length) return;
    this.blockReason = BLOCK_REASONS[0];
    this.blockNote = '';
    this.reasonFor.set({ companyId: company.id_event_accreditation_company, ids, target: 'company' });
  }

  abrirMotivoInterno(ids: number[]): void {
    if (!ids.length) return;
    this.blockReason = BLOCK_REASONS[0];
    this.blockNote = '';
    this.reasonFor.set({ companyId: 0, ids, target: 'internal' });
  }

  fecharMotivo(): void {
    this.reasonFor.set(null);
  }

  confirmarBloqueio(): void {
    const reason = this.reasonFor();
    if (!reason?.ids.length) return;
    this.decidir(reason.ids, 'block', this.blockReason, this.blockNote, reason.target || 'company');
  }

  aprovarSelecionados(company: AccreditationCompany): void {
    const ids = this.pickedIds(company);
    if (!ids.length) return;
    void this.confirmAndDecide(
      `Aprovar ${ids.length} colaborador(es) selecionado(s)?`,
      ids,
      'approve',
    );
  }

  aprovarEmpresa(company: AccreditationCompany): void {
    const ids = this.pendingIds(company);
    if (!ids.length) return;
    const nome = company.fancy_name || company.company_name;
    void this.confirmAndDecide(
      `Aprovar ${ids.length} colaborador(es) de ${nome}? Eles ficam liberados para entrar no dia do evento.`,
      ids,
      'approve',
    );
  }

  aprovarTodosPendentes(): void {
    const ev = this.item();
    if (!ev) return;
    const companyIds = (ev.companies || []).flatMap((c) => this.pendingIds(c));
    const internalIds = ev.can_decide_internal ? this.pendingInternalIds(ev) : [];
    if (!companyIds.length && !internalIds.length) return;
    void this.confirmAndDecide(
      `Aprovar ${companyIds.length + internalIds.length} colaborador(es) pendentes?`,
      companyIds,
      'approve',
      internalIds,
    );
  }

  private async confirmAndDecide(
    text: string,
    ids: number[],
    action: 'approve' | 'unblock',
    internalIds: number[] = [],
  ): Promise<void> {
    const res = await Swal.fire({
      title: action === 'approve' ? 'Aprovar colaboradores?' : 'Desbloquear?',
      text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action === 'approve' ? 'Aprovar' : 'Desbloquear',
      cancelButtonText: 'Cancelar',
      confirmButtonColor:
        getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#1d54e6',
    });
    if (!res.isConfirmed) return;
    if (ids.length) {
      this.decidir(ids, action, undefined, undefined, 'company', () => {
        if (internalIds.length) this.decidir(internalIds, action, undefined, undefined, 'internal');
      });
      return;
    }
    if (internalIds.length) this.decidir(internalIds, action, undefined, undefined, 'internal');
  }

  onPickBracelet(
    target: 'company' | 'internal',
    idOrIds: number | string | Array<number | string>,
    idBracelet: number | string | null,
  ): void {
    if (idBracelet == null) return;
    this.trocarPulseira(target, idOrIds, idBracelet);
  }

  trocarPulseira(
    target: 'company' | 'internal',
    idOrIds: number | string | Array<number | string>,
    idBracelet: number | string,
  ): void {
    const ev = this.item();
    const braceletId = entityId(idBracelet);
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds])
      .map((n) => entityId(n))
      .filter((n): n is number | string => n != null);
    if (!ev || braceletId == null || !ids.length) return;
    this.acting.set(true);
    this.service
      .changeBracelet(ev.id_event_accreditation, {
        target,
        ids,
        id_bracelet_type: braceletId,
      })
      .subscribe({
        next: (res) => {
          this.acting.set(false);
          this.applyItem(res.item);
          this.notification.success(
            ids.length > 1 ? `Pulseira aplicada em ${ids.length} colaborador(es).` : 'Pulseira atualizada.',
          );
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao trocar a pulseira.');
        },
      });
  }

  decidir(
    ids: number[],
    action: 'approve' | 'block' | 'unblock',
    reason?: string,
    note?: string,
    target: 'company' | 'internal' = 'company',
    onDone?: () => void,
  ): void {
    const ev = this.item();
    if (!ev || !ids.length) return;
    this.acting.set(true);
    this.service
      .decideCollaborators(ev.id_event_accreditation, {
        action,
        ids,
        reason,
        note: note?.trim() || undefined,
        target,
      })
      .subscribe({
        next: (res) => {
          this.acting.set(false);
          this.applyItem(res.item);
          const msg =
            action === 'approve'
              ? 'Colaborador(es) aprovado(s).'
              : action === 'block'
                ? 'Colaborador(es) bloqueado(s).'
                : 'Colaborador(es) desbloqueado(s).';
          this.notification.success(msg);
          onDone?.();
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao registrar a decisão.');
        },
      });
  }

  notificar(idCompany?: number): void {
    const ev = this.item();
    if (!ev) return;
    this.acting.set(true);
    this.service.notifyCompanies(ev.id_event_accreditation, idCompany ? { id_company: idCompany } : {}).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success(
          res.sent
            ? `Lembrete enviado (${res.sent} e-mail${res.sent === 1 ? '' : 's'}).`
            : 'Nenhum e-mail de contato encontrado para a(s) empresa(s).',
        );
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao notificar empresas.');
      },
    });
  }

  private computeKpis(companies: AccreditationCompany[]): EventAccreditationKpis {
    const kpis = emptyKpis();
    kpis.companies_total = companies.length;
    for (const company of companies) {
      if (company.indication_status === 'INDICACAO') kpis.companies_pending += 1;
      else if (company.indication_status === 'AGUARDANDO_APROVACAO') kpis.companies_waiting += 1;
      else if (company.indication_status === 'APROVADO') kpis.companies_approved += 1;
      else if (company.indication_status === 'NEGADO') kpis.companies_denied += 1;
      for (const col of company.collaborators || []) {
        kpis.collaborators_total += 1;
        const st = Number(col.id_access_status);
        if (st === STATUS_APROVADO) kpis.collaborators_approved += 1;
        else if (st === STATUS_NEGADO || isCollaboratorBlocked(st)) kpis.collaborators_denied += 1;
        else kpis.collaborators_waiting += 1;
      }
    }
    return kpis;
  }

  isPendingInternal(c: AccreditationInternal): boolean {
    return isCollaboratorPending(c.id_access_status);
  }

  internalPillClass(c: AccreditationInternal): string {
    if (isCollaboratorApproved(c.id_access_status)) return 'ok';
    if (isCollaboratorBlocked(c.id_access_status)) return 'bad';
    return 'wait';
  }

  internalPillLabel(c: AccreditationInternal): string {
    if (isCollaboratorApproved(c.id_access_status)) return 'Aprovado';
    if (isCollaboratorBlocked(c.id_access_status)) return 'Bloqueado';
    return 'Pendente';
  }

  countInternalPending(ev: EventAccreditationItem): number {
    return (ev.internals || []).filter((c) => this.isPendingInternal(c)).length;
  }

  countInternalApproved(ev: EventAccreditationItem): number {
    return (ev.internals || []).filter((c) => isCollaboratorApproved(c.id_access_status)).length;
  }

  countInternalBlocked(ev: EventAccreditationItem): number {
    return (ev.internals || []).filter((c) => isCollaboratorBlocked(c.id_access_status)).length;
  }

  aprovarInternosPendentes(ev: EventAccreditationItem): void {
    const ids = this.pendingInternalIds(ev);
    if (!ids.length) return;
    void this.confirmAndDecide(`Aprovar ${ids.length} colaborador(es) interno(s)?`, [], 'approve', ids);
  }

  inscreverInterno(): void {
    const ev = this.item();
    const braceletIds = [...this.pickedInternalBracelets()];
    if (!ev || !braceletIds.length) {
      this.notification.error('Selecione ao menos uma pulseira.');
      return;
    }
    this.acting.set(true);
    this.service.registerInternal(ev.id_event_accreditation, { id_bracelet_types: braceletIds }).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.pickedInternalBracelets.set(new Set());
        this.applyItem(res.item);
        this.notification.success(
          braceletIds.length === 1
            ? 'Inscrição enviada para aprovação.'
            : `${braceletIds.length} inscrições enviadas para aprovação.`,
        );
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao se inscrever.');
      },
    });
  }

  cancelarInterno(): void {
    const ev = this.item();
    if (!ev) return;
    this.acting.set(true);
    this.service.unregisterInternal(ev.id_event_accreditation).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success('Inscrição cancelada.');
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao cancelar a inscrição.');
      },
    });
  }

  usedInternalBraceletIds(): Set<number> {
    const used = new Set<number>();
    for (const row of this.item()?.internals || []) used.add(row.id_bracelet_type);
    return used;
  }

  isInternalBraceletOn(id: number): boolean {
    return this.selectedInternalBracelets().has(id);
  }

  isInternalBraceletLocked(id: number): boolean {
    return this.usedInternalBraceletIds().has(id);
  }

  toggleInternalBracelet(id: number): void {
    const next = new Set(this.selectedInternalBracelets());
    if (next.has(id)) {
      if (this.isInternalBraceletLocked(id)) {
        this.notification.error('Não é possível remover um tipo de pulseira já atribuído a colaboradores internos.');
        return;
      }
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedInternalBracelets.set(next);
  }

  usedBraceletIds(): Set<number> {
    const used = new Set<number>();
    for (const company of this.item()?.companies || []) {
      for (const col of company.collaborators || []) {
        used.add(col.id_bracelet_type);
      }
    }
    return used;
  }

  beginEdit(): void {
    const ev = this.item();
    if (!ev?.can_manage) return;
    const start = fromIsoToSp(ev.inscription_start);
    const end = fromIsoToSp(ev.inscription_end);
    this.insStart.set(start.date || null);
    this.insEnd.set(end.date || start.date || null);
    this.insTimeStart = start.time || '00:00';
    this.insTimeEnd = end.time || '18:00';
    this.eventDays.set(new Set(normalizeEventDates(ev.event_dates, ev.start, ev.end)));
    this.selectedBracelets.set(new Set((ev.bracelet_types || []).map((b) => b.id_bracelet_type)));
    this.editInternalEnabled.set(!!ev.internal_enabled);
    this.editPhotoRequired.set(!!ev.photo_required);
    this.selectedInternalBracelets.set(
      new Set((ev.internal_bracelet_types || []).map((b) => b.id_bracelet_type)),
    );
    this.selectedCompanyIds.set(new Set((ev.companies || []).map((c) => c.id_company)));
    this.selectedSectorIds.set(
      new Set((ev.setores || []).map((s) => s.id_setor).filter((id): id is number => !!id)),
    );
    this.editCompanySearch.set('');
    this.service.listSectors().subscribe({
      next: (res) => this.catalogSectors.set(res.sectors || []),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
    this.service.listBraceletTypes({ event_kind: ev.event_kind }).subscribe({
      next: (res) => this.catalogBracelets.set(res.types || []),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tipos de pulseira.'),
    });
    this.service.listCompanies().subscribe({
      next: (res) => {
        const byId = new Map((res.companies || []).map((c) => [c.id_company, c]));
        for (const company of ev.companies || []) {
          if (!byId.has(company.id_company)) {
            byId.set(company.id_company, {
              id_company: company.id_company,
              company_name: company.company_name,
              fancy_name: company.fancy_name,
            });
          }
        }
        this.catalogCompanies.set(
          [...byId.values()].sort((a, b) =>
            (a.fancy_name || a.company_name).localeCompare(b.fancy_name || b.company_name, 'pt-BR'),
          ),
        );
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
    this.editName.set(ev.name || '');
    this.resetEditCover();
    this.editCoverPreview.set(this.coverSrc());
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.resetEditCover();
    this.editing.set(false);
  }

  onEditCoverPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.notification.error('A foto deve ter no máximo 2 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.notification.error('Use JPEG, PNG ou WebP.');
      return;
    }
    this.revokeEditCoverObjectUrl();
    this.editCoverFile = file;
    this.editCoverObjectUrl = URL.createObjectURL(file);
    this.editCoverPreview.set(this.editCoverObjectUrl);
  }

  clearEditCover(): void {
    this.resetEditCover();
    this.editCoverPreview.set(this.coverSrc());
  }

  private resetEditCover(): void {
    this.editCoverFile = null;
    this.revokeEditCoverObjectUrl();
    this.editCoverPreview.set(null);
  }

  private revokeEditCoverObjectUrl(): void {
    if (this.editCoverObjectUrl) {
      URL.revokeObjectURL(this.editCoverObjectUrl);
      this.editCoverObjectUrl = null;
    }
  }

  onInsDay(iso: string): void {
    const a = this.insStart();
    const b = this.insEnd();
    if (!a || b || iso < a) {
      this.insStart.set(iso);
      this.insEnd.set(null);
      return;
    }
    this.insEnd.set(iso);
  }

  clearIns(): void {
    this.insStart.set(null);
    this.insEnd.set(null);
  }

  sortedEventDays(): string[] {
    return [...this.eventDays()].sort();
  }

  firstEventDay(): string | null {
    return this.sortedEventDays()[0] || null;
  }

  onEventDay(iso: string): void {
    const next = new Set(this.eventDays());
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    this.eventDays.set(next);
  }

  clearEventDay(): void {
    this.eventDays.set(new Set());
  }

  insValueLabel(): string {
    const a = this.insStart();
    const b = this.insEnd();
    if (!a) return 'Nenhum período selecionado';
    return b ? `${formatIsoBr(a)} → ${formatIsoBr(b)}` : `${formatIsoBr(a)} → —`;
  }

  eventValueLabel(): string {
    const days = this.sortedEventDays();
    return days.length ? formatEventDatesBr(days) : 'Nenhum dia selecionado';
  }

  insFooter(): string {
    const a = this.insStart();
    const b = this.insEnd();
    if (a && b) {
      const n = this.daysInRange(a, b).length;
      return `${n} ${n === 1 ? 'dia selecionado' : 'dias selecionados'}`;
    }
    if (a) return 'Escolha o último dia';
    return 'Clique no primeiro dia';
  }

  eventFooter(): string {
    const n = this.eventDays().size;
    if (!n) return 'Clique para marcar os dias do evento';
    return n === 1 ? '1 dia selecionado' : `${n} dias selecionados`;
  }

  dateConflict(): string {
    const fim = this.insWindowEnd();
    const dia = this.firstEventDay();
    if (fim && dia && fim > dia) {
      return `A janela fecha depois do evento. Ajuste para terminar até ${formatIsoBr(dia)}.`;
    }
    const a = this.insStart();
    const b = this.insEnd();
    if (a && b && a === b && this.insTimeEnd <= this.insTimeStart) {
      return 'Em janela de um dia, o fechamento precisa ser depois da abertura.';
    }
    return '';
  }

  canSaveEdit(): boolean {
    return !!(
      this.editName().trim() &&
      this.eventDays().size &&
      this.insStart() &&
      this.insEnd() &&
      this.insTimeStart &&
      this.insTimeEnd &&
      this.selectedBracelets().size > 0 &&
      this.selectedSectorIds().size > 0 &&
      (!this.editInternalEnabled() || this.selectedInternalBracelets().size > 0) &&
      !this.dateConflict()
    );
  }

  toggleEditSector(id: number): void {
    const next = new Set(this.selectedSectorIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedSectorIds.set(next);
  }

  lockedCompanyIds(): Set<number> {
    const locked = new Set<number>();
    for (const company of this.item()?.companies || []) {
      if ((company.collaborators || []).length || company.id_aprovacao) {
        locked.add(company.id_company);
      }
    }
    return locked;
  }

  isCompanyLocked(id: number): boolean {
    return this.lockedCompanyIds().has(id);
  }

  private companyMatchesSearch(c: AccreditationCompanyBrief, q: string): boolean {
    if (!q) return true;
    const hay = `${c.fancy_name || ''} ${c.company_name || ''} ${c.cnpj || ''}`.toLowerCase();
    return hay.includes(q);
  }

  availableEditCompanies(): AccreditationCompanyBrief[] {
    const sel = this.selectedCompanyIds();
    const q = this.editCompanySearch().trim().toLowerCase();
    return this.catalogCompanies().filter((c) => !sel.has(c.id_company) && this.companyMatchesSearch(c, q));
  }

  selectedEditCompanies(): AccreditationCompanyBrief[] {
    const sel = this.selectedCompanyIds();
    return this.catalogCompanies().filter((c) => sel.has(c.id_company));
  }

  includeEditCompany(id: number): void {
    const next = new Set(this.selectedCompanyIds());
    next.add(id);
    this.selectedCompanyIds.set(next);
  }

  removeEditCompany(id: number): void {
    if (this.isCompanyLocked(id)) {
      this.notification.error('Não é possível remover uma empresa que já indicou colaboradores.');
      return;
    }
    const next = new Set(this.selectedCompanyIds());
    next.delete(id);
    this.selectedCompanyIds.set(next);
  }

  isBraceletOn(id: number): boolean {
    return this.selectedBracelets().has(id);
  }

  isBraceletLocked(id: number): boolean {
    return this.isBraceletOn(id) && this.usedBraceletIds().has(id);
  }

  toggleBracelet(id: number): void {
    const next = new Set(this.selectedBracelets());
    if (next.has(id)) {
      if (this.usedBraceletIds().has(id)) {
        this.notification.error('Não é possível remover um tipo de pulseira já atribuído a colaboradores.');
        return;
      }
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedBracelets.set(next);
  }

  salvarEdicao(): void {
    const ev = this.item();
    if (!ev || !this.canSaveEdit()) {
      this.notification.error(
        this.dateConflict() ||
          'Preencha o nome, a janela, o dia do evento, ao menos uma pulseira e um setor.',
      );
      return;
    }
    const days = this.sortedEventDays();
    const inscriptionStart = this.toLocalIso(this.insStart(), this.insTimeStart);
    const inscriptionEnd = this.toLocalIso(this.insWindowEnd(), this.insTimeEnd);
    if (!days.length || !inscriptionStart || !inscriptionEnd) {
      this.notification.error('Informe datas e horários válidos.');
      return;
    }
    this.saving.set(true);
    const coverFile = this.editCoverFile;
    this.service
      .update(ev.id_event_accreditation, {
        name: this.editName().trim(),
        start: days[0],
        end: days[days.length - 1],
        event_dates: days,
        inscription_start: inscriptionStart,
        inscription_end: inscriptionEnd,
        bracelet_types: [...this.selectedBracelets()],
        setores: [...this.selectedSectorIds()],
        internal_enabled: this.editInternalEnabled(),
        photo_required: this.editPhotoRequired(),
        internal_bracelet_types: this.editInternalEnabled()
          ? [...this.selectedInternalBracelets()]
          : [],
      })
      .subscribe({
        next: (res) => {
          if (!coverFile) {
            this.finishEditSave(res.item);
            return;
          }
          this.service.uploadCover(ev.id_event_accreditation, coverFile).subscribe({
            next: (coverRes) => this.finishEditSave(coverRes.item),
            error: (err) => {
              this.saving.set(false);
              this.editing.set(false);
              this.applyItem(res.item);
              this.notification.notifyHttpError(err, 'Dados salvos, mas a foto não foi enviada.');
            },
          });
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao salvar alterações.');
        },
      });
  }

  private finishEditSave(item: EventAccreditationItem): void {
    this.saving.set(false);
    this.editing.set(false);
    this.resetEditCover();
    this.applyItem(item);
    this.notification.success('Credenciamento atualizado.');
  }

  buscarColaboradores(company: AccreditationCompany): void {
    const idCompany = company.id_company;
    const q = (this.search[idCompany] || '').trim();
    this.pickCollaborator[idCompany] = null;
    this.patchPickedSearchItem(idCompany, null);
    if (this.searchTimers[idCompany]) clearTimeout(this.searchTimers[idCompany]);
    if (q.length < 2) {
      this.patchSearching(idCompany, false);
      this.patchSearchResults(idCompany, []);
      return;
    }
    this.patchSearching(idCompany, true);
    this.searchTimers[idCompany] = setTimeout(
      () => this.loadCompanyCollaborators(company, q),
      this.searchDebounceMs,
    );
  }

  selecionarColaboradorBusca(company: AccreditationCompany, item: CollaboratorItem): void {
    if (item.is_blocklisted) {
      this.notification.error(formatBlocklistNotice(item));
      return;
    }
    const idCompany = company.id_company;
    this.patchPickedSearchItem(idCompany, item);
    this.pickCollaborator[idCompany] = item.id_collaborator;
    this.applyCollaboratorRole(idCompany, item);
    this.search[idCompany] = '';
    this.patchSearchResults(idCompany, []);
    this.patchSearching(idCompany, false);
  }

  limparColaboradorBusca(company: AccreditationCompany): void {
    const idCompany = company.id_company;
    this.patchPickedSearchItem(idCompany, null);
    this.pickCollaborator[idCompany] = null;
    this.search[idCompany] = '';
    this.patchSearchResults(idCompany, []);
  }

  private patchSearching(idCompany: number, value: boolean): void {
    this.searching.update((m) => ({ ...m, [idCompany]: value }));
  }

  private patchSearchResults(idCompany: number, rows: CollaboratorItem[]): void {
    this.searchResults.update((m) => ({ ...m, [idCompany]: rows }));
  }

  private patchPickedSearchItem(idCompany: number, item: CollaboratorItem | null): void {
    this.pickedSearchItem.update((m) => ({ ...m, [idCompany]: item }));
  }

  setPickRole(idCompany: number, roleId: number | null): void {
    this.pickRole.update((m) => ({ ...m, [idCompany]: roleId }));
  }

  private collaboratorRoleId(item: CollaboratorItem): number | null {
    const raw = item.id_collaborator_role ?? item.role?.id_collaborator_role;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private applyCollaboratorRole(idCompany: number, item: CollaboratorItem): void {
    const roleId = this.collaboratorRoleId(item);
    this.setPickRole(idCompany, roleId);
    const label = item.role?.description?.trim();
    if (!roleId || !label) return;
    if (this.roles().some((r) => String(r.id_collaborator_role) === String(roleId))) return;
    this.roles.update((list) => [...list, { id_collaborator_role: roleId, description: label }]);
  }

  private loadCompanyCollaborators(company: AccreditationCompany, q: string): void {
    const idCompany = company.id_company;
    const taken = new Set((company.collaborators || []).map((c) => String(c.id_collaborator)));
    const apply = (rows: CollaboratorItem[]) => {
      if ((this.search[idCompany] || '').trim() !== q) return;
      this.patchSearching(idCompany, false);
      this.patchSearchResults(
        idCompany,
        (rows || []).filter((c) => !taken.has(String(c.id_collaborator))),
      );
    };
    this.collaborators.searchByTerm(q).subscribe({
      next: (res) => apply(res.results || []),
      error: (err) => {
        this.collaborators.list(1, 20, { q, status: true }).subscribe({
          next: (res) => apply(res.collaborators || []),
          error: (err2) => {
            this.patchSearching(idCompany, false);
            this.patchSearchResults(idCompany, []);
            this.notification.notifyHttpError(err2 || err, 'Falha ao buscar colaboradores.');
          },
        });
      },
    });
  }

  abrirBulkImport(company: AccreditationCompany): void {
    this.bulkCompany.set(company);
    this.showBulkModal.set(true);
  }

  fecharBulkModal(): void {
    this.showBulkModal.set(false);
    this.bulkCompany.set(null);
  }

  onBulkCompleted(): void {
    const ev = this.item();
    if (ev) this.carregar(ev.id_event_accreditation);
  }

  adicionar(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev) return;
    const idCollaborator = this.pickCollaborator[company.id_company];
    const idRole = this.pickRole()[company.id_company];
    const idBracelet = this.pickBracelet[company.id_company];
    if (!idCollaborator || !idRole || !idBracelet) {
      this.notification.error('Selecione colaborador, função e pulseira.');
      return;
    }
    const picked = this.pickedSearchItem()[company.id_company];
    if (picked?.is_blocklisted) {
      this.notification.error(formatBlocklistNotice(picked));
      return;
    }
    this.acting.set(true);
    this.service
      .addCollaborator(ev.id_event_accreditation, company.id_company, {
        id_collaborator: idCollaborator,
        id_collaborator_role: idRole,
        id_bracelet_type: idBracelet,
      })
      .subscribe({
        next: (res) => {
          this.acting.set(false);
          this.applyItem(res.item);
          this.limparColaboradorBusca(company);
          this.notification.success('Colaborador indicado.');
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.error(
            extractBlocklistNotice(err) || this.notification.extractErrorMessage(err, 'Falha ao indicar colaborador.'),
          );
        },
      });
  }

  remover(company: AccreditationCompany, linkId: number): void {
    const ev = this.item();
    if (!ev) return;
    this.acting.set(true);
    this.service.removeCollaborator(ev.id_event_accreditation, company.id_company, linkId).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao remover indicação.');
      },
    });
  }

  concluir(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev) return;
    if (this.photoBlocksSectorNotify(ev, company)) {
      this.notification.error(this.notifySectorTitle(ev, company));
      return;
    }
    this.acting.set(true);
    this.service.completeCompany(ev.id_event_accreditation, company.id_company).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success('Indicação concluída. O setor foi notificado.');
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao concluir indicação.');
      },
    });
  }

  abrirAddEmpresas(setor: AccreditationSector): void {
    this.addCompaniesSetor.set(setor);
    this.addSelectedCompanyIds.set(new Set());
    this.addCompanySearch.set('');
    this.showAddCompanies.set(true);
    if (!this.catalogCompanies().length) {
      this.service.listCompanies().subscribe({
        next: (res) => this.catalogCompanies.set(res.companies || []),
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
      });
    }
  }

  fecharAddEmpresas(): void {
    this.showAddCompanies.set(false);
    this.addCompaniesSetor.set(null);
  }

  availableAddCompanies(): AccreditationCompanyBrief[] {
    const ev = this.item();
    const taken = new Set((ev?.companies || []).map((c) => c.id_company));
    const q = this.addCompanySearch().trim().toLowerCase();
    const selected = this.addSelectedCompanyIds();
    return this.catalogCompanies().filter((c) => {
      if (taken.has(c.id_company) && !selected.has(c.id_company)) return false;
      if (!q) return true;
      return `${c.fancy_name || ''} ${c.company_name} ${c.cnpj || ''}`.toLowerCase().includes(q);
    });
  }

  toggleAddCompany(id: number): void {
    const next = new Set(this.addSelectedCompanyIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.addSelectedCompanyIds.set(next);
  }

  confirmarAddEmpresas(): void {
    const ev = this.item();
    const setor = this.addCompaniesSetor();
    if (!ev || !setor) return;
    const ids = [...this.addSelectedCompanyIds()];
    if (!ids.length) return;
    this.acting.set(true);
    this.service.addSectorCompanies(ev.id_event_accreditation, setor.id_setor, ids).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.fecharAddEmpresas();
        this.notification.success(
          res.added ? `${res.added} empresa(s) convidada(s).` : 'Nenhuma empresa nova foi incluída.',
        );
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao adicionar empresas.');
      },
    });
  }

  reenviarConvitesSetor(setor: AccreditationSector): void {
    const ev = this.item();
    if (!ev) return;
    this.acting.set(true);
    this.service.notifySectorCompanies(ev.id_event_accreditation, setor.id_setor).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success(`Convites reenviados (${res.sent} e-mail(s)).`);
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao reenviar convites.');
      },
    });
  }

  reenviarAvisoSetor(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev) return;
    if (this.photoBlocksSectorNotify(ev, company)) {
      this.notification.error(this.notifySectorTitle(ev, company));
      return;
    }
    this.acting.set(true);
    this.service.notifySectorIndication(ev.id_event_accreditation, company.id_company).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success('Setor notificado novamente.');
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao notificar o setor.');
      },
    });
  }

  reenviarAvisoResponsavel(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev) return;
    if (ev.photo_required && this.hasMissingPhotos(company)) {
      this.notification.error(this.notifyOwnerTitle(company));
      return;
    }
    this.acting.set(true);
    this.service.notifyOwnerValidated(ev.id_event_accreditation, company.id_company).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success('Responsável notificado novamente.');
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao notificar o responsável.');
      },
    });
  }

  exportar(): void {
    const ev = this.item();
    if (!ev?.can_export) return;
    this.exporting.set(true);
    this.service.exportXlsx(ev.id_event_accreditation).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `credenciamento-eventos-${ev.id_event_accreditation}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.exporting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao exportar.');
      },
    });
  }

  private daysInRange(inicio: string, fim: string): string[] {
    const out: string[] = [];
    let cur = inicio;
    while (cur <= fim) {
      out.push(cur);
      const [y, m, d] = cur.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      if (out.length > 366) break;
    }
    return out;
  }

  private toLocalIso(date?: string | null, time?: string | null): string {
    if (!date || !time) return '';
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
}
