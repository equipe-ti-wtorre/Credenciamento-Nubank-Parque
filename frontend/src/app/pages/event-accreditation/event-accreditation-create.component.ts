import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { EditorComponent, TINYMCE_SCRIPT_SRC } from '@tinymce/tinymce-angular';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService, hasPermission } from '../../core/services/auth.service';
import { EligibleSector } from '../../services/approval.service';
import {
  CompanyService,
  CompanyType,
  formatCnpj,
  normalizeCnpjInput,
} from '../../services/company.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  BraceletChipComponent,
  BraceletVisualPickerComponent,
  DEFAULT_BRACELET_COLOR,
  DEFAULT_BRACELET_ICON,
} from '../../shared/bracelet-chip';
import {
  AccreditationCompanyBrief,
  BraceletKind,
  BraceletType,
  EventAccreditationInviteFile,
  EventAccreditationInviteMode,
  EventAccreditationKind,
  EventAccreditationService,
  formatDateBr,
  formatDateTimeBr,
  formatEventDatesBr,
  kindLabel,
} from '../../services/event-accreditation.service';
import {
  MonthCalendarComponent,
  MonthCalendarTick,
  formatIsoBr,
} from '../../shared/month-calendar';
import { EventKindBadgeComponent } from './event-kind-badge.component';

type WizardStep = 'dados' | 'pulseiras' | 'revisar';

const STEP_ORDER: WizardStep[] = ['dados', 'pulseiras', 'revisar'];
const WEEKDAYS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const STEP_LABELS: Record<WizardStep, string> = {
  dados: 'Dados do credenciamento',
  pulseiras: 'Tipos de pulseira',
  revisar: 'Revisar',
};

