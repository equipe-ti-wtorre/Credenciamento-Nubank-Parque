import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ModalComponent } from '../../shared/modal/modal.component';
import { NotificationService } from '../../core/services/notification.service';
import { CollaboratorRole, CollaboratorService } from '../../services/collaborator.service';
import { PatrimonialService } from '../../services/patrimonial.service';
import {
  CadastroStatus,
  UnifiedBulkConfirmBody,
  UnifiedBulkConfirmResult,
  UnifiedBulkPreviewResult,
  UnifiedCollaboratorRow,
  UnifiedColaboradorDecision,
  UnifiedDivergence,
  UnifiedVehicleRow,
  UnifiedVeiculoDecision,
} from './service-access-bulk-import.types';

export interface BulkImportApiAdapter {
  downloadTemplate: () => Observable<Blob>;
  preview: (file: File) => Observable<UnifiedBulkPreviewResult>;
  confirm: (
    previewToken: string,
    decisoes: UnifiedBulkConfirmBody['decisoes'],
  ) => Observable<UnifiedBulkConfirmResult>;
  templateFilename?: string;
  confirmLabel?: string;
}

type WizardStep = 'upload' | 'review' | 'result';

interface ColDecisionState {
  include: boolean;
  camposMaster: Record<string, boolean>;
  aplicarFuncao: boolean;
  roleId?: number | null;
  /** Decisão explícita Aplicar/Manter (como no cadastro). */
  roleDecision?: 'aplicar' | 'manter' | null;
}

interface VeicDecisionState {
  include: boolean;
  campos: Record<string, boolean>;
}

