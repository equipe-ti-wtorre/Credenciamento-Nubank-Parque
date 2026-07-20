import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ModalComponent } from '../../shared/modal/modal.component';
import { NotificationService } from '../../core/services/notification.service';
import {
  PatrimonialService,
  ServiceAccessCollaborator,
  ServiceAccessItem,
  ServiceAccessVehicle,
} from '../../services/patrimonial.service';
import { CompanyItem } from '../../services/company.service';
import { ApprovalService, EligibleSector } from '../../services/approval.service';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
} from '../../services/collaborator.service';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { ServiceAccessBulkImportWizardComponent } from './service-access-bulk-import-wizard.component';
import { UnifiedCollaboratorRow, UnifiedVehicleRow } from './service-access-bulk-import.types';
import { PeriodoRangePickerComponent, PeriodoRangeValue } from '../../shared/periodo-range-picker';

type WizardStep = 'dados' | 'pessoas' | 'revisar';

type CellErrorField = 'role' | 'document' | 'name' | string;

interface CellError {
  field: CellErrorField;
  message: string;
}

interface DraftCollaborator {
  clientKey: string;
  id_collaborator: number | null;
  collaborator_name: string;
  collaborator_document: string;
  id_collaborator_document_type?: number | null;
  document_type_description?: string | null;
  id_collaborator_role: number | null;
  role_description: string;
  /** Função atual no cadastro (para confirmar alteração). */
  cadastro_role_id?: number | null;
  cadastro_role_description?: string | null;
  /** Confirmação inline: cadastro → nova função. */
  roleChange?: {
    fromId: number | null;
    fromDesc: string;
    toId: number;
    toDesc: string;
  } | null;
  source?: 'manual' | 'planilha';
  sheetLine?: number;
  cellErrors: CellError[];
}