@Component({
  selector: 'app-event-accreditation-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MonthCalendarComponent,
    ModalComponent,
    EventKindBadgeComponent,
    EditorComponent,
    BraceletChipComponent,
    BraceletVisualPickerComponent,
  ],
  providers: [{ provide: TINYMCE_SCRIPT_SRC, useValue: '/tinymce/tinymce.min.js' }],
  template: `
    <div class="wcrt-page">
      <button type="button" class="wcrt-back" (click)="onClose()">← Voltar para lista</button>

      <div class="wcrt-stepper" [attr.aria-label]="'Passo ' + stepNumber() + ' de 3: ' + stepLabel()">
        <div class="wcrt-stepper__track">
          @for (s of stepDefs; track s.key; let i = $index) {
            @if (i > 0) {
              <span class="wcrt-stepper__line" [class.is-done]="stepIndex() > i - 1"></span>
            }
            <div
              class="wcrt-stepper__item"
              [class.is-active]="step() === s.key"
              [class.is-done]="stepIndex() > i"
            >
              <span class="wcrt-stepper__dot">
                @if (stepIndex() > i) {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="wcrt-stepper__label">{{ s.label }}</span>
            </div>
          }
        </div>
        <p class="wcrt-stepper__current" aria-hidden="true">{{ stepNumber() }} · {{ stepLabel() }}</p>
      </div>

      <div class="wcrt">
        @if (step() === 'dados') {
          <form id="wcrt-dados-form" class="wcrt-form" [formGroup]="dadosForm" (ngSubmit)="goPulseiras()">
            <div class="wcrt-dados">
              <section class="wcrt-col">
                <h2>Janela de indicação<span class="wcrt-req">*</span></h2>
                <p class="wcrt-col__sub">Quando as empresas podem indicar colaboradores.</p>
                <div class="wcrt-value" [class.empty]="!insStart()" [class.bad]="!!dateConflict() && !!insWindowEnd()">
                  <span class="wcrt-value__ico" aria-hidden="true">▤</span>
                  <span class="wcrt-value__txt">{{ insValueLabel() }}</span>
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
                <div class="wcrt-pair">
                  <div class="wcrt-field">
                    <label for="wcrt-ins-start">Abre às<span class="wcrt-req">*</span></label>
                    <input id="wcrt-ins-start" type="time" formControlName="ins_time_start" class="wcrt-control" />
                  </div>
                  <div class="wcrt-field">
                    <label for="wcrt-ins-end">Fecha às<span class="wcrt-req">*</span></label>
                    <input id="wcrt-ins-end" type="time" formControlName="ins_time_end" class="wcrt-control" />
                  </div>
                </div>
                <p class="wcrt-help">Aplicados ao primeiro e ao último dia.</p>
              </section>

              <section class="wcrt-col">
                <h2>Dias do evento<span class="wcrt-req">*</span></h2>
                <p class="wcrt-col__sub">Datas em que os credenciados entram no parque.</p>
                <div class="wcrt-value" [class.empty]="!eventDays().size">
                  <span class="wcrt-value__ico" aria-hidden="true">▤</span>
                  <span class="wcrt-value__txt">{{ eventValueLabel() }}</span>
                </div>
                <app-month-calendar
                  mode="multi"
                  [selectedDates]="sortedEventDays()"
                  [ticks]="eventTicks()"
                  [footerText]="eventFooter()"
                  (daySelect)="onEventDay($event)"
                  (cleared)="clearEventDay()"
                />
                <div class="wcrt-legend">
                  <span><i class="wcrt-legend__dot wcrt-legend__dot--sel"></i>Selecionado</span>
                  <span><i class="wcrt-legend__dot wcrt-legend__dot--win"></i>Janela de indicação</span>
                </div>
              </section>

              <section class="wcrt-col wcrt-col--form">
                <h2>Identificação</h2>
                <p class="wcrt-col__sub">O que os setores e as empresas vão ver.</p>
                <div class="wcrt-pair wcrt-pair--id">
                  <div class="wcrt-field">
                    <label for="wcrt-name">Nome do evento<span class="wcrt-req">*</span></label>
                    <input
                      id="wcrt-name"
                      type="text"
                      formControlName="name"
                      maxlength="200"
                      class="wcrt-control"
                      placeholder="Ex.: Showday — Setembro"
                      [class.invalid]="nameInvalid()"
                    />
                    @if (nameInvalid()) {
                      <p class="wcrt-err">Informe o nome do evento.</p>
                    }
                  </div>
                  <div class="wcrt-field">
                    <span class="wcrt-kind-lbl">Tipo de evento<span class="wcrt-req">*</span></span>
                    <div class="wcrt-kind-picks" role="radiogroup" aria-label="Tipo de evento">
                      <button
                        type="button"
                        class="wcrt-kind-pick wcrt-kind-pick--showday"
                        role="radio"
                        [attr.aria-checked]="dadosForm.controls.event_kind.value === 'SHOWDAY'"
                        [class.on]="dadosForm.controls.event_kind.value === 'SHOWDAY'"
                        (click)="setEventKind('SHOWDAY')"
                      >
                        <span class="wcrt-kind-pick__ico" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                            <path d="M9 18V6l10-2v12"/>
                            <circle cx="6" cy="18" r="2.4"/>
                            <circle cx="16" cy="16" r="2.4"/>
                          </svg>
                        </span>
                        Showday
                      </button>
                      <button
                        type="button"
                        class="wcrt-kind-pick wcrt-kind-pick--jogo"
                        role="radio"
                        [attr.aria-checked]="dadosForm.controls.event_kind.value === 'JOGO'"
                        [class.on]="dadosForm.controls.event_kind.value === 'JOGO'"
                        (click)="setEventKind('JOGO')"
                      >
                        <span class="wcrt-kind-pick__ico" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M12 3c2.2 2.4 3.4 5.6 3.4 9S14.2 18.6 12 21M12 3c-2.2 2.4-3.4 5.6-3.4 9S9.8 18.6 12 21"/>
                            <path d="M4.2 8.5h15.6M4.2 15.5h15.6"/>
                          </svg>
                        </span>
                        Jogo
                      </button>
                    </div>
                  </div>
                </div>
                <div class="wcrt-field">
                  <span class="wcrt-kind-lbl">Setores participantes<span class="wcrt-req">*</span></span>
                  <p class="wcrt-help">Cada setor indica as empresas que vão participar e valida as indicações.</p>
                  <div class="wcrt-setor-list" [class.invalid]="setorInvalid()">
                    @for (s of sectors(); track s.id) {
                      <label class="wcrt-setor-pick">
                        <input
                          type="checkbox"
                          [checked]="selectedSectors().has(s.id)"
                          (change)="toggleSector(s.id)"
                        />
                        <span>{{ s.nome }}</span>
                      </label>
                    } @empty {
                      <p class="wcrt-help">Nenhum setor ativo encontrado.</p>
                    }
                  </div>
                  @if (setorInvalid()) {
                    <p class="wcrt-err">Selecione ao menos um setor.</p>
                  }
                </div>

                <div class="wcrt-field">
                  <span class="wcrt-kind-lbl">Foto do evento</span>
                  <p class="wcrt-help">Identifica o evento na lista e no e-mail. JPEG, PNG ou WebP, até 2 MB.</p>
                  <div class="wcrt-cover">
                    <div class="wcrt-cover__preview" [class.empty]="!coverPreview()">
                      @if (coverPreview()) {
                        <img [src]="coverPreview()" alt="Prévia da capa" />
                      } @else {
                        <span>Sem foto</span>
                      }
                    </div>
                    <div class="wcrt-cover__actions">
                      <label class="wcrt-cover__pick">
                        <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onCoverPick($event)" />
                        {{ coverPreview() ? 'Trocar foto' : 'Escolher foto' }}
                      </label>
                      @if (coverPreview()) {
                        <button type="button" class="wcrt-cover__clear" (click)="clearCover()">Remover</button>
                      }
                    </div>
                  </div>
                </div>

                <div class="wcrt-resumo">
                  <h3>Resumo</h3>
                  <ul class="wcrt-tl">
                    <li [class.set]="!!insStart()">
                      <b>Indicações abrem</b>
                      <span [class.pend]="!insStart()">{{ insStart() ? formatIsoBr(insStart()) : 'a definir' }}</span>
                      @if (insStart()) {
                        <em>às {{ dadosForm.controls.ins_time_start.value }}</em>
                      }
                    </li>
                    <li [class.set]="!!insWindowEnd()">
                      <b>Indicações fecham</b>
                      <span [class.pend]="!insWindowEnd()">{{ insWindowEnd() ? formatIsoBr(insWindowEnd()) : 'a definir' }}</span>
                      @if (insWindowEnd()) {
                        <em>às {{ dadosForm.controls.ins_time_end.value }}</em>
                      }
                    </li>
                    <li [class.set]="!!eventDays().size">
                      <b>Dias do evento</b>
                      <span [class.pend]="!eventDays().size">{{ eventDays().size ? eventValueLabel() : 'a definir' }}</span>
                      @if (eventDays().size) {
                        <em>{{ eventMonthLabel() }}</em>
                      }
                    </li>
                  </ul>
                  @if (dateConflict(); as bad) {
                    <div class="wcrt-alert wcrt-alert--bad">{{ bad }}</div>
                  }
                  @if (goodAlert(); as good) {
                    <div class="wcrt-alert wcrt-alert--good">{{ good }}</div>
                  }
                </div>
              </section>
            </div>
          </form>
        }

        @if (false) {
          <div class="wcrt-form">
            <div class="wcrt-panel-head">
              <h1>Empresas convidadas</h1>
              <p>Só as empresas incluídas no evento recebem o convite e podem indicar colaboradores.</p>
              <label class="wcrt-switch">
                <input
                  type="checkbox"
                  [checked]="internalEnabled()"
                  (change)="internalEnabled.set(($any($event.target).checked))"
                />
                <span class="wcrt-switch__ui" aria-hidden="true"></span>
                <span class="wcrt-switch__txt">
                  <b>Credenciamento interno</b>
                  Usuários internos AD poderão se inscrever neste evento.
                </span>
              </label>
            </div>
            <div class="wcrt-dual">
              <section class="wcrt-box" aria-labelledby="hDisp">
                <div class="wcrt-box-head">
                  <div class="wcrt-box-title">
                    <h2 id="hDisp">Empresas cadastradas</h2>
                    <span class="wcrt-badge-soft">{{ availableCountLabel() }}</span>
                  </div>
                  <div class="wcrt-searchbox">
                    <span class="wcrt-searchbox__mag" aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      [(ngModel)]="companySearch"
                      name="companySearch"
                      placeholder="Buscar por nome, razão social ou CNPJ"
                      aria-label="Buscar empresa"
                      autocomplete="off"
                    />
                    <button
                      type="button"
                      class="wcrt-searchbox__clr"
                      [class.on]="!!companySearch"
                      aria-label="Limpar busca"
                      (click)="clearCompanySearch()"
                    >
                      ✕
                    </button>
                  </div>
                  <div class="wcrt-bulk">
                    <span>{{ availableHint() }}</span>
                    <button
                      type="button"
                      class="wcrt-link"
                      [disabled]="!availableCompanies().length"
                      (click)="includeAllVisible()"
                    >
                      {{ includeAllLabel() }}
                    </button>
                  </div>
                </div>
                @if (availableCompanies().length) {
                  <ul class="wcrt-co-list">
                    @for (c of availableCompanies(); track c.id_company) {
                      <li class="wcrt-co-row">
                        <span class="wcrt-co-info">
                          <span class="wcrt-co-nm">{{ c.fancy_name || c.company_name }}</span>
                          <span class="wcrt-co-rs">
                            {{ c.company_name }}
                            @if (c.cnpj) {
                              · <span class="wcrt-co-cnpj">{{ formatCnpj(c.cnpj || '') }}</span>
                            }
                          </span>
                        </span>
                        <button type="button" class="wcrt-act wcrt-act--add" (click)="includeCompany(c.id_company)">
                          Incluir
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <div class="wcrt-co-empty">
                    @if (companySearch.trim()) {
                      <b>Nenhuma empresa encontrada</b>
                      Nada corresponde a “{{ companySearch.trim() }}”.
                      <div class="hint">Revise a busca ou cadastre a empresa.</div>
                    } @else {
                      <b>Todas já foram incluídas</b>
                      As {{ companies().length }} empresas cadastradas estão no evento.
                    }
                  </div>
                }
                <div class="wcrt-box-foot">
                  <span>Clique em <b>Incluir</b> para mover a empresa</span>
                  @if (canCreateCompany()) {
                    <button type="button" class="wcrt-link" (click)="openCompanyModal()">Cadastrar empresa</button>
                  }
                </div>
              </section>

              <section class="wcrt-box wcrt-box--target" aria-labelledby="hSel">
                <div class="wcrt-box-head">
                  <div class="wcrt-box-title">
                    <h2 id="hSel">Incluídas no evento</h2>
                    <span class="wcrt-badge-soft wcrt-badge-soft--on">{{ selectedCountLabel() }}</span>
                  </div>
                  <div class="wcrt-bulk">
                    <span>{{ selectedHint() }}</span>
                    <button
                      type="button"
                      class="wcrt-link"
                      [disabled]="selected().size === 0"
                      (click)="removeAllCompanies()"
                    >
                      Remover todas
                    </button>
                  </div>
                </div>
                @if (selectedCompanies().length) {
                  <ul class="wcrt-co-list">
                    @for (c of selectedCompanies(); track c.id_company) {
                      <li class="wcrt-co-row">
                        <span class="wcrt-co-info">
                          <span class="wcrt-co-nm">{{ c.fancy_name || c.company_name }}</span>
                          <span class="wcrt-co-rs">
                            {{ c.company_name }}
                            @if (c.cnpj) {
                              · <span class="wcrt-co-cnpj">{{ formatCnpj(c.cnpj || '') }}</span>
                            }
                          </span>
                        </span>
                        <button type="button" class="wcrt-act wcrt-act--rem" (click)="removeCompany(c.id_company)">
                          Remover
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <div class="wcrt-co-empty">
                    <b>Nenhuma empresa aqui</b>
                    Inclua ao menos uma empresa para seguir.
                    <div class="hint">Use a coluna da esquerda.</div>
                  </div>
                }
                <div class="wcrt-box-foot">
                  <span>O convite é enviado no último passo.</span>
                </div>
              </section>
            </div>
          </div>
        }

        @if (step() === 'pulseiras') {
          <div class="wcrt-form">
            <div class="wcrt-panel-head">
              <h1>Tipos de pulseira</h1>
              <p>
                @if (internalEnabled()) {
                  Defina as pulseiras das empresas e, em seguida, as dos colaboradores internos.
                } @else {
                  Escolha as pulseiras que as empresas poderão atribuir aos colaboradores.
                }
              </p>
              <label class="wcrt-switch">
                <input
                  type="checkbox"
                  [checked]="internalEnabled()"
                  (change)="internalEnabled.set(($any($event.target).checked))"
                />
                <span class="wcrt-switch__ui" aria-hidden="true"></span>
                <span class="wcrt-switch__txt">
                  <b>Credenciamento interno</b>
                  Usuários internos AD poderão se inscrever neste evento.
                </span>
              </label>
              <label class="wcrt-switch">
                <input
                  type="checkbox"
                  [checked]="photoRequired()"
                  (change)="photoRequired.set(($any($event.target).checked))"
                />
                <span class="wcrt-switch__ui" aria-hidden="true"></span>
                <span class="wcrt-switch__txt">
                  <b>Foto do colaborador obrigatória</b>
                  O setor só avisa o responsável depois que todos os indicados tiverem foto. A importação não exige foto.
                </span>
              </label>
              <div class="wcrt-kind-filter" role="status">
                <span>Filtro pelo tipo do evento</span>
                <app-event-kind-badge [kind]="dadosForm.controls.event_kind.value" [compact]="true" />
              </div>
            </div>
            <div class="wcrt-dual">
              <section class="wcrt-box" aria-labelledby="hBrDisp">
                <div class="wcrt-box-head">
                  <div class="wcrt-box-title">
                    <h2 id="hBrDisp">Compatíveis com {{ kindLabel(dadosForm.controls.event_kind.value) }}</h2>
                    <span class="wcrt-badge-soft">{{ availableBraceletCountLabel() }}</span>
                  </div>
                  <div class="wcrt-bulk">
                    <span>{{ availableBraceletHint() }}</span>
                    <button
                      type="button"
                      class="wcrt-link"
                      [disabled]="!availableBracelets().length"
                      (click)="includeAllBracelets()"
                    >
                      Incluir todas
                    </button>
                  </div>
                </div>
                @if (availableBracelets().length) {
                  <ul class="wcrt-co-list">
                    @for (b of availableBracelets(); track b.id_bracelet_type) {
                      <li class="wcrt-co-row">
                        <span class="wcrt-co-info">
                          <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                          @if (b.event_kind === 'BOTH') {
                            <span class="wcrt-co-rs">Válida para Showday e Jogo</span>
                          }
                        </span>
                        <button
                          type="button"
                          class="wcrt-act wcrt-act--add"
                          (click)="includeBracelet(b.id_bracelet_type)"
                        >
                          Incluir
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <div class="wcrt-co-empty">
                    @if (!filteredCatalog().length) {
                      <b>Nenhum tipo para {{ kindLabel(dadosForm.controls.event_kind.value) }}</b>
                      Cadastre um tipo de pulseira compatível com este evento.
                    } @else {
                      <b>Todas já foram incluídas</b>
                      Os {{ filteredCatalog().length }} tipos disponíveis estão no evento.
                    }
                  </div>
                }
                <div class="wcrt-box-foot">
                  <span>Clique em <b>Incluir</b> para habilitar a pulseira</span>
                  <button type="button" class="wcrt-link" (click)="openBraceletModal()">
                    Cadastrar tipo de pulseira
                  </button>
                </div>
              </section>

              <section class="wcrt-box wcrt-box--target" aria-labelledby="hBrSel">
                <div class="wcrt-box-head">
                  <div class="wcrt-box-title">
                    <h2 id="hBrSel">{{ internalEnabled() ? 'Para as empresas' : 'Habilitadas no evento' }}</h2>
                    <span class="wcrt-badge-soft wcrt-badge-soft--on">{{ selectedBraceletCountLabel() }}</span>
                  </div>
                  <div class="wcrt-bulk">
                    <span>{{ selectedBraceletHint() }}</span>
                    <button
                      type="button"
                      class="wcrt-link"
                      [disabled]="selectedBracelets().size === 0"
                      (click)="removeAllBracelets()"
                    >
                      Remover todas
                    </button>
                  </div>
                </div>
                @if (selectedBraceletItems().length) {
                  <ul class="wcrt-co-list">
                    @for (b of selectedBraceletItems(); track b.id_bracelet_type) {
                      <li class="wcrt-co-row">
                        <span class="wcrt-co-info">
                          <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                          @if (b.event_kind === 'BOTH') {
                            <span class="wcrt-co-rs">Válida para Showday e Jogo</span>
                          }
                        </span>
                        <button
                          type="button"
                          class="wcrt-act wcrt-act--rem"
                          (click)="removeBracelet(b.id_bracelet_type)"
                        >
                          Remover
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <div class="wcrt-co-empty">
                    <b>Nenhuma pulseira aqui</b>
                    Inclua ao menos um tipo para seguir.
                    <div class="hint">Use a coluna da esquerda.</div>
                  </div>
                }
                <div class="wcrt-box-foot">
                  <span>Na indicação, só essas pulseiras aparecem.</span>
                </div>
              </section>
            </div>

            @if (internalEnabled()) {
              <div class="wcrt-panel-head wcrt-panel-head--sub">
                <h2>Pulseiras dos colaboradores internos</h2>
                <p>Os usuários AD escolhem uma destas pulseiras ao se inscrever.</p>
              </div>
              <div class="wcrt-dual">
                <section class="wcrt-box" aria-labelledby="hIntDisp">
                  <div class="wcrt-box-head">
                    <div class="wcrt-box-title">
                      <h2 id="hIntDisp">Disponíveis para internos</h2>
                      <span class="wcrt-badge-soft">{{ availableInternalBraceletCountLabel() }}</span>
                    </div>
                    <div class="wcrt-bulk">
                      <span>{{ availableInternalBraceletHint() }}</span>
                      <button
                        type="button"
                        class="wcrt-link"
                        [disabled]="!availableInternalBracelets().length"
                        (click)="includeAllInternalBracelets()"
                      >
                        Incluir todas
                      </button>
                    </div>
                  </div>
                  @if (availableInternalBracelets().length) {
                    <ul class="wcrt-co-list">
                      @for (b of availableInternalBracelets(); track b.id_bracelet_type) {
                        <li class="wcrt-co-row">
                          <span class="wcrt-co-info">
                            <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                          </span>
                          <button
                            type="button"
                            class="wcrt-act wcrt-act--add"
                            (click)="includeInternalBracelet(b.id_bracelet_type)"
                          >
                            Incluir
                          </button>
                        </li>
                      }
                    </ul>
                  } @else {
                    <div class="wcrt-co-empty">
                      <b>Todas já foram incluídas</b>
                      ou não há tipos compatíveis.
                    </div>
                  }
                </section>
                <section class="wcrt-box wcrt-box--target" aria-labelledby="hIntSel">
                  <div class="wcrt-box-head">
                    <div class="wcrt-box-title">
                      <h2 id="hIntSel">Habilitadas para internos</h2>
                      <span class="wcrt-badge-soft wcrt-badge-soft--on">{{ selectedInternalBraceletCountLabel() }}</span>
                    </div>
                    <div class="wcrt-bulk">
                      <button
                        type="button"
                        class="wcrt-link"
                        [disabled]="selectedInternalBracelets().size === 0"
                        (click)="removeAllInternalBracelets()"
                      >
                        Remover todas
                      </button>
                    </div>
                  </div>
                  @if (selectedInternalBraceletItems().length) {
                    <ul class="wcrt-co-list">
                      @for (b of selectedInternalBraceletItems(); track b.id_bracelet_type) {
                        <li class="wcrt-co-row">
                          <span class="wcrt-co-info">
                            <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                          </span>
                          <button
                            type="button"
                            class="wcrt-act wcrt-act--rem"
                            (click)="removeInternalBracelet(b.id_bracelet_type)"
                          >
                            Remover
                          </button>
                        </li>
                      }
                    </ul>
                  } @else {
                    <div class="wcrt-co-empty">
                      <b>Nenhuma pulseira interna</b>
                      Inclua ao menos um tipo para os usuários AD.
                    </div>
                  }
                </section>
              </div>
            }
          </div>
        }

        @if (step() === 'revisar') {
          <div class="wcrt-rev-cols">
            <div class="wcrt-rev-main">
              <section class="wcrt-rev-card">
                <div class="wcrt-rev-card-head">
                  <h2>Dados do credenciamento</h2>
                  <button type="button" class="wcrt-rev-edit" (click)="goToStep('dados')">Editar dados</button>
                </div>
                <p class="wcrt-rev-hero">
                  @if (coverPreview()) {
                    <img [src]="coverPreview()" alt="" class="wcrt-rev-cover" />
                  }
                  {{ dadosForm.controls.name.value || '—' }}
                </p>
                <p class="wcrt-rev-hero-sub">
                  <app-event-kind-badge [kind]="dadosForm.controls.event_kind.value" />
                  <span>setores: {{ setoresNomes() }}</span>
                </p>
                <dl class="wcrt-rev-dl">
                  <div>
                    <dt>Dias do evento</dt>
                    <dd>
                      {{ eventValueLabel() }}
                      @if (eventWeekday()) {
                        <small>{{ eventWeekday() }}</small>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Janela de indicação</dt>
                    <dd>
                      <span class="wcrt-rev-mono">{{ inscriptionWindowCompact() }}</span>
                      <small>{{ inscriptionWindowHint() }}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Setores participantes</dt>
                    <dd>
                      {{ setoresNomes() }}
                      <small>cada setor indica empresas e valida as indicações</small>
                    </dd>
                  </div>
                </dl>
              </section>

              <section class="wcrt-rev-card">
                <div class="wcrt-rev-card-head">
                  <h2>Próximo passo</h2>
                </div>
                <p class="wcrt-rev-hero-sub">
                  Credenciamento interno:
                  <b>{{ internalEnabled() ? 'sim' : 'não' }}</b>
                  @if (internalEnabled()) {
                    · {{ selectedInternalBracelets().size }} pulseira{{ selectedInternalBracelets().size === 1 ? '' : 's' }} para AD
                  }
                  · Foto obrigatória:
                  <b>{{ photoRequired() ? 'sim' : 'não' }}</b>
                </p>
                <p class="wcrt-col__sub">
                  Depois de criar, cada setor participante indica as empresas e envia o convite automaticamente.
                </p>
              </section>

              <section class="wcrt-rev-card">
                <div class="wcrt-rev-card-head">
                  <h2>Tipos de pulseira <span class="wcrt-rev-qtd">{{ selectedBracelets().size }}</span></h2>
                  <button type="button" class="wcrt-rev-edit" (click)="goToStep('pulseiras')">Editar pulseiras</button>
                </div>
                <div class="wcrt-rev-chips">
                  @for (b of selectedBraceletItems(); track b.id_bracelet_type) {
                    <span class="wcrt-rev-chip-wrap" [class.flag]="isBraceletFlag(b)">
                      <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
                      <em>{{ braceletKindEm(b) }}</em>
                    </span>
                  }
                </div>
                @if (incompatibleBracelets().length) {
                  <div class="wcrt-rev-note warn">
                    <b>
                      {{ incompatibleBracelets().length }}
                      tipo{{ incompatibleBracelets().length === 1 ? '' : 's' }}
                      não se aplica{{ incompatibleBracelets().length === 1 ? '' : 'm' }}
                      a {{ kindLabel(dadosForm.controls.event_kind.value) }}
                    </b>
                    {{ incompatibleNote() }}
                  </div>
                }
              </section>
            </div>

            <aside class="wcrt-rev-rail">
              <h2>Ao criar</h2>
              <p class="wcrt-rev-rail-sub">O credenciamento é criado e os setores são avisados para indicar empresas.</p>
              <ul class="wcrt-rev-tl">
                <li class="now">
                  <b>Agora</b>
                  <span>O credenciamento é criado sem empresas</span>
                  <em>Cada setor convida as empresas que vão participar</em>
                </li>
                <li>
                  <b>{{ railOpenWhen() }}</b>
                  <span>Indicações abrem</span>
                  <em>empresas podem cadastrar colaboradores</em>
                </li>
                <li>
                  <b>{{ railCloseWhen() }}</b>
                  <span>Indicações fecham</span>
                  <em>{{ railCloseHint() }}</em>
                </li>
                <li>
                  <b>{{ eventValueLabel() }}</b>
                  <span>Dias do evento</span>
                  <em>{{ railEventHint() }}</em>
                </li>
              </ul>
              <div class="wcrt-rev-confirm">
                <button
                  type="button"
                  class="wcrt-rev-btn wcrt-rev-btn-pri"
                  [disabled]="saving() || !canContinue() || selectedBracelets().size === 0 || internalBraceletsMissing()"
                  (click)="salvar()"
                >
                  {{ saving() ? 'Criando…' : 'Criar credenciamento' }}
                </button>
                <button type="button" class="wcrt-rev-btn wcrt-rev-btn-sec" [disabled]="saving()" (click)="onBack()">
                  Voltar
                </button>
              </div>
            </aside>
          </div>
        }

        @if (false) {
          <div class="wcrt-mail">
            <section class="wcrt-rev-card">
              <div class="wcrt-rev-card-head">
                <h2>E-mail de convite</h2>
                <span class="wcrt-rev-qtd">{{ selected().size }} empresa{{ selected().size === 1 ? '' : 's' }}</span>
              </div>
              <p class="wcrt-col__sub">As empresas só recebem este e-mail depois de enviar ou agendar.</p>
              <div class="wcrt-field">
                <label for="wcrt-mail-subject">Assunto<span class="wcrt-req">*</span></label>
                <input
                  id="wcrt-mail-subject"
                  type="text"
                  class="wcrt-control"
                  maxlength="255"
                  [(ngModel)]="inviteSubject"
                  name="inviteSubject"
                />
              </div>
              <div class="wcrt-field">
                <span class="wcrt-kind-lbl">Corpo do e-mail</span>
                @if (inviteLoading()) {
                  <p class="wcrt-help">Carregando editor…</p>
                } @else {
                  <editor
                    [init]="tinyInit"
                    [(ngModel)]="inviteHtml"
                    name="inviteHtml"
                    licenseKey="gpl"
                    [disabled]="sendingInvite()"
                  />
                }
              </div>
              <div class="wcrt-field">
                <span class="wcrt-kind-lbl">Anexos</span>
                <p class="wcrt-help">PDF, imagem ou Office. Até 5 arquivos de 5 MB.</p>
                <div class="wcrt-mail-files">
                  @for (f of inviteFiles(); track f.id_event_accreditation_invite_file) {
                    <div class="wcrt-mail-file">
                      <b>{{ f.original_name }}</b>
                      <span>{{ formatFileSize(f.size_bytes) }}</span>
                      <button type="button" (click)="removeInviteFile(f)" [disabled]="sendingInvite()">Remover</button>
                    </div>
                  }
                  @if (inviteFiles().length < 5) {
                    <label class="wcrt-cover__pick">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        (change)="onInviteFilePick($event)"
                        [disabled]="sendingInvite() || uploadingFile()"
                      />
                      {{ uploadingFile() ? 'Enviando…' : 'Incluir anexo' }}
                    </label>
                  }
                </div>
              </div>
            </section>
            <div class="wcrt-mail-actions">
              <button
                type="button"
                class="btn-action-primary"
                [disabled]="sendingInvite() || !createdId() || !inviteSubject.trim() || !inviteHtml.trim()"
                (click)="finishInvite('now')"
              >
                {{ sendingInvite() ? 'Enviando…' : 'Enviar agora' }}
              </button>
              <button
                type="button"
                class="btn-action-secondary"
                [disabled]="sendingInvite() || !createdId()"
                (click)="finishInvite('schedule')"
              >
                Agendar para o início da inscrição
              </button>
              <button
                type="button"
                class="wcrt-rev-link"
                [disabled]="sendingInvite()"
                (click)="finishInvite('skip')"
              >
                Pular e concluir
              </button>
            </div>
          </div>
        }
      </div>

      @if (step() !== 'revisar') {
        <div class="wcrt-foot">
          <div class="wcrt-foot__left">
            @if (step() === 'dados') {
              <span class="wcrt-foot__status">{{ footStatus() }}</span>
            } @else {
              <span class="wcrt-foot__status" [class.warn]="selectedBracelets().size === 0 || internalBraceletsMissing()">{{ braceletsFootStatus() }}</span>
            }
          </div>
          <div class="wcrt-foot__right">
            @if (step() === 'dados') {
              <button type="button" class="btn-action-secondary" [disabled]="saving()" (click)="onBack()">
                Cancelar
              </button>
              <button
                type="button"
                class="btn-action-primary"
                [disabled]="saving() || !canContinue()"
                (click)="goPulseiras()"
              >
                Continuar para pulseiras
              </button>
            }
            @if (step() === 'pulseiras') {
              <button type="button" class="btn-action-secondary" [disabled]="saving()" (click)="onBack()">
                Voltar
              </button>
              <button
                type="button"
                class="btn-action-primary"
                [disabled]="saving() || selectedBracelets().size === 0 || internalBraceletsMissing()"
                (click)="goToStep('revisar')"
              >
                Continuar para revisão
              </button>
            }
          </div>
        </div>
      }
    </div>

    <app-modal
      [open]="showCompanyModal()"
      title="Cadastrar empresa"
      subtitle="A empresa entra na lista e já fica incluída no evento."
      size="md"
      (close)="closeCompanyModal()"
    >
      <form id="wcrt-company-form" class="wcrt-co-form" (ngSubmit)="salvarEmpresa()">
        <div class="wcrt-field">
          <label for="wcrt-co-type">Tipo<span class="wcrt-req">*</span></label>
          <select id="wcrt-co-type" name="id_company_type" class="wcrt-control wcrt-select" [(ngModel)]="companyDraft.id_company_type">
            <option [ngValue]="null">Selecione o tipo</option>
            @for (t of companyTypes(); track t.id_company_type) {
              <option [ngValue]="t.id_company_type">{{ t.description }}</option>
            }
          </select>
        </div>
        <div class="wcrt-field">
          <label for="wcrt-co-cnpj">CNPJ<span class="wcrt-req">*</span></label>
          <input
            id="wcrt-co-cnpj"
            name="cnpj"
            class="wcrt-control"
            maxlength="18"
            placeholder="00.000.000/0000-00"
            [(ngModel)]="companyDraft.cnpj"
          />
        </div>
        <div class="wcrt-field">
          <label for="wcrt-co-name">Razão social<span class="wcrt-req">*</span></label>
          <input id="wcrt-co-name" name="company_name" class="wcrt-control" [(ngModel)]="companyDraft.company_name" />
        </div>
        <div class="wcrt-field">
          <label for="wcrt-co-fancy">Nome fantasia</label>
          <input id="wcrt-co-fancy" name="fancy_name" class="wcrt-control" [(ngModel)]="companyDraft.fancy_name" />
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="closeCompanyModal()">Cancelar</button>
        <button type="submit" form="wcrt-company-form" class="btn-action-primary" [disabled]="savingCompany()">
          {{ savingCompany() ? 'Salvando…' : 'Salvar e incluir' }}
        </button>
      </div>
    </app-modal>

    <app-modal
      [open]="showBraceletModal()"
      title="Cadastrar tipo de pulseira"
      subtitle="O tipo entra na lista e já fica habilitado neste evento."
      size="md"
      (close)="closeBraceletModal()"
    >
      <form id="wcrt-bracelet-form" class="wcrt-co-form" (ngSubmit)="salvarPulseira()">
        <div class="wcrt-field">
          <label for="wcrt-br-name">Nome<span class="wcrt-req">*</span></label>
          <input
            id="wcrt-br-name"
            name="bracelet_name"
            class="wcrt-control"
            maxlength="100"
            placeholder="Ex.: Backstage"
            [(ngModel)]="braceletDraft.name"
          />
        </div>
        <div class="wcrt-field">
          <label for="wcrt-br-kind">Tipo de evento<span class="wcrt-req">*</span></label>
          <select
            id="wcrt-br-kind"
            name="bracelet_kind"
            class="wcrt-control wcrt-select"
            [(ngModel)]="braceletDraft.event_kind"
          >
            <option [ngValue]="dadosForm.controls.event_kind.value">
              {{ kindLabel(dadosForm.controls.event_kind.value) }}
            </option>
            <option [ngValue]="'BOTH'">Showday e Jogo</option>
          </select>
          <p class="wcrt-help">Só tipos compatíveis com {{ kindLabel(dadosForm.controls.event_kind.value) }} entram nesta lista.</p>
        </div>
        <app-bracelet-visual-picker
          [name]="braceletDraft.name"
          [kind]="braceletDraft.event_kind"
          [color]="braceletDraft.color"
          (colorChange)="braceletDraft.color = $event"
        />
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="closeBraceletModal()">Cancelar</button>
        <button type="submit" form="wcrt-bracelet-form" class="btn-action-primary" [disabled]="savingBracelet()">
          {{ savingBracelet() ? 'Salvando…' : 'Salvar e incluir' }}
        </button>
      </div>
    </app-modal>

  `,
  styles: [
    `
      :host {
        --ink: #241030;
        --ink-2: #54485f;
        --ink-3: #7b7086;
        --line: #e3dfe9;
        --line-strong: #cfc8d8;
        --ok: #1f7a3d;
        --warn: #a85b00;
        --warn-bg: #fdf4e6;
        --danger: #b3261e;
        --danger-bg: #fceeed;
        --purple-core: #8d0de3;
        --purple-900: #420465;
        --green-300: #a7d296;
        --form-field-height: 2.5rem;
        font-family: var(--font-body);
        display: block;
        width: 100%;
      }
      .wcrt-page {
        width: 100%;
        max-width: none;
        color: var(--ink);
        padding-bottom: 40px;
      }
      .wcrt-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 18px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--wtorre, #1d54e6);
        font: inherit;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
      }
      .wcrt-back:hover {
        text-decoration: underline;
      }
      .wcrt {
        display: flex;
        flex-direction: column;
        min-width: 0;
        max-width: 100%;
      }
      .form-field.is-invalid,
      .form-select.is-invalid {
        border-color: var(--danger);
      }
      .wcrt-stepper {
        display: flex;
        flex-direction: column;
        margin-bottom: 16px;
        padding: 14px 16px;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 14px;
      }
      .wcrt-stepper__track {
        display: flex;
        align-items: center;
        width: 100%;
      }
      .wcrt-stepper__current {
        display: none;
      }
      .wcrt-stepper__item {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }
      .wcrt-stepper__dot {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        flex: none;
        font-weight: 700;
        font-size: 12.5px;
        background: #eef0f4;
        color: var(--ink-3);
      }
      .wcrt-stepper__dot svg {
        width: 14px;
        height: 14px;
      }
      .wcrt-stepper__label {
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      .wcrt-stepper__item.is-active .wcrt-stepper__dot {
        background: var(--purple-core);
        color: #fff;
      }
      .wcrt-stepper__item.is-active .wcrt-stepper__label {
        color: var(--ink);
        font-weight: 600;
      }
      .wcrt-stepper__item.is-done .wcrt-stepper__dot {
        background: var(--purple-900);
        color: #fff;
      }
      .wcrt-stepper__item.is-done .wcrt-stepper__label {
        color: var(--ink-2);
      }
      .wcrt-stepper__line {
        flex: 1;
        height: 2px;
        background: #eef0f4;
        margin: 0 12px;
        border-radius: 2px;
      }
      .wcrt-stepper__line.is-done {
        background: var(--purple-900);
      }
      .wcrt-form {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 22px 24px;
      }
      .wcrt-panel-head {
        margin-bottom: 16px;
      }
      .wcrt-panel-head h1 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 17px;
        font-weight: 600;
        margin: 0 0 3px;
      }
      .wcrt-panel-head p {
        margin: 0;
        color: var(--ink-2);
        font-size: 13px;
      }
      .wcrt-panel-head--sub {
        margin: 22px 0 12px;
      }
      .wcrt-panel-head--sub h2 {
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 3px;
      }
      .wcrt-switch {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #f8fafc;
        cursor: pointer;
      }
      .wcrt-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .wcrt-switch__ui {
        flex: 0 0 auto;
        width: 40px;
        height: 22px;
        border-radius: 999px;
        background: #cbd5e1;
        position: relative;
        transition: background 0.15s ease;
      }
      .wcrt-switch__ui::after {
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
      .wcrt-switch input:checked + .wcrt-switch__ui {
        background: var(--color-primary, #1d54e6);
      }
      .wcrt-switch input:checked + .wcrt-switch__ui::after {
        transform: translateX(18px);
      }
      .wcrt-switch__txt {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        font-size: 13px;
        color: var(--ink-2);
      }
      .wcrt-switch__txt b {
        color: var(--ink, #0f172a);
      }
      .wcrt-kind-filter {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #fff;
        font-size: 12px;
        color: var(--ink-2);
      }
      .wcrt-kind-lbl {
        display: block;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--ink-2);
        margin-bottom: 6px;
      }
      .wcrt-kind-picks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        min-width: 0;
      }
      .wcrt-kind-pick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-width: 0;
        border: 1px solid var(--line-strong);
        background: #fff;
        border-radius: 10px;
        padding: 8px 6px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        color: var(--ink-2);
      }
      .wcrt-kind-pick__ico {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        flex: none;
      }
      .wcrt-kind-pick__ico svg {
        width: 13px;
        height: 13px;
      }
      .wcrt-kind-pick--showday .wcrt-kind-pick__ico {
        background: #f6e8fb;
        color: #6b0870;
      }
      .wcrt-kind-pick--jogo .wcrt-kind-pick__ico {
        background: #e6f6ee;
        color: #0f5c38;
      }
      .wcrt-kind-pick--showday.on {
        border-color: #c98ad6;
        background: #f6e8fb;
        color: #6b0870;
      }
      .wcrt-kind-pick--jogo.on {
        border-color: #7ec9a1;
        background: #e6f6ee;
        color: #0f5c38;
      }
      .wcrt-dual {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      .wcrt-box {
        border: 1px solid var(--line);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        min-height: 420px;
      }
      .wcrt-box--target {
        border-color: var(--line-strong);
      }
      .wcrt-box-head {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
      }
      .wcrt-box-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .wcrt-box-title h2 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 12px;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0;
      }
      .wcrt-badge-soft {
        font-size: 11.5px;
        color: var(--ink-3);
      }
      .wcrt-badge-soft--on {
        color: var(--purple-900);
        font-weight: 500;
      }
      .wcrt-searchbox {
        position: relative;
        margin-top: 10px;
      }
      .wcrt-searchbox input {
        width: 100%;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        padding: 8px 32px;
        font-size: 13.5px;
        font: inherit;
      }
      .wcrt-searchbox input:hover {
        border-color: var(--purple-core);
      }
      .wcrt-searchbox__mag {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--ink-3);
        font-size: 13px;
      }
      .wcrt-searchbox__clr {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: 0;
        color: var(--ink-3);
        cursor: pointer;
        padding: 4px;
        display: none;
      }
      .wcrt-searchbox__clr.on {
        display: block;
      }
      .wcrt-bulk {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 9px;
        font-size: 12px;
        color: var(--ink-3);
      }
      .wcrt-link {
        background: none;
        border: 0;
        padding: 0;
        color: var(--purple-core);
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
      }
      .wcrt-link:disabled {
        color: var(--ink-3);
        text-decoration: none;
        cursor: default;
      }
      .wcrt-co-list {
        list-style: none;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        flex: 1;
        max-height: 360px;
      }
      .wcrt-co-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 8px;
      }
      .wcrt-co-row + .wcrt-co-row {
        border-top: 1px solid var(--line);
      }
      .wcrt-co-row:hover {
        background: #faf8fc;
      }
      .wcrt-co-info {
        flex: 1;
        min-width: 0;
      }
      .wcrt-co-nm {
        font-weight: 600;
        font-size: 13.5px;
        display: block;
        overflow-wrap: anywhere;
      }
      .wcrt-co-rs {
        font-size: 11.5px;
        color: var(--ink-2);
        display: block;
        overflow-wrap: anywhere;
      }
      .wcrt-co-cnpj {
        font-size: 11px;
        color: var(--ink-3);
      }
      .wcrt-act {
        flex: 0 0 auto;
        border: 1px solid var(--line-strong);
        background: #fff;
        border-radius: 999px;
        padding: 5px 12px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .wcrt-act--add:hover {
        border-color: var(--purple-core);
        color: var(--purple-900);
        background: #f9f2fe;
      }
      .wcrt-act--rem {
        border-color: transparent;
        color: var(--ink-3);
      }
      .wcrt-act--rem:hover {
        border-color: #e9b4b0;
        color: var(--danger);
        background: var(--danger-bg);
      }
      .wcrt-co-empty {
        margin: auto;
        padding: 26px 20px;
        text-align: center;
        color: var(--ink-2);
        font-size: 13px;
      }
      .wcrt-co-empty b {
        display: block;
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 13.5px;
        color: var(--ink);
        margin-bottom: 4px;
      }
      .wcrt-co-empty .hint {
        font-size: 12px;
        color: var(--ink-3);
        margin-top: 6px;
      }
      .wcrt-box-foot {
        border-top: 1px solid var(--line);
        padding: 10px 14px;
        font-size: 12px;
        color: var(--ink-3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .wcrt-co-form .wcrt-field:last-child {
        margin-bottom: 0;
      }
      .wcrt-dados {
        display: grid;
        grid-template-columns: minmax(236px, 254px) minmax(236px, 254px) minmax(280px, 1fr);
        gap: 26px;
        align-items: start;
      }
      .wcrt-col > h2 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 13px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0 0 3px;
      }
      .wcrt-col__sub {
        font-size: 12.5px;
        color: var(--ink-3);
        margin: 0 0 12px;
      }
      .wcrt-req {
        color: var(--danger);
        margin-left: 2px;
      }
      .wcrt-value {
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: #fff;
        margin-bottom: 12px;
      }
      .wcrt-value.empty {
        border-style: dashed;
        color: var(--ink-3);
      }
      .wcrt-value.bad {
        border-color: var(--danger);
        background: var(--danger-bg);
      }
      .wcrt-value__ico {
        color: var(--ink-3);
      }
      .wcrt-value__txt {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: 13.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .wcrt-value.empty .wcrt-value__txt {
        font-weight: 400;
      }
      .wcrt-pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 14px;
      }
      .wcrt-pair--id {
        display: flex;
        flex-wrap: wrap;
        align-items: start;
        gap: 12px;
        margin-top: 0;
        margin-bottom: 14px;
      }
      .wcrt-pair--id > .wcrt-field {
        margin-bottom: 0;
      }
      .wcrt-pair--id > .wcrt-field:first-child {
        flex: 1 1 160px;
        min-width: 0;
      }
      .wcrt-pair--id > .wcrt-field:last-child {
        flex: 1 1 220px;
        min-width: 0;
      }
      .wcrt-setor-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 220px;
        overflow: auto;
        padding: 10px 12px;
        border: 1px solid var(--line, #e2e5ec);
        border-radius: 10px;
        background: #fff;
      }
      .wcrt-setor-list.invalid {
        border-color: #d64545;
      }
      .wcrt-setor-pick {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 14px;
        cursor: pointer;
      }
      .wcrt-field {
        margin-bottom: 14px;
        min-width: 0;
      }
      .wcrt-pair .wcrt-field {
        margin: 0;
      }
      .wcrt-field label {
        display: block;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--ink-2);
        margin-bottom: 6px;
      }
      .wcrt-field label.wcrt-setor-pick {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 0;
        font-size: 14px;
        font-weight: 500;
        color: inherit;
      }
      .wcrt-setor-pick input[type='checkbox'] {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--brand, var(--purple-core, #8d0de3));
      }
      .wcrt-control {
        width: 100%;
        background: #fff;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        font: inherit;
        color: inherit;
      }
      .wcrt-control:hover {
        border-color: var(--purple-core);
      }
      .wcrt-control.invalid {
        border-color: var(--danger);
        background: var(--danger-bg);
      }
      .wcrt-select {
        appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%237B7086' stroke-width='1.6'><path d='M1 1l5 5 5-5'/></svg>");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 34px;
      }
      .wcrt-field--hero .wcrt-control {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 17px;
        font-weight: 600;
        padding: 11px 13px;
      }
      .wcrt-help {
        font-size: 12px;
        color: var(--ink-3);
        margin: 6px 0 0;
      }
      .wcrt-err {
        font-size: 12px;
        color: var(--danger);
        margin: 6px 0 0;
      }
      .wcrt-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
        font-size: 11.5px;
        color: var(--ink-2);
      }
      .wcrt-legend__dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 5px;
        vertical-align: 0;
      }
      .wcrt-legend__dot--sel {
        background: var(--purple-core);
      }
      .wcrt-legend__dot--win {
        background: var(--green-300);
      }
      .wcrt-resumo {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 14px 16px;
        margin-top: 18px;
      }
      .wcrt-resumo h3 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 11.5px;
        letter-spacing: 0.11em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0 0 12px;
      }
      .wcrt-tl {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .wcrt-tl li {
        position: relative;
        padding: 0 0 14px 18px;
        border-left: 1px solid var(--line);
        margin-left: 4px;
      }
      .wcrt-tl li:last-child {
        border-left-color: transparent;
        padding-bottom: 0;
      }
      .wcrt-tl li::before {
        content: '';
        position: absolute;
        left: -5px;
        top: 4px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--line-strong);
      }
      .wcrt-tl li.set::before {
        background: var(--purple-core);
      }
      .wcrt-tl b {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .wcrt-tl span {
        font-size: 13.5px;
        font-weight: 600;
      }
      .wcrt-tl span.pend {
        font-weight: 400;
        color: var(--ink-3);
      }
      .wcrt-tl em {
        display: inline-block;
        margin-left: 4px;
        font-size: 11.5px;
        font-style: normal;
        color: var(--ink-3);
      }
      .wcrt-alert {
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 12.5px;
        margin-top: 10px;
      }
      .wcrt-alert--bad {
        background: var(--danger-bg);
        border: 1px solid #e9b4b0;
        color: #7e1b15;
      }
      .wcrt-alert--good {
        background: #f1f8ed;
        border: 1px solid var(--green-300);
        color: #175e2e;
      }
      .wcrt-notify {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding-top: 0.25rem;
      }
      .wcrt-block__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .wcrt-block__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wcrt-block__count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ink-3);
      }
      .wcrt-search {
        display: flex;
        min-width: 16rem;
      }
      .wcrt-search__icon {
        position: absolute;
        left: 10px;
        top: 50%;
        width: 16px;
        height: 16px;
        transform: translateY(-50%);
        color: var(--ink-3);
      }
      .wcrt-search__input {
        padding-left: 2rem;
      }
      .wcrt-table-scroll {
        overflow: auto;
        max-height: 22rem;
      }
      .wcrt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }
      .wcrt-table th {
        text-align: left;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ink-3);
        padding: 8px 6px;
        border-bottom: 1px solid var(--line);
      }
      .wcrt-table td {
        padding: 10px 6px;
        border-bottom: 1px solid #f1f3f7;
        vertical-align: middle;
      }
      .wcrt-rev-cols {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 328px;
        gap: 18px;
        align-items: start;
      }
      .wcrt-rev-card {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 18px 20px;
        margin-bottom: 14px;
      }
      .wcrt-rev-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .wcrt-rev-card-head h2 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 13px;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wcrt-rev-qtd {
        font-family: var(--font-body);
        font-size: 11.5px;
        letter-spacing: 0;
        text-transform: none;
        color: var(--purple-900);
        background: #f6ecfd;
        border-radius: 999px;
        padding: 2px 8px;
      }
      .wcrt-rev-edit {
        border: 1px solid var(--line-strong);
        background: #fff;
        border-radius: 999px;
        padding: 5px 13px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .wcrt-rev-edit:hover {
        border-color: var(--purple-core);
        color: var(--purple-900);
      }
      .wcrt-rev-hero {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 21px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0 0 3px;
      }
      .wcrt-rev-hero-sub {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--ink-2);
        margin: 0 0 16px;
      }
      .wcrt-rev-dl {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 14px 20px;
        border-top: 1px solid var(--line);
        padding-top: 14px;
        margin: 0;
      }
      .wcrt-rev-dl dt {
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink-3);
        margin: 0 0 3px;
      }
      .wcrt-rev-dl dd {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      .wcrt-rev-dl dd .wcrt-rev-mono {
        font-family: var(--font-body);
        font-weight: 500;
        font-size: 13px;
      }
      .wcrt-rev-dl dd small {
        display: block;
        font-family: var(--font-body);
        font-size: 11.5px;
        font-weight: 400;
        color: var(--ink-3);
        margin-top: 2px;
      }
      .wcrt-rev-emp {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
        gap: 10px;
      }
      .wcrt-rev-emp-item {
        border: 1px solid var(--line);
        border-radius: 9px;
        padding: 9px 12px;
        min-width: 0;
      }
      .wcrt-rev-emp-item b {
        display: block;
        font-size: 13.5px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .wcrt-rev-emp-item span {
        display: block;
        font-size: 11.5px;
        color: var(--ink-2);
        overflow-wrap: anywhere;
      }
      .wcrt-rev-cnpj {
        font-family: var(--font-body);
        font-size: 11px;
        color: var(--ink-3);
      }
      .wcrt-rev-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }
      .wcrt-rev-chip-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .wcrt-rev-chip-wrap em {
        font-family: var(--font-body);
        font-style: normal;
        font-size: 10.5px;
        font-weight: 400;
        color: var(--ink-3);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wcrt-rev-chip-wrap.flag em {
        color: var(--warn);
      }
      .wcrt-rev-chip {
        display: inline-flex;
        align-items: baseline;
        gap: 7px;
        border: 1px solid var(--line-strong);
        border-radius: 999px;
        padding: 5px 12px;
        font-size: 13px;
        font-weight: 600;
      }
      .wcrt-rev-chip em {
        font-family: var(--font-body);
        font-style: normal;
        font-size: 10.5px;
        font-weight: 400;
        color: var(--ink-3);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wcrt-rev-chip.flag {
        border-color: #e8c9a0;
        background: var(--warn-bg);
      }
      .wcrt-rev-chip.flag em {
        color: var(--warn);
      }
      .wcrt-rev-chip--showday:not(.flag) {
        border-color: #e4c4ef;
        background: #f6e8fb;
        color: #6b0870;
      }
      .wcrt-rev-chip--jogo:not(.flag) {
        border-color: #b7e0c8;
        background: #e6f6ee;
        color: #0f5c38;
      }
      .wcrt-rev-chip--both:not(.flag) {
        border-color: #c9d3e4;
        background: #eef2f8;
        color: #3d4a6b;
      }
      .wcrt-rev-note {
        border-radius: 9px;
        padding: 11px 13px;
        font-size: 12.5px;
        margin-top: 14px;
      }
      .wcrt-rev-note.warn {
        background: var(--warn-bg);
        border: 1px solid #e8c9a0;
        color: #7a4300;
      }
      .wcrt-rev-note b {
        display: block;
        margin-bottom: 2px;
      }
      .wcrt-rev-rail {
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 18px 20px;
        position: sticky;
        top: 18px;
      }
      .wcrt-rev-rail h2 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 13px;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0 0 4px;
      }
      .wcrt-rev-rail-sub {
        font-size: 12.5px;
        color: var(--ink-3);
        margin: 0 0 16px;
      }
      .wcrt-rev-tl {
        list-style: none;
        margin: 0 0 16px;
        padding: 0;
      }
      .wcrt-rev-tl li {
        position: relative;
        padding: 0 0 15px 18px;
        border-left: 1px solid var(--line);
        margin-left: 4px;
      }
      .wcrt-rev-tl li:last-child {
        border-left-color: transparent;
        padding-bottom: 0;
      }
      .wcrt-rev-tl li::before {
        content: '';
        position: absolute;
        left: -5px;
        top: 4px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--purple-core);
      }
      .wcrt-rev-tl li.now::before {
        box-shadow: 0 0 0 3px #f0ddfb;
      }
      .wcrt-rev-tl b {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .wcrt-rev-tl span {
        font-size: 13.5px;
        font-weight: 600;
      }
      .wcrt-rev-tl em {
        font-family: var(--font-body);
        font-size: 11.5px;
        font-style: normal;
        color: var(--ink-3);
        display: block;
      }
      .wcrt-rev-confirm {
        border-top: 1px solid var(--line);
        padding-top: 14px;
      }
      .wcrt-rev-btn {
        width: 100%;
        border-radius: 999px;
        padding: 12px;
        font-size: 14px;
        font-weight: 700;
        border: 1px solid transparent;
        cursor: pointer;
        margin-top: 12px;
      }
      .wcrt-rev-btn-pri {
        background: var(--purple-core);
        color: #fff;
        margin-top: 0;
      }
      .wcrt-rev-btn-pri:hover:not(:disabled) {
        background: var(--purple-900);
      }
      .wcrt-rev-btn-pri:disabled {
        background: #edeaf1;
        color: var(--ink-3);
        cursor: not-allowed;
      }
      .wcrt-rev-btn-sec {
        background: #fff;
        border-color: var(--line-strong);
        margin-top: 8px;
      }
      .wcrt-rev-btn-sec:hover:not(:disabled) {
        border-color: var(--purple-core);
        color: var(--purple-900);
      }
      .wcrt-rev-link {
        display: block;
        width: 100%;
        background: none;
        border: 0;
        padding: 0;
        color: var(--purple-core);
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        margin-top: 12px;
        text-align: left;
      }
      .wcrt-cover {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 6px;
      }
      .wcrt-cover__preview {
        width: 72px;
        height: 72px;
        border-radius: 12px;
        overflow: hidden;
        background: #f4f6fb;
        border: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ink-3);
        font-size: 12px;
        flex-shrink: 0;
      }
      .wcrt-cover__preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .wcrt-cover__actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .wcrt-cover__pick {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line-strong);
        background: #fff;
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .wcrt-cover__pick input {
        display: none;
      }
      .wcrt-cover__clear {
        border: 0;
        background: none;
        color: var(--danger);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .wcrt-rev-cover {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
      }
      .wcrt-mail {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .wcrt-mail-files {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 6px;
      }
      .wcrt-mail-file {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--line);
        border-radius: 10px;
        font-size: 13px;
      }
      .wcrt-mail-file b {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .wcrt-mail-file span {
        color: var(--ink-3);
        font-size: 12px;
      }
      .wcrt-mail-file button {
        border: 0;
        background: none;
        color: var(--danger);
        font-weight: 600;
        cursor: pointer;
      }
      .wcrt-mail-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .wcrt-rev-mail-btn {
        display: inline-block;
        padding: 10px 16px;
        background: #1d54e6;
        color: #fff;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13px;
      }
      .wcrt-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 24px;
        padding-top: 8px;
      }
      .wcrt-foot__left {
        min-width: 0;
      }
      .wcrt-foot__status {
        font-size: 12.5px;
        color: var(--ink-3);
      }
      .wcrt-foot__status.warn {
        color: var(--danger);
      }
      .wcrt-foot__right {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }
      .wcrt-foot__pessoas {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .wcrt-foot__hint {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--danger);
      }
      @media (max-width: 1100px) {
        .wcrt-stepper__label {
          display: none;
        }
        .wcrt-stepper__current {
          display: block;
          margin: 8px 0 0;
          font-size: 12.5px;
          font-weight: 600;
        }
      }
      @media (max-width: 900px) {
        .wcrt-dual {
          grid-template-columns: 1fr;
        }
        .wcrt-dados {
          grid-template-columns: 1fr 1fr;
        }
        .wcrt-col--form {
          grid-column: 1 / -1;
        }
        .wcrt-rev-cols {
          grid-template-columns: 1fr;
        }
        .wcrt-stepper__label {
          display: none;
        }
        .wcrt-stepper__current {
          display: block;
          margin: 8px 0 0;
          font-size: 12.5px;
          font-weight: 600;
        }
      }
      @media (max-width: 760px) {
        .wcrt-dados,
        .wcrt-pair {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class EventAccreditationCreateComponent implements OnInit, OnDestroy {
  private readonly service = inject(EventAccreditationService);
  private readonly companyService = inject(CompanyService);
  private readonly auth = inject(AuthService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  readonly step = signal<WizardStep>('dados');
  readonly sectors = signal<EligibleSector[]>([]);
  readonly companies = signal<AccreditationCompanyBrief[]>([]);
  readonly saving = signal(false);
  readonly selected = signal<Set<number>>(new Set());
  readonly kindLabel = kindLabel;
  readonly formatDateBr = formatDateBr;
  readonly formatDateTimeBr = formatDateTimeBr;
  readonly formatIsoBr = formatIsoBr;
  readonly formatCnpj = formatCnpj;

  readonly insStart = signal<string | null>(null);
  readonly insEnd = signal<string | null>(null);
  readonly eventDays = signal<Set<string>>(new Set());
  readonly showCompanyModal = signal(false);
  readonly savingCompany = signal(false);
  readonly companyTypes = signal<CompanyType[]>([]);
  readonly canCreateCompany = signal(false);
  readonly catalogBracelets = signal<BraceletType[]>([]);
  readonly selectedBracelets = signal<Set<number>>(new Set());
  readonly internalEnabled = signal(false);
  readonly photoRequired = signal(false);
  readonly selectedInternalBracelets = signal<Set<number>>(new Set());
  readonly showBraceletModal = signal(false);
  readonly savingBracelet = signal(false);
  readonly coverPreview = signal<string | null>(null);
  readonly createdId = signal<number | null>(null);
  readonly inviteLoading = signal(false);
  readonly sendingInvite = signal(false);
  readonly uploadingFile = signal(false);
  readonly inviteFiles = signal<EventAccreditationInviteFile[]>([]);
  readonly tinyInit: Record<string, unknown> = {
    base_url: '/tinymce',
    suffix: '.min',
    license_key: 'gpl',
    height: 420,
    menubar: 'file edit view insert format tools table help',
    branding: true,
    promotion: false,
    plugins:
      'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount',
    toolbar:
      'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | ' +
      'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | ' +
      'link image | code removeformat | help',
    content_style: 'body { font-family: Helvetica, Arial, sans-serif; font-size: 14px; }',
    convert_urls: false,
    relative_urls: false,
    remove_script_host: false,
    image_title: true,
    automatic_uploads: false,
    file_picker_types: 'image',
  };
  inviteSubject = '';
  inviteHtml = '';
  private coverFile: File | null = null;
  readonly stepDefs = STEP_ORDER.map((key) => ({ key, label: STEP_LABELS[key] }));
  readonly stepIndex = computed(() => STEP_ORDER.indexOf(this.step()));
  private loadedBraceletKind: EventAccreditationKind | null = null;

  companySearch = '';
  dadosFormSubmitted = false;
  companyDraft: {
    id_company_type: number | null;
    cnpj: string;
    company_name: string;
    fancy_name: string;
  } = { id_company_type: null, cnpj: '', company_name: '', fancy_name: '' };
  braceletDraft: { name: string; event_kind: BraceletKind; icon: string; color: string } = {
    name: '',
    event_kind: 'SHOWDAY',
    icon: DEFAULT_BRACELET_ICON,
    color: DEFAULT_BRACELET_COLOR,
  };

  dadosForm = new FormGroup({
    ins_time_start: new FormControl('00:00', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    ins_time_end: new FormControl('18:00', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    event_kind: new FormControl<EventAccreditationKind>('SHOWDAY', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    id_setor: new FormControl<number | null>(null),
  });
  readonly selectedSectors = signal<Set<number>>(new Set());

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

  stepNumber(): number {
    return this.stepIndex() + 1;
  }

  stepLabel(): string {
    return STEP_LABELS[this.step()];
  }

  setEventKind(kind: EventAccreditationKind): void {
    if (this.dadosForm.controls.event_kind.value === kind) return;
    this.dadosForm.controls.event_kind.setValue(kind);
    this.loadedBraceletKind = null;
    this.pruneSelectedBracelets();
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

  eventMonthLabel(): string {
    const day = this.firstEventDay();
    if (!day) return '';
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    const m = Number(day.slice(5, 7)) - 1;
    return months[m] || '';
  }

  dateConflict(): string {
    const fim = this.insWindowEnd();
    const dia = this.firstEventDay();
    if (fim && dia && fim > dia) {
      return `A janela fecha depois do evento. Ajuste para terminar até ${formatIsoBr(dia)}.`;
    }
    const a = this.insStart();
    const b = this.insEnd();
    const abre = this.dadosForm.controls.ins_time_start.value;
    const fecha = this.dadosForm.controls.ins_time_end.value;
    if (a && b && a === b && fecha <= abre) {
      return 'Em janela de um dia, o fechamento precisa ser depois da abertura.';
    }
    return '';
  }

  goodAlert(): string {
    if (!this.canContinue()) return '';
    const dia = this.firstEventDay();
    const fim = this.insWindowEnd();
    if (!dia || !fim) return '';
    const ant = this.daysBetween(fim, dia);
    return `Prazos válidos. As indicações fecham ${ant === 0 ? 'no próprio dia do evento' : `${ant} dia(s) antes`}.`;
  }

  canContinue(): boolean {
    const name = this.dadosForm.controls.name.value.trim();
    return !!(
      name &&
      this.selectedSectors().size &&
      this.eventDays().size &&
      this.insStart() &&
      this.insEnd() &&
      !this.dateConflict()
    );
  }

  footStatus(): string {
    const falta = [
      !this.dadosForm.controls.name.value.trim() && 'nome',
      !this.selectedSectors().size && 'setores participantes',
      !this.eventDays().size && 'dias do evento',
      (!this.insStart() || !this.insEnd()) && 'janela de indicação',
    ].filter(Boolean);
    if (falta.length) return `Faltam: ${falta.join(', ')}`;
    if (this.dateConflict()) return 'Corrija o conflito de datas para continuar';
    return 'Tudo pronto para o passo 2';
  }

  inscriptionStartIso(): string {
    return this.toLocalIso(this.insStart(), this.dadosForm.controls.ins_time_start.value);
  }

  inscriptionEndIso(): string {
    return this.toLocalIso(this.insWindowEnd(), this.dadosForm.controls.ins_time_end.value);
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

  private daysBetween(fromIso: string, toIso: string): number {
    const a = new Date(`${fromIso}T12:00:00`);
    const b = new Date(`${toIso}T12:00:00`);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  }

  private toLocalIso(date?: string | null, time?: string | null): string {
    if (!date || !time) return '';
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  nameInvalid(): boolean {
    const c = this.dadosForm.controls.name;
    return c.invalid && (c.touched || this.dadosFormSubmitted);
  }

  setorInvalid(): boolean {
    return this.dadosFormSubmitted && this.selectedSectors().size === 0;
  }

  toggleSector(id: number): void {
    const next = new Set(this.selectedSectors());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedSectors.set(next);
  }

  setoresNomes(): string {
    const ids = this.selectedSectors();
    const names = this.sectors()
      .filter((s) => ids.has(s.id))
      .map((s) => s.nome);
    return names.length ? names.join(', ') : '—';
  }

  ngOnDestroy(): void {
    this.revokeCoverPreview();
  }

  async ngOnInit(): Promise<void> {
    const user = await this.auth.getCurrentUser();
    if (user?.requires_company || user?.profile?.requires_company) {
      void this.router.navigate(['/admin/credenciamento-eventos']);
      return;
    }
    this.canCreateCompany.set(hasPermission(user, 'companies', 'create'));
    this.service.listSectors().subscribe({
      next: (res) =>
        this.sectors.set(
          (res.sectors || []).map((s) => ({ id: s.id, nome: s.nome, niveisExigidos: 1 })),
        ),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
  }

  private normSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  availableCompanies(): AccreditationCompanyBrief[] {
    const t = this.normSearch(this.companySearch.trim());
    const sel = this.selected();
    return this.companies().filter((c) => {
      if (sel.has(c.id_company)) return false;
      if (!t) return true;
      return this.normSearch(`${c.fancy_name || ''} ${c.company_name} ${c.cnpj || ''}`).includes(t);
    });
  }

  selectedCompanies(): AccreditationCompanyBrief[] {
    const ids = this.selected();
    return this.companies().filter((c) => ids.has(c.id_company));
  }

  availableCountLabel(): string {
    const total = this.companies().length;
    const left = total - this.selected().size;
    return `${left} de ${total} disponíveis`;
  }

  selectedCountLabel(): string {
    const n = this.selected().size;
    return `${n} selecionada${n === 1 ? '' : 's'}`;
  }

  availableHint(): string {
    const n = this.availableCompanies().length;
    if (this.companySearch.trim()) {
      return `${n} resultado${n === 1 ? '' : 's'}`;
    }
    return `${n} empresa${n === 1 ? '' : 's'} na lista`;
  }

  includeAllLabel(): string {
    const n = this.availableCompanies().length;
    return this.companySearch.trim() ? `Incluir os ${n} resultados` : 'Incluir todas';
  }

  selectedHint(): string {
    const n = this.selected().size;
    if (!n) return 'Nenhuma empresa incluída ainda.';
    return `${n} empresa${n === 1 ? '' : 's'} vai receber o convite.`;
  }

  companiesFootStatus(): string {
    const n = this.selected().size;
    if (!n) return 'Inclua ao menos uma empresa para continuar';
    return `${n} empresa${n === 1 ? '' : 's'} incluída${n === 1 ? '' : 's'}`;
  }

  loadBracelets(): void {
    const kind = this.dadosForm.controls.event_kind.value;
    if (this.loadedBraceletKind === kind && this.catalogBracelets().length) {
      this.pruneSelectedBracelets();
      return;
    }
    this.service.listBraceletTypes({ event_kind: kind }).subscribe({
      next: (res) => {
        this.catalogBracelets.set(res.types || []);
        this.loadedBraceletKind = kind;
        this.pruneSelectedBracelets();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tipos de pulseira.'),
    });
  }

  private pruneSelectedBracelets(): void {
    const valid = new Set(this.filteredCatalog().map((b) => b.id_bracelet_type));
    const next = new Set([...this.selectedBracelets()].filter((id) => valid.has(id)));
    if (next.size !== this.selectedBracelets().size) this.selectedBracelets.set(next);
    const nextInternal = new Set([...this.selectedInternalBracelets()].filter((id) => valid.has(id)));
    if (nextInternal.size !== this.selectedInternalBracelets().size) {
      this.selectedInternalBracelets.set(nextInternal);
    }
  }

  availableBracelets(): BraceletType[] {
    const sel = this.selectedBracelets();
    return this.filteredCatalog().filter((b) => !sel.has(b.id_bracelet_type));
  }

  selectedBraceletItems(): BraceletType[] {
    const sel = this.selectedBracelets();
    return this.filteredCatalog().filter((b) => sel.has(b.id_bracelet_type));
  }

  filteredCatalog(): BraceletType[] {
    const kind = this.dadosForm.controls.event_kind.value;
    return this.catalogBracelets().filter((b) => b.event_kind === 'BOTH' || b.event_kind === kind);
  }

  availableBraceletCountLabel(): string {
    const total = this.filteredCatalog().length;
    const left = this.availableBracelets().length;
    return `${left} de ${total} disponíveis`;
  }

  selectedBraceletCountLabel(): string {
    const n = this.selectedBracelets().size;
    return `${n} selecionada${n === 1 ? '' : 's'}`;
  }

  availableBraceletHint(): string {
    const n = this.availableBracelets().length;
    return `${n} tipo${n === 1 ? '' : 's'} na lista`;
  }

  selectedBraceletHint(): string {
    const n = this.selectedBracelets().size;
    if (!n) return 'Nenhuma pulseira habilitada ainda.';
    return n === 1 ? '1 tipo disponível na indicação.' : `${n} tipos disponíveis na indicação.`;
  }

  braceletsFootStatus(): string {
    const n = this.selectedBracelets().size;
    if (!n) return 'Inclua ao menos um tipo de pulseira para continuar';
    if (this.internalBraceletsMissing()) {
      return 'Inclua ao menos uma pulseira para os colaboradores internos';
    }
    return `${n} tipo${n === 1 ? '' : 's'} de pulseira habilitado${n === 1 ? '' : 's'}`;
  }

  internalBraceletsMissing(): boolean {
    return this.internalEnabled() && this.selectedInternalBracelets().size === 0;
  }

  availableInternalBracelets(): BraceletType[] {
    const sel = this.selectedInternalBracelets();
    return this.filteredCatalog().filter((b) => !sel.has(b.id_bracelet_type));
  }

  selectedInternalBraceletItems(): BraceletType[] {
    const sel = this.selectedInternalBracelets();
    return this.filteredCatalog().filter((b) => sel.has(b.id_bracelet_type));
  }

  availableInternalBraceletCountLabel(): string {
    const total = this.filteredCatalog().length;
    return `${this.availableInternalBracelets().length} de ${total} disponíveis`;
  }

  selectedInternalBraceletCountLabel(): string {
    const n = this.selectedInternalBracelets().size;
    return `${n} selecionada${n === 1 ? '' : 's'}`;
  }

  availableInternalBraceletHint(): string {
    const n = this.availableInternalBracelets().length;
    return `${n} tipo${n === 1 ? '' : 's'} na lista`;
  }

  includeInternalBracelet(id: number): void {
    const next = new Set(this.selectedInternalBracelets());
    next.add(id);
    this.selectedInternalBracelets.set(next);
  }

  removeInternalBracelet(id: number): void {
    const next = new Set(this.selectedInternalBracelets());
    next.delete(id);
    this.selectedInternalBracelets.set(next);
  }

  includeAllInternalBracelets(): void {
    this.selectedInternalBracelets.set(new Set(this.filteredCatalog().map((b) => b.id_bracelet_type)));
  }

  removeAllInternalBracelets(): void {
    this.selectedInternalBracelets.set(new Set());
  }

  includeBracelet(id: number): void {
    const next = new Set(this.selectedBracelets());
    next.add(id);
    this.selectedBracelets.set(next);
  }

  removeBracelet(id: number): void {
    const next = new Set(this.selectedBracelets());
    next.delete(id);
    this.selectedBracelets.set(next);
  }

  includeAllBracelets(): void {
    this.selectedBracelets.set(new Set(this.filteredCatalog().map((b) => b.id_bracelet_type)));
  }

  openBraceletModal(): void {
    this.braceletDraft = {
      name: '',
      event_kind: this.dadosForm.controls.event_kind.value,
      icon: DEFAULT_BRACELET_ICON,
      color: DEFAULT_BRACELET_COLOR,
    };
    this.showBraceletModal.set(true);
  }

  closeBraceletModal(): void {
    this.showBraceletModal.set(false);
  }

  salvarPulseira(): void {
    const name = this.braceletDraft.name.trim();
    if (!name) {
      this.notification.error('Informe o nome da pulseira.');
      return;
    }
    const eventKind = this.dadosForm.controls.event_kind.value;
    const kind: BraceletKind =
      this.braceletDraft.event_kind === 'BOTH' ? 'BOTH' : eventKind;
    this.savingBracelet.set(true);
    this.service
      .createBraceletType({
        name,
        event_kind: kind,
        icon: this.braceletDraft.icon,
        color: this.braceletDraft.color,
      })
      .subscribe({
      next: (res) => {
        const created = res.type;
        const next = [
          ...this.catalogBracelets().filter((b) => b.id_bracelet_type !== created.id_bracelet_type),
          created,
        ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        this.catalogBracelets.set(next);
        this.loadedBraceletKind = eventKind;
        this.includeBracelet(created.id_bracelet_type);
        this.savingBracelet.set(false);
        this.showBraceletModal.set(false);
        this.notification.success('Tipo de pulseira cadastrado e incluído.');
      },
      error: (err) => {
        this.savingBracelet.set(false);
        this.notification.notifyHttpError(err, 'Falha ao cadastrar tipo de pulseira.');
      },
    });
  }

  removeAllBracelets(): void {
    this.selectedBracelets.set(new Set());
  }

  includeCompany(id: number): void {
    const next = new Set(this.selected());
    next.add(id);
    this.selected.set(next);
  }

  removeCompany(id: number): void {
    const next = new Set(this.selected());
    next.delete(id);
    this.selected.set(next);
  }

  includeAllVisible(): void {
    const next = new Set(this.selected());
    for (const c of this.availableCompanies()) next.add(c.id_company);
    this.selected.set(next);
  }

  removeAllCompanies(): void {
    this.selected.set(new Set());
  }

  clearCompanySearch(): void {
    this.companySearch = '';
  }

  openCompanyModal(): void {
    this.companyDraft = { id_company_type: null, cnpj: '', company_name: '', fancy_name: '' };
    this.showCompanyModal.set(true);
    if (!this.companyTypes().length) {
      this.companyService.listTypes().subscribe({
        next: (res) => {
          this.companyTypes.set(res.types || []);
          if (this.companyTypes().length === 1) {
            this.companyDraft.id_company_type = this.companyTypes()[0].id_company_type;
          }
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar tipos de empresa.'),
      });
    }
  }

  closeCompanyModal(): void {
    this.showCompanyModal.set(false);
  }

  salvarEmpresa(): void {
    if (!this.companyDraft.id_company_type) {
      this.notification.error('Selecione o tipo de empresa.');
      return;
    }
    const cnpj = normalizeCnpjInput(this.companyDraft.cnpj);
    if (cnpj.length !== 14) {
      this.notification.error('CNPJ deve conter 14 dígitos.');
      return;
    }
    if (!this.companyDraft.company_name.trim()) {
      this.notification.error('Razão social é obrigatória.');
      return;
    }
    this.savingCompany.set(true);
    this.companyService
      .create({
        id_company_type: this.companyDraft.id_company_type,
        cnpj,
        company_name: this.companyDraft.company_name.trim(),
        fancy_name: this.companyDraft.fancy_name.trim() || null,
      })
      .subscribe({
        next: (res) => {
          const created = res.company;
          const brief: AccreditationCompanyBrief = {
            id_company: created.id_company,
            company_name: created.company_name,
            fancy_name: created.fancy_name || null,
            cnpj: created.cnpj || null,
            status: true,
          };
          this.companies.set([brief, ...this.companies().filter((c) => c.id_company !== brief.id_company)]);
          this.includeCompany(brief.id_company);
          this.savingCompany.set(false);
          this.showCompanyModal.set(false);
          this.notification.success('Empresa cadastrada e incluída no evento.');
        },
        error: (err) => {
          this.savingCompany.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar empresa.');
        },
      });
  }

  setorNome(): string {
    const id = this.dadosForm.controls.id_setor.value;
    return this.sectors().find((s) => s.id === id)?.nome || '—';
  }

  eventWeekday(): string {
    const day = this.firstEventDay();
    if (!day) return '';
    const [y, m, d] = day.split('-').map(Number);
    return WEEKDAYS_PT[new Date(y, m - 1, d).getDay()] || '';
  }

  private compactDayTime(iso: string | null, time: string): string {
    if (!iso) return '—';
    const [, m, d] = iso.split('-');
    return `${d}/${m} ${time}`;
  }

  private shortDayAt(iso: string | null, time: string): string {
    if (!iso) return '—';
    const [, m, d] = iso.split('-');
    return `${d}/${m} às ${time}`;
  }

  inscriptionWindowCompact(): string {
    return `${this.compactDayTime(this.insStart(), this.dadosForm.controls.ins_time_start.value)} → ${this.compactDayTime(this.insWindowEnd(), this.dadosForm.controls.ins_time_end.value)}`;
  }

  inscriptionWindowHint(): string {
    const a = this.insStart();
    const b = this.insWindowEnd();
    const dia = this.firstEventDay();
    if (!a || !b) return '';
    const n = this.daysInRange(a, b).length;
    const days = `${n} ${n === 1 ? 'dia' : 'dias'}`;
    if (!dia) return days;
    const ant = this.daysBetween(b, dia);
    return ant === 0 ? `${days} · fecha no dia do evento` : `${days} · fecha ${ant} dia${ant === 1 ? '' : 's'} antes`;
  }

  inviteCompanyNames(): string {
    return this.selectedCompanies()
      .map((c) => c.fancy_name || c.company_name)
      .join(', ');
  }

  braceletKindEm(b: BraceletType): string {
    if (b.event_kind === 'BOTH') return 'Showday · Jogo';
    if (this.isBraceletFlag(b)) return `só ${kindLabel(b.event_kind)}`;
    return kindLabel(b.event_kind);
  }

  isBraceletFlag(b: BraceletType): boolean {
    const kind = this.dadosForm.controls.event_kind.value;
    return b.event_kind !== 'BOTH' && b.event_kind !== kind;
  }

  incompatibleBracelets(): BraceletType[] {
    return this.selectedBraceletItems().filter((b) => this.isBraceletFlag(b));
  }

  incompatibleNote(): string {
    const bad = this.incompatibleBracelets();
    if (!bad.length) return '';
    const kind = kindLabel(this.dadosForm.controls.event_kind.value);
    const names = bad.map((b) => b.name).join(', ');
    const other = kindLabel(bad[0].event_kind);
    if (bad.length === 1) {
      return `A pulseira ${names} está configurada só para ${other}. Ela não vai aparecer para as empresas neste credenciamento.`;
    }
    return `As pulseiras ${names} não se aplicam a ${kind}. Elas não vão aparecer para as empresas neste credenciamento.`;
  }

  railOpenWhen(): string {
    return this.shortDayAt(this.insStart(), this.dadosForm.controls.ins_time_start.value);
  }

  railCloseWhen(): string {
    return this.shortDayAt(this.insWindowEnd(), this.dadosForm.controls.ins_time_end.value);
  }

  railCloseHint(): string {
    const fim = this.insWindowEnd();
    const dia = this.firstEventDay();
    const setor = this.setoresNomes();
    if (!fim || !dia) return `${setor} validam as indicações`;
    const ant = this.daysBetween(fim, dia);
    if (ant === 0) return `${setor} validam no próprio dia do evento`;
    return `${setor} têm ${ant} dia${ant === 1 ? '' : 's'} para validar`;
  }

  railEventHint(): string {
    const n = this.selectedBracelets().size;
    const day = this.eventWeekday();
    const types = `${n} tipo${n === 1 ? '' : 's'} de pulseira ativo${n === 1 ? '' : 's'}`;
    return day ? `${day} · ${types}` : types;
  }

  onCoverPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.notification.error('A foto deve ter no máximo 2 MB.');
      return;
    }
    const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!okType) {
      this.notification.error('Use JPEG, PNG ou WebP.');
      return;
    }
    this.coverFile = file;
    this.revokeCoverPreview();
    this.coverPreview.set(URL.createObjectURL(file));
  }

  clearCover(): void {
    this.coverFile = null;
    this.revokeCoverPreview();
  }

  private revokeCoverPreview(): void {
    const url = this.coverPreview();
    if (url) URL.revokeObjectURL(url);
    this.coverPreview.set(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  goToStep(step: WizardStep): void {
    if (step === 'pulseiras') this.loadBracelets();
    this.step.set(step);
  }

  goPulseiras(): void {
    this.dadosFormSubmitted = true;
    this.dadosForm.markAllAsTouched();
    if (!this.canContinue()) {
      this.notification.error(this.dateConflict() || 'Preencha os dados obrigatórios do credenciamento.');
      return;
    }
    this.loadBracelets();
    this.step.set('pulseiras');
  }

  onBack(): void {
    const i = this.stepIndex();
    if (i <= 0) {
      this.onClose();
      return;
    }
    const prev = STEP_ORDER[i - 1];
    if (prev === 'pulseiras') this.loadBracelets();
    this.step.set(prev);
  }

  onClose(): void {
    if (this.createdId()) {
      this.goToDetail();
      return;
    }
    void this.router.navigate(['/admin/credenciamento-eventos']);
  }

  private goToDetail(): void {
    const id = this.createdId();
    if (!id) {
      void this.router.navigate(['/admin/credenciamento-eventos']);
      return;
    }
    void this.router.navigate(['/admin/credenciamento-eventos', id]);
  }

  salvar(): void {
    if (
      !this.canContinue() ||
      this.selectedBracelets().size === 0 ||
      this.internalBraceletsMissing()
    ) {
      return;
    }
    const raw = this.dadosForm.getRawValue();
    const days = this.sortedEventDays();
    const setores = [...this.selectedSectors()];
    if (!days.length || !setores.length) return;

    this.saving.set(true);
    this.service
      .create({
        name: raw.name.trim(),
        event_kind: raw.event_kind,
        start: days[0],
        end: days[days.length - 1],
        event_dates: days,
        inscription_start: this.inscriptionStartIso(),
        inscription_end: this.inscriptionEndIso(),
        setores,
        bracelet_types: [...this.selectedBracelets()],
        internal_enabled: this.internalEnabled(),
        photo_required: this.photoRequired(),
        internal_bracelet_types: this.internalEnabled() ? [...this.selectedInternalBracelets()] : [],
      })
      .subscribe({
        next: (res) => {
          const id = res.item.id_event_accreditation;
          this.createdId.set(id);
          this.notification.success('Credenciamento criado.');
          this.afterCreate(id);
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao criar credenciamento.');
        },
      });
  }

  private afterCreate(id: number): void {
    const file = this.coverFile;
    if (!file) {
      this.saving.set(false);
      this.goToDetail();
      return;
    }
    this.service.uploadCover(id, file).subscribe({
      next: () => {
        this.saving.set(false);
        this.goToDetail();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(err, 'Evento criado, mas a foto não foi enviada.');
        this.goToDetail();
      },
    });
  }

  onInviteFilePick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const id = this.createdId();
    if (!file || !id) return;
    if (file.size > 5 * 1024 * 1024) {
      this.notification.error('O anexo deve ter no máximo 5 MB.');
      return;
    }
    this.uploadingFile.set(true);
    this.service.uploadInviteFile(id, file).subscribe({
      next: (res) => {
        this.inviteFiles.set(res.invite.files || []);
        this.uploadingFile.set(false);
      },
      error: (err) => {
        this.uploadingFile.set(false);
        this.notification.notifyHttpError(err, 'Falha ao enviar anexo.');
      },
    });
  }

  removeInviteFile(file: EventAccreditationInviteFile): void {
    const id = this.createdId();
    if (!id) return;
    this.service.deleteInviteFile(id, file.id_event_accreditation_invite_file).subscribe({
      next: (res) => this.inviteFiles.set(res.invite.files || []),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover anexo.'),
    });
  }

  private persistableInviteHtml(): string {
    const preview = this.coverPreview();
    let html = this.inviteHtml || '';
    if (preview && html.includes(preview)) {
      html = html.split(preview).join('cid:event-cover');
    }
    return html;
  }

  finishInvite(mode: EventAccreditationInviteMode): void {
    const id = this.createdId();
    if (!id) return;
    if (mode !== 'skip' && (!this.inviteSubject.trim() || !this.inviteHtml.trim())) {
      this.notification.error('Informe o assunto e o corpo do e-mail.');
      return;
    }
    this.sendingInvite.set(true);
    const persist$ =
      mode === 'skip'
        ? this.service.sendInvite(id, { mode })
        : this.service.saveInvite(id, { subject: this.inviteSubject.trim(), html: this.persistableInviteHtml() }).pipe(
            switchMap(() => this.service.sendInvite(id, { mode })),
          );

    persist$.subscribe({
      next: (res) => {
        this.sendingInvite.set(false);
        if (mode === 'now') {
          this.notification.success(
            res.sent > 0 ? `Convite enviado para ${res.sent} destinatário(s).` : 'Convite enviado.',
          );
        } else if (mode === 'schedule') {
          this.notification.success(
            res.scheduled
              ? 'Convite agendado para o início da inscrição.'
              : 'A data de inscrição já passou — o convite foi enviado agora.',
          );
        } else {
          this.notification.success('Credenciamento concluído sem envio de e-mail.');
        }
        this.goToDetail();
      },
      error: (err) => {
        this.sendingInvite.set(false);
        this.notification.notifyHttpError(err, 'Falha ao concluir o convite.');
      },
    });
  }
}