@Component({
  selector: 'app-service-access-bulk-import-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, NgTemplateOutlet],
  template: `
    <ng-template #wimpBody>
      <div class="wimp">
        <div
          class="wimp-stepper"
          *ngIf="!embedded || !!apiAdapter"
          [attr.aria-label]="'Passo ' + stepNumber() + ' de 3: ' + stepLabel()"
        >
          <div class="wimp-stepper__track">
            <div class="wimp-stepper__item" [class.is-active]="step() === 'upload'" [class.is-done]="step() !== 'upload'">
              <span class="wimp-stepper__dot">
                @if (step() !== 'upload') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                } @else { 1 }
              </span>
              <span class="wimp-stepper__label">Enviar arquivo</span>
            </div>
            <span class="wimp-stepper__line" [class.is-done]="step() !== 'upload'"></span>
            <div class="wimp-stepper__item" [class.is-active]="step() === 'review'" [class.is-done]="step() === 'result'">
              <span class="wimp-stepper__dot">
                @if (!embedded && step() === 'result') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                } @else { 2 }
              </span>
              <span class="wimp-stepper__label">Revisar dados</span>
            </div>
            <span class="wimp-stepper__line" [class.is-done]="step() === 'result'"></span>
            <div class="wimp-stepper__item" [class.is-active]="step() === 'result'">
              <span class="wimp-stepper__dot">3</span>
              <span class="wimp-stepper__label">Importar</span>
            </div>
          </div>
          <p class="wimp-stepper__current" aria-hidden="true">
            {{ stepNumber() }} · {{ stepLabel() }}
          </p>
        </div>

        @if (step() === 'upload') {
          <div class="wimp-panel" [class.wimp-panel--compact]="embedded">
            @if (embedded) {
              <div class="wimp-embed">
                <input #fileInput type="file" accept=".xlsx,.xls" class="hidden" (change)="onFileSelected($event)" />
                @if (!file()) {
                  <div
                    class="upload-dropzone upload-dropzone--banner"
                    [class.upload-dropzone--dragover]="dragging()"
                    tabindex="0"
                    role="button"
                    [attr.aria-disabled]="busy() || importing() || null"
                    (click)="!busy() && !importing() && fileInput.click()"
                    (keydown.enter)="!busy() && !importing() && fileInput.click()"
                    (keydown.space)="$event.preventDefault(); !busy() && !importing() && fileInput.click()"
                    (dragover)="$event.preventDefault(); dragging.set(true)"
                    (dragleave)="dragging.set(false)"
                    (drop)="dragging.set(false); onDrop($event)"
                  >
                    <div class="upload-dropzone__main">
                      <span class="upload-dropzone__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>
                      </span>
                      <span class="upload-dropzone__text">
                        <span class="upload-dropzone__title">
                          Arraste a planilha aqui ou
                          <span class="upload-dropzone__link">clique para procurar</span>
                        </span>
                        <span class="upload-dropzone__hint">Formato .xlsx — use o modelo para preencher corretamente</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      class="upload-dropzone__action"
                      [disabled]="templateDownloading() || busy() || importing()"
                      (click)="$event.stopPropagation(); downloadTemplate()"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>
                      {{ templateDownloading() ? 'Baixando...' : 'Baixar modelo' }}
                    </button>
                  </div>
                } @else {
                  <div class="wimp-filecard wimp-filecard--embed">
                    <span class="wimp-filecard__icon wimp-filecard__icon--xlsx">XLSX</span>
                    <span class="wimp-filecard__meta">
                      <span class="wimp-filecard__name">{{ file()!.name }}</span>
                      <span class="wimp-filecard__size">
                        {{ busy() || importing() ? 'Processando…' : formatBytes(file()!.size) }}
                      </span>
                    </span>
                    <button
                      type="button"
                      class="wimp-filecard__remove"
                      aria-label="Remover"
                      [disabled]="busy() || importing()"
                      (click)="clearFile()"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                    <button
                      type="button"
                      class="upload-dropzone__action"
                      [disabled]="templateDownloading() || busy() || importing()"
                      (click)="$event.stopPropagation(); downloadTemplate()"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>
                      {{ templateDownloading() ? 'Baixando...' : 'Baixar modelo' }}
                    </button>
                  </div>
                }
                <div class="wimp-embed__err" aria-live="polite">
                  @if (uploadError()) {
                    <span class="wimp-err wimp-err--inline">{{ uploadError() }}</span>
                  }
                </div>
              </div>
            } @else {
              <p class="wimp-template-note">
                {{
                  hideVehicles
                    ? 'Modelo com aba Colaboradores (e Veículos no arquivo, ignorada aqui). Não altere os cabeçalhos.'
                    : hideCollaborators
                      ? 'Modelo com aba Veículos (e Colaboradores no arquivo, ignorada aqui). Não altere os cabeçalhos.'
                      : 'Modelo com duas abas: Colaboradores e Veículos. Não altere os cabeçalhos.'
                }}
              </p>

              <div class="wimp-cols">
                @if (!hideCollaborators) {
                  <div class="wimp-cols__group">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
                    Aba "Colaboradores"
                  </div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Documento</span><span class="wimp-cols__desc">Número do documento</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Tipo de documento</span><span class="wimp-cols__desc">Lista: CPF, RG, Passaporte</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Nome completo</span><span class="wimp-cols__desc">Nome do colaborador</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Função / Cargo</span><span class="wimp-cols__desc">Lista de funções do sistema</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">RG</span><span class="wimp-cols__desc">RG</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Telefone</span><span class="wimp-cols__desc">Telefone com DDD</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                }

                @if (!hideVehicles) {
                  <div class="wimp-cols__group">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M6 17l1-5h10l1 5M7 12l1-4h8l1 4"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>
                    Aba "Veículos"
                  </div>
                  @if (hideCollaborators) {
                    <div class="wimp-cols__row"><span class="wimp-cols__key">Empresa</span><span class="wimp-cols__desc">Nome fantasia (obrigatório para admin)</span><span class="wimp-tag wimp-tag--opt">Conforme perfil</span></div>
                  }
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Placa</span><span class="wimp-cols__desc">Placa do veículo</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Marca</span><span class="wimp-cols__desc">Fabricante</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Modelo</span><span class="wimp-cols__desc">Modelo</span><span class="wimp-tag wimp-tag--req">Obrigatório</span></div>
                  @if (!hideCollaborators) {
                    <div class="wimp-cols__row"><span class="wimp-cols__key">Motorista (documento)</span><span class="wimp-cols__desc">Documento de um colaborador da aba ao lado</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                  }
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Cor</span><span class="wimp-cols__desc">Lista de sugestão</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Tipo</span><span class="wimp-cols__desc">Lista de sugestão</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                  <div class="wimp-cols__row"><span class="wimp-cols__key">Observações</span><span class="wimp-cols__desc">Texto livre</span><span class="wimp-tag wimp-tag--opt">Opcional</span></div>
                }
              </div>

              <input #fileInputFull type="file" accept=".xlsx,.xls" class="hidden" (change)="onFileSelected($event)" />
              @if (!file()) {
                <div
                  class="upload-dropzone upload-dropzone--banner"
                  [class.upload-dropzone--dragover]="dragging()"
                  tabindex="0"
                  role="button"
                  (click)="fileInputFull.click()"
                  (keydown.enter)="fileInputFull.click()"
                  (keydown.space)="$event.preventDefault(); fileInputFull.click()"
                  (dragover)="$event.preventDefault(); dragging.set(true)"
                  (dragleave)="dragging.set(false)"
                  (drop)="dragging.set(false); onDrop($event)"
                >
                  <div class="upload-dropzone__main">
                    <span class="upload-dropzone__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>
                    </span>
                    <span class="upload-dropzone__text">
                      <span class="upload-dropzone__title">
                        Arraste a planilha aqui ou
                        <span class="upload-dropzone__link">clique para procurar</span>
                      </span>
                      <span class="upload-dropzone__hint">Somente .xlsx · até 5 MB</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    class="upload-dropzone__action"
                    [disabled]="templateDownloading()"
                    (click)="$event.stopPropagation(); downloadTemplate()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg>
                    {{ templateDownloading() ? 'Baixando...' : 'Baixar modelo' }}
                  </button>
                </div>
              } @else {
                <div class="wimp-filecard">
                  <span class="wimp-filecard__icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  </span>
                  <span class="wimp-filecard__meta">
                    <span class="wimp-filecard__name">{{ file()!.name }}</span>
                    <span class="wimp-filecard__size">{{ formatBytes(file()!.size) }}</span>
                  </span>
                  <button type="button" class="wimp-filecard__remove" aria-label="Remover" (click)="clearFile()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              }
              @if (uploadError()) {
                <p class="wimp-err">{{ uploadError() }}</p>
              }
            }
          </div>
        }

        @if ((!embedded || !!apiAdapter) && step() === 'review' && preview(); as prev) {
          <div class="wimp-panel">
            <div class="wimp-summary">
              <span class="wimp-stat wimp-stat--total">
                {{
                  hideVehicles
                    ? prev.resumo.colaboradores.total
                    : hideCollaborators
                      ? prev.resumo.veiculos.total
                      : prev.resumo.colaboradores.total + prev.resumo.veiculos.total
                }}
                registros
              </span>
              @if (!hideCollaborators) {
                <span class="wimp-stat wimp-stat--new">
                  {{ hideVehicles ? '' : 'Colab.: ' }}{{ prev.resumo.colaboradores.novos }} novos ·
                  {{ prev.resumo.colaboradores.atualizacoes }} atual.
                </span>
              }
              @if (!hideVehicles) {
                <span class="wimp-stat wimp-stat--update">
                  {{ hideCollaborators ? '' : 'Veíc.: ' }}{{ prev.resumo.veiculos.novos }} novos ·
                  {{ prev.resumo.veiculos.atualizacoes }} atual.
                </span>
              }
              @if (
                (hideCollaborators ? 0 : prev.resumo.colaboradores.erros) +
                  (hideVehicles ? 0 : prev.resumo.veiculos.erros) >
                0
              ) {
                <span class="wimp-stat wimp-stat--error">
                  {{
                    (hideCollaborators ? 0 : prev.resumo.colaboradores.erros) +
                      (hideVehicles ? 0 : prev.resumo.veiculos.erros)
                  }}
                  com erro
                </span>
              }
            </div>

            @if (!hideCollaborators) {
            <div class="wimp-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
              Colaboradores <span class="wimp-count">· {{ prev.colaboradores.length }}</span>
            </div>
            <div class="wimp-cards">
              @for (row of prev.colaboradores; track row.linha) {
                @if (!dismissedColLines().has(row.linha)) {
                  <article
                    class="wimp-rowcard"
                    [class.wimp-rowcard--error]="row.cadastro === 'erro' && !row.pendente_funcao"
                    [class.wimp-rowcard--pending]="row.pendente_funcao || hasPendingRoleDecision(row)"
                  >
                    <div class="wimp-entity__head">
                      @if (row.cadastro !== 'erro' || row.pendente_funcao) {
                        <input
                          type="checkbox"
                          [checked]="colDecisions()[row.linha]?.include"
                          [disabled]="row.pendente_funcao && !colDecisions()[row.linha]?.roleId"
                          (change)="toggleColInclude(row.linha, $event)"
                        />
                      }
                      <span
                        class="wimp-badge"
                        [attr.data-status]="row.pendente_funcao ? 'pendente' : row.cadastro"
                      >{{ row.pendente_funcao ? 'Pendente' : cadastroLabel(row.cadastro) }}</span>
                      <div class="wimp-entity__grow">
                        <div class="wimp-entity__title">{{ row.nome || 'Linha ' + row.linha }}</div>
                        <div class="wimp-entity__sub">
                          {{ row.chave.tipo }} · {{ row.chave.documento }}
                          @if (vinculoLabel(row)) { · {{ vinculoLabel(row) }} }
                        </div>
                      </div>
                      @if (row.cadastro === 'erro') {
                        <button type="button" class="wimp-link-danger" (click)="dismissColError(row.linha)">
                          Remover
                        </button>
                      }
                    </div>
                    @if (row.cadastro === 'erro' && row.pendente_funcao) {
                      <div class="wimp-rowcard__err">{{ row.erros.join(' · ') }}</div>
                      <label class="wimp-fix-field">
                        <span class="wimp-fix-field__label">Função / Cargo</span>
                        <select
                          class="wimp-select"
                          [ngModel]="colDecisions()[row.linha]?.roleId ?? null"
                          (ngModelChange)="setColRole(row.linha, $event)"
                          [name]="'role-fix-' + row.linha"
                        >
                          <option [ngValue]="null">Selecionar função…</option>
                          @for (r of roles(); track r.id_collaborator_role) {
                            <option [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                          }
                        </select>
                      </label>
                    } @else if (row.cadastro === 'erro') {
                      <div class="wimp-rowcard__err">{{ row.erros.join(' · ') }}</div>
                    }
                    @if (row.cadastro === 'atualizacao' && row.divergencias.length) {
                      <div class="wimp-diff">
                        <div class="wimp-diff__row wimp-diff__row--head"><span>Campo</span><span>Atual</span><span>Novo (planilha)</span><span>Aplicar</span></div>
                        @for (d of row.divergencias; track d.campo) {
                          <div class="wimp-diff__row">
                            <span class="wimp-diff__field">{{ d.rotulo }}</span>
                            <span class="wimp-diff__old">{{ d.atual ?? '—' }}</span>
                            <span class="wimp-diff__new">{{ d.novo ?? '—' }}</span>
                            <span class="wimp-diff__apply">
                              <input type="checkbox" [checked]="!!colDecisions()[row.linha]?.camposMaster?.[d.campo]" (change)="toggleColMasterField(row.linha, d.campo, $event)" />
                            </span>
                          </div>
                        }
                      </div>
                    }
                    @if (roleChangeDiff(row); as d) {
                      <div class="wimp-role-field">
                        @if (!row.pendente_funcao) {
                          <select
                            class="wimp-select"
                            [ngModel]="selectedRoleForRow(row, d)"
                            (ngModelChange)="setColRoleChoice(row.linha, $event, d)"
                            [name]="'role-choice-' + row.linha"
                          >
                            <option [ngValue]="null">Selecionar função…</option>
                            @for (r of roles(); track r.id_collaborator_role) {
                              <option [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
                            }
                          </select>
                        }
                        <div class="wimp-role-change">
                          <span class="wimp-role-change__arrow">{{ d.atual ?? '—' }} → {{ d.novo ?? '—' }}</span>
                          <button
                            type="button"
                            class="wimp-role-change__yes"
                            [class.is-on]="colDecisions()[row.linha]?.roleDecision === 'aplicar'"
                            (click)="confirmRoleChange(row.linha)"
                          >
                            Aplicar
                          </button>
                          <button
                            type="button"
                            class="wimp-role-change__no"
                            [class.is-on]="colDecisions()[row.linha]?.roleDecision === 'manter'"
                            (click)="dismissRoleChange(row.linha)"
                          >
                            Manter
                          </button>
                        </div>
                      </div>
                    }
                  </article>
                }
              } @empty {
                <p class="wimp-empty">Nenhum colaborador na planilha.</p>
              }
            </div>
            }

            @if (!hideVehicles) {
              <div class="wimp-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M6 17l1-5h10l1 5M7 12l1-4h8l1 4"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>
                Veículos <span class="wimp-count">· {{ prev.veiculos.length }}</span>
              </div>
              <div class="wimp-cards">
                @for (row of prev.veiculos; track row.linha) {
                  @if (!dismissedVeicLines().has(row.linha)) {
                  <article class="wimp-rowcard" [class.wimp-rowcard--error]="row.cadastro === 'erro'">
                    <div class="wimp-entity__head">
                      @if (row.cadastro !== 'erro') {
                        <input type="checkbox" [checked]="veicDecisions()[row.linha]?.include" (change)="toggleVeicInclude(row.linha, $event)" />
                      }
                      <span class="wimp-badge" [attr.data-status]="row.cadastro">{{ cadastroLabel(row.cadastro) }}</span>
                      <div class="wimp-entity__grow">
                        <div class="wimp-entity__title">{{ row.chave.placa || 'Linha ' + row.linha }}</div>
                        <div class="wimp-entity__sub">
                          {{
                            hideCollaborators
                              ? row.cadastro === 'novo'
                                ? 'Novo cadastro'
                                : row.cadastro === 'inalterado'
                                  ? 'Já cadastrado'
                                  : 'Atualizar cadastro'
                              : row.vinculo === 'ja_vinculado'
                                ? 'Já no acesso'
                                : 'Será vinculado'
                          }}
                        </div>
                      </div>
                      @if (row.cadastro === 'erro') {
                        <button type="button" class="wimp-link-danger" (click)="dismissVeicError(row.linha)">
                          Remover
                        </button>
                      }
                    </div>
                    @if (!hideCollaborators) {
                      @if (row.motorista; as m) {
                        <div class="wimp-driver">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
                          Motorista: <strong>{{ m.nome || '—' }}</strong> · {{ m.documento }}
                        </div>
                      } @else {
                        <div class="wimp-driver wimp-driver--none">Sem motorista informado</div>
                      }
                    }
                    @if (row.cadastro === 'erro') {
                      <div class="wimp-rowcard__err">{{ row.erros.join(' · ') }}</div>
                    }
                    @if (row.cadastro === 'atualizacao' && row.divergencias.length) {
                      <div class="wimp-diff">
                        <div class="wimp-diff__row wimp-diff__row--head"><span>Campo</span><span>Atual</span><span>Novo (planilha)</span><span>Aplicar</span></div>
                        @for (d of row.divergencias; track d.campo) {
                          <div class="wimp-diff__row">
                            <span class="wimp-diff__field">{{ d.rotulo }}</span>
                            <span class="wimp-diff__old">{{ d.atual ?? '—' }}</span>
                            <span class="wimp-diff__new">{{ d.novo ?? '—' }}</span>
                            <span class="wimp-diff__apply">
                              <input type="checkbox" [checked]="!!veicDecisions()[row.linha]?.campos?.[d.campo]" (change)="toggleVeicField(row.linha, d.campo, $event)" />
                            </span>
                          </div>
                        }
                      </div>
                    }
                  </article>
                  }
                } @empty {
                  <p class="wimp-empty">Nenhum veículo na planilha.</p>
                }
              </div>
            }
          </div>
        }

        @if (step() === 'result') {
          <div class="wimp-panel">
            @if (importing()) {
              <div class="wimp-progress">
                <div class="wimp-spinner"></div>
                <div class="wimp-progress__text">
                  {{ hideVehicles || hideCollaborators ? 'Importando…' : 'Adicionando ao acesso…' }}
                </div>
              </div>
            } @else if (tokenConsumed()) {
              <div class="wimp-result">
                <h3 class="wimp-result__title">Essa importação já foi concluída.</h3>
              </div>
            } @else if (result(); as r) {
              <div class="wimp-result">
                <div class="wimp-result__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <h3 class="wimp-result__title">
                  {{ hideVehicles || hideCollaborators ? 'Importação concluída' : 'Adicionados ao acesso' }}
                </h3>
                @if (!hideCollaborators) {
                  <div class="wimp-result__group">
                    <div class="wimp-result__glabel">Colaboradores</div>
                    <div class="wimp-result__stats">
                      <span class="wimp-stat wimp-stat--new">{{ r.colaboradores.inseridos }} inseridos</span>
                      <span class="wimp-stat wimp-stat--update">{{ r.colaboradores.atualizados }} atualizados</span>
                      <span class="wimp-stat wimp-stat--error">{{ r.colaboradores.ignorados }} ignorados</span>
                    </div>
                  </div>
                }
                @if (!hideVehicles) {
                  <div class="wimp-result__group">
                    <div class="wimp-result__glabel">Veículos</div>
                    <div class="wimp-result__stats">
                      <span class="wimp-stat wimp-stat--new">{{ r.veiculos.inseridos }} inseridos</span>
                      <span class="wimp-stat wimp-stat--update">{{ r.veiculos.atualizados }} atualizados</span>
                      @if (hideCollaborators) {
                        <span class="wimp-stat wimp-stat--error">{{ r.veiculos.ignorados }} ignorados</span>
                      }
                    </div>
                  </div>
                  @if (!hideCollaborators) {
                    <div class="wimp-result__group">
                      <div class="wimp-result__glabel">Vínculos de motorista</div>
                      <div class="wimp-result__stats">
                        <span class="wimp-stat wimp-stat--update">{{ r.motoristas }} definidos</span>
                      </div>
                    </div>
                  }
                }
              </div>
            }
          </div>
        }
      </div>
    </ng-template>

    <ng-template #wimpFooter>

        @if (step() !== 'result') {
          <button type="button" class="wimp-btn wimp-btn--ghost" (click)="onBack()" [disabled]="busy()">
            {{ step() === 'upload' ? 'Cancelar' : 'Voltar' }}
          </button>
        } @else {
          <span></span>
        }
        <div class="wimp-foot__right">
          @if (step() === 'upload') {
            <button type="button" class="wimp-btn wimp-btn--primary" [disabled]="!file() || busy()" (click)="runPreview()">
              {{ busy() ? 'Analisando...' : 'Continuar' }}
            </button>
          }
          @if (step() === 'review') {
            <button type="button" class="wimp-btn wimp-btn--primary" [disabled]="busy() || !canConfirm()" (click)="runConfirm()">
              {{
                busy()
                  ? 'Importando...'
                  : apiAdapter?.confirmLabel || (embedded ? 'Confirmar e adicionar' : 'Adicionar ao acesso')
              }}
            </button>
          }
          @if (step() === 'result' && !importing()) {
            <button type="button" class="wimp-btn wimp-btn--primary" (click)="onClose()">Concluir</button>
          }
        </div>
      
    </ng-template>

    @if (embedded) {
      @if (open) {
        <div class="wimp-host--embedded">
          <ng-container *ngTemplateOutlet="wimpBody" />
          @if (apiAdapter) {
            <div class="wimp-foot wimp-foot--embed">
              <ng-container *ngTemplateOutlet="wimpFooter" />
            </div>
          }
        </div>
      }
    } @else {
      <app-modal
        [open]="open"
        title="Importar para o acesso"
        [subtitle]="modalSubtitle"
        size="xl"
        [closeOnBackdrop]="false"
        [focusFirstField]="false"
        (close)="onClose()"
      >
        <ng-container *ngTemplateOutlet="wimpBody" />
        <div modal-footer class="modal-footer wimp-foot">
          <ng-container *ngTemplateOutlet="wimpFooter" />
        </div>
      </app-modal>
    }

  `,
  styles: [
    `
      :host {
        --wtorre-soft: var(--wtorre-tonal-bg);
        --ink: #14182b;
        --ink-2: #5a6178;
        --ink-3: #8b91a7;
        --line: #e6e8f0;
        --ok: #16a34a;
        --ok-soft: #e7f6ec;
        --danger: #dc2626;
        --danger-soft: #fdecec;
        --radius-field: 10px;
        --radius-pill: 999px;
        --field-h: 42px;
        font-family: var(--font-body, 'Plus Jakarta Sans', system-ui, sans-serif);
      }
      .wimp {
        display: flex;
        flex-direction: column;
        gap: 0;
        min-width: 0;
        max-width: 100%;
        overflow-x: hidden;
      }
      .wimp-host--embedded { display: flex; flex-direction: column; gap: 0; min-width: 0; }
      .wimp-panel--compact {
        padding: 0;
        border: 0;
        background: transparent;
        min-width: 0;
      }
      .wimp-embed {
        display: flex;
        flex-direction: column;
        width: 100%;
        min-width: 0;
      }
      .wimp-embed__err {
        min-height: 1.125rem;
        margin-top: 6px;
      }
      .wimp-filecard--embed {
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 64px;
        padding: 12px 14px;
        background: var(--ok-soft);
        border: 1.5px solid #b8e0c8;
        border-radius: 14px;
        box-sizing: border-box;
      }
      .wimp-filecard__icon--xlsx {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: #16a34a;
        color: #fff;
        display: grid;
        place-items: center;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .02em;
        flex: none;
      }
      .wimp-filecard--embed .wimp-filecard__meta {
        flex: 1;
        min-width: 0;
      }
      .wimp-filecard--embed .wimp-filecard__name { font-size: 13.5px; }
      .wimp-filecard--embed .wimp-filecard__size { font-size: 12px; }
      .wimp-err--inline {
        margin: 0;
        font-size: 12.5px;
        color: var(--danger);
      }
      .wimp-stepper {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 4px 0 14px;
        min-width: 0;
      }
      .wimp-stepper__track {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
      }
      .wimp-stepper__current {
        display: none;
        margin: 8px 0 0;
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1.35;
        color: var(--ink);
        word-break: break-word;
      }
      .wimp-stepper__item { display: flex; align-items: center; gap: 9px; min-width: 0; }
      .wimp-stepper__dot {
        width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
        flex: none; font-family: var(--font-display, Sora, system-ui, sans-serif); font-weight: 700;
        font-size: 12.5px; background: #eef0f4; color: var(--ink-3);
      }
      .wimp-stepper__dot svg { width: 14px; height: 14px; }
      .wimp-stepper__label { font-size: 13px; font-weight: 600; color: var(--ink-3); white-space: nowrap; }
      .wimp-stepper__item.is-active .wimp-stepper__dot { background: var(--wtorre); color: #fff; }
      .wimp-stepper__item.is-active .wimp-stepper__label,
      .wimp-stepper__item.is-done .wimp-stepper__label { color: var(--ink); }
      .wimp-stepper__item.is-done .wimp-stepper__dot { background: var(--ok); color: #fff; }
      .wimp-stepper__line { flex: 1; height: 2px; background: #eef0f4; margin: 0 12px; border-radius: 2px; }
      .wimp-stepper__line.is-done { background: var(--ok); }

      .wimp-panel { padding-bottom: 4px; }
      .wimp-template-note { font-size: 12.5px; color: var(--ink-2); margin: 4px 0 14px; }

      .wimp-cols { border: 1px solid var(--line); border-radius: var(--radius-field); overflow: hidden; margin-bottom: 20px; }
      .wimp-cols__group {
        background: #f2f5fc; padding: 7px 14px; font-size: 10.5px; font-weight: 700;
        letter-spacing: .05em; text-transform: uppercase; color: var(--wtorre);
        border-top: 1px solid var(--line); display: flex; align-items: center; gap: 7px;
      }
      .wimp-cols__group:first-child { border-top: none; }
      .wimp-cols__group svg { width: 13px; height: 13px; }
      .wimp-cols__row {
        display: grid; grid-template-columns: minmax(0,1.15fr) minmax(0,1fr) auto;
        gap: 12px; align-items: center; padding: 9px 14px; font-size: 13px; border-top: 1px solid var(--line);
      }
      .wimp-cols__key {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
        background: #f2f3f8; padding: 2px 7px; border-radius: 6px; justify-self: start;
      }
      .wimp-cols__desc { color: var(--ink-2); }
      .wimp-tag {
        justify-self: end; font-size: 11px; font-weight: 600; padding: 2px 9px;
        border-radius: var(--radius-pill); white-space: nowrap;
      }
      .wimp-tag--req { background: var(--wtorre-soft); color: var(--wtorre); }
      .wimp-tag--opt { background: #f0f1f5; color: var(--ink-3); }

      .wimp-filecard {
        display: flex; align-items: center; gap: 12px; padding: 12px 14px;
        border: 1px solid var(--line); border-radius: var(--radius-field);
      }
      .wimp-filecard__icon {
        flex: none; width: 40px; height: 40px; border-radius: 9px; background: var(--ok-soft); color: var(--ok);
        display: grid; place-items: center;
      }
      .wimp-filecard__icon svg { width: 20px; height: 20px; }
      .wimp-filecard__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .wimp-filecard__name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .wimp-filecard__size { font-size: 12px; color: var(--ink-3); }
      .wimp-filecard__remove {
        flex: none; width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent;
        color: var(--ink-3); cursor: pointer; display: grid; place-items: center;
      }
      .wimp-filecard__remove:hover { background: var(--danger-soft); color: var(--danger); }
      .wimp-filecard__remove svg { width: 16px; height: 16px; }
      .wimp-err { margin: 10px 0 0; font-size: 13px; color: var(--danger); }

      .wimp-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
      .wimp-stat {
        display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600;
        padding: 6px 12px; border-radius: var(--radius-pill);
      }
      .wimp-stat--total { background: #f0f1f5; color: var(--ink-2); }
      .wimp-stat--new { background: var(--ok-soft); color: var(--ok); }
      .wimp-stat--update { background: var(--wtorre-soft); color: var(--wtorre); }
      .wimp-stat--error { background: var(--danger-soft); color: var(--danger); }

      .wimp-section-title {
        display: flex; align-items: center; gap: 8px; font-family: var(--font-display, Sora, sans-serif);
        font-size: 14px; font-weight: 700; margin: 4px 0 12px;
      }
      .wimp-section-title:not(:first-of-type) { margin-top: 22px; }
      .wimp-section-title svg { width: 16px; height: 16px; color: var(--wtorre); }
      .wimp-count { font-family: var(--font-body, inherit); font-size: 12px; font-weight: 600; color: var(--ink-3); }

      .wimp-cards { display: flex; flex-direction: column; gap: 10px; max-height: min(42vh, 380px); overflow: auto; }
      .wimp-rowcard { border: 1px solid var(--line); border-radius: var(--radius-field); padding: 14px 16px; }
      .wimp-rowcard--error { background: #fffafa; border-color: #f6d5d5; }
      .wimp-rowcard--pending { background: #fffbeb; border-color: #fde68a; }
      .wimp-entity__head { display: flex; align-items: center; gap: 10px; }
      .wimp-entity__grow { flex: 1; min-width: 0; }
      .wimp-link-danger {
        flex: none; border: 0; background: transparent; color: var(--danger);
        font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 0;
      }
      .wimp-link-danger:hover { text-decoration: underline; }
      .wimp-form-field {
        display: flex; flex-direction: column; gap: 6px; margin-top: 12px; max-width: 22rem;
      }
      .wimp-form-field__label { font-size: 12px; font-weight: 600; color: var(--ink-2); }
      .wimp-select {
        height: var(--field-h); border: 1px solid var(--line); border-radius: var(--radius-field);
        padding: 0 12px; font-size: 13.5px; background: #fff; color: var(--ink); max-width: 22rem;
      }
      .wimp-select:focus { outline: 2px solid color-mix(in srgb, var(--wtorre) 35%, transparent); border-color: var(--wtorre); }
      .wimp-role-field { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      .wimp-role-change {
        display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
        padding: 6px 8px; border-radius: 8px; background: #eff6ff; border: 1px solid #bfdbfe;
        font-size: 12px; line-height: 1.3; max-width: 22rem;
      }
      .wimp-role-change__arrow { font-weight: 700; color: #1e3a8a; }
      .wimp-role-change__yes, .wimp-role-change__no {
        border: 0; background: transparent; cursor: pointer; font-size: 12px; font-weight: 700; padding: 0;
      }
      .wimp-role-change__yes { color: var(--wtorre); }
      .wimp-role-change__no { color: #64748b; }
      .wimp-role-change__yes.is-on, .wimp-role-change__no.is-on { text-decoration: underline; }
      .wimp-badge {
        font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: var(--radius-pill); flex: none;
        background: #f0f1f5; color: var(--ink-2);
      }
      .wimp-badge[data-status='novo'] { background: var(--ok-soft); color: var(--ok); }
      .wimp-badge[data-status='atualizacao'] { background: var(--wtorre-soft); color: var(--wtorre); }
      .wimp-badge[data-status='inalterado'] { background: #f0f1f5; color: var(--ink-2); }
      .wimp-badge[data-status='erro'] { background: var(--danger-soft); color: var(--danger); }
      .wimp-badge[data-status='pendente'] { background: #fff7ed; color: #c2410c; }
      .wimp-entity__title { font-size: 14px; font-weight: 600; }
      .wimp-entity__sub { font-size: 12.5px; color: var(--ink-2); margin-top: 1px; }
      .wimp-rowcard__err { margin-top: 8px; font-size: 12.5px; color: var(--danger); }
      .wimp-empty { font-size: 13px; color: var(--ink-3); margin: 0; }

      .wimp-driver {
        margin-top: 10px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px;
        color: var(--ink-2); background: #f5f7fc; border: 1px solid var(--line);
        padding: 5px 11px; border-radius: var(--radius-pill);
      }
      .wimp-driver svg { width: 14px; height: 14px; color: var(--ink-3); }
      .wimp-driver strong { color: var(--ink); font-weight: 600; }
      .wimp-driver--none { color: var(--ink-3); font-style: italic; }

      .wimp-diff { margin-top: 12px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
      .wimp-diff__row {
        display: grid; grid-template-columns: 100px 1fr 1fr 56px; gap: 10px; align-items: center;
        padding: 8px 12px; font-size: 13px;
      }
      .wimp-diff__row + .wimp-diff__row { border-top: 1px solid var(--line); }
      .wimp-diff__row--head {
        background: #f8f9fd; font-size: 10px; font-weight: 600; letter-spacing: .04em;
        text-transform: uppercase; color: var(--ink-3);
      }
      .wimp-diff__field { font-weight: 600; }
      .wimp-diff__old { color: var(--ink-3); text-decoration: line-through; }
      .wimp-diff__new { color: var(--ink); font-weight: 600; }
      .wimp-diff__apply { display: grid; place-items: center; }
      .wimp-diff__apply input { width: 16px; height: 16px; accent-color: var(--wtorre); cursor: pointer; }

      .wimp-progress { padding: 40px 8px; text-align: center; }
      .wimp-spinner {
        width: 42px; height: 42px; margin: 0 auto 14px; border: 3px solid #e6e8f0;
        border-top-color: var(--wtorre); border-radius: 50%; animation: wimp-spin .8s linear infinite;
      }
      @keyframes wimp-spin { to { transform: rotate(360deg); } }
      .wimp-progress__text { font-size: 14px; font-weight: 600; }
      .wimp-result { text-align: center; padding: 24px 8px 10px; }
      .wimp-result__icon {
        width: 60px; height: 60px; border-radius: 50%; background: var(--ok-soft); color: var(--ok);
        display: grid; place-items: center; margin: 0 auto 14px;
      }
      .wimp-result__icon svg { width: 30px; height: 30px; }
      .wimp-result__title {
        font-family: var(--font-display, Sora, sans-serif); font-size: 18px; font-weight: 700; margin: 0 0 14px;
      }
      .wimp-result__group { max-width: 360px; margin: 0 auto 10px; text-align: left; }
      .wimp-result__glabel {
        font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        color: var(--ink-3); margin-bottom: 6px;
      }
      .wimp-result__stats { display: flex; gap: 8px; flex-wrap: wrap; }

      .wimp-foot {
        display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%;
      }
      .wimp-foot--embed {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--line, #e2e8f0);
      }
      .wimp-foot__right { display: flex; gap: 10px; margin-left: auto; }
      .wimp-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        height: var(--field-h); padding: 0 20px; border-radius: var(--radius-pill);
        font-family: inherit; font-weight: 600; font-size: 14px; border: 1px solid transparent;
        cursor: pointer; transition: .15s; white-space: nowrap;
      }
      .wimp-btn svg { width: 16px; height: 16px; flex: none; }
      .wimp-btn--ghost { background: #fff; border-color: var(--line); color: var(--ink); }
      .wimp-btn--ghost:hover { border-color: #d3d7e4; background: #fafbfe; }
      .wimp-btn--soft { background: var(--wtorre-soft); color: var(--wtorre); }
      .wimp-btn--soft:hover { background: #dde7fd; }
      .wimp-btn--primary { background: var(--wtorre); color: #fff; }
      .wimp-btn--primary:hover { background: var(--wtorre-hover); }
      .wimp-btn:disabled { opacity: .5; cursor: not-allowed; }

      @media (max-width: 720px) {
        .wimp-stepper__label { display: none; }
        .wimp-stepper__current { display: block; }
        .wimp-stepper__line { margin: 0 8px; min-width: 16px; }
      }
      @media (max-width: 560px) {
        .wimp-cols__row { grid-template-columns: 1fr auto; }
        .wimp-cols__desc { grid-column: 1 / -1; }
        .wimp-diff__row { grid-template-columns: 1fr 1fr 40px; }
        .wimp-diff__field { grid-column: 1 / -1; }
        .wimp-filecard--embed {
          flex-wrap: wrap;
          width: 100%;
        }
        .upload-dropzone--banner {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .upload-dropzone--banner .upload-dropzone__main {
          width: 100%;
          min-width: 0;
        }
        .upload-dropzone--banner .upload-dropzone__text {
          min-width: 0;
          width: 100%;
        }
        .upload-dropzone--banner .upload-dropzone__title,
        .upload-dropzone--banner .upload-dropzone__hint {
          white-space: normal;
          overflow: visible;
          text-overflow: unset;
          word-break: break-word;
        }
        .upload-dropzone--banner .upload-dropzone__hint {
          font-size: 0.8125rem;
          color: #64748b;
          line-height: 1.35;
        }
        .upload-dropzone__action {
          width: 100%;
          justify-content: center;
        }
        .wimp-foot,
        .wimp-foot--embed {
          flex-direction: column;
          align-items: stretch;
        }
        .wimp-foot__right {
          margin-left: 0;
          width: 100%;
          flex-direction: column;
        }
        .wimp-btn {
          width: 100%;
          justify-content: center;
        }
      }
    `,
  ],
})
export class ServiceAccessBulkImportWizardComponent implements OnChanges {
  @Input({ required: true }) open = false;
  /** 0/null = ainda sem rascunho; pede ao pai via draftRequired antes das APIs. */
  @Input() serviceAccessId: number | null = null;
  /**
   * Incrementado pelo pai após create/update do rascunho (datas sincronizadas).
   * O embed espera este token antes de preview/upload quando pediu draftRequired.
   */
  @Input() draftSyncToken = 0;
  @Input() accessName = '';
  @Input() companyName = '';
  /** Quando false, a confirmação não dispara notificação aos aprovadores. */
  @Input() notifyApprovers = true;
  /** Renderiza o conteúdo sem app-modal (dentro de outro wizard). */
  @Input() embedded = false;
  /** APIs externas (ex.: evento) — dispensa rascunho de acesso de serviço. */
  @Input() apiAdapter: BulkImportApiAdapter | null = null;
  /** Admin de colaboradores: oculta eixo/resumo de veículos. */
  @Input() hideVehicles = false;
  /** Admin de frota: oculta eixo/resumo de colaboradores. */
  @Input() hideCollaborators = false;
  @Output() closed = new EventEmitter<void>();
  @Output() completed = new EventEmitter<{
    roleProposals: {
      documento: string;
      id_collaborator: number | null;
      from: string;
      fromRoleId: number | null;
      to: string;
      toRoleId: number | null;
    }[];
  }>();
  @Output() draftRequired = new EventEmitter<void>();
  @Output() issues = new EventEmitter<{
    colaboradores: UnifiedCollaboratorRow[];
    veiculos: UnifiedVehicleRow[];
  }>();
  /** Divergências de função (cadastro → planilha) para confirmação inline no wizard pai. */
  @Output() roleProposals = new EventEmitter<
    {
      documento: string;
      id_collaborator: number | null;
      from: string;
      fromRoleId: number | null;
      to: string;
      toRoleId: number | null;
    }[]
  >();