interface DraftVehicle {
  clientKey: string;
  id_vehicle: number | null;
  plate: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  type?: string | null;
  source?: 'manual' | 'planilha';
  sheetLine?: number;
  cellErrors: CellError[];
}

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function daysBetweenInclusive(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const a = new Date(`${inicio}T00:00:00`);
  const b = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

@Component({
  selector: 'app-service-access-create-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ModalComponent,
    ServiceAccessBulkImportWizardComponent,
    PeriodoRangePickerComponent,
  ],
  template: `
    <app-modal
      [open]="open"
      title="Novo acesso de serviço"
      [subtitle]="modalSubtitle"
      size="2xl"
      [closeOnBackdrop]="false"
      [focusFirstField]="false"
      [bodyScroll]="true"
      (close)="onClose()"
    >
      <div class="wcrt" [class.wcrt--pessoas]="step() === 'pessoas'">
        <div class="wcrt-stepper">
          <div
            class="wcrt-stepper__item"
            [class.is-active]="step() === 'dados'"
            [class.is-done]="step() !== 'dados'"
          >
            <span class="wcrt-stepper__dot">
              @if (step() !== 'dados') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              } @else {
                1
              }
            </span>
            <span class="wcrt-stepper__label">Dados do acesso</span>
          </div>
          <span class="wcrt-stepper__line" [class.is-done]="step() !== 'dados'"></span>
          <div
            class="wcrt-stepper__item"
            [class.is-active]="step() === 'pessoas'"
            [class.is-done]="step() === 'revisar'"
          >
            <span class="wcrt-stepper__dot">
              @if (step() === 'revisar') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              } @else {
                2
              }
            </span>
            <span class="wcrt-stepper__label">Colaboradores e veículos</span>
          </div>
          <span class="wcrt-stepper__line" [class.is-done]="step() === 'revisar'"></span>
          <div class="wcrt-stepper__item" [class.is-active]="step() === 'revisar'">
            <span class="wcrt-stepper__dot">3</span>
            <span class="wcrt-stepper__label">Revisar e enviar</span>
          </div>
        </div>

        @if (step() === 'dados') {
          <form id="wcrt-dados-form" class="wcrt-form" [formGroup]="dadosForm" (ngSubmit)="runCreate()">
            <div class="wcrt-dados">
              <div class="wcrt-dados__left">
                <app-periodo-range-picker
                  formControlName="periodo"
                  label="Período do acesso"
                  inputId="wcrt-periodo"
                  [inline]="true"
                  [controlInvalid]="!!dadosForm.get('periodo')?.invalid"
                  [controlTouched]="!!dadosForm.get('periodo')?.touched || dadosFormSubmitted"
                />
              </div>
              <div class="wcrt-dados__right">
                @if (isAdmin) {
                  <div>
                    <label class="form-label" for="wcrt-company">Empresa</label>
                    <select
                      id="wcrt-company"
                      formControlName="id_company"
                      class="form-select"
                      [class.is-invalid]="companyInvalid()"
                    >
                      <option [ngValue]="null">Selecione...</option>
                      @for (c of companies; track c.id_company) {
                        <option [ngValue]="c.id_company">
                          {{ c.fancy_name || c.company_name }}
                        </option>
                      }
                    </select>
                    <p class="text-xs text-slate-500 mt-1">
                      Não encontrou a empresa?
                      <a routerLink="/admin/empresas" class="text-[var(--color-primary-dark)] font-medium hover:underline">
                        Cadastrar empresa
                      </a>
                    </p>
                  </div>
                }
                <div>
                  <label class="form-label" for="wcrt-finalidade">Nome do evento</label>
                  <input
                    #finalidadeInput
                    id="wcrt-finalidade"
                    type="text"
                    formControlName="finalidade"
                    maxlength="500"
                    class="form-field"
                    [class.is-invalid]="finalidadeInvalid()"
                  />
                  <div class="wcrt-error-slot" aria-live="polite">
                    @if (finalidadeInvalid()) {
                      <p class="wcrt-field-error">Informe o nome do evento.</p>
                    }
                  </div>
                </div>
                <div>
                  <label class="form-label" for="wcrt-observacao">Descrição do serviço</label>
                  <textarea
                    #observacaoInput
                    id="wcrt-observacao"
                    formControlName="observacao"
                    rows="4"
                    maxlength="500"
                    class="form-field"
                    [class.is-invalid]="observacaoInvalid()"
                  ></textarea>
                  <div class="wcrt-error-slot" aria-live="polite">
                    @if (observacaoInvalid()) {
                      <p class="wcrt-field-error">Informe a descrição do serviço.</p>
                    }
                  </div>
                </div>
                <div>
                  <label class="form-label" for="wcrt-setor">Setor aprovador</label>
                  <select
                    id="wcrt-setor"
                    formControlName="id_setor"
                    class="form-select"
                    [class.is-invalid]="setorInvalid()"
                  >
                    <option [ngValue]="null" disabled>Selecione o setor</option>
                    @for (s of sectors(); track s.id) {
                      <option [ngValue]="s.id">{{ s.nome }}</option>
                    }
                  </select>
                </div>
                <div class="wcrt-notify">
                  <p class="text-sm font-medium text-slate-800">Notificações de entrada na portaria</p>
                  <p class="text-xs text-slate-500">
                    Avisa solicitante e aprovadores no check-in, conforme o tipo selecionado.
                  </p>
                  <label class="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      class="mt-1"
                      formControlName="notificar_entrada_colaborador"
                    />
                    <span class="text-sm text-slate-800">Entrada de colaborador</span>
                  </label>
                  <label class="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      class="mt-1"
                      formControlName="notificar_entrada_veiculo"
                    />
                    <span class="text-sm text-slate-800">Entrada de veículo</span>
                  </label>
                </div>
              </div>
            </div>
          </form>
        }

        @if (step() === 'pessoas') {
          <div class="wcrt-pessoas">
            <section class="wcrt-import">
              <app-service-access-bulk-import-wizard
                [open]="true"
                [embedded]="true"
                [serviceAccessId]="createdId()"
                [draftSyncToken]="draftSyncToken()"
                [accessName]="finalidade"
                [companyName]="companyName()"
                [notifyApprovers]="false"
                (draftRequired)="prepararImportacao()"
                (completed)="onImportCompleted($event)"
                (issues)="onImportIssues($event)"
                (roleProposals)="onRoleProposals($event)"
              />
            </section>

            @if (pendingCollaboratorCount() > 0) {
              <div class="wcrt-alert wcrt-alert--danger">
                <span class="wcrt-alert__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
                </span>
                <p class="wcrt-alert__text">
                  @if (pendingMissingRoleCount() === pendingCollaboratorCount()) {
                    {{ pendingCollaboratorCount() }}
                    {{ pendingCollaboratorCount() === 1 ? 'colaborador sem função' : 'colaboradores sem função' }}.
                    Selecione a Função / Cargo nas linhas destacadas abaixo — nada precisa ser reimportado.
                  } @else {
                    {{ pendingCollaboratorCount() }}
                    {{ pendingCollaboratorCount() === 1 ? 'colaborador com pendência' : 'colaboradores com pendências' }}.
                    O motivo aparece em cada linha destacada — corrija ou remova para continuar.
                  }
                </p>
                <label class="wcrt-alert__check">
                  <input
                    type="checkbox"
                    [ngModel]="onlyPending()"
                    (ngModelChange)="onlyPending.set($event)"
                    name="onlyPending"
                  />
                  Ver só pendências
                </label>
              </div>
            } @else if (pendingRoleDecisionCount() > 0) {
              <div class="wcrt-alert wcrt-alert--warn">
                <span class="wcrt-alert__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                </span>
                <p class="wcrt-alert__text">
                  {{ pendingRoleDecisionCount() }}
                  {{ pendingRoleDecisionCount() === 1
                    ? 'alteração de função aguardando decisão'
                    : 'alterações de função aguardando decisão' }}.
                  Escolha <strong>Aplicar</strong> ou <strong>Manter</strong> em cada linha antes de continuar.
                </p>
                <label class="wcrt-alert__check wcrt-alert__check--warn">
                  <input
                    type="checkbox"
                    [ngModel]="onlyPending()"
                    (ngModelChange)="onlyPending.set($event)"
                    name="onlyPendingRole"
                  />
                  Ver só pendências
                </label>
              </div>
            } @else if (draftCollaborators().length > 0) {
              <div class="wcrt-alert wcrt-alert--ok">
                <span class="wcrt-alert__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>
                </span>
                <p class="wcrt-alert__text">Tudo certo com os colaboradores.</p>
              </div>
            }

            <section class="wcrt-block wcrt-block--colab">
              <div class="wcrt-block__head">
                <h3 class="wcrt-block__title">
                  Colaboradores
                  <span class="wcrt-block__count">{{ draftCollaborators().length }} no total</span>
                </h3>
                <div class="wcrt-search wcrt-search--pill">
                  <div class="relative flex-1 min-w-[12rem]">
                    <svg class="wcrt-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input
                      type="search"
                      [(ngModel)]="colabQuery"
                      (ngModelChange)="onColabSearchAndFilter($event)"
                      name="colabQuery"
                      placeholder="Nome ou documento..."
                      class="form-field wcrt-search__input"
                      autocomplete="off"
                    />
                    @if (colabSearching()) {
                      <div class="wcrt-dropdown">Buscando...</div>
                    }
                    @if (!colabSearching() && colabResults().length > 0) {
                      <ul class="wcrt-dropdown wcrt-dropdown--list">
                        @for (c of colabResults(); track c.id_collaborator) {
                          <li>
                            <button
                              type="button"
                              class="wcrt-dropdown__btn"
                              [disabled]="c.is_blacklisted"
                              [class.is-disabled]="c.is_blacklisted"
                              (click)="addCollaborator(c)"
                            >
                              <span class="wcrt-dropdown__name">{{ c.name }}</span>
                              <span class="wcrt-dropdown__meta">
                                {{ c.document }}
                                @if (c.is_blacklisted) {
                                  <span class="text-rose-600"> · blacklist</span>
                                }
                              </span>
                            </button>
                          </li>
                        }
                      </ul>
                    }
                    @if (
                      colabQuery.trim().length >= 2 &&
                      !colabSearching() &&
                      colabResults().length === 0
                    ) {
                      <div class="wcrt-dropdown">Nenhum colaborador encontrado no cadastro.</div>
                    }
                  </div>
                </div>
              </div>

              <div class="wcrt-table-scroll">
                <table class="wcrt-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Documento</th>
                      <th>Função / Cargo</th>
                      <th class="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of filteredCollaborators(); track c.clientKey) {
                      <tr
                        [class.wcrt-row-pending]="isRowPending(c)"
                        [class.wcrt-row-decision]="!!c.roleChange"
                      >
                        <td>
                          <span class="wcrt-name-row">
                            <span class="wcrt-name">{{ c.collaborator_name }}</span>
                            @if (c.source === 'planilha') {
                              <span class="wcrt-tag wcrt-tag--sheet">planilha · linha {{ c.sheetLine }}</span>
                            }
                          </span>
                          @if (rowErrorMessage(c); as msg) {
                            <p class="wcrt-row-error">{{ msg }}</p>
                          }
                        </td>
                        <td class="font-mono text-xs">{{ c.collaborator_document || '—' }}</td>
                        <td class="wcrt-td-role">
                          <div class="wcrt-role-field">
                            <select
                              class="form-select form-select--sm"
                              [class.is-invalid]="hasRoleError(c) || !c.id_collaborator_role"
                              [ngModel]="c.roleChange?.toId ?? c.id_collaborator_role"
                              (ngModelChange)="setCollaboratorRole(c.clientKey, $event)"
                              [name]="'role-' + c.clientKey"
                            >
                              <option [ngValue]="null">Selecionar função…</option>
                              @for (r of roles(); track r.id_collaborator_role) {
                                <option [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                              }
                            </select>
                            @if (c.roleChange; as ch) {
                              <div class="wcrt-role-change">
                                <span class="wcrt-role-change__arrow">{{ ch.fromDesc }} → {{ ch.toDesc }}</span>
                                <button type="button" class="wcrt-role-change__yes" (click)="confirmRoleChange(c.clientKey)">
                                  Aplicar
                                </button>
                                <button type="button" class="wcrt-role-change__no" (click)="dismissRoleChange(c.clientKey)">
                                  Manter
                                </button>
                              </div>
                            } @else if (hasRoleError(c) || !c.id_collaborator_role) {
                              <p class="wcrt-field-error wcrt-field-error--role">Função / Cargo obrigatória</p>
                            }
                          </div>
                        </td>
                        <td class="text-right">
                          <button type="button" class="wcrt-link-danger" (click)="removeCollaborator(c.clientKey)">
                            Remover
                          </button>
                        </td>
                      </tr>
                    }
                    @if (filteredCollaborators().length === 0) {
                      <tr>
                        <td colspan="4" class="wcrt-empty">Nenhum colaborador encontrado.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>

            <section class="wcrt-block wcrt-block--veic">
              <div class="wcrt-block__head">
                <h3 class="wcrt-block__title">
                  Veículos
                  <span class="wcrt-block__count">{{ draftVehicles().length }} no total</span>
                </h3>
                <div class="wcrt-search wcrt-search--pill">
                  <div class="relative flex-1 min-w-[12rem]">
                    <svg class="wcrt-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input
                      type="search"
                      [(ngModel)]="veicQuery"
                      (ngModelChange)="onVeicSearch($event)"
                      name="veicQuery"
                      placeholder="Placa, marca ou modelo..."
                      class="form-field wcrt-search__input"
                      autocomplete="off"
                    />
                    @if (veicSearching()) {
                      <div class="wcrt-dropdown">Buscando...</div>
                    }
                    @if (!veicSearching() && veicResults().length > 0) {
                      <ul class="wcrt-dropdown wcrt-dropdown--list">
                        @for (v of veicResults(); track v.id_vehicle) {
                          <li>
                            <button type="button" class="wcrt-dropdown__btn" (click)="addVehicle(v)">
                              <span class="wcrt-dropdown__name font-mono">{{ v.plate }}</span>
                              <span class="wcrt-dropdown__meta">
                                {{ v.brand || '—' }} {{ v.model || '' }}
                              </span>
                            </button>
                          </li>
                        }
                      </ul>
                    }
                    @if (
                      veicQuery.trim().length >= 2 &&
                      !veicSearching() &&
                      veicResults().length === 0
                    ) {
                      <div class="wcrt-dropdown">Nenhum veículo encontrado.</div>
                    }
                  </div>
                </div>
              </div>
              <div class="wcrt-table-scroll wcrt-table-scroll--sm">
                <table class="wcrt-table">
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Marca</th>
                      <th>Modelo</th>
                      <th class="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (v of draftVehicles(); track v.clientKey) {
                      <tr [class.wcrt-row-pending]="v.cellErrors.length > 0">
                        <td class="font-mono font-medium">
                          {{ v.plate || '—' }}
                          @if (v.source === 'planilha' && v.sheetLine) {
                            <span class="wcrt-tag wcrt-tag--sheet">planilha · linha {{ v.sheetLine }}</span>
                          }
                          @if (v.cellErrors.length > 0) {
                            <p class="wcrt-field-error">{{ v.cellErrors[0].message }}</p>
                          }
                        </td>
                        <td>{{ v.brand || '—' }}</td>
                        <td>{{ v.model || '—' }}</td>
                        <td class="text-right">
                          <button type="button" class="wcrt-link-danger" (click)="removeVehicle(v.clientKey)">
                            Remover
                          </button>
                        </td>
                      </tr>
                    }
                    @if (draftVehicles().length === 0) {
                      <tr>
                        <td colspan="4" class="wcrt-empty">Nenhum veículo incluído.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        }

        @if (step() === 'revisar') {
          <div class="wcrt-review">
            <section class="wcrt-review__card">
              <div class="wcrt-review__head">
                <h3 class="wcrt-review__title">Dados do acesso</h3>
                <button type="button" class="wcrt-edit-btn" aria-label="Editar dados do acesso" (click)="goToStep('dados')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
              </div>
              <dl class="wcrt-dl wcrt-dl--grid">
                <div>
                  <dt>Empresa</dt>
                  <dd>{{ companyName() || '—' }}</dd>
                </div>
                <div>
                  <dt>Nome do evento</dt>
                  <dd>{{ finalidade || '—' }}</dd>
                </div>
                <div>
                  <dt>Descrição do serviço</dt>
                  <dd>{{ observacao || '—' }}</dd>
                </div>
                <div>
                  <dt>Período</dt>
                  <dd>
                    {{ formatDateBr(startDate) }} — {{ formatDateBr(endDate) }}
                    <span class="wcrt-dl__days">· {{ periodDays() }} {{ periodDays() === 1 ? 'dia' : 'dias' }}</span>
                  </dd>
                </div>
                <div>
                  <dt>Setor</dt>
                  <dd>{{ setorNome() }}</dd>
                </div>
              </dl>
              <div class="wcrt-tags">
                @if (notificarEntradaColaborador) {
                  <span class="wcrt-tag wcrt-tag--ok">Notifica entrada de colaborador</span>
                }
                @if (notificarEntradaVeiculo) {
                  <span class="wcrt-tag wcrt-tag--ok">Notifica entrada de veículo</span>
                }
              </div>
            </section>

            <div class="wcrt-review__grid">
              <section class="wcrt-review__card">
                <div class="wcrt-review__head">
                  <h3 class="wcrt-review__title">
                    Colaboradores
                    <span class="wcrt-badge">{{ draftCollaborators().length }}</span>
                  </h3>
                  <button type="button" class="wcrt-edit-btn" aria-label="Editar colaboradores" (click)="goToStep('pessoas')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                </div>
                @if (draftCollaborators().length === 0) {
                  <p class="wcrt-hint">Nenhum colaborador — a solicitação será enviada sem vínculos.</p>
                } @else {
                  <ul class="wcrt-list">
                    @for (c of draftCollaborators(); track c.clientKey) {
                      <li class="wcrt-list__item">
                        <span class="wcrt-avatar">{{ initials(c.collaborator_name) }}</span>
                        <span class="wcrt-list__info">
                          <span class="font-medium">{{ c.collaborator_name }}</span>
                          <span class="wcrt-list__meta">{{ c.collaborator_document }} · {{ c.role_description }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                }
              </section>
              <section class="wcrt-review__card">
                <div class="wcrt-review__head">
                  <h3 class="wcrt-review__title">
                    Veículos
                    <span class="wcrt-badge">{{ draftVehicles().length }}</span>
                  </h3>
                  <button type="button" class="wcrt-edit-btn" aria-label="Editar veículos" (click)="goToStep('pessoas')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                </div>
                @if (draftVehicles().length === 0) {
                  <p class="wcrt-hint">Nenhum veículo — a solicitação será enviada sem vínculos.</p>
                } @else {
                  <ul class="wcrt-list">
                    @for (v of draftVehicles(); track v.clientKey) {
                      <li class="wcrt-list__item">
                        <span class="wcrt-vehicle-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 1 0 0 .01M19 17a2 2 0 1 0 0 .01M3 17V9l2-5h14l2 5v8"/></svg>
                        </span>
                        <span class="wcrt-list__info">
                          <span class="wcrt-plate">{{ v.plate }}</span>
                          <span class="wcrt-list__meta">{{ v.brand || '—' }} {{ v.model || '' }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>

            <p class="wcrt-banner wcrt-banner--info">
              Ao enviar, o setor {{ setorNome() }} será notificado.
            </p>
          </div>
        }
      </div>

      <div modal-footer class="modal-footer wcrt-foot">
        <button type="button" class="btn-action-secondary" [disabled]="busy()" (click)="onBack()">
          {{ step() === 'dados' ? 'Cancelar' : 'Voltar' }}
        </button>
        <div class="wcrt-foot__right">
          @if (step() === 'dados') {
            <button
              type="button"
              class="btn-action-primary"
              [disabled]="busy()"
              (click)="runCreate()"
            >
              Continuar
            </button>
          }
          @if (step() === 'pessoas') {
            <div class="wcrt-foot__pessoas">
              @if (pendingCollaboratorCount() > 0) {
                <span class="wcrt-foot__hint">
                  {{ pendingCollaboratorCount() }}
                  {{ pendingCollaboratorCount() === 1 ? 'pendência' : 'pendências' }} para corrigir
                </span>
              } @else if (pendingRoleDecisionCount() > 0) {
                <span class="wcrt-foot__hint wcrt-foot__hint--warn">
                  {{ pendingRoleDecisionCount() }}
                  {{ pendingRoleDecisionCount() === 1 ? 'decisão' : 'decisões' }} de função pendente{{ pendingRoleDecisionCount() === 1 ? '' : 's' }}
                </span>
              }
              <button
                type="button"
                class="btn-action-primary"
                [disabled]="busy() || !canContinuePessoas()"
                (click)="goReview()"
              >
                Continuar
              </button>
            </div>
          }
          @if (step() === 'revisar') {
            <button type="button" class="btn-action-primary wcrt-submit-btn" [disabled]="busy()" (click)="runSubmit()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
              {{ busy() ? 'Enviando…' : 'Enviar para aprovação' }}
            </button>
          }
        </div>
      </div>
    </app-modal>
  `,
  styles: [
    `
      :host {
        --wtorre: #1d54e6;
        --wtorre-hover: #1846c4;
        --ink: #14182b;
        --ink-2: #5a6178;
        --ink-3: #8b91a7;
        --line: #e6e8f0;
        --ok: #16a34a;
        --danger: #e11d48;
        --danger-soft-bg: #fff1f2;
        --danger-border: #fecdd3;
        --form-field-height: 2.5rem;
        font-family: var(--font-body, 'Plus Jakarta Sans', system-ui, sans-serif);
      }
      .wcrt {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .wcrt--pessoas {
        flex: 1;
        min-height: 0;
      }
      .wcrt--pessoas .wcrt-stepper {
        flex: none;
        position: sticky;
        top: 0;
        z-index: 2;
        background: #fff;
      }
      .wcrt-stepper {
        display: flex;
        align-items: center;
        padding: 4px 0 14px;
      }
      .wcrt-stepper__item {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .wcrt-stepper__dot {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        flex: none;
        font-family: var(--font-display, Sora, system-ui, sans-serif);
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
        background: var(--wtorre);
        color: #fff;
      }
      .wcrt-stepper__item.is-active .wcrt-stepper__label,
      .wcrt-stepper__item.is-done .wcrt-stepper__label {
        color: var(--ink);
      }
      .wcrt-stepper__item.is-done .wcrt-stepper__dot {
        background: var(--ok);
        color: #fff;
      }
      .wcrt-stepper__line {
        flex: 1;
        height: 2px;
        background: #eef0f4;
        margin: 0 12px;
        border-radius: 2px;
      }
      .wcrt-stepper__line.is-done {
        background: var(--ok);
      }
      .wcrt-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .wcrt-dados {
        display: grid;
        grid-template-columns: minmax(280px, 320px) 1fr;
        gap: 1.5rem;
        align-items: start;
      }
      .wcrt-dados__left,
      .wcrt-dados__right {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .wcrt-field-error {
        margin: 0;
        font-size: 0.75rem;
        color: var(--danger);
        line-height: 1.25;
      }
      .wcrt-error-slot {
        min-height: 1.125rem;
        margin-top: 4px;
      }
      .wcrt-td-role {
        vertical-align: top;
        min-width: 200px;
      }
      .wcrt-role-field {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        min-width: 0;
      }
      .wcrt-role-field .form-select {
        width: 100%;
      }
      .wcrt-field-error--role {
        margin: 0;
        line-height: 1.2;
      }
      .wcrt-role-change {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        margin-top: 6px;
        padding: 6px 8px;
        border-radius: 8px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        font-size: 0.75rem;
        line-height: 1.3;
      }
      .wcrt-role-change__arrow {
        font-weight: 700;
        color: #1e3a8a;
      }
      .wcrt-role-change__yes,
      .wcrt-role-change__no {
        border: 0;
        background: transparent;
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0;
      }
      .wcrt-role-change__yes { color: var(--wtorre); }
      .wcrt-role-change__no { color: #64748b; }
      .wcrt-block--colab {
        flex: none;
        min-height: 0;
        overflow: visible;
      }
      .wcrt-table-scroll {
        flex: none;
        min-height: 120px;
        max-height: min(360px, 42vh);
        overflow-x: auto;
        overflow-y: auto;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .form-field.is-invalid,
      .form-select.is-invalid {
        border-color: var(--danger) !important;
      }
      .wcrt-notify {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .wcrt-pessoas {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        min-height: 0;
      }
      .wcrt-import {
        flex: none;
        padding: 0;
        border: 0;
        background: transparent;
        border-radius: 0;
      }
      .wcrt-import > app-service-access-bulk-import-wizard {
        display: block;
        width: 100%;
      }
      .wcrt-import__prep-hint {
        font-size: 0.75rem;
        color: var(--ink-2);
      }
      .wcrt-alert {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid transparent;
      }
      .wcrt-alert--danger {
        background: var(--danger-soft-bg);
        border-color: var(--danger-border);
        color: #9f1239;
      }
      .wcrt-alert--warn {
        background: #fffbeb;
        border-color: #fde68a;
        color: #92400e;
      }
      .wcrt-alert--ok {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #047857;
      }
      .wcrt-alert__icon {
        flex: none;
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
      }
      .wcrt-alert__icon svg {
        width: 20px;
        height: 20px;
      }
      .wcrt-alert__text {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1.4;
      }
      .wcrt-alert__check {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #9f1239;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      .wcrt-alert__check--warn {
        color: #92400e;
      }
      .wcrt-alert__check input {
        width: 15px;
        height: 15px;
        accent-color: #e11d48;
      }
      .wcrt-alert__check--warn input {
        accent-color: #d97706;
      }
      .wcrt-block {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        background: #fff;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .wcrt-block--veic {
        flex: none;
        overflow: hidden;
      }
      .wcrt-block__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
        flex: none;
      }
      .wcrt-block__title {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--ink);
        margin: 0;
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
      }
      .wcrt-block__count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ink-3);
      }
      .wcrt-search {
        display: flex;
        flex: 1;
        min-width: 0;
        max-width: 18rem;
        margin-left: auto;
        position: relative;
      }
      .wcrt-search--pill .wcrt-search__input {
        padding-left: 2.35rem;
        border-radius: 999px;
        height: 2.375rem;
      }
      .wcrt-search__icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        color: var(--ink-3);
        pointer-events: none;
        z-index: 1;
      }
      .wcrt-table-scroll--sm {
        flex: none;
        max-height: min(200px, 30vh);
        min-height: 88px;
      }
      .wcrt-table-scroll .wcrt-table {
        margin: 0;
        border: 0;
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
      }
      .wcrt-table-scroll thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #f8fafc;
        box-shadow: 0 1px 0 var(--line);
      }
      .wcrt-name-row {
        display: inline-flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 6px;
        max-width: 100%;
      }
      .wcrt-name {
        font-weight: 700;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      td .wcrt-tag {
        white-space: nowrap;
        flex: none;
      }
      .wcrt-foot__hint {
        color: #be123c;
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .wcrt-dropdown {
        position: absolute;
        left: 0;
        right: 0;
        margin-top: 4px;
        z-index: 30;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        padding: 8px 12px;
        font-size: 0.875rem;
        color: var(--ink-2);
      }
      .wcrt-dropdown--list {
        max-height: 14rem;
        overflow-y: auto;
        padding: 0;
        list-style: none;
        margin: 0;
      }
      .wcrt-dropdown__btn {
        width: 100%;
        text-align: left;
        padding: 8px 12px;
        border: 0;
        border-bottom: 1px solid #f1f5f9;
        background: transparent;
        cursor: pointer;
      }
      .wcrt-dropdown__btn:hover {
        background: #f8fafc;
      }
      .wcrt-dropdown__btn.is-disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .wcrt-dropdown__name {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ink);
      }
      .wcrt-dropdown__meta {
        display: block;
        font-size: 0.75rem;
        color: var(--ink-2);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .wcrt-banner {
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 0.825rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
      }
      .wcrt-banner--danger {
        background: var(--danger-soft-bg);
        border: 1px solid var(--danger-border);
        color: #9f1239;
      }
      .wcrt-banner--ok {
        background: #ecfdf5;
        border: 1px solid #bbf7d0;
        color: #15803d;
      }
      .wcrt-banner--info {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        font-weight: 500;
        margin: 0;
      }
      .wcrt-table-tools {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 0.75rem;
      }
      .wcrt-table-tools__search {
        flex: 1;
        min-width: 0;
      }
      .wcrt-pill {
        flex: none;
        border: 1px solid var(--line);
        background: #fff;
        border-radius: 999px;
        padding: 0 14px;
        height: var(--form-field-height);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ink-2);
        cursor: pointer;
        white-space: nowrap;
      }
      .wcrt-pill.is-active {
        background: var(--wtorre);
        border-color: var(--wtorre);
        color: #fff;
      }
      .wcrt-table {
        width: 100%;
        font-size: 0.875rem;
      }
      .wcrt-table th {
        text-align: left;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ink-3);
        border-bottom: 1px solid var(--line);
        padding: 6px 4px;
      }
      .wcrt-table td {
        padding: 8px 4px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
      }
      .wcrt-row-pending {
        background: var(--danger-soft-bg);
        box-shadow: inset 3px 0 0 var(--danger);
      }
      .wcrt-row-decision,
      .wcrt-row-pending.wcrt-row-decision {
        background: #fffbeb;
        box-shadow: inset 3px 0 0 #f59e0b;
      }
      .wcrt-row-error {
        margin: 2px 0 0;
        font-size: 0.72rem;
        line-height: 1.35;
        color: var(--danger);
      }
      .wcrt-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }
      .wcrt-tag--sheet {
        background: #eef2ff;
        color: #4338ca;
      }
      .wcrt-tag--ok {
        background: #ecfdf5;
        color: #15803d;
        text-transform: none;
        letter-spacing: normal;
        font-size: 0.75rem;
      }
      .wcrt-empty {
        text-align: center;
        color: var(--ink-3);
        padding: 1rem 4px !important;
      }
      .wcrt-link-danger {
        font-size: 0.75rem;
        color: #e11d48;
        background: none;
        border: 0;
        cursor: pointer;
        padding: 0;
      }
      .wcrt-link-danger:hover {
        text-decoration: underline;
      }
      .form-select--sm {
        padding: 4px 8px;
        font-size: 0.8rem;
        min-height: 32px;
      }
      .wcrt-review {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .wcrt-review__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }
      .wcrt-review__card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        background: #fafbfd;
      }
      .wcrt-review__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .wcrt-review__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--ink);
        margin: 0;
      }
      .wcrt-edit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex: none;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: #fff;
        color: var(--ink-2);
        cursor: pointer;
      }
      .wcrt-edit-btn:hover {
        background: #eef0f4;
        color: var(--wtorre);
      }
      .wcrt-edit-btn svg {
        width: 14px;
        height: 14px;
      }
      .wcrt-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.4rem;
        height: 1.4rem;
        padding: 0 6px;
        border-radius: 999px;
        background: #eaf0fe;
        color: var(--wtorre);
        font-size: 0.75rem;
        font-weight: 700;
      }
      .wcrt-dl {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      .wcrt-dl--grid {
        grid-template-columns: 1fr 1fr;
      }
      .wcrt-dl dt {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ink-3);
        margin: 0 0 2px;
      }
      .wcrt-dl dd {
        margin: 0;
        font-size: 0.9rem;
        color: var(--ink);
        font-weight: 500;
      }
      .wcrt-dl__days {
        color: var(--wtorre);
        font-weight: 700;
      }
      .wcrt-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .wcrt-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .wcrt-list__item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .wcrt-list__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.875rem;
        min-width: 0;
      }
      .wcrt-list__meta {
        font-size: 0.75rem;
        color: var(--ink-2);
      }
      .wcrt-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex: none;
        border-radius: 50%;
        background: var(--wtorre);
        color: #fff;
        font-weight: 700;
        font-size: 0.75rem;
        font-family: var(--font-display, Sora, system-ui, sans-serif);
      }
      .wcrt-vehicle-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex: none;
        border-radius: 50%;
        background: #eef0f4;
        color: var(--ink-2);
      }
      .wcrt-vehicle-icon svg {
        width: 18px;
        height: 18px;
      }
      .wcrt-plate {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--ink);
      }
      .wcrt-hint {
        margin: 0;
        font-size: 0.8rem;
        color: var(--ink-2);
      }
      .wcrt-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        flex-wrap: wrap;
      }
      .wcrt-foot__right {
        margin-left: auto;
      }
      .wcrt-foot__pessoas {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: flex-end;
      }
      .wcrt-foot__hint {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--danger);
      }
      .wcrt-foot__hint--warn {
        color: #b45309;
      }
      .wcrt-submit-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .wcrt-submit-btn svg {
        width: 16px;
        height: 16px;
      }
      @media (max-width: 900px) {
        .wcrt--pessoas {
          overflow: visible;
          height: auto;
          max-height: none;
        }
        .wcrt-pessoas {
          overflow: visible;
          flex: none;
        }
        .wcrt-block--colab,
        .wcrt-block--veic {
          flex: none;
          min-height: 0;
          overflow: visible;
        }
        .wcrt-table-scroll,
        .wcrt-table-scroll--sm {
          flex: none;
          min-height: 0;
          max-height: 280px;
        }
      }
      @media (max-width: 720px) {
        .wcrt-dados {
          grid-template-columns: 1fr;
        }
        .wcrt-stepper {
          gap: 0;
          padding-bottom: 10px;
        }
        .wcrt-stepper__label {
          font-size: 11px;
          white-space: normal;
          line-height: 1.2;
          max-width: 5.5rem;
        }
        .wcrt-stepper__line {
          margin: 0 6px;
          min-width: 12px;
        }
        .wcrt-block__head {
          flex-direction: column;
          align-items: stretch;
        }
        .wcrt-search {
          max-width: none;
          width: 100%;
          margin-left: 0;
        }
        .wcrt-alert {
          align-items: flex-start;
        }
        .wcrt-alert__check {
          width: 100%;
          margin-left: 34px;
        }
        .wcrt-foot {
          flex-direction: column;
          align-items: stretch;
        }
        .wcrt-foot > .btn-action-secondary,
        .wcrt-foot > button {
          width: 100%;
          justify-content: center;
        }
        .wcrt-foot__right,
        .wcrt-foot__pessoas {
          margin-left: 0;
          width: 100%;
          flex-direction: column;
          align-items: stretch;
        }
        .wcrt-foot__hint {
          text-align: center;
        }
        .wcrt-foot__pessoas .btn-action-primary,
        .wcrt-submit-btn {
          width: 100%;
          justify-content: center;
        }
        .wcrt-table {
          min-width: 520px;
        }
        .wcrt-td-role {
          min-width: 160px;
        }
      }
      @media (max-width: 640px) {
        .wcrt-stepper__label {
          display: none;
        }
        .wcrt-review__grid,
        .wcrt-dl--grid {
          grid-template-columns: 1fr;
        }
        .wcrt-search {
          max-width: none;
          width: 100%;
          margin-left: 0;
        }
        .wcrt-alert__check {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class ServiceAccessCreateWizardComponent implements OnChanges {
  @Input({ required: true }) open = false;
  @Input() isAdmin = false;
  @Input() companies: CompanyItem[] = [];
  @Output() closed = new EventEmitter<{ createdId: number | null }>();
  @Output() completed = new EventEmitter<{ service: ServiceAccessItem }>();

  @ViewChild('finalidadeInput') finalidadeInput?: ElementRef<HTMLInputElement>;
  @ViewChild('observacaoInput') observacaoInput?: ElementRef<HTMLTextAreaElement>;

  step = signal<WizardStep>('dados');
  createdId = signal<number | null>(null);
  /** Incrementado após ensureDraft para o embed de import sincronizar datas antes do preview. */
  draftSyncToken = signal(0);
  busy = signal(false);
  sectors = signal<EligibleSector[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  draftCollaborators = signal<DraftCollaborator[]>([]);
  draftVehicles = signal<DraftVehicle[]>([]);

  onlyPending = signal(false);
  filterQuery = signal('');

  /** true somente após Enviar para aprovação com sucesso */
  private submitted = false;
  /** linhas com problema importadas via planilha, aguardando resolução no servidor */
  private pendingFromSheet = signal<DraftCollaborator[]>([]);

  dadosFormSubmitted = false;

  dadosForm = new FormGroup({
    periodo: new FormControl<PeriodoRangeValue | null>(null, { validators: [Validators.required] }),
    finalidade: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    observacao: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
    id_setor: new FormControl<number | null>(null, { validators: [Validators.required] }),
    id_company: new FormControl<number | null>(null),
    notificar_entrada_colaborador: new FormControl(true, { nonNullable: true }),
    notificar_entrada_veiculo: new FormControl(true, { nonNullable: true }),
  });

  colabQuery = '';
  veicQuery = '';
  colabSearching = signal(false);
  veicSearching = signal(false);
  colabResults = signal<CollaboratorItem[]>([]);
  veicResults = signal<VehicleItem[]>([]);

  private colabTimer: ReturnType<typeof setTimeout> | null = null;
  private veicTimer: ReturnType<typeof setTimeout> | null = null;
  private companyLabel = '';
  private clientKeySeq = 0;

  formatDateBr = formatDateBr;

  filteredCollaborators = computed(() => {
    const q = this.filterQuery().trim().toLowerCase();
    const list = this.draftCollaborators();
    // Filtro "só pendências" é ignorado quando não resta nenhuma —
    // senão a lista fica vazia sem como desmarcar (o banner some junto).
    const hasPending = list.some((c) => this.isPending(c) || !!c.roleChange);
    const onlyPend = this.onlyPending() && hasPending;
    return list.filter((c) => {
      if (onlyPend && !this.isPending(c) && !c.roleChange) return false;
      if (!q) return true;
      return (
        c.collaborator_name.toLowerCase().includes(q) ||
        c.collaborator_document.toLowerCase().includes(q)
      );
    });
  });

  pendingCollaboratorCount = computed(
    () => this.draftCollaborators().filter((c) => this.isPending(c)).length,
  );

  /** Pendências causadas apenas por falta de função (para a mensagem do alerta). */
  pendingMissingRoleCount = computed(
    () =>
      this.draftCollaborators().filter((c) => {
        if (!this.isPending(c)) return false;
        const roleId = Number(c.id_collaborator_role);
        return !(Number.isFinite(roleId) && roleId > 0);
      }).length,
  );

  pendingRoleDecisionCount = computed(
    () => this.draftCollaborators().filter((c) => !!c.roleChange).length,
  );

  canContinuePessoas = computed(
    () => this.pendingCollaboratorCount() === 0 && this.pendingRoleDecisionCount() === 0,
  );

  constructor(
    private patrimonialService: PatrimonialService,
    private approvalService: ApprovalService,
    private collaboratorService: CollaboratorService,
    private vehicleService: VehicleService,
    private notification: NotificationService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.reset();
      this.loadSectors();
      this.loadRoles();
      this.loadDocumentTypes();
      return;
    }
    if (changes['isAdmin']) {
      this.applyCompanyValidator();
    }
  }

  get modalSubtitle(): string {
    if (this.step() === 'dados') {
      return 'Informe período, nome do evento, descrição do serviço e setor aprovador.';
    }
    if (this.step() === 'pessoas') {
      return 'Inclua manualmente ou importe por planilha XLSX. Corrija as pendências direto na tabela.';
    }
    return 'Confira os dados e envie para aprovação.';
  }

  get finalidade(): string {
    return this.dadosForm.getRawValue().finalidade;
  }

  get observacao(): string {
    return this.dadosForm.getRawValue().observacao;
  }

  get idSetor(): number | null {
    return this.dadosForm.getRawValue().id_setor;
  }

  get idCompany(): number | null {
    return this.dadosForm.getRawValue().id_company;
  }

  get periodo(): PeriodoRangeValue | null {
    return this.dadosForm.getRawValue().periodo;
  }

  get startDate(): string {
    return this.periodo?.inicio || '';
  }

  get endDate(): string {
    return this.periodo?.fim || '';
  }

  get notificarEntradaColaborador(): boolean {
    return this.dadosForm.getRawValue().notificar_entrada_colaborador;
  }

  get notificarEntradaVeiculo(): boolean {
    return this.dadosForm.getRawValue().notificar_entrada_veiculo;
  }

  companyName(): string {
    return this.companyLabel;
  }

  setorNome(): string {
    return this.sectors().find((s) => s.id === this.idSetor)?.nome || '—';
  }

  periodDays(): number {
    return daysBetweenInclusive(this.startDate, this.endDate);
  }

  initials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  finalidadeInvalid(): boolean {
    const ctrl = this.dadosForm.get('finalidade');
    return !!ctrl?.invalid && (ctrl.touched || this.dadosFormSubmitted);
  }

  observacaoInvalid(): boolean {
    const ctrl = this.dadosForm.get('observacao');
    return !!ctrl?.invalid && (ctrl.touched || this.dadosFormSubmitted);
  }

  setorInvalid(): boolean {
    const ctrl = this.dadosForm.get('id_setor');
    return !!ctrl?.invalid && (ctrl.touched || this.dadosFormSubmitted);
  }

  companyInvalid(): boolean {
    const ctrl = this.dadosForm.get('id_company');
    return !!ctrl?.invalid && (ctrl.touched || this.dadosFormSubmitted);
  }

  hasRoleError(c: DraftCollaborator): boolean {
    const roleId = Number(c.id_collaborator_role);
    if (Number.isFinite(roleId) && roleId > 0) return false;
    return c.cellErrors.some((e) => this.isRoleCellError(e));
  }

  /** Exposto ao template (pending visual da linha). */
  isRowPending(c: DraftCollaborator): boolean {
    // Decisão de função = amarelo, não vermelho
    if (c.roleChange) return false;
    return this.isPending(c);
  }

  /** Motivo (não relacionado a função) que mantém a linha pendente. */
  rowErrorMessage(c: DraftCollaborator): string | null {
    if (c.roleChange) return null;
    const err = c.cellErrors.find((e) => !this.isRoleCellError(e));
    return err?.message || null;
  }

  private isRoleCellError(e: CellError): boolean {
    return e.field === 'role' || /fun[cç][aã]o/i.test(e.message);
  }

  private isPending(c: DraftCollaborator): boolean {
    const roleId = Number(c.id_collaborator_role);
    const hasRole = Number.isFinite(roleId) && roleId > 0;
    if (!hasRole) return true;
    // Com função válida, erros só de cargo não mantêm a linha pendente
    return c.cellErrors.some((e) => !this.isRoleCellError(e));
  }

  /** Cria/atualiza rascunho sob demanda (upload/modelo) — sem aprovação/notificação. */
  prepararImportacao() {
    this.dadosForm.markAllAsTouched();
    if (this.dadosForm.invalid) {
      this.notification.error('Preencha os dados do acesso (período, nome e setor) antes de importar.');
      return;
    }
    // Sempre sincroniza datas/dados: ao voltar no wizard o período pode ter mudado.
    this.ensureDraft(() => {
      this.draftSyncToken.update((n) => n + 1);
    });
  }

  /** Continuar do passo 1: valida formulário e overlap; sincroniza rascunho se já existir. */
  runCreate() {
    this.dadosFormSubmitted = true;
    this.dadosForm.markAllAsTouched();
    if (this.dadosForm.invalid) {
      if (!this.finalidade.trim()) {
        this.finalidadeInput?.nativeElement.focus();
      } else if (!this.observacao.trim()) {
        this.observacaoInput?.nativeElement.focus();
      }
      return;
    }
    const setorNome = this.sectors().find((s) => s.id === this.idSetor)?.nome?.trim();
    if (!setorNome) {
      this.notification.error('Setor aprovador inválido.');
      return;
    }

    this.revalidateCollaboratorsOverlap(() => {
      const advance = () => {
        this.clearOverlapCellErrors();
        this.step.set('pessoas');
      };
      // Com rascunho (ex.: após import), grava o novo período no servidor antes de avançar.
      if (this.createdId()) {
        this.ensureDraft(advance);
      } else {
        advance();
      }
    });
  }

  onImportCompleted(event?: {
    roleProposals?: {
      documento: string;
      id_collaborator: number | null;
      from: string;
      fromRoleId: number | null;
      to: string;
      toRoleId: number | null;
    }[];
  }) {
    if (event?.roleProposals != null) {
      this.pendingRoleProposals = event.roleProposals;
    }
    this.reloadDraftsFromServer(() => {
      const pending = this.pendingFromSheet().filter((c) => this.isPending(c));
      if (pending.length === 0) {
        this.pendingFromSheet.set([]);
      } else {
        const norm = (s: string) => String(s || '').replace(/\D/g, '');
        this.draftCollaborators.update((list) => {
          const merged = [...list];
          for (const row of pending) {
            const alreadyResolved = merged.some(
              (c) =>
                (row.id_collaborator != null && c.id_collaborator === row.id_collaborator) ||
                (!!row.collaborator_document &&
                  !!c.collaborator_document &&
                  (c.collaborator_document === row.collaborator_document ||
                    norm(c.collaborator_document) === norm(row.collaborator_document)) &&
                  !this.isPending(c)),
            );
            if (!alreadyResolved) merged.push(row);
          }
          return merged;
        });
        this.pendingFromSheet.set(pending);
      }
      this.applyPendingRoleProposals();
      this.resolveMissingCollaboratorIds(() => this.dedupeCollaboratorsById());
    });
  }

  onImportIssues(payload: { colaboradores: UnifiedCollaboratorRow[]; veiculos: UnifiedVehicleRow[] }) {
    const rows = (payload.colaboradores || []).map((row) => this.mapSheetRowToDraftCollaborator(row));
    this.pendingFromSheet.set(rows);
    this.mergeSheetRowsIntoCollaborators(rows);

    const veicRows = (payload.veiculos || [])
      .filter((row) => row.cadastro === 'erro')
      .map((row) => this.mapSheetRowToDraftVehicle(row));
    if (veicRows.length) {
      this.mergeSheetRowsIntoVehicles(veicRows);
    }
  }

  onClose() {
    if (this.busy()) return;
    this.discardDraftAndClose();
  }

  onBack() {
    if (this.busy()) return;
    if (this.step() === 'pessoas') {
      this.clearPeopleAndForceNewImport(() => this.step.set('dados'));
      return;
    }
    if (this.step() === 'revisar') {
      this.step.set('pessoas');
      return;
    }
    this.onClose();
  }

  goToStep(step: WizardStep) {
    if (step === 'dados' && this.step() !== 'dados') {
      this.clearPeopleAndForceNewImport(() => this.step.set('dados'));
      return;
    }
    this.step.set(step);
  }

  /**
   * Ao voltar para Dados: limpa listas locais, descarta o rascunho no servidor
   * e força novo import com o período atualizado.
   */
  private clearPeopleAndForceNewImport(then: () => void) {
    this.draftCollaborators.set([]);
    this.draftVehicles.set([]);
    this.pendingFromSheet.set([]);
    this.pendingRoleProposals = [];
    this.onlyPending.set(false);
    this.filterQuery.set('');
    this.colabQuery = '';
    this.veicQuery = '';
    this.colabResults.set([]);
    this.veicResults.set([]);

    const id = this.createdId();
    if (!id) {
      this.notification.info('Colaboradores e veículos foram limpos. Importe a planilha novamente após ajustar o período.');
      then();
      return;
    }

    this.busy.set(true);
    this.patrimonialService.deleteDraft(id).subscribe({
      next: () => {
        this.createdId.set(null);
        this.draftSyncToken.set(0);
        this.busy.set(false);
        this.notification.info('Colaboradores e veículos foram limpos. Importe a planilha novamente após ajustar o período.');
        then();
      },
      error: () => {
        // Mesmo se o delete falhar, zera o id local para forçar novo rascunho no import.
        this.createdId.set(null);
        this.draftSyncToken.set(0);
        this.busy.set(false);
        this.notification.info('Colaboradores e veículos foram limpos. Importe a planilha novamente após ajustar o período.');
        then();
      },
    });
  }

  goReview() {
    if (!this.canContinuePessoas()) {
      if (this.pendingRoleDecisionCount() > 0) {
        this.notification.error(
          'Confirme as alterações de função (Aplicar ou Manter) antes de continuar.',
        );
      } else if (this.pendingCollaboratorCount() > 0) {
        this.notification.error('Corrija as pendências dos colaboradores antes de continuar.');
      }
      return;
    }
    this.busy.set(true);
    this.resolveMissingCollaboratorIds(() => {
      this.busy.set(false);
      this.dedupeCollaboratorsById();
      const unresolved = this.draftCollaborators().filter((c) => c.id_collaborator == null);
      if (unresolved.length > 0) {
        this.notification.error(
          `Não foi possível cadastrar ${unresolved.length === 1 ? '1 colaborador' : unresolved.length + ' colaboradores'} (documento/função inválidos). Corrija ou remova as linhas.`,
        );
        return;
      }
      this.revalidateCollaboratorsOverlap(() => this.step.set('revisar'));
    });
  }

  runSubmit() {
    if (this.pendingCollaboratorCount() > 0) {
      this.notification.error('Corrija as pendências dos colaboradores antes de enviar.');
      return;
    }
    if (this.pendingRoleDecisionCount() > 0) {
      this.notification.error(
        'Confirme as alterações de função (Aplicar ou Manter) antes de enviar.',
      );
      this.step.set('pessoas');
      return;
    }

    const submitAfterValidate = () => {
      this.ensureDraft((id) => {
        this.busy.set(true);
        const collaborators = this.draftCollaborators()
          .filter((c) => c.id_collaborator != null && c.id_collaborator_role != null)
          .map((c) => ({
            id_collaborator: c.id_collaborator as number,
            id_collaborator_role: c.id_collaborator_role as number,
          }));
        const vehicles = this.draftVehicles()
          .filter((v) => v.id_vehicle != null && v.cellErrors.length === 0)
          .map((v) => ({ id_vehicle: v.id_vehicle as number }));
        this.patrimonialService
          .syncRelations(id, {
            collaborators,
            vehicles,
            notify_approvers: true,
            ...(this.idSetor ? { id_setor: this.idSetor } : {}),
          })
          .subscribe({
            next: (res) => {
              this.busy.set(false);
              this.submitted = true;
              this.notification.success('Acesso enviado para aprovação.');
              this.completed.emit({ service: res.service });
              this.reset();
            },
            error: (err) => {
              this.busy.set(false);
              this.notification.notifyHttpError(err, 'Falha ao enviar para aprovação.');
            },
          });
      });
    };

    // Revalida overlap com as datas atuais do formulário (ex.: voltou e alterou o período).
    this.revalidateCollaboratorsOverlap(submitAfterValidate, { onConflictGoToDados: true });
  }

  /**
   * Revalida conflito de período com as datas do formulário.
   * Se a lista local estiver vazia mas houver rascunho (createdId), busca IDs no servidor.
   */
  private revalidateCollaboratorsOverlap(
    onOk: () => void,
    opts?: { onConflictGoToDados?: boolean },
  ) {
    const localIds = this.draftCollaborators()
      .map((c) => Number(c.id_collaborator))
      .filter((id) => Number.isFinite(id) && id > 0);

    const runValidate = (collabIds: number[]) => {
      if (collabIds.length === 0) {
        onOk();
        return;
      }
      this.busy.set(true);
      this.patrimonialService
        .validateCollaboratorsOverlap({
          start_date: this.startDate,
          end_date: this.endDate,
          id_collaborators: collabIds,
          exclude_service_access_id: this.createdId(),
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            onOk();
          },
          error: (err) => {
            this.busy.set(false);
            this.notification.notifyHttpError(err, 'Conflito de datas nos colaboradores.');
            if (opts?.onConflictGoToDados) {
              this.step.set('dados');
            }
          },
        });
    };

    if (localIds.length > 0) {
      runValidate([...new Set(localIds)]);
      return;
    }

    const draftId = this.createdId();
    if (!draftId) {
      onOk();
      return;
    }

    this.busy.set(true);
    this.patrimonialService.getById(draftId).subscribe({
      next: (res) => {
        this.busy.set(false);
        const serverIds = (res.service.collaborators || [])
          .map((c) => Number(c.id_collaborator))
          .filter((id) => Number.isFinite(id) && id > 0);
        runValidate([...new Set(serverIds)]);
      },
      error: (err) => {
        this.busy.set(false);
        this.notification.notifyHttpError(err, 'Falha ao validar colaboradores do rascunho.');
        if (opts?.onConflictGoToDados) {
          this.step.set('dados');
        }
      },
    });
  }

  private isOverlapCellError(e: CellError): boolean {
    const m = String(e.message || '').toLowerCase();
    return (
      m.includes('sobrepost') ||
      m.includes('conflito de data') ||
      m.includes('data sobreposta') ||
      m.includes('outro acesso de serviço')
    );
  }

  /** Remove erros de overlap locais após o período ser revalidado com sucesso. */
  private clearOverlapCellErrors() {
    const strip = (list: DraftCollaborator[]) =>
      list.map((c) => ({
        ...c,
        cellErrors: c.cellErrors.filter((e) => !this.isOverlapCellError(e)),
      }));
    this.draftCollaborators.update(strip);
    this.pendingFromSheet.update(strip);
  }

  private buildDadosPayload() {
    const setorNome = this.sectors().find((s) => s.id === this.idSetor)?.nome?.trim() || '';
    return {
      start_date: this.startDate,
      end_date: this.endDate,
      finalidade: this.finalidade.trim(),
      requesting_department: setorNome,
      observacao: this.observacao.trim(),
      id_setor: this.idSetor!,
      notificar_entrada_colaborador: this.notificarEntradaColaborador,
      notificar_entrada_veiculo: this.notificarEntradaVeiculo,
    };
  }

  /**
   * Cria rascunho ou atualiza o existente com os dados do passo 1.
   * Ao voltar e alterar datas, o update revalida conflito de colaboradores no servidor.
   */
  private ensureDraft(then: (id: number) => void) {
    if (this.dadosForm.invalid) return;

    const payload = this.buildDadosPayload();
    const existing = this.createdId();

    if (existing) {
      this.busy.set(true);
      this.patrimonialService.update(existing, payload).subscribe({
        next: () => {
          this.busy.set(false);
          then(existing);
        },
        error: (err) => {
          this.busy.set(false);
          this.notification.notifyHttpError(err, 'Falha ao atualizar o acesso.');
        },
      });
      return;
    }

    this.busy.set(true);
    this.patrimonialService
      .create({
        ...payload,
        notify_approvers: false,
        ...(this.isAdmin && this.idCompany ? { id_company: this.idCompany } : {}),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.createdId.set(res.service.id_service_access);
          this.companyLabel = res.service.company_fancy_name || this.resolveCompanyLabel();
          then(res.service.id_service_access);
        },
        error: (err) => {
          this.busy.set(false);
          this.notification.notifyHttpError(err, 'Falha ao preparar o acesso.');
        },
      });
  }

  private discardDraftAndClose() {
    const id = this.createdId();
    if (!id || this.submitted) {
      this.reset();
      this.closed.emit({ createdId: null });
      return;
    }
    this.busy.set(true);
    this.patrimonialService.deleteDraft(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.closed.emit({ createdId: null });
      },
      error: () => {
        this.busy.set(false);
        this.reset();
        this.closed.emit({ createdId: null });
      },
    });
  }

  onColabSearchAndFilter(term: string) {
    this.filterQuery.set(term);
    this.onColabSearch(term);
  }

  onColabSearch(term: string) {
    if (this.colabTimer) clearTimeout(this.colabTimer);
    const q = term.trim();
    if (q.length < 2) {
      this.colabResults.set([]);
      this.colabSearching.set(false);
      return;
    }
    this.colabTimer = setTimeout(() => this.buscarColaboradores(q), 300);
  }

  onVeicSearch(term: string) {
    if (this.veicTimer) clearTimeout(this.veicTimer);
    const q = term.trim();
    if (q.length < 2) {
      this.veicResults.set([]);
      this.veicSearching.set(false);
      return;
    }
    this.veicTimer = setTimeout(() => this.buscarVeiculos(q), 300);
  }

  addCollaborator(item: CollaboratorItem) {
    if (item.is_blacklisted) {
      this.notification.error('Colaborador está na blacklist.');
      return;
    }
    if (this.draftCollaborators().some((c) => c.id_collaborator === item.id_collaborator)) {
      this.notification.error('Colaborador já está na lista.');
      return;
    }
    const roleId = item.id_collaborator_role || this.roles()[0]?.id_collaborator_role || null;
    if (!roleId) {
      this.notification.error('Nenhuma função cadastrada para vincular.');
      return;
    }
    const role =
      this.roles().find((r) => r.id_collaborator_role === roleId)?.description ||
      item.role?.description ||
      '—';
    this.draftCollaborators.update((list) => [
      ...list,
      {
        clientKey: this.nextClientKey('c'),
        id_collaborator: item.id_collaborator,
        collaborator_name: item.name,
        collaborator_document: item.document,
        id_collaborator_role: roleId,
        role_description: role,
        cadastro_role_id: item.id_collaborator_role || roleId,
        cadastro_role_description: role,
        source: 'manual',
        cellErrors: [],
      },
    ]);
    this.colabQuery = '';
    this.filterQuery.set('');
    this.colabResults.set([]);
  }

  setCollaboratorRole(clientKey: string, roleId: number | string | null) {
    const idRole = Number(roleId);
    if (!Number.isFinite(idRole) || idRole <= 0) return;
    const desc =
      this.roles().find((r) => r.id_collaborator_role === idRole)?.description || '—';

    const current = this.draftCollaborators().find((c) => c.clientKey === clientKey);
    if (!current) return;

    const fromId = current.cadastro_role_id ?? current.id_collaborator_role;
    const fromDesc =
      current.cadastro_role_description ||
      current.role_description ||
      this.roles().find((r) => r.id_collaborator_role === fromId)?.description ||
      '—';

    // Troca em relação ao cadastro → confirmação inline (sem alert)
    if (fromId != null && Number(fromId) > 0 && Number(fromId) !== idRole) {
      this.draftCollaborators.update((list) =>
        list.map((c) =>
          c.clientKey === clientKey
            ? {
                ...c,
                roleChange: {
                  fromId: Number(fromId),
                  fromDesc,
                  toId: idRole,
                  toDesc: desc,
                },
              }
            : c,
        ),
      );
      return;
    }

    this.applyCollaboratorRole(clientKey, idRole, desc);
  }

  confirmRoleChange(clientKey: string) {
    const row = this.draftCollaborators().find((c) => c.clientKey === clientKey);
    if (!row?.roleChange) return;
    this.clearRoleProposalFor(row);
    this.applyCollaboratorRole(clientKey, row.roleChange.toId, row.roleChange.toDesc);
  }

  dismissRoleChange(clientKey: string) {
    const row = this.draftCollaborators().find((c) => c.clientKey === clientKey);
    if (row) this.clearRoleProposalFor(row);
    this.draftCollaborators.update((list) =>
      list.map((c) => (c.clientKey === clientKey ? { ...c, roleChange: null } : c)),
    );
    const after = this.draftCollaborators().find((c) => c.clientKey === clientKey);
    if (after && after.id_collaborator == null && after.collaborator_document) {
      this.resolveCollaboratorId(clientKey, after.collaborator_document);
    }
  }

  private applyCollaboratorRole(clientKey: string, idRole: number, desc: string) {
    this.draftCollaborators.update((list) =>
      list.map((c) => {
        if (c.clientKey !== clientKey) return c;
        return {
          ...c,
          id_collaborator_role: idRole,
          role_description: desc,
          roleChange: null,
          cellErrors: c.cellErrors.filter((e) => !this.isRoleCellError(e)),
        };
      }),
    );

    this.pendingFromSheet.update((list) =>
      list.map((c) =>
        c.clientKey === clientKey
          ? {
              ...c,
              id_collaborator_role: idRole,
              role_description: desc,
              roleChange: null,
              cellErrors: c.cellErrors.filter((e) => !this.isRoleCellError(e)),
            }
          : c,
      ),
    );

    const row = this.draftCollaborators().find((c) => c.clientKey === clientKey);
    if (row && row.id_collaborator == null && row.collaborator_document) {
      this.resolveCollaboratorId(clientKey, row.collaborator_document);
    }
  }

  onRoleProposals(
    proposals: {
      documento: string;
      id_collaborator: number | null;
      from: string;
      fromRoleId: number | null;
      to: string;
      toRoleId: number | null;
    }[],
  ) {
    this.pendingRoleProposals = proposals || [];
    if (this.draftCollaborators().length) {
      this.applyPendingRoleProposals();
    }
  }

  private pendingRoleProposals: {
    documento: string;
    id_collaborator: number | null;
    from: string;
    fromRoleId: number | null;
    to: string;
    toRoleId: number | null;
  }[] = [];

  private resolveRoleIdByDescription(label: string | null | undefined): number | null {
    const wanted = String(label || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
    if (!wanted || wanted === '—') return null;
    const hit = this.roles().find((r) => {
      const d = String(r.description || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .trim()
        .toLowerCase();
      return d === wanted;
    });
    return hit?.id_collaborator_role ?? null;
  }

  private asRoleId(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private applyPendingRoleProposals() {
    const proposals = this.pendingRoleProposals;
    if (!proposals.length) return;

    const norm = (s: string) => String(s || '').replace(/\D/g, '');

    this.draftCollaborators.update((list) =>
      list.map((c) => {
        const hit = proposals.find(
          (p) =>
            (p.id_collaborator != null &&
              c.id_collaborator != null &&
              Number(p.id_collaborator) === Number(c.id_collaborator)) ||
            (!!p.documento &&
              !!c.collaborator_document &&
              (p.documento === c.collaborator_document ||
                norm(p.documento) === norm(c.collaborator_document))),
        );
        if (!hit) return c;

        const fromRoleId =
          this.asRoleId(hit.fromRoleId) ??
          this.resolveRoleIdByDescription(hit.from) ??
          this.asRoleId(c.cadastro_role_id) ??
          this.asRoleId(c.id_collaborator_role);
        const toRoleId =
          this.asRoleId(hit.toRoleId) ?? this.resolveRoleIdByDescription(hit.to);
        if (fromRoleId == null || toRoleId == null) return c;
        if (fromRoleId === toRoleId) return c;
        if (c.roleChange?.toId === toRoleId && c.roleChange?.fromId === fromRoleId) return c;

        const fromDesc =
          (hit.from && hit.from !== '—' ? hit.from : null) ||
          c.cadastro_role_description ||
          this.roles().find((r) => r.id_collaborator_role === fromRoleId)?.description ||
          '—';
        const toDesc =
          (hit.to && hit.to !== '—' ? hit.to : null) ||
          this.roles().find((r) => r.id_collaborator_role === toRoleId)?.description ||
          '—';

        return {
          ...c,
          id_collaborator: c.id_collaborator ?? this.asRoleId(hit.id_collaborator),
          // Mantém cadastro no vínculo até o usuário decidir (amarelo)
          id_collaborator_role: fromRoleId,
          role_description: fromDesc,
          cadastro_role_id: fromRoleId,
          cadastro_role_description: fromDesc,
          roleChange: {
            fromId: fromRoleId,
            fromDesc,
            toId: toRoleId,
            toDesc,
          },
          cellErrors: c.cellErrors.filter((e) => !this.isRoleCellError(e)),
        };
      }),
    );
  }

  /** Remove linhas duplicadas do mesmo cadastro (planilha + reload do servidor). */
  private dedupeCollaboratorsById() {
    this.draftCollaborators.update((list) => {
      const seen = new Set<number>();
      const ranked = [...list].sort((a, b) => {
        const score = (c: DraftCollaborator) =>
          (c.id_collaborator != null ? 4 : 0) +
          (c.source !== 'planilha' ? 2 : 0) +
          (c.roleChange ? 1 : 0) +
          (c.cellErrors.length === 0 ? 1 : 0);
        return score(b) - score(a);
      });
      const out: DraftCollaborator[] = [];
      for (const c of ranked) {
        if (c.id_collaborator != null) {
          if (seen.has(c.id_collaborator)) continue;
          seen.add(c.id_collaborator);
        }
        out.push(c);
      }
      return out;
    });
  }

  /** Busca no cadastro pelo documento; se não existir, cria o colaborador. */
  private resolveMissingCollaboratorIds(done?: () => void) {
    const missing = this.draftCollaborators().filter(
      (c) => c.id_collaborator == null && !!c.collaborator_document?.trim(),
    );
    if (!missing.length) {
      done?.();
      return;
    }

    let pending = missing.length;
    const finishOne = () => {
      pending -= 1;
      if (pending <= 0) done?.();
    };

    const bindFound = (row: DraftCollaborator, found: CollaboratorItem) => {
      this.draftCollaborators.update((list) =>
        list.map((c) =>
          c.clientKey === row.clientKey && c.id_collaborator == null
            ? {
                ...c,
                id_collaborator: found.id_collaborator,
                collaborator_name: c.collaborator_name || found.name,
                collaborator_document: found.document || c.collaborator_document,
                id_collaborator_document_type:
                  c.id_collaborator_document_type ?? found.id_collaborator_document_type,
                cadastro_role_id: c.cadastro_role_id ?? found.id_collaborator_role ?? null,
                cadastro_role_description:
                  c.cadastro_role_description ||
                  found.role?.description ||
                  this.roles().find((r) => r.id_collaborator_role === found.id_collaborator_role)
                    ?.description ||
                  null,
                cellErrors: c.cellErrors.filter(
                  (e) => e.field !== 'document' && e.field !== 'name' && !this.isRoleCellError(e),
                ),
              }
            : c,
        ),
      );
    };

    for (const row of missing) {
      const q = String(row.collaborator_document || '').trim();
      const roleId = this.asRoleId(row.id_collaborator_role);
      const name = String(row.collaborator_name || '').trim();
      const docTypeId = this.resolveDocumentTypeId(row);

      this.collaboratorService.list(1, 10, { q, status: true }).subscribe({
        next: (res) => {
          const norm = (s: string) => String(s || '').replace(/\D/g, '');
          const target = norm(q) || q.toLowerCase();
          const found = (res.collaborators || []).find((c) => {
            const doc = norm(c.document) || String(c.document || '').toLowerCase();
            return doc === target || String(c.document) === q;
          });
          if (found && !found.is_blacklisted) {
            bindFound(row, found);
            finishOne();
            return;
          }

          // Não existe no cadastro → cria
          if (!roleId || !name || !docTypeId) {
            finishOne();
            return;
          }
          this.collaboratorService
            .create({
              id_collaborator_document_type: docTypeId,
              id_collaborator_role: roleId,
              document: q,
              name,
              status: true,
            })
            .subscribe({
              next: (created) => {
                bindFound(row, created.collaborator);
                finishOne();
              },
              error: (err) => {
                // Já existe (corrida / documento duplicado) → busca de novo
                const dup =
                  err?.status === 409 ||
                  err?.code === 'ER_DUP_ENTRY' ||
                  /já cadastrad/i.test(String(err?.error?.message || err?.message || ''));
                if (dup) {
                  this.collaboratorService.list(1, 10, { q, status: true }).subscribe({
                    next: (again) => {
                      const norm2 = (s: string) => String(s || '').replace(/\D/g, '');
                      const target2 = norm2(q) || q.toLowerCase();
                      const found2 = (again.collaborators || []).find((c) => {
                        const doc =
                          norm2(c.document) || String(c.document || '').toLowerCase();
                        return doc === target2 || String(c.document) === q;
                      });
                      if (found2 && !found2.is_blacklisted) bindFound(row, found2);
                      finishOne();
                    },
                    error: () => finishOne(),
                  });
                  return;
                }
                const msg =
                  (typeof err?.error === 'object' && err?.error?.message) ||
                  err?.message ||
                  'Falha ao cadastrar colaborador.';
                this.draftCollaborators.update((list) =>
                  list.map((c) =>
                    c.clientKey === row.clientKey
                      ? {
                          ...c,
                          cellErrors: [
                            ...c.cellErrors.filter((e) => e.field !== 'document'),
                            { field: 'document', message: String(msg) },
                          ],
                        }
                      : c,
                  ),
                );
                finishOne();
              },
            });
        },
        error: () => {
          // Sem listagem: tenta criar direto se tiver dados
          if (!roleId || !name || !docTypeId) {
            finishOne();
            return;
          }
          this.collaboratorService
            .create({
              id_collaborator_document_type: docTypeId,
              id_collaborator_role: roleId,
              document: q,
              name,
              status: true,
            })
            .subscribe({
              next: (created) => {
                bindFound(row, created.collaborator);
                finishOne();
              },
              error: () => finishOne(),
            });
        },
      });
    }
  }

  private resolveDocumentTypeId(row: DraftCollaborator): number | null {
    if (row.id_collaborator_document_type != null) {
      return this.asRoleId(row.id_collaborator_document_type);
    }
    const wanted = String(row.document_type_description || 'CPF')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
    const types = this.documentTypes();
    const hit = types.find((t) => {
      const d = String(t.description || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .trim()
        .toLowerCase();
      return d === wanted;
    });
    if (hit) return hit.id_collaborator_document_type;
    const cpf = types.find((t) => /cpf/i.test(t.description || ''));
    return cpf?.id_collaborator_document_type ?? types[0]?.id_collaborator_document_type ?? null;
  }

  private clearRoleProposalFor(c: DraftCollaborator) {
    const norm = (s: string) => String(s || '').replace(/\D/g, '');
    this.pendingRoleProposals = this.pendingRoleProposals.filter((p) => {
      if (
        p.id_collaborator != null &&
        c.id_collaborator != null &&
        Number(p.id_collaborator) === Number(c.id_collaborator)
      ) {
        return false;
      }
      if (
        p.documento &&
        c.collaborator_document &&
        (p.documento === c.collaborator_document ||
          norm(p.documento) === norm(c.collaborator_document))
      ) {
        return false;
      }
      return true;
    });
  }

  /** Tenta vincular o id do cadastro pelo documento após corrigir a função. */
  private resolveCollaboratorId(clientKey: string, document: string) {
    const q = String(document || '').trim();
    if (q.length < 3) return;
    this.collaboratorService.list(1, 10, { q, status: true }).subscribe({
      next: (res) => {
        const norm = (s: string) => String(s || '').replace(/\D/g, '');
        const target = norm(q) || q.toLowerCase();
        const found = (res.collaborators || []).find((c) => {
          const doc = norm(c.document) || String(c.document || '').toLowerCase();
          return doc === target || String(c.document) === q;
        });
        if (!found || found.is_blacklisted) return;
        const masterRoleId = found.id_collaborator_role || null;
        const masterDesc =
          found.role?.description ||
          this.roles().find((r) => r.id_collaborator_role === masterRoleId)?.description ||
          null;
        this.draftCollaborators.update((list) =>
          list.map((c) => {
            if (c.clientKey !== clientKey || c.id_collaborator != null) return c;
            const currentRole = this.asRoleId(c.id_collaborator_role);
            const needsDecision =
              masterRoleId != null &&
              currentRole != null &&
              Number(masterRoleId) !== Number(currentRole) &&
              !c.roleChange;
            return {
              ...c,
              id_collaborator: found.id_collaborator,
              collaborator_name: c.collaborator_name || found.name,
              collaborator_document: found.document || c.collaborator_document,
              cadastro_role_id: masterRoleId || c.cadastro_role_id || null,
              cadastro_role_description: masterDesc || c.cadastro_role_description || null,
              roleChange: needsDecision
                ? {
                    fromId: Number(masterRoleId),
                    fromDesc: masterDesc || '—',
                    toId: currentRole,
                    toDesc:
                      c.role_description ||
                      this.roles().find((r) => r.id_collaborator_role === currentRole)
                        ?.description ||
                      '—',
                  }
                : c.roleChange || null,
              cellErrors: c.cellErrors.filter(
                (e) => e.field !== 'document' && e.field !== 'general' && !this.isRoleCellError(e),
              ),
            };
          }),
        );
      },
      error: () => {
        /* silencioso — usuário ainda pode adicionar via busca */
      },
    });
  }

  removeCollaborator(clientKey: string) {
    this.draftCollaborators.update((list) => list.filter((c) => c.clientKey !== clientKey));
  }

  addVehicle(item: VehicleItem) {
    if (item.is_blacklisted) {
      this.notification.error('Veículo está na blacklist.');
      return;
    }
    if (this.draftVehicles().some((v) => v.id_vehicle === item.id_vehicle)) {
      this.notification.error('Veículo já está na lista.');
      return;
    }
    this.draftVehicles.update((list) => [
      ...list,
      {
        clientKey: this.nextClientKey('v'),
        id_vehicle: item.id_vehicle,
        plate: item.plate,
        brand: item.brand,
        model: item.model,
        color: item.color,
        type: item.type,
        source: 'manual',
        cellErrors: [],
      },
    ]);
    this.veicQuery = '';
    this.veicResults.set([]);
  }

  removeVehicle(clientKey: string) {
    this.draftVehicles.update((list) => list.filter((v) => v.clientKey !== clientKey));
  }

  private mapErrosToCellErrors(erros: string[] | undefined): CellError[] {
    return (erros || []).map((message) => {
      let field: CellErrorField = 'general';
      if (/fun[cç][aã]o/i.test(message)) field = 'role';
      else if (/documento/i.test(message)) field = 'document';
      else if (/nome/i.test(message)) field = 'name';
      return { field, message };
    });
  }

  private mapSheetRowToDraftCollaborator(row: UnifiedCollaboratorRow): DraftCollaborator {
    const asId = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const resolvedId = row.resolvido ? asId(row.resolvido['id_collaborator']) : null;
    const resolvedRole = row.resolvido ? asId(row.resolvido['id_collaborator_role']) : null;
    const atualRole = row.resolvido ? asId(row.resolvido['id_collaborator_role_atual']) : null;
    const resolvedDocType = row.resolvido
      ? asId(row.resolvido['id_collaborator_document_type'])
      : null;
    const roleDiff = (row.divergencias_vinculo || []).find((d) => d.campo === 'id_collaborator_role');
    const toRoleId = resolvedRole;
    const fromRoleId =
      atualRole ??
      (roleDiff ? this.resolveRoleIdByDescription(String(roleDiff.atual ?? '')) : null);
    const toDesc =
      (toRoleId &&
        this.roles().find((r) => r.id_collaborator_role === toRoleId)?.description) ||
      (roleDiff?.novo != null ? String(roleDiff.novo) : null) ||
      '—';
    const fromDesc =
      (fromRoleId &&
        this.roles().find((r) => r.id_collaborator_role === fromRoleId)?.description) ||
      (roleDiff?.atual != null ? String(roleDiff.atual) : null) ||
      '—';

    const hasRoleDecision =
      fromRoleId != null && toRoleId != null && fromRoleId !== toRoleId;

    return {
      clientKey: `sheet-c-${row.linha}`,
      id_collaborator: resolvedId,
      collaborator_name: row.nome || row.chave?.documento || `Linha ${row.linha}`,
      collaborator_document: row.chave?.documento || '',
      id_collaborator_document_type: resolvedDocType,
      document_type_description: row.chave?.tipo || null,
      id_collaborator_role: hasRoleDecision ? fromRoleId : toRoleId,
      role_description: hasRoleDecision ? fromDesc : toDesc,
      cadastro_role_id: fromRoleId ?? null,
      cadastro_role_description: fromDesc !== '—' ? fromDesc : null,
      roleChange: hasRoleDecision
        ? {
            fromId: fromRoleId!,
            fromDesc,
            toId: toRoleId!,
            toDesc,
          }
        : null,
      source: 'planilha',
      sheetLine: row.linha,
      cellErrors: this.mapErrosToCellErrors(row.erros),
    };
  }

  private mapSheetRowToDraftVehicle(row: UnifiedVehicleRow): DraftVehicle {
    return {
      clientKey: `sheet-v-${row.linha}`,
      id_vehicle: null,
      plate: row.chave?.placa || '',
      brand: null,
      model: null,
      source: 'planilha',
      sheetLine: row.linha,
      cellErrors: (row.erros || []).map((message) => ({ field: 'general', message })),
    };
  }

  private mergeSheetRowsIntoVehicles(rows: DraftVehicle[]) {
    this.draftVehicles.update((list) => {
      const next = [...list];
      for (const row of rows) {
        const idx = next.findIndex(
          (v) =>
            (row.sheetLine != null && v.sheetLine === row.sheetLine) ||
            (!!row.plate && v.plate === row.plate),
        );
        if (idx >= 0) {
          if (next[idx].id_vehicle != null && next[idx].cellErrors.length === 0) continue;
          next[idx] = { ...next[idx], ...row, clientKey: next[idx].clientKey };
        } else {
          next.push(row);
        }
      }
      return next;
    });
  }

  private mergeSheetRowsIntoCollaborators(rows: DraftCollaborator[]) {
    this.draftCollaborators.update((list) => {
      const next = [...list];
      for (const row of rows) {
        if (row.id_collaborator != null) {
          const alreadyImported = next.some(
            (c) => c.id_collaborator === row.id_collaborator && c.cellErrors.length === 0,
          );
          if (alreadyImported) continue;
        }
        const idx = next.findIndex(
          (c) =>
            (row.sheetLine != null && c.sheetLine === row.sheetLine) ||
            (!!row.collaborator_document && c.collaborator_document === row.collaborator_document),
        );
        if (idx >= 0) {
          const existing = next[idx];
          const existingRole = Number(existing.id_collaborator_role);
          // Não sobrescreve correção manual já feita pelo usuário
          if (Number.isFinite(existingRole) && existingRole > 0 && !this.isPending(existing)) {
            continue;
          }
          next[idx] = { ...existing, ...row, clientKey: existing.clientKey };
        } else {
          next.push(row);
        }
      }
      return next;
    });
  }

  private nextClientKey(prefix: string): string {
    this.clientKeySeq += 1;
    return `${prefix}-${Date.now()}-${this.clientKeySeq}`;
  }

  private buscarColaboradores(term: string) {
    this.colabSearching.set(true);
    this.collaboratorService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.colabSearching.set(false);
        this.colabResults.set(res.collaborators);
      },
      error: (err) => {
        this.colabSearching.set(false);
        this.colabResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar colaboradores.');
      },
    });
  }

  private buscarVeiculos(term: string) {
    this.veicSearching.set(true);
    this.vehicleService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.veicSearching.set(false);
        this.veicResults.set(res.vehicles.filter((v) => !v.is_blacklisted));
      },
      error: (err) => {
        this.veicSearching.set(false);
        this.veicResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar veículos.');
      },
    });
  }

  private loadSectors() {
    this.approvalService.listEligibleSectors('ACESSO_SERVICO').subscribe({
      next: (res) => this.sectors.set(res.sectors),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
  }

  private loadRoles() {
    this.collaboratorService.listRoles().subscribe({
      next: (res) => {
        this.roles.set(res.roles);
        if (this.pendingRoleProposals.length) {
          this.applyPendingRoleProposals();
        }
      },
      error: () => this.roles.set([]),
    });
  }

  private loadDocumentTypes() {
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types || []),
      error: () => this.documentTypes.set([]),
    });
  }

  private resolveCompanyLabel(): string {
    if (!this.idCompany) return '';
    const c = this.companies.find((x) => x.id_company === this.idCompany);
    return c?.fancy_name || c?.company_name || '';
  }

  private mapServerCollaborator(c: ServiceAccessCollaborator): DraftCollaborator {
    const masterRoleId = c.master_id_collaborator_role ?? c.id_collaborator_role;
    const masterRoleDesc =
      c.master_role_description ||
      c.role_description ||
      this.roles().find((r) => r.id_collaborator_role === masterRoleId)?.description ||
      '—';
    return {
      clientKey: `srv-c-${c.id_collaborator}`,
      id_collaborator: c.id_collaborator,
      collaborator_name: c.collaborator_name,
      collaborator_document: c.collaborator_document,
      id_collaborator_role: c.id_collaborator_role,
      role_description: c.role_description || '—',
      cadastro_role_id: masterRoleId,
      cadastro_role_description: masterRoleDesc,
      source: 'manual',
      cellErrors: [],
    };
  }

  private mapServerVehicle(v: ServiceAccessVehicle): DraftVehicle {
    return {
      clientKey: `srv-v-${v.id_vehicle}`,
      id_vehicle: v.id_vehicle,
      plate: v.plate,
      brand: v.brand,
      model: v.model,
      color: v.color,
      type: v.type,
      source: 'manual',
      cellErrors: [],
    };
  }

  private reloadDraftsFromServer(onDone?: () => void) {
    const id = this.createdId();
    if (!id) {
      onDone?.();
      return;
    }
    this.busy.set(true);
    this.patrimonialService.getById(id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.companyLabel = res.service.company_fancy_name || this.companyLabel;
        this.draftCollaborators.set(
          (res.service.collaborators || []).map((c) => this.mapServerCollaborator(c)),
        );
        this.draftVehicles.set((res.service.vehicles || []).map((v) => this.mapServerVehicle(v)));
        onDone?.();
      },
      error: (err) => {
        this.busy.set(false);
        this.notification.notifyHttpError(err, 'Falha ao atualizar a lista após o import.');
        onDone?.();
      },
    });
  }

  private applyCompanyValidator(): void {
    const ctrl = this.dadosForm.get('id_company');
    if (!ctrl) return;
    if (this.isAdmin) {
      ctrl.setValidators([Validators.required]);
    } else {
      ctrl.clearValidators();
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private reset() {
    this.step.set('dados');
    this.createdId.set(null);
    this.draftSyncToken.set(0);
    this.busy.set(false);
    this.submitted = false;
    this.dadosFormSubmitted = false;
    this.companyLabel = '';
    this.dadosForm.reset({
      periodo: null,
      finalidade: '',
      observacao: '',
      id_setor: null,
      id_company: null,
      notificar_entrada_colaborador: true,
      notificar_entrada_veiculo: true,
    });
    this.applyCompanyValidator();
    this.draftCollaborators.set([]);
    this.draftVehicles.set([]);
    this.pendingFromSheet.set([]);
    this.pendingRoleProposals = [];
    this.onlyPending.set(false);
    this.filterQuery.set('');
    this.colabQuery = '';
    this.veicQuery = '';
    this.colabResults.set([]);
    this.veicResults.set([]);
    this.colabSearching.set(false);
    this.veicSearching.set(false);
    if (this.colabTimer) clearTimeout(this.colabTimer);
    if (this.veicTimer) clearTimeout(this.veicTimer);
  }
}
