import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { NotificationService } from '../../core/services/notification.service';
import { CollaboratorItem, CollaboratorRole, CollaboratorService } from '../../services/collaborator.service';
import { STATUS_APROVADO, STATUS_NEGADO } from '../../services/credential.service';
import { formatCnpj } from '../../services/company.service';
import {
  AccreditationCompany,
  AccreditationCompanyBrief,
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
import { ActionBtnComponent } from '../../shared/actions';
import { BraceletChipComponent } from '../../shared/bracelet-chip';
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
    BraceletChipComponent,
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
                  @if (ev.inscription_open) {
                    <span class="ead-chip ead-chip--ok">Indicação aberta</span>
                  } @else {
                    <span class="ead-chip" [ngClass]="'ead-chip--' + statusChip(ev.id_access_status)">
                      {{ eventStatusLabel(ev) }}
                    </span>
                  }
                  <span class="ead-hero__date">{{ formatEventDatesBr(ev.event_dates, ev.start, ev.end) }}</span>
                </div>
              </div>
              @if (!isInternalOnlyView(ev)) {
                <div class="ead-hero__actions">
                  @if (ev.can_manage && !editing()) {
                    <button type="button" class="ead-btn ead-btn--ghost" (click)="beginEdit()">Editar</button>
                  }
                  @if (ev.can_notify) {
                    <button
                      type="button"
                      class="ead-btn ead-btn--light"
                      [disabled]="acting() || !hasCompaniesInIndication(ev)"
                      (click)="notificar()"
                    >
                      Notificar empresas
                    </button>
                  }
                  @if (ev.can_decide) {
                    <button
                      type="button"
                      class="ead-btn ead-btn--light"
                      [disabled]="acting() || !pendingTotal(ev)"
                      (click)="aprovarTodosPendentes()"
                    >
                      {{ pendingTotal(ev) ? 'Aprovar todos os pendentes (' + pendingTotal(ev) + ')' : 'Nada pendente' }}
                    </button>
                  }
                </div>
              }
            </div>
            <div class="ead-hero__facts">
              <div>
                <div class="ead-fact__k">Prazo de indicação</div>
                <div class="ead-fact__v">
                  {{ formatShortRange(ev.inscription_start, ev.inscription_end) }}
                  <small>· {{ prazoLabel(ev) }}</small>
                </div>
                <div class="ead-bar"><i [style.width.%]="prazoPct(ev)"></i></div>
              </div>
              <div>
                <div class="ead-fact__k">Setor aprovador</div>
                <div class="ead-fact__v">
                  {{ ev.setor_nome || '—' }}
                  <small>· {{ approversLabel(ev) }}</small>
                </div>
              </div>
              <div>
                <div class="ead-fact__k">Pulseiras liberadas</div>
                <div class="ead-fact__v">{{ heroBracelets(ev).length }} {{ heroBracelets(ev).length === 1 ? 'tipo' : 'tipos' }}</div>
                <div class="ead-hero__meta ead-hero__meta--chips">
                  @for (b of heroBracelets(ev); track b.id_bracelet_type) {
                    <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        @if (editing()) {
          <section class="ead-edit">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
              <div>
                <h3 class="ead-edit__h">Editar credenciamento</h3>
                <p class="ead-edit__sub">Nome, foto, período de indicação, dia do evento, pulseiras e empresas convidadas. Colaboradores já indicados não mudam aqui.</p>
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

            <section class="mt-5">
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
                        [selected]="isInternalBraceletOn(b.id_bracelet_type)"
                      />
                    </button>
                  }
                </div>
              </section>
            }

            <section class="mt-5">
              <h4 class="ead-edit__h">Empresas convidadas</h4>
              <p class="ead-edit__sub">Inclua ou remova empresas. Quem já indicou colaboradores permanece no evento. Empresas novas entram sem e-mail — use Notificar empresas depois de salvar.</p>
              <div class="ead-co">
                <div class="ead-co__col">
                  <div class="ead-co__head">
                    <h5>Cadastradas</h5>
                    <span>{{ availableEditCompanies().length }}</span>
                  </div>
                  <input
                    type="search"
                    class="ead-co__search"
                    placeholder="Buscar empresa"
                    aria-label="Buscar empresa para incluir"
                    [ngModel]="editCompanySearch()"
                    (ngModelChange)="editCompanySearch.set($event)"
                  />
                  @if (availableEditCompanies().length) {
                    <ul class="ead-co__list">
                      @for (c of availableEditCompanies(); track c.id_company) {
                        <li>
                          <span>
                            <b>{{ c.fancy_name || c.company_name }}</b>
                            <small>
                              {{ c.company_name }}
                              @if (c.cnpj) {
                                · {{ formatCnpj(c.cnpj) }}
                              }
                            </small>
                          </span>
                          <button type="button" class="ead-btn ead-btn--sm" (click)="includeEditCompany(c.id_company)">
                            Incluir
                          </button>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="ead-co__empty">{{ editCompanySearch().trim() ? 'Nenhuma empresa encontrada.' : 'Todas as empresas cadastradas já estão no evento.' }}</p>
                  }
                </div>
                <div class="ead-co__col ead-co__col--on">
                  <div class="ead-co__head">
                    <h5>No evento</h5>
                    <span>{{ selectedCompanyIds().size }}</span>
                  </div>
                  @if (selectedEditCompanies().length) {
                    <ul class="ead-co__list">
                      @for (c of selectedEditCompanies(); track c.id_company) {
                        <li>
                          <span>
                            <b>{{ c.fancy_name || c.company_name }}</b>
                            <small>{{ c.company_name }}</small>
                          </span>
                          @if (isCompanyLocked(c.id_company)) {
                            <span class="ead-co__lock">Com indicações</span>
                          } @else {
                            <button type="button" class="ead-btn ead-btn--sm" (click)="removeEditCompany(c.id_company)">
                              Remover
                            </button>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="ead-co__empty">Inclua ao menos uma empresa.</p>
                  }
                </div>
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
                  <p class="ead-self__d">Escolha uma pulseira disponível para colaboradores internos.</p>
                </div>
              </div>
            </div>
            <div class="ead-indicate ead-indicate--internal">
              <div class="ead-pick-chips" role="radiogroup" aria-label="Pulseira">
                @for (b of ev.internal_bracelet_types || []; track b.id_bracelet_type) {
                  <button
                    type="button"
                    class="ead-br-pick"
                    role="radio"
                    [attr.aria-checked]="pickInternalBracelet === b.id_bracelet_type"
                    [class.on]="pickInternalBracelet === b.id_bracelet_type"
                    (click)="togglePickInternalBracelet(b.id_bracelet_type)"
                  >
                    <app-bracelet-chip
                      [name]="b.name"
                      [icon]="b.icon"
                      [color]="b.color"
                      [selected]="pickInternalBracelet === b.id_bracelet_type"
                    />
                  </button>
                }
              </div>
              <button
                type="button"
                class="ead-btn ead-btn--primary"
                [disabled]="acting() || !pickInternalBracelet"
                (click)="inscreverInterno()"
              >
                Inscrever-me
              </button>
            </div>
          </article>
        } @else if (ev.my_internal && !ev.can_manage && !ev.can_decide) {
          <article class="ead-empresa ead-self">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo" aria-hidden="true">AD</div>
                <div>
                  <h3 class="ead-empresa__nome">Sua inscrição</h3>
                  <p class="ead-self__d">
                    Pulseira
                    <app-bracelet-chip
                      [name]="ev.my_internal.bracelet_name"
                      [icon]="ev.my_internal.bracelet_icon"
                      [color]="ev.my_internal.bracelet_color"
                    />
                    ·
                    <span class="ead-chip" [ngClass]="'ead-chip--' + internalPillClass(ev.my_internal)">
                      {{ internalPillLabel(ev.my_internal) }}
                    </span>
                  </p>
                </div>
              </div>
              @if (ev.inscription_open && isPendingInternal(ev.my_internal)) {
                <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="cancelarInterno()">
                  Cancelar inscrição
                </button>
              }
            </div>
          </article>
        }

        @if (ev.internal_enabled && (ev.can_manage || ev.can_decide)) {
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
              @if (ev.can_decide) {
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
            @if (ev.can_decide && countInternalPending(ev) > 0) {
              <div class="ead-bulk" [class.on]="pickedInternalCount() > 0">
                <span><b>{{ pickedInternalCount() }}</b> selecionados</span>
                <span class="ead-bulk-acts">
                  <select
                    class="form-select ead-br-select"
                    [(ngModel)]="bulkInternalBracelet"
                    name="bulkInternalBracelet"
                    [disabled]="acting()"
                    aria-label="Pulseira em massa"
                  >
                    <option [ngValue]="null">Definir pulseira</option>
                    @for (b of ev.internal_bracelet_types || []; track b.id_bracelet_type) {
                      <option [ngValue]="b.id_bracelet_type">{{ b.name }}</option>
                    }
                  </select>
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
              <table class="ead-tabela">
                <thead>
                  <tr>
                    @if (ev.can_decide) {
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
                      @if (ev.can_decide) {
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
                          <div class="ead-avatar" aria-hidden="true">{{ personInitials(c.nome_completo) }}</div>
                          <span>{{ c.nome_completo }}</span>
                        </div>
                        <span class="ead-doc">{{ c.email }}</span>
                      </td>
                      <td>{{ c.departamento || '—' }}</td>
                      <td>
                        @if (ev.can_decide && isPendingInternal(c)) {
                          <select
                            class="form-select ead-br-select"
                            [ngModel]="c.id_bracelet_type"
                            [name]="'intBr' + c.id_event_accreditation_internal"
                            [disabled]="acting()"
                            (ngModelChange)="trocarPulseira('internal', c.id_event_accreditation_internal, $event)"
                            [attr.aria-label]="'Pulseira de ' + c.nome_completo"
                          >
                            @for (b of ev.internal_bracelet_types || []; track b.id_bracelet_type) {
                              <option [ngValue]="b.id_bracelet_type">{{ b.name }}</option>
                            }
                          </select>
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
                        @if (ev.can_decide && isPendingInternal(c)) {
                          <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivoInterno([c.id_event_accreditation_internal])">
                            Recusar
                          </button>
                          <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_internal], 'approve', undefined, undefined, 'internal')">
                            Aprovar
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
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
          <h2>Empresas convidadas <span>· {{ (ev.companies || []).length }}</span></h2>
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
            <button
              type="button"
              class="ead-btn"
              [disabled]="!ev.can_export || exporting()"
              (click)="exportar()"
            >
              {{ exporting() ? 'Exportando...' : 'Exportar lista' }}
            </button>
          </div>
        </div>

        @for (company of filteredCompanies(ev); track company.id_event_accreditation_company) {
          <article class="ead-empresa">
            <div class="ead-empresa__head">
              <div class="ead-empresa__id">
                <div class="ead-empresa__logo" aria-hidden="true">{{ companyInitials(company) }}</div>
                <div>
                  <h3 class="ead-empresa__nome">{{ company.fancy_name || company.company_name }}</h3>
                  <div class="ead-empresa__counts">
                    <span class="ead-count ead-count--ind"><b>{{ company.collaborators.length }}</b> indicados</span>
                    <span class="ead-count ead-count--apr"><b>{{ countApproved(company) }}</b> aprovados</span>
                    <span class="ead-count ead-count--pen"><b>{{ countPending(company) }}</b> {{ countPending(company) === 1 ? 'pendente' : 'pendentes' }}</span>
                    <span class="ead-count ead-count--blo"><b>{{ countBlocked(company) }}</b> {{ countBlocked(company) === 1 ? 'bloqueado' : 'bloqueados' }}</span>
                  </div>
                </div>
                <span class="ead-chip" [ngClass]="'ead-chip--' + companyPillClass(company)" [class.ead-chip--plain]="companyPillClass(company) === 'idle'">
                  {{ companyPillLabel(company) }}
                </span>
              </div>
              <div class="ead-empresa__actions">
                @if (company.can_complete) {
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="concluir(company)">
                    Concluir indicação
                  </button>
                }
                @if (ev.can_notify && company.indication_status === 'INDICACAO') {
                  <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="notificar(company.id_company)">
                    Notificar empresa
                  </button>
                }
                @if (ev.can_decide) {
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

            @if (ev.can_decide && countPending(company) > 0) {
              <div class="ead-bulk" [class.on]="pickedCount(company) > 0">
                <span><b>{{ pickedCount(company) }}</b> selecionados</span>
                <span class="ead-bulk-acts">
                  <select
                    class="form-select ead-br-select"
                    [(ngModel)]="bulkCompanyBracelet[company.id_event_accreditation_company]"
                    [name]="'bulkCoBr' + company.id_event_accreditation_company"
                    [disabled]="acting()"
                    aria-label="Pulseira em massa"
                  >
                    <option [ngValue]="null">Definir pulseira</option>
                    @for (b of ev.bracelet_types || []; track b.id_bracelet_type) {
                      <option [ngValue]="b.id_bracelet_type">{{ b.name }}</option>
                    }
                  </select>
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

            @if (company.can_indicate) {
              <div class="ead-indicate">
                <input
                  [(ngModel)]="search[company.id_company]"
                  [name]="'q' + company.id_company"
                  (ngModelChange)="buscarColaboradores(company.id_company)"
                  placeholder="Buscar colaborador"
                  class="form-field"
                />
                <select [(ngModel)]="pickCollaborator[company.id_company]" [name]="'col' + company.id_company" class="form-select">
                  <option [ngValue]="null">Colaborador</option>
                  @for (c of searchResults[company.id_company] || []; track c.id_collaborator) {
                    <option [ngValue]="c.id_collaborator">{{ c.name }} · {{ c.document }}</option>
                  }
                </select>
                <select [(ngModel)]="pickRole[company.id_company]" [name]="'role' + company.id_company" class="form-select">
                  <option [ngValue]="null">Função</option>
                  @for (r of roles(); track r.id_collaborator_role) {
                    <option [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                  }
                </select>
                <div class="ead-indicate-row">
                  <select [(ngModel)]="pickBracelet[company.id_company]" [name]="'br' + company.id_company" class="form-select">
                    <option [ngValue]="null">Pulseira</option>
                    @for (b of bracelets(); track b.id_bracelet_type) {
                      <option [ngValue]="b.id_bracelet_type">{{ b.name }}</option>
                    }
                  </select>
                  <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="adicionar(company)">
                    Indicar
                  </button>
                </div>
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
              <table class="ead-tabela">
                <thead>
                  <tr>
                    @if (ev.can_decide) {
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
                  @for (c of company.collaborators; track c.id_event_accreditation_collaborator) {
                    <tr [class.blocked]="isBlocked(c)">
                      @if (ev.can_decide) {
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
                          <div class="ead-avatar" aria-hidden="true">{{ personInitials(c.collaborator_name) }}</div>
                          <span>{{ c.collaborator_name }}</span>
                        </div>
                      </td>
                      <td class="ead-doc">{{ c.collaborator_document }}</td>
                      <td>{{ c.role_description }}</td>
                      <td>
                        @if (ev.can_decide && isPending(c)) {
                          <select
                            class="form-select ead-br-select"
                            [ngModel]="c.id_bracelet_type"
                            [name]="'coBr' + c.id_event_accreditation_collaborator"
                            [disabled]="acting()"
                            (ngModelChange)="trocarPulseira('company', c.id_event_accreditation_collaborator, $event)"
                            [attr.aria-label]="'Pulseira de ' + c.collaborator_name"
                          >
                            @for (b of ev.bracelet_types || []; track b.id_bracelet_type) {
                              <option [ngValue]="b.id_bracelet_type">{{ b.name }}</option>
                            }
                          </select>
                        } @else {
                          <app-bracelet-chip
                            [name]="c.bracelet_name"
                            [icon]="c.bracelet_icon"
                            [color]="c.bracelet_color"
                          />
                        }
                      </td>
                      <td>
                        <span class="ead-chip" [ngClass]="'ead-chip--' + collabPillClass(c)">{{ collabPillLabel(c) }}</span>
                        @if (c.decided_by_name && (isApproved(c) || isBlocked(c))) {
                          <span class="ead-audit">
                            por {{ c.decided_by_name }} · {{ formatAuditAt(c.decided_at) }}
                            @if (c.decision_reason) {
                              · <span class="why">{{ c.decision_reason }}</span>
                            }
                          </span>
                        }
                      </td>
                      <td class="ead-acoes">
                        @if (ev.can_decide && isPending(c)) {
                          <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivo(company, [c.id_event_accreditation_collaborator])">
                            Recusar
                          </button>
                          <button type="button" class="ead-btn ead-btn--sm ead-btn--primary" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_collaborator], 'approve')">
                            Aprovar
                          </button>
                        }
                        @if (ev.can_decide && isApproved(c)) {
                          <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="abrirMotivo(company, [c.id_event_accreditation_collaborator])">
                            Bloquear
                          </button>
                        }
                        @if (ev.can_decide && isBlocked(c)) {
                          <button type="button" class="ead-btn ead-btn--sm" [disabled]="acting()" (click)="decidir([c.id_event_accreditation_collaborator], 'unblock')">
                            Desbloquear
                          </button>
                        }
                        @if (company.can_indicate) {
                          <app-action-btn icon="delete" title="Remover" variant="danger" (action)="remover(company, c.id_event_accreditation_collaborator)" />
                        }
                      </td>
                    </tr>
                  }
                  @if (reasonFor()?.companyId === company.id_event_accreditation_company) {
                    <tr class="ead-reason">
                      <td [attr.colspan]="ev.can_decide ? 7 : 6">
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
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
      }
      .ead-chip--ok {
        background: var(--ead-green-200);
        color: #24401a;
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
        min-height: 250px;
        background: var(--ead-purple);
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
        padding: 26px 28px;
        color: #fff;
        display: flex;
        flex-direction: column;
        gap: 18px;
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
        font-size: 34px;
        line-height: 1.05;
        margin: 0 0 12px;
        letter-spacing: -0.02em;
      }
      .ead-hero__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .ead-hero__meta--chips {
        margin-top: 9px;
      }
      .ead-hero__date {
        font-size: 13.5px;
        color: #d9c7e8;
        font-weight: 500;
      }
      .ead-hero__actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .ead-hero__facts {
        margin-top: auto;
        display: flex;
        flex-wrap: wrap;
        gap: 20px 44px;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
        padding-top: 16px;
      }
      .ead-fact__k {
        font-size: 12px;
        color: #c9b2dc;
        font-weight: 500;
        margin-bottom: 5px;
      }
      .ead-fact__v {
        font-size: 14px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .ead-fact__v small {
        font-weight: 500;
        color: #c9b2dc;
        font-size: 13px;
      }
      .ead-bar {
        height: 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.22);
        overflow: hidden;
        margin-top: 9px;
        width: 230px;
        max-width: 100%;
      }
      .ead-bar i {
        display: block;
        height: 100%;
        background: var(--ead-green-300);
        border-radius: 3px;
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
        overflow: hidden;
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
      .ead-empty {
        border-top: 1px solid var(--ead-line-soft);
        padding: 34px 20px 32px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
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
      }
      .ead-pessoa span {
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
      }
      .ead-acoes {
        text-align: right;
        white-space: nowrap;
      }
      .ead-acoes .ead-btn + .ead-btn {
        margin-left: 6px;
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
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--ead-line-soft);
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
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 10px;
      }
      .ead-co__col {
        border: 1px solid var(--ead-line);
        border-radius: var(--ead-r-ctl);
        background: var(--ead-surface);
        min-height: 220px;
        display: flex;
        flex-direction: column;
      }
      .ead-co__col--on {
        border-color: #d6c9e6;
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
        margin: 8px 12px 0;
        height: 36px;
        border: 1px solid var(--ead-line);
        border-radius: 8px;
        padding: 0 10px;
        font: inherit;
        font-size: 13px;
        color: var(--ead-ink);
      }
      .ead-co__list {
        list-style: none;
        margin: 0;
        padding: 8px 0;
        overflow: auto;
        max-height: 280px;
      }
      .ead-co__list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 12px;
      }
      .ead-co__list b {
        display: block;
        font-size: 13.5px;
        color: var(--ead-ink);
      }
      .ead-co__list small {
        display: block;
        font-size: 12px;
        color: var(--ead-muted);
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
        .ead-acoes {
          text-align: left;
        }
        .ead-edit__grid,
        .ead-edit__times,
        .ead-indicate,
        .ead-indicate--internal,
        .ead-co {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class EventAccreditationDetailComponent implements OnInit, OnDestroy {
  private readonly service = inject(EventAccreditationService);
  private readonly collaborators = inject(CollaboratorService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly item = signal<EventAccreditationItem | null>(null);
  readonly coverSrc = signal<string | null>(null);
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
  readonly editCompanySearch = signal('');
  readonly editInternalEnabled = signal(false);
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
  bulkInternalBracelet: number | null = null;
  bulkCompanyBracelet: Record<number, number | null> = {};
  readonly reasonFor = signal<{ companyId: number; ids: number[]; target?: 'company' | 'internal' } | null>(null);
  pickInternalBracelet: number | null = null;

  isInternalOnlyView(ev: EventAccreditationItem): boolean {
    return !ev.can_manage && !ev.can_decide && !(ev.companies || []).length;
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

  statusChip(status?: number | null): string {
    const st = Number(status);
    if (st === 3) return 'ok';
    if (st === 4 || st === 5) return 'bad';
    if (st === 1 || st === 2) return 'wait';
    return 'idle';
  }

  togglePickInternalBracelet(id: number): void {
    this.pickInternalBracelet = this.pickInternalBracelet === id ? null : id;
  }
  insTimeStart = '00:00';
  insTimeEnd = '18:00';
  blockReason: string = BLOCK_REASONS[0];
  blockNote = '';
  readonly blockReasons = BLOCK_REASONS;

  search: Record<number, string> = {};
  searchResults: Record<number, CollaboratorItem[]> = {};
  pickCollaborator: Record<number, number | null> = {};
  pickRole: Record<number, number | null> = {};
  pickBracelet: Record<number, number | null> = {};
  private searchTimers: Record<number, ReturnType<typeof setTimeout> | undefined> = {};
  private nowTimer: ReturnType<typeof setInterval> | undefined;

  readonly formatDateBr = formatDateBr;
  readonly formatEventDatesBr = formatEventDatesBr;
  readonly formatDateTimeBr = formatDateTimeBr;
  readonly kindLabel = kindLabel;
  readonly formatIsoBr = formatIsoBr;

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
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      void this.router.navigate(['/admin/credenciamento-eventos']);
      return;
    }
    this.collaborators.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles || []),
    });
    this.carregar(id);
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.nowTimer) clearInterval(this.nowTimer);
    this.revokeEditCoverObjectUrl();
  }

  carregar(id: number): void {
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (res) => {
        this.applyItem(res.item);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar credenciamento.');
        void this.router.navigate(['/admin/credenciamento-eventos']);
      },
    });
  }

  private applyItem(item: EventAccreditationItem): void {
    this.item.set(item);
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
    return companies + this.countInternalPending(ev);
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

  prazoPct(ev: EventAccreditationItem): number {
    this.now();
    const ini = ev.inscription_start ? new Date(ev.inscription_start).getTime() : 0;
    const fim = ev.inscription_end ? new Date(ev.inscription_end).getTime() : 0;
    if (!ini || !fim || fim <= ini) return ev.inscription_open ? 0 : 100;
    const now = Date.now();
    return Math.min(100, Math.max(0, ((now - ini) / (fim - ini)) * 100));
  }

  prazoLabel(ev: EventAccreditationItem): string {
    this.now();
    if (!ev.inscription_end) return '—';
    const fim = new Date(ev.inscription_end).getTime();
    if (Number.isNaN(fim)) return '—';
    const now = Date.now();
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
    const braceletId = Number(this.bulkInternalBracelet);
    if (!ids.length || !braceletId) return;
    this.trocarPulseira('internal', ids, braceletId);
  }

  aplicarPulseiraEmpresa(company: AccreditationCompany): void {
    const ids = this.pickedIds(company);
    const braceletId = Number(this.bulkCompanyBracelet[company.id_event_accreditation_company]);
    if (!ids.length || !braceletId) return;
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
    const internalIds = this.pendingInternalIds(ev);
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

  trocarPulseira(target: 'company' | 'internal', idOrIds: number | number[], idBracelet: number): void {
    const ev = this.item();
    const braceletId = Number(idBracelet);
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter((n) => Number.isInteger(n) && n > 0);
    if (!ev || !Number.isInteger(braceletId) || braceletId <= 0 || !ids.length) return;
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
    if (!ev || !this.pickInternalBracelet) {
      this.notification.error('Selecione uma pulseira.');
      return;
    }
    this.acting.set(true);
    this.service.registerInternal(ev.id_event_accreditation, { id_bracelet_type: this.pickInternalBracelet }).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.pickInternalBracelet = null;
        this.applyItem(res.item);
        this.notification.success('Inscrição enviada para aprovação.');
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
    this.selectedInternalBracelets.set(
      new Set((ev.internal_bracelet_types || []).map((b) => b.id_bracelet_type)),
    );
    this.selectedCompanyIds.set(new Set((ev.companies || []).map((c) => c.id_company)));
    this.editCompanySearch.set('');
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
      this.selectedCompanyIds().size > 0 &&
      (!this.editInternalEnabled() || this.selectedInternalBracelets().size > 0) &&
      !this.dateConflict()
    );
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
          'Preencha o nome, a janela, o dia do evento, ao menos uma pulseira e uma empresa.',
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
        companies: [...this.selectedCompanyIds()],
        internal_enabled: this.editInternalEnabled(),
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

  buscarColaboradores(idCompany: number): void {
    const q = (this.search[idCompany] || '').trim();
    if (this.searchTimers[idCompany]) clearTimeout(this.searchTimers[idCompany]);
    this.searchTimers[idCompany] = setTimeout(() => {
      this.collaborators.list(1, 20, { q, status: true }).subscribe({
        next: (res) => {
          this.searchResults[idCompany] = res.collaborators || [];
        },
      });
    }, 250);
  }

  adicionar(company: AccreditationCompany): void {
    const ev = this.item();
    if (!ev) return;
    const idCollaborator = this.pickCollaborator[company.id_company];
    const idRole = this.pickRole[company.id_company];
    const idBracelet = this.pickBracelet[company.id_company];
    if (!idCollaborator || !idRole || !idBracelet) {
      this.notification.error('Selecione colaborador, função e pulseira.');
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
          this.pickCollaborator[company.id_company] = null;
          this.notification.success('Colaborador indicado.');
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao indicar colaborador.');
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
        a.download = `credenciamento-eventos-${ev.id_event_accreditation}.xlsx`;
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