  private pendingUpload: File | null = null;
  private pendingTemplate = false;
  private lastRoleProposals: {
    documento: string;
    id_collaborator: number | null;
    from: string;
    fromRoleId: number | null;
    to: string;
    toRoleId: number | null;
  }[] = [];

  step = signal<WizardStep>('upload');
  file = signal<File | null>(null);
  preview = signal<UnifiedBulkPreviewResult | null>(null);
  result = signal<UnifiedBulkConfirmResult | null>(null);
  busy = signal(false);
  importing = signal(false);
  templateDownloading = signal(false);
  uploadError = signal<string | null>(null);
  tokenConsumed = signal(false);
  dragging = signal(false);
  colDecisions = signal<Record<number, ColDecisionState>>({});
  veicDecisions = signal<Record<number, VeicDecisionState>>({});
  dismissedColLines = signal<Set<number>>(new Set());
  dismissedVeicLines = signal<Set<number>>(new Set());
  roles = signal<CollaboratorRole[]>([]);
  private rolesLoaded = false;

  get modalSubtitle(): string {
    const nome = this.accessName || 'Acesso';
    const emp = this.companyName || '';
    const left = emp ? `${nome} · ${emp}` : nome;
    if (this.hideVehicles) return `${left} — colaboradores em uma planilha.`;
    if (this.hideCollaborators) return `${left} — veículos em uma planilha.`;
    return `${left} — colaboradores e veículos em uma planilha.`;
  }

  stepNumber(): number {
    if (this.step() === 'upload') return 1;
    if (this.step() === 'review') return 2;
    return 3;
  }

  stepLabel(): string {
    if (this.step() === 'upload') return 'Enviar arquivo';
    if (this.step() === 'review') return 'Revisar dados';
    return 'Importar';
  }

  hasCommitable = computed(() => {
    const cols = Object.values(this.colDecisions()).some((d) => d.include);
    const veics = Object.values(this.veicDecisions()).some((d) => d.include);
    return cols || veics;
  });

  canConfirm = computed(() => {
    if (!this.hasCommitable()) return false;
    const prev = this.preview();
    if (!prev) return false;
    const decisions = this.colDecisions();
    for (const row of prev.colaboradores) {
      if (row.cadastro === 'erro' && !row.pendente_funcao) continue;
      if (this.dismissedColLines().has(row.linha)) continue;
      const state = decisions[row.linha];
      if (!state?.include) continue;
      if (this.roleChangeDiff(row) && !state.roleDecision) return false;
      if (row.pendente_funcao && !state.roleId) return false;
    }
    return true;
  });

  constructor(
    private patrimonialService: PatrimonialService,
    private collaboratorService: CollaboratorService,
    private notification: NotificationService,
  ) {}

  cadastroLabel(s: CadastroStatus): string {
    if (s === 'novo') return 'Novo';
    if (s === 'atualizacao') return 'Atualização';
    if (s === 'inalterado') return 'Sem alteração';
    return 'Erro';
  }

  vinculoLabel(row: UnifiedCollaboratorRow): string {
    if (row.cadastro === 'erro') return '';
    if (row.cadastro === 'inalterado' && row.vinculo === 'a_vincular') {
      return 'cadastro sem alteração · será vinculado';
    }
    if (row.vinculo === 'ja_vinculado') return 'já no acesso';
    return 'será vinculado';
  }

  vinculoSuffix(row: UnifiedCollaboratorRow): string {
    const label = this.vinculoLabel(row);
    return label ? ` · ${label}` : '';
  }

  formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  onClose() {
    if (this.busy()) return;
    this.reset();
    if (!this.embedded) {
      this.closed.emit();
    }
  }

  onBack() {
    if (this.step() === 'review') {
      this.backToUpload();
      return;
    }
    if (this.embedded) {
      this.clearFile();
      return;
    }
    this.onClose();
  }

  reset() {
    this.step.set('upload');
    this.file.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.uploadError.set(null);
    this.tokenConsumed.set(false);
    this.colDecisions.set({});
    this.veicDecisions.set({});
    this.dismissedColLines.set(new Set());
    this.dismissedVeicLines.set(new Set());
    this.importing.set(false);
    this.dragging.set(false);
  }

  roleChangeDiff(row: UnifiedCollaboratorRow) {
    return (row.divergencias_vinculo || []).find((d) => d.campo === 'id_collaborator_role') || null;
  }

  hasPendingRoleDecision(row: UnifiedCollaboratorRow): boolean {
    if (!this.roleChangeDiff(row)) return false;
    if (row.cadastro === 'erro' && !row.pendente_funcao) return false;
    const state = this.colDecisions()[row.linha];
    return !!state?.include && !state.roleDecision;
  }

  selectedRoleForRow(row: UnifiedCollaboratorRow, d: UnifiedDivergence): number | null {
    const state = this.colDecisions()[row.linha];
    if (state?.roleId != null) return state.roleId;
    if (state?.roleDecision === 'manter') return this.resolveRoleId(String(d.atual ?? ''));
    if (state?.roleDecision === 'aplicar') return this.resolveRoleId(String(d.novo ?? ''));
    return this.resolveRoleId(String(d.novo ?? '')) ?? this.resolveRoleId(String(d.atual ?? ''));
  }

  private resolveRoleId(description: string): number | null {
    const fold = (s: string) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const target = fold(description);
    if (!target || target === '—') return null;
    const hit = this.roles().find((r) => fold(r.description) === target);
    return hit?.id_collaborator_role ?? null;
  }

  dismissColError(line: number) {
    this.dismissedColLines.update((set) => {
      const next = new Set(set);
      next.add(line);
      return next;
    });
    this.colDecisions.update((m) => {
      if (!m[line]) return m;
      return { ...m, [line]: { ...m[line], include: false } };
    });
  }

  dismissVeicError(line: number) {
    this.dismissedVeicLines.update((set) => {
      const next = new Set(set);
      next.add(line);
      return next;
    });
  }

  clearFile() {
    this.file.set(null);
    this.uploadError.set(null);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.ensureRolesLoaded();
    }

    const syncReady =
      (changes['draftSyncToken'] || changes['serviceAccessId']) && this.hasServiceId();
    if (!syncReady) return;

    if (this.pendingTemplate) {
      this.pendingTemplate = false;
      this.downloadTemplateNow();
    }
    if (this.pendingUpload) {
      const f = this.pendingUpload;
      this.pendingUpload = null;
      this.file.set(f);
      this.uploadError.set(null);
      if (this.embedded) {
        this.runPreview();
      }
    }
  }

  private ensureRolesLoaded() {
    if (this.rolesLoaded) return;
    this.rolesLoaded = true;
    this.collaboratorService.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles || []),
      error: () => {
        this.rolesLoaded = false;
      },
    });
  }

  private hasServiceId(): boolean {
    return Number(this.serviceAccessId) > 0;
  }

  private hasApiReady(): boolean {
    return !!this.apiAdapter || this.hasServiceId();
  }

  private shouldAutoConfirm(): boolean {
    return this.embedded && !this.apiAdapter;
  }

  /** Sempre pede ao pai sincronizar datas do formulário no rascunho antes das APIs. */
  private requestDraftSync(): void {
    this.draftRequired.emit();
  }

  onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] || null;
    this.setFile(f);
    input.value = '';
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0] || null;
    this.setFile(f);
  }

  private setFile(f: File | null) {
    this.uploadError.set(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      this.uploadError.set('Envie um arquivo .xlsx.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      this.uploadError.set('Arquivo excede 5 MB.');
      return;
    }
    if (this.apiAdapter) {
      this.file.set(f);
      return;
    }
    // No wizard de criação (embedded): sempre sincroniza o período do formulário no rascunho.
    if (this.embedded || !this.hasServiceId()) {
      this.pendingUpload = f;
      this.requestDraftSync();
      return;
    }
    this.file.set(f);
  }

  downloadTemplate() {
    if (this.apiAdapter) {
      this.downloadTemplateNow();
      return;
    }
    if (this.embedded || !this.hasServiceId()) {
      this.pendingTemplate = true;
      this.requestDraftSync();
      return;
    }
    this.downloadTemplateNow();
  }

  private downloadTemplateNow() {
    if (this.apiAdapter) {
      this.templateDownloading.set(true);
      this.apiAdapter.downloadTemplate().subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = this.apiAdapter?.templateFilename || 'template-importacao.xlsx';
          a.click();
          URL.revokeObjectURL(url);
          this.templateDownloading.set(false);
        },
        error: (err) => {
          this.templateDownloading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao baixar modelo.');
        },
      });
      return;
    }
    if (!this.hasServiceId()) {
      this.pendingTemplate = true;
      this.requestDraftSync();
      return;
    }
    this.templateDownloading.set(true);
    this.patrimonialService.baixarBulkImportTemplate(this.serviceAccessId!).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template-acesso-servico.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.templateDownloading.set(false);
      },
      error: (err) => {
        this.templateDownloading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao baixar modelo.');
      },
    });
  }

  runPreview() {
    const f = this.file();
    if (!f || !this.hasApiReady()) return;
    this.busy.set(true);
    this.uploadError.set(null);
    const preview$ = this.apiAdapter
      ? this.apiAdapter.preview(f)
      : this.patrimonialService.bulkImportPreview(this.serviceAccessId!, f);
    preview$.subscribe({
      next: (prev) => {
        this.preview.set(prev);
        this.initDecisions(prev);
        if (this.shouldAutoConfirm()) {
          const colErrors = prev.colaboradores.filter((r) => r.cadastro === 'erro');
          const veicErrors = prev.veiculos.filter((r) => r.cadastro === 'erro');
          this.issues.emit({ colaboradores: colErrors, veiculos: veicErrors });
          this.busy.set(false);
          if (!this.hasCommitable()) {
            this.uploadError.set(
              colErrors.length || veicErrors.length
                ? 'Nenhuma linha válida para importar. Corrija os problemas listados abaixo e envie de novo.'
                : 'Nenhuma linha válida para importar.',
            );
            this.clearFile();
            return;
          }
          this.emitRoleProposals(prev);
          this.runConfirm();
          return;
        }
        this.step.set('review');
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        const msg =
          (typeof err?.error === 'object' && err?.error?.message) ||
          err?.message ||
          'Arquivo inválido. Verifique abas e cabeçalhos.';
        this.uploadError.set(msg);
        this.notification.notifyHttpError(err, msg);
      },
    });
  }

  private emitRoleProposals(prev: UnifiedBulkPreviewResult) {
    const asId = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const proposals = prev.colaboradores
      .filter((r) => r.cadastro !== 'erro')
      .map((row) => {
        const diff = (row.divergencias_vinculo || []).find((d) => d.campo === 'id_collaborator_role');
        const toRoleId = row.resolvido ? asId(row.resolvido['id_collaborator_role']) : null;
        const fromRoleId = row.resolvido
          ? asId(row.resolvido['id_collaborator_role_atual'])
          : null;
        const idCol = row.resolvido ? asId(row.resolvido['id_collaborator']) : null;

        // Divergência explícita OU ids diferentes em resolvido
        const hasDiff =
          !!diff ||
          (fromRoleId != null && toRoleId != null && Number(fromRoleId) !== Number(toRoleId));
        if (!hasDiff) return null;

        return {
          documento: row.chave?.documento || '',
          id_collaborator: idCol,
          from: String(diff?.atual ?? '—'),
          fromRoleId,
          to: String(diff?.novo ?? '—'),
          toRoleId,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
    this.lastRoleProposals = proposals;
    this.roleProposals.emit(proposals);
  }

  private initDecisions(prev: UnifiedBulkPreviewResult) {
    this.ensureRolesLoaded();
    this.dismissedColLines.set(new Set());
    this.dismissedVeicLines.set(new Set());
    const col: Record<number, ColDecisionState> = {};
    for (const row of prev.colaboradores) {
      if (row.cadastro === 'erro' && !row.pendente_funcao) continue;
      const camposMaster: Record<string, boolean> = {};
      for (const d of row.divergencias) {
        camposMaster[d.campo] = false;
      }
      const hasRoleChange = !!this.roleChangeDiff(row);
      if (row.pendente_funcao) {
        col[row.linha] = {
          include: false,
          camposMaster,
          aplicarFuncao: true,
          roleId: null,
          roleDecision: null,
        };
        continue;
      }
      col[row.linha] = {
        include: true,
        camposMaster,
        aplicarFuncao: false,
        roleDecision: hasRoleChange ? null : 'manter',
        roleId: null,
      };
    }
    const veic: Record<number, VeicDecisionState> = {};
    for (const row of prev.veiculos) {
      if (row.cadastro === 'erro') continue;
      const campos: Record<string, boolean> = {};
      for (const d of row.divergencias) {
        campos[d.campo] = true;
      }
      veic[row.linha] = { include: true, campos };
    }
    this.colDecisions.set(col);
    this.veicDecisions.set(veic);
  }

  backToUpload() {
    this.step.set('upload');
  }

  toggleColInclude(line: number, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.colDecisions.update((m) => ({ ...m, [line]: { ...m[line], include: checked } }));
  }

  toggleColMasterField(line: number, field: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.colDecisions.update((m) => ({
      ...m,
      [line]: { ...m[line], camposMaster: { ...m[line].camposMaster, [field]: checked } },
    }));
  }

  setColRole(line: number, roleId: number | null) {
    const id = roleId != null && Number(roleId) > 0 ? Number(roleId) : null;
    this.colDecisions.update((m) => ({
      ...m,
      [line]: {
        ...(m[line] || { include: false, camposMaster: {}, aplicarFuncao: true }),
        roleId: id,
        include: id != null,
        aplicarFuncao: true,
        roleDecision: id != null ? 'aplicar' : null,
      },
    }));
  }

  setColRoleChoice(line: number, roleId: number | null, diff: UnifiedDivergence) {
    const id = roleId != null && Number(roleId) > 0 ? Number(roleId) : null;
    const toId = this.resolveRoleId(String(diff.novo ?? ''));
    const fromId = this.resolveRoleId(String(diff.atual ?? ''));
    let roleDecision: 'aplicar' | 'manter' | null = null;
    if (id != null && toId != null && id === toId) roleDecision = 'aplicar';
    else if (id != null && fromId != null && id === fromId) roleDecision = 'manter';
    else if (id != null) roleDecision = 'aplicar';
    const row = this.preview()?.colaboradores.find((r) => r.linha === line);
    const blocked = row?.cadastro === 'erro' && !row.pendente_funcao;
    this.colDecisions.update((m) => ({
      ...m,
      [line]: {
        ...(m[line] || { include: !blocked, camposMaster: {}, aplicarFuncao: false }),
        roleId: id,
        include: blocked ? false : m[line]?.include !== false,
        aplicarFuncao: roleDecision === 'aplicar',
        roleDecision,
      },
    }));
  }

  confirmRoleChange(line: number) {
    const prev = this.preview();
    const row = prev?.colaboradores.find((r) => r.linha === line);
    const diff = row ? this.roleChangeDiff(row) : null;
    const toId = diff ? this.resolveRoleId(String(diff.novo ?? '')) : null;
    this.colDecisions.update((m) => ({
      ...m,
      [line]: {
        ...(m[line] || { include: true, camposMaster: {}, aplicarFuncao: true }),
        roleDecision: 'aplicar',
        aplicarFuncao: true,
        roleId: toId ?? m[line]?.roleId ?? null,
        include: row?.cadastro === 'erro' && !row.pendente_funcao ? false : m[line]?.include !== false,
      },
    }));
  }

  dismissRoleChange(line: number) {
    const prev = this.preview();
    const row = prev?.colaboradores.find((r) => r.linha === line);
    const diff = row ? this.roleChangeDiff(row) : null;
    const fromId = diff ? this.resolveRoleId(String(diff.atual ?? '')) : null;
    this.colDecisions.update((m) => ({
      ...m,
      [line]: {
        ...(m[line] || { include: true, camposMaster: {}, aplicarFuncao: false }),
        roleDecision: 'manter',
        aplicarFuncao: false,
        roleId: fromId ?? m[line]?.roleId ?? null,
        include: row?.cadastro === 'erro' && !row.pendente_funcao ? false : m[line]?.include !== false,
      },
    }));
  }

  toggleVeicInclude(line: number, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.veicDecisions.update((m) => ({ ...m, [line]: { ...m[line], include: checked } }));
  }

  toggleVeicField(line: number, field: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.veicDecisions.update((m) => ({
      ...m,
      [line]: { ...m[line], campos: { ...m[line].campos, [field]: checked } },
    }));
  }

  runConfirm() {
    const prev = this.preview();
    if (!prev) return;

    const colaboradores: UnifiedColaboradorDecision[] = [];
    for (const [lineStr, state] of Object.entries(this.colDecisions())) {
      const linha = Number(lineStr);
      if (!state.include) {
        colaboradores.push({ linha, aplicar: false });
        continue;
      }
      const decision: UnifiedColaboradorDecision = {
        linha,
        aplicar: true,
        camposMaster: Object.entries(state.camposMaster || {})
          .filter(([, v]) => v)
          .map(([k]) => k),
        aplicarFuncao: state.aplicarFuncao === true,
      };
      if (state.roleId != null && Number(state.roleId) > 0) {
        decision.id_collaborator_role = Number(state.roleId);
      }
      colaboradores.push(decision);
    }

    const veiculos: UnifiedVeiculoDecision[] = [];
    for (const [lineStr, state] of Object.entries(this.veicDecisions())) {
      const linha = Number(lineStr);
      if (!state.include) {
        veiculos.push({ linha, aplicar: false });
        continue;
      }
      veiculos.push({
        linha,
        aplicar: true,
        campos: Object.entries(state.campos)
          .filter(([, v]) => v)
          .map(([k]) => k),
      });
    }

    this.busy.set(true);
    this.importing.set(true);
    this.tokenConsumed.set(false);
    if (!this.shouldAutoConfirm()) {
      this.step.set('result');
    }

    const confirm$ = this.apiAdapter
      ? this.apiAdapter.confirm(prev.previewToken, { colaboradores, veiculos })
      : this.patrimonialService.bulkImportConfirm(
          this.serviceAccessId!,
          prev.previewToken,
          { colaboradores, veiculos },
          { notify_approvers: this.notifyApprovers },
        );

    confirm$.subscribe({
      next: (res) => {
        this.result.set(res);
        this.busy.set(false);
        this.importing.set(false);
        this.completed.emit({ roleProposals: this.lastRoleProposals });
        this.notification.success('Importação concluída.');
        if (this.shouldAutoConfirm()) {
          const previewSnap = this.preview();
          const hasErrors =
            !!previewSnap &&
            (previewSnap.colaboradores.some((r) => r.cadastro === 'erro') ||
              previewSnap.veiculos.some((r) => r.cadastro === 'erro'));
          if (!hasErrors) {
            this.issues.emit({ colaboradores: [], veiculos: [] });
          }
          this.reset();
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.importing.set(false);
        const code = err?.error?.code;
        if (code === 'PREVIEW_TOKEN_CONSUMIDO' || err?.status === 409) {
          this.tokenConsumed.set(true);
          this.notification.info('Essa importação já foi concluída.');
          this.completed.emit({ roleProposals: this.lastRoleProposals });
          if (this.shouldAutoConfirm()) {
            this.reset();
          }
          return;
        }
        if (this.shouldAutoConfirm()) {
          this.step.set('upload');
          this.uploadError.set(
            (typeof err?.error === 'object' && err?.error?.message) ||
              'Falha ao importar a planilha.',
          );
        } else {
          this.step.set('review');
        }
        this.notification.notifyHttpError(err, 'Falha ao confirmar importação.');
      },
    });
  }
}
