import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService, hasPermission } from '../../core/services/auth.service';
import {
  BraceletKind,
  BraceletType,
  EventAccreditationFilterCounts,
  EventAccreditationItem,
  EventAccreditationListSituation,
  EventAccreditationListSort,
  EventAccreditationService,
  formatDateBr,
  kindLabel,
} from '../../services/event-accreditation.service';
import { ActionBtnComponent } from '../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../shared/actions/action-dropdown-item.directive';
import {
  BraceletChipComponent,
  BraceletVisualPickerComponent,
  DEFAULT_BRACELET_COLOR,
  DEFAULT_BRACELET_ICON,
  normalizeBraceletColor,
  normalizeBraceletIcon,
} from '../../shared/bracelet-chip';
import { EventKindBadgeComponent } from './event-kind-badge.component';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function emptyCounts(): EventAccreditationFilterCounts {
  return { todos: 0, abertos: 0, encerrados: 0 };
}

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtDay(value?: string | null): string {
  const dt = parseDay(value);
  if (!dt) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function fmtDateTimeShort(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const tm = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dd} ${tm}`;
}

@Component({
  selector: 'app-event-accreditation-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    EventKindBadgeComponent,
    BraceletChipComponent,
    BraceletVisualPickerComponent,
  ],
  template: `
    <div class="eal">
      <div class="eal-toolbar">
        <div class="eal-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="11" cy="11" r="7"/>
            <path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            type="search"
            placeholder="Buscar por evento"
            aria-label="Buscar por evento"
            [ngModel]="filterName()"
            (ngModelChange)="onSearch($event)"
          />
        </div>

        <div class="eal-seg" role="group" aria-label="Filtrar por situação">
          <button type="button" [attr.aria-pressed]="situation() === 'todos'" (click)="setSituation('todos')">
            Todos <span>{{ filterCounts().todos }}</span>
          </button>
          <button type="button" [attr.aria-pressed]="situation() === 'abertos'" (click)="setSituation('abertos')">
            Inscrição aberta <span>{{ filterCounts().abertos }}</span>
          </button>
          <button type="button" [attr.aria-pressed]="situation() === 'encerrados'" (click)="setSituation('encerrados')">
            Encerrados <span>{{ filterCounts().encerrados }}</span>
          </button>
        </div>

        @if (canEdit()) {
          <button type="button" class="eal-btn eal-push" (click)="openBracelets()">Tipos de pulseira</button>
        }
        @if (canCreate()) {
          <button type="button" class="eal-btn eal-btn--primary" [class.eal-push]="!canEdit()" (click)="novo()">
            Novo credenciamento
          </button>
        }
      </div>

      <div class="eal-tablecard">
        <table>
          <thead>
            <tr>
              <th [attr.aria-sort]="ariaSort('nome')">
                <button class="eal-th" type="button" (click)="toggleSort('nome')">
                  Evento
                  <svg class="eal-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>
                </button>
              </th>
              <th><div class="eal-th">Tipo</div></th>
              <th [attr.aria-sort]="ariaSort('data')">
                <button class="eal-th" type="button" (click)="toggleSort('data')">
                  Data do evento
                  <svg class="eal-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>
                </button>
              </th>
              <th [attr.aria-sort]="ariaSort('prazo')">
                <button class="eal-th" type="button" (click)="toggleSort('prazo')">
                  Inscrições
                  <svg class="eal-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>
                </button>
              </th>
              <th><div class="eal-th">Indicações</div></th>
              <th><div class="eal-th">Situação</div></th>
              <th class="eal-right"><div class="eal-th">Ações</div></th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr>
                <td colspan="7"><div class="eal-vazio">Carregando…</div></td>
              </tr>
            } @else if (items().length === 0) {
              <tr>
                <td colspan="7">
                  <div class="eal-vazio">
                    <b>Nenhum evento encontrado</b>
                    Ajuste a busca ou volte para “Todos”.
                  </div>
                </td>
              </tr>
            } @else {
              @for (e of items(); track e.id_event_accreditation) {
                <tr (click)="abrir(e)">
                  <td class="eal-c-evento">
                    <div class="eal-evento">
                      @if (coverSrc(e); as src) {
                        <div class="eal-thumb"><img [src]="src" alt=""></div>
                      } @else {
                        <div class="eal-thumb eal-thumb--none" aria-hidden="true">sem arte</div>
                      }
                      <div>
                        <div class="eal-evento__nome">
                          <span class="eal-rowlink">{{ e.name }}</span>
                          @if (e.internal_enabled) {
                            <span class="eal-chip eal-chip--ad eal-chip--plain">Colaborador Interno</span>
                          }
                        </div>
                        <div class="eal-evento__sub">
                          {{ e.companies_total ?? 0 }} empresa(s) convidada(s)
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-k="Tipo">
                    <span class="eal-chip eal-chip--plain" [ngClass]="kindChipClass(e.event_kind)">
                      {{ kindLabel(e.event_kind) }}
                    </span>
                  </td>
                  <td data-k="Data do evento">
                    <div class="eal-data">
                      {{ eventPeriod(e).principal }}
                      <small>{{ eventPeriod(e).legenda }}</small>
                    </div>
                  </td>
                  <td data-k="Inscrições">
                    <div class="eal-prazo__v">
                      {{ fmtDateTimeShort(e.inscription_start) }}
                      <span class="eal-seta">→</span>
                      {{ fmtDateTimeShort(e.inscription_end) }}
                    </div>
                    <div class="eal-prazo__r" [ngClass]="prazoInfo(e).cls">{{ prazoInfo(e).txt }}</div>
                    <div class="eal-bar"><i [class.eal-low]="prazoInfo(e).cls !== 'off'" [style.width.%]="prazoInfo(e).pct"></i></div>
                  </td>
                  <td data-k="Indicações">
                    <div class="eal-prog">
                      {{ e.companies_completed ?? 0 }} de {{ e.companies_total ?? 0 }}
                      <small>empresas concluíram</small>
                    </div>
                    <div class="eal-bar"><i [style.width.%]="indicationPct(e)"></i></div>
                  </td>
                  <td data-k="Situação">
                    <span class="eal-chip" [ngClass]="statusChip(e).cls">{{ statusChip(e).txt }}</span>
                    @if (e.pending_count) {
                      <div class="eal-evento__sub">{{ e.pending_count }} na sua fila</div>
                    }
                  </td>
                  <td class="eal-acoes" (click)="$event.stopPropagation()">
                    <app-action-menu>
                      <app-action-btn icon="grid" title="Gerenciar" variant="neutral" (action)="abrir(e)" />
                      @if (e.can_toggle_active) {
                        <app-action-dropdown>
                          <button appActionDropdownItem type="button" (click)="alterarStatus(e)">
                            {{ e.ativo === false ? 'Ativar' : 'Desativar' }}
                          </button>
                        </app-action-dropdown>
                      }
                    </app-action-menu>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <div class="eal-foot">
          <p>
            Mostrando {{ items().length }} de {{ pagination().total }} evento(s)
            · página {{ pagination().page }} de {{ pagination().totalPages }}
          </p>
          <div>
            <button
              type="button"
              class="eal-btn eal-btn--sm"
              [disabled]="pagination().page <= 1 || loading()"
              (click)="irPagina(pagination().page - 1)"
            >Anterior</button>
            <button
              type="button"
              class="eal-btn eal-btn--sm"
              [disabled]="pagination().page >= pagination().totalPages || loading()"
              (click)="irPagina(pagination().page + 1)"
            >Próxima</button>
          </div>
        </div>
      </div>
    </div>

    @if (showBracelets()) {
      <div class="eal-modal-bg" (click)="showBracelets.set(false)">
        <div class="eal-modal" (click)="$event.stopPropagation()">
          <div class="eal-modal__head">
            <div>
              <h3>Tipos de pulseira</h3>
              <p>Cadastre o nome, o tipo de evento e a cor impressa na pulseira.</p>
            </div>
            <button type="button" class="eal-btn eal-btn--sm" (click)="showBracelets.set(false)">Fechar</button>
          </div>
          <div class="eal-modal__body">
            <div class="eal-modal__fields">
              <label class="eal-modal__field" for="eal-br-name">
                <span>Nome</span>
                <input
                  id="eal-br-name"
                  [(ngModel)]="newBraceletName"
                  name="newBraceletName"
                  maxlength="100"
                  placeholder="Ex.: Acesso ao Campo"
                />
              </label>
              <label class="eal-modal__field" for="eal-br-kind">
                <span>Tipo de evento</span>
                <select id="eal-br-kind" [(ngModel)]="newBraceletKind" name="newBraceletKind">
                  <option value="SHOWDAY">Showday</option>
                  <option value="JOGO">Jogo</option>
                  <option value="BOTH">Showday e Jogo</option>
                </select>
              </label>
            </div>
            <app-bracelet-visual-picker
              class="eal-modal__picker"
              [name]="newBraceletName"
              [kind]="newBraceletKind"
              [color]="newBraceletColor"
              (colorChange)="newBraceletColor = $event"
            />
            <div class="eal-modal__form-actions">
              @if (editingBracelet()) {
                <button type="button" class="eal-btn eal-btn--sm" [disabled]="savingBracelet()" (click)="cancelEditBracelet()">
                  Cancelar
                </button>
              }
              <button type="button" class="eal-btn eal-btn--primary" [disabled]="savingBracelet()" (click)="salvarPulseira()">
                Salvar tipo
              </button>
            </div>
            <div class="eal-modal__cadastrados">
              <h4>Cadastrados</h4>
              <span>{{ activeBraceletCount() }} tipos ativos</span>
            </div>
            <table class="eal-modal__table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th class="eal-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                @for (t of bracelets(); track t.id_bracelet_type) {
                  <tr>
                    <td>
                      <app-bracelet-chip [name]="t.name" [color]="t.color" />
                    </td>
                    <td><app-event-kind-badge [kind]="t.event_kind" [compact]="true" /></td>
                    <td>{{ t.ativo ? 'Ativo' : 'Inativo' }}</td>
                    <td class="eal-right">
                      <button type="button" class="eal-link" (click)="startEditBracelet(t)">Editar</button>
                      <button type="button" class="eal-link" (click)="toggleBracelet(t)">
                        {{ t.ativo ? 'Desativar' : 'Ativar' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --eal-purple: var(--brand);
        --eal-purple-900: var(--purple-900, #420465);
        --eal-green-200: var(--success-border, #c9e2bf);
        --eal-green-300: var(--green-300, #a7d296);
        --eal-bg: var(--app-bg, #f6f4f9);
        --eal-surface: #fff;
        --eal-line: var(--app-border, #e9e4f0);
        --eal-line-soft: #f1ecf7;
        --eal-ink: var(--text-primary, #1e002f);
        --eal-muted: var(--text-muted, #6b5b78);
        --eal-amber-bg: var(--warning-soft-bg, #fdf1dc);
        --eal-amber-ink: var(--warning, #8a5300);
        --eal-r-card: 16px;
        --eal-r-ctl: 10px;
      }
      .eal {
        width: 100%;
        color: var(--eal-ink);
        font-family: var(--font-body);
      }
      .eal :focus-visible {
        outline: 2px solid var(--eal-purple);
        outline-offset: 2px;
        border-radius: 8px;
      }
      .eal-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .eal-search {
        position: relative;
        flex: 1 1 260px;
        max-width: 340px;
      }
      .eal-search input {
        width: 100%;
        height: 40px;
        padding: 0 14px 0 38px;
        border-radius: var(--eal-r-ctl);
        border: 1px solid var(--eal-line);
        background: var(--eal-surface);
        font-family: var(--font-body);
        font-size: 13.5px;
        color: var(--eal-ink);
      }
      .eal-search input::placeholder {
        color: var(--eal-muted);
      }
      .eal-search svg {
        position: absolute;
        left: 13px;
        top: 11px;
        color: var(--eal-muted);
      }
      .eal-seg {
        display: flex;
        background: var(--eal-surface);
        border: 1px solid var(--eal-line);
        border-radius: var(--eal-r-ctl);
        padding: 3px;
      }
      .eal-seg button {
        height: 32px;
        padding: 0 12px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        color: var(--eal-muted);
        cursor: pointer;
      }
      .eal-seg button[aria-pressed='true'] {
        background: #f3e4fd;
        color: var(--eal-purple-900);
      }
      .eal-seg button span {
        font-variant-numeric: tabular-nums;
        opacity: 0.65;
        margin-left: 5px;
      }
      .eal-btn {
        height: 40px;
        padding: 0 16px;
        border-radius: var(--eal-r-ctl);
        border: 1px solid var(--eal-line);
        background: var(--eal-surface);
        color: var(--eal-ink);
        font-family: var(--font-body);
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .eal-btn:hover {
        border-color: #d6c9e6;
      }
      .eal-btn--primary {
        background: var(--brand);
        border-color: var(--brand);
        color: #fff;
      }
      .eal-btn--primary:hover {
        background: var(--brand-hover);
        border-color: var(--brand-hover);
      }
      .eal-btn--sm {
        height: 32px;
        padding: 0 12px;
        font-size: 12.5px;
      }
      .eal-btn[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .eal-push {
        margin-left: auto;
      }
      .eal-tablecard {
        background: var(--eal-surface);
        border: 1px solid var(--eal-line);
        border-radius: var(--eal-r-card);
        overflow: hidden;
      }
      .eal table {
        width: 100%;
        border-collapse: collapse;
      }
      .eal thead th {
        text-align: left;
        background: #fbf9fd;
        border-bottom: 1px solid var(--eal-line);
        padding: 0;
        font-size: 12px;
        color: var(--eal-muted);
        font-weight: 600;
        white-space: nowrap;
      }
      .eal-th {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 12px 18px;
        width: 100%;
      }
      button.eal-th {
        background: none;
        border: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
        font-weight: 600;
      }
      button.eal-th:hover {
        color: var(--eal-ink);
      }
      .eal-caret {
        opacity: 0;
        transition: opacity 0.12s;
      }
      thead th[aria-sort] .eal-caret {
        opacity: 1;
        color: var(--eal-purple);
      }
      thead th[aria-sort='descending'] .eal-caret {
        transform: rotate(180deg);
      }
      th.eal-right .eal-th {
        justify-content: flex-end;
      }
      .eal tbody td {
        padding: 6px 18px;
        border-bottom: 1px solid var(--eal-line-soft);
        vertical-align: middle;
        font-size: 13.5px;
      }
      .eal tbody tr:last-child td {
        border-bottom: 0;
      }
      .eal-c-evento {
        padding-left: 10px;
      }
      .eal tbody tr {
        transition: background 0.12s;
      }
      .eal tbody tr:hover {
        background: #fbf9fd;
        cursor: pointer;
      }
      .eal tbody tr:hover .eal-rowlink {
        text-decoration: underline;
      }
      .eal-evento {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .eal-thumb {
        width: 104px;
        height: 78px;
        border-radius: 10px;
        overflow: hidden;
        background: #efe9f5;
        flex: 0 0 104px;
      }
      .eal-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .eal-thumb--none {
        display: grid;
        place-items: center;
        color: var(--eal-muted);
        font-size: 12px;
        font-weight: 600;
      }
      .eal-evento__nome {
        font-weight: 600;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
        line-height: 1.2;
      }
      .eal-evento__sub {
        font-size: 12px;
        color: var(--eal-muted);
        margin-top: 3px;
      }
      .eal-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .eal-chip::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        flex: 0 0 6px;
      }
      .eal-chip--plain::before {
        display: none;
      }
      .eal-chip--tipo-show {
        background: #f3e4fd;
        color: var(--eal-purple-900);
      }
      .eal-chip--tipo-jogo {
        background: var(--eal-green-200);
        color: #24401a;
      }
      .eal-chip--tipo-outro {
        background: #eaf0f8;
        color: #254368;
      }
      .eal-chip--ad {
        background: var(--eal-bg);
        border: 1px solid var(--eal-line);
        color: var(--eal-muted);
        font-weight: 500;
        height: 22px;
        font-size: 11.5px;
      }
      .eal-chip--wait {
        background: var(--eal-amber-bg);
        color: var(--eal-amber-ink);
      }
      .eal-chip--idle {
        background: #f2eff6;
        color: var(--eal-muted);
      }
      .eal-chip--ok {
        background: var(--eal-green-200);
        color: #24401a;
      }
      .eal-chip--done {
        background: #f2eff6;
        color: var(--eal-muted);
      }
      .eal-data {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
      }
      .eal-data small {
        display: block;
        font-weight: 500;
        color: var(--eal-muted);
        font-size: 12px;
        margin-top: 2px;
        font-variant-numeric: normal;
      }
      .eal-prazo__v {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
      }
      .eal-prazo__r {
        font-size: 12px;
        margin-top: 3px;
        color: var(--eal-muted);
        font-weight: 500;
      }
      .eal-prazo__r.urg {
        color: var(--eal-amber-ink);
      }
      .eal-prazo__r.off {
        color: #8c2a2a;
      }
      .eal-prazo__r.soon {
        color: var(--eal-purple-900);
      }
      .eal-seta {
        color: var(--eal-muted);
        font-weight: 500;
        padding: 0 2px;
      }
      .eal-bar {
        height: 5px;
        border-radius: 3px;
        background: #efe9f5;
        overflow: hidden;
        margin-top: 7px;
        width: 172px;
        max-width: 100%;
      }
      .eal-bar i {
        display: block;
        height: 100%;
        border-radius: 3px;
        background: var(--eal-green-300);
      }
      .eal-bar i.eal-low {
        background: var(--eal-purple);
      }
      .eal-prog {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .eal-prog small {
        display: block;
        font-weight: 500;
        color: var(--eal-muted);
        font-size: 12px;
        margin-top: 2px;
      }
      .eal-acoes {
        text-align: right;
        white-space: nowrap;
      }
      .eal-acoes .action-menu {
        justify-content: flex-end;
      }
      .eal-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 18px;
        border-top: 1px solid var(--eal-line);
        background: #fbf9fd;
        flex-wrap: wrap;
      }
      .eal-foot p {
        margin: 0;
        font-size: 12.5px;
        color: var(--eal-muted);
        font-variant-numeric: tabular-nums;
      }
      .eal-vazio {
        padding: 52px 20px;
        text-align: center;
        color: var(--eal-muted);
      }
      .eal-vazio b {
        display: block;
        font-family: var(--font-display);
        color: var(--eal-ink);
        font-size: 15px;
        margin-bottom: 4px;
      }
      .eal-modal-bg {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(30, 0, 47, 0.4);
        padding: 16px;
      }
      .eal-modal {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 16px 48px rgba(30, 0, 47, 0.16);
        width: 100%;
        max-width: 52rem;
        max-height: 90vh;
        overflow: auto;
      }
      .eal-modal__head {
        padding: 22px 22px 16px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .eal-modal__head h3 {
        margin: 0;
        font-family: var(--font-display);
        font-size: 20px;
        color: var(--eal-purple-900);
      }
      .eal-modal__head p {
        margin: 6px 0 0;
        font-size: 13px;
        color: var(--eal-muted);
      }
      .eal-modal__body {
        padding: 0 22px 22px;
      }
      .eal-modal__fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
      }
      .eal-modal__field {
        display: grid;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--eal-muted);
      }
      .eal-modal__field input,
      .eal-modal__field select {
        height: 42px;
        border-radius: var(--eal-r-ctl);
        border: 1px solid var(--eal-line);
        padding: 0 12px;
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        color: var(--eal-ink);
      }
      .eal-modal__form-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin: 16px 0 22px;
      }
      .eal-modal__picker {
        display: block;
      }
      .eal-modal__cadastrados {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .eal-modal__cadastrados h4 {
        margin: 0;
        font-family: var(--font-display);
        font-size: 15px;
        color: var(--eal-ink);
      }
      .eal-modal__cadastrados span {
        font-size: 12px;
        color: var(--eal-muted);
      }
      .eal-modal__table {
        width: 100%;
        font-size: 13.5px;
      }
      .eal-modal__table th {
        text-align: left;
        font-size: 12px;
        color: var(--eal-muted);
        padding: 8px 0;
      }
      .eal-modal__table td {
        padding: 10px 0;
        border-top: 1px solid var(--eal-line-soft);
      }
      .eal-link + .eal-link {
        margin-left: 10px;
      }
      .eal-link {
        background: none;
        border: 0;
        color: var(--eal-purple-900);
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
      }
      @media (max-width: 920px) {
        .eal thead {
          display: none;
        }
        .eal tbody tr {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px 14px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--eal-line-soft);
        }
        .eal tbody td {
          border: 0;
          padding: 0;
          display: block;
        }
        .eal tbody td[data-k]::before {
          content: attr(data-k);
          display: block;
          font-size: 11.5px;
          color: var(--eal-muted);
          font-weight: 600;
          margin-bottom: 3px;
        }
        .eal-c-evento {
          grid-column: 1 / -1;
        }
        .eal-acoes {
          grid-column: 1 / -1;
          text-align: left;
          padding-top: 4px;
        }
        .eal-bar {
          width: 100%;
        }
        .eal-evento {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }
        .eal-thumb {
          width: 100%;
          height: auto;
          aspect-ratio: 16 / 9;
          flex-basis: auto;
        }
        .eal-modal__fields {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class EventAccreditationListComponent implements OnInit {
  private readonly service = inject(EventAccreditationService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly items = signal<EventAccreditationItem[]>([]);
  readonly coverThumbs = signal<Record<number, string>>({});
  readonly loading = signal(false);
  readonly showBracelets = signal(false);
  readonly bracelets = signal<BraceletType[]>([]);
  readonly savingBracelet = signal(false);
  readonly editingBracelet = signal<BraceletType | null>(null);
  readonly pagination = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  readonly filterName = signal('');
  readonly situation = signal<EventAccreditationListSituation>('todos');
  readonly sortField = signal<EventAccreditationListSort>('nome');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly filterCounts = signal<EventAccreditationFilterCounts>(emptyCounts());
  readonly now = signal(Date.now());

  newBraceletName = '';
  newBraceletKind: BraceletKind = 'SHOWDAY';
  newBraceletIcon: string = DEFAULT_BRACELET_ICON;
  newBraceletColor: string = DEFAULT_BRACELET_COLOR;
  private filterTimer: ReturnType<typeof setTimeout> | null = null;

  readonly kindLabel = kindLabel;
  readonly fmtDateTimeShort = fmtDateTimeShort;
  readonly canCreate = signal(false);
  readonly canEdit = signal(false);

  async ngOnInit(): Promise<void> {
    const user = await this.auth.getCurrentUser();
    this.canCreate.set(
      hasPermission(user, 'event_accreditation', 'create') &&
        !user?.requires_company &&
        !user?.profile?.requires_company,
    );
    this.canEdit.set(hasPermission(user, 'event_accreditation', 'edit'));
    this.carregar();
  }

  carregar(): void {
    this.loading.set(true);
    this.service
      .list(this.pagination().page, this.pagination().limit, {
        name: this.filterName().trim() || undefined,
        situation: this.situation(),
        sort: this.sortField(),
        dir: this.sortDir(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.pagination.set(res.pagination);
          this.filterCounts.set(this.normalizeFilterCounts(res.filter_counts, res.pagination?.total));
          this.loading.set(false);
          this.loadMissingCovers(res.items);
        },
        error: (err) => {
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar credenciamentos.');
        },
      });
  }

  private normalizeFilterCounts(
    counts: EventAccreditationFilterCounts | undefined,
    total?: number,
  ): EventAccreditationFilterCounts {
    const next = {
      todos: Number(counts?.todos || 0),
      abertos: Number(counts?.abertos || 0),
      encerrados: Number(counts?.encerrados || 0),
    };
    if (!next.todos && Number(total) > 0) next.todos = Number(total);
    return next;
  }

  coverSrc(e: EventAccreditationItem): string | null {
    return e.cover_thumb || this.coverThumbs()[e.id_event_accreditation] || null;
  }

  private loadMissingCovers(items: EventAccreditationItem[]): void {
    for (const e of items) {
      if (!e.cover || e.cover_thumb || this.coverThumbs()[e.id_event_accreditation]) continue;
      this.service.getCoverBlob(e.cover).subscribe({
        next: (url) => this.coverThumbs.update((map) => ({ ...map, [e.id_event_accreditation]: url })),
        error: () => {},
      });
    }
  }

  onSearch(value: string): void {
    this.filterName.set(value);
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.pagination.update((p) => ({ ...p, page: 1 }));
      this.carregar();
    }, 300);
  }

  setSituation(value: EventAccreditationListSituation): void {
    if (this.situation() === value) return;
    this.situation.set(value);
    this.pagination.update((p) => ({ ...p, page: 1 }));
    this.carregar();
  }

  toggleSort(field: EventAccreditationListSort): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
    this.carregar();
  }

  ariaSort(field: EventAccreditationListSort): 'ascending' | 'descending' | null {
    if (this.sortField() !== field) return null;
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  irPagina(page: number): void {
    this.pagination.update((p) => ({ ...p, page }));
    this.carregar();
  }

  novo(): void {
    void this.router.navigate(['/admin/credenciamento-eventos/novo']);
  }

  abrir(item: EventAccreditationItem): void {
    void this.router.navigate(['/admin/credenciamento-eventos', item.id_event_accreditation]);
  }

  alterarStatus(item: EventAccreditationItem): void {
    this.service.patchStatus(item.id_event_accreditation, item.ativo === false).subscribe({
      next: () => {
        this.notification.success(item.ativo === false ? 'Credenciamento ativado.' : 'Credenciamento desativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }

  activeBraceletCount(): number {
    return this.bracelets().filter((t) => t.ativo).length;
  }

  openBracelets(): void {
    this.showBracelets.set(true);
    this.service.listBraceletTypes({ includeInactive: true }).subscribe({
      next: (res) => this.bracelets.set(res.types),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar pulseiras.'),
    });
  }

  startEditBracelet(type: BraceletType): void {
    this.editingBracelet.set(type);
    this.newBraceletName = type.name;
    this.newBraceletKind = type.event_kind;
    this.newBraceletIcon = normalizeBraceletIcon(type.icon);
    this.newBraceletColor = normalizeBraceletColor(type.color);
  }

  cancelEditBracelet(): void {
    this.editingBracelet.set(null);
    this.newBraceletName = '';
    this.newBraceletKind = 'SHOWDAY';
    this.newBraceletIcon = DEFAULT_BRACELET_ICON;
    this.newBraceletColor = DEFAULT_BRACELET_COLOR;
  }

  salvarPulseira(): void {
    const name = this.newBraceletName.trim();
    if (!name) {
      this.notification.error('Informe o nome da pulseira.');
      return;
    }
    const payload = {
      name,
      event_kind: this.newBraceletKind,
      icon: this.newBraceletIcon,
      color: this.newBraceletColor,
    };
    this.savingBracelet.set(true);
    const editing = this.editingBracelet();
    const req = editing
      ? this.service.updateBraceletType(editing.id_bracelet_type, payload)
      : this.service.createBraceletType(payload);
    req.subscribe({
      next: () => {
        this.savingBracelet.set(false);
        this.cancelEditBracelet();
        this.notification.success(editing ? 'Tipo de pulseira atualizado.' : 'Tipo de pulseira cadastrado.');
        this.openBracelets();
      },
      error: (err) => {
        this.savingBracelet.set(false);
        this.notification.notifyHttpError(err, editing ? 'Falha ao atualizar pulseira.' : 'Falha ao cadastrar pulseira.');
      },
    });
  }

  toggleBracelet(type: BraceletType): void {
    this.service.updateBraceletType(type.id_bracelet_type, { ativo: !type.ativo }).subscribe({
      next: () => this.openBracelets(),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao atualizar pulseira.'),
    });
  }

  kindChipClass(kind?: string | null): string {
    if (kind === 'JOGO') return 'eal-chip--tipo-jogo';
    if (kind === 'SHOWDAY') return 'eal-chip--tipo-show';
    return 'eal-chip--tipo-outro';
  }

  eventPeriod(e: EventAccreditationItem): { principal: string; legenda: string } {
    const dates = (e.event_dates?.length ? e.event_dates : [e.start, e.end]).filter(Boolean) as string[];
    const unique = [...new Set(dates.map((d) => String(d).slice(0, 10)))];
    const first = parseDay(unique[0]);
    const last = parseDay(unique[unique.length - 1]);
    if (!first) return { principal: formatDateBr(e.start), legenda: '' };
    if (unique.length <= 1 || !last || unique[0] === unique[unique.length - 1]) {
      return {
        principal: `${fmtDay(unique[0])}/${first.getFullYear()}`,
        legenda: WEEKDAYS[first.getDay()] || '',
      };
    }
    const days = Math.round((last.getTime() - first.getTime()) / 864e5) + 1;
    return {
      principal: `${fmtDay(unique[0])} – ${fmtDay(unique[unique.length - 1])}/${last.getFullYear()}`,
      legenda: `${days} dias de operação`,
    };
  }

  prazoInfo(e: EventAccreditationItem): { txt: string; cls: string; pct: number } {
    this.now();
    const start = e.inscription_start ? new Date(e.inscription_start).getTime() : 0;
    const end = e.inscription_end ? new Date(e.inscription_end).getTime() : 0;
    const now = Date.now();
    if (!end) return { txt: '—', cls: '', pct: 0 };
    const ms = end - now;
    const dias = Math.ceil(ms / 864e5);
    const horas = Math.ceil(ms / 36e5);
    if (start && now < start) {
      const faltam = Math.ceil((start - now) / 864e5);
      return { txt: `abre em ${faltam} dia(s)`, cls: 'soon', pct: 0 };
    }
    if (ms <= 0) {
      return { txt: `encerrada há ${Math.abs(dias)} dia(s)`, cls: 'off', pct: 100 };
    }
    const pct =
      start && end > start ? Math.min(100, Math.max(4, Math.round(((now - start) / (end - start)) * 100))) : 0;
    if (horas <= 24) return { txt: `aberta · faltam ${horas}h`, cls: 'urg', pct };
    return { txt: `aberta · faltam ${dias} dia(s)`, cls: '', pct };
  }

  indicationPct(e: EventAccreditationItem): number {
    const total = e.companies_total || 0;
    if (!total) return 0;
    return Math.round(((e.companies_completed || 0) / total) * 100);
  }

  statusChip(e: EventAccreditationItem): { cls: string; txt: string } {
    this.now();
    const st = Number(e.id_access_status);
    const ended = e.inscription_end ? new Date(e.inscription_end).getTime() <= Date.now() : false;
    if (e.ativo === false || st === 4 || st === 5) {
      return { cls: 'eal-chip--done', txt: 'Encerrado' };
    }
    if (st === 2) return { cls: 'eal-chip--wait', txt: 'Aguardando aprovação' };
    if (st === 3 && !ended) return { cls: 'eal-chip--ok', txt: 'Tudo aprovado' };
    if (ended) return { cls: 'eal-chip--done', txt: 'Encerrado' };
    if (st === 1) return { cls: 'eal-chip--idle', txt: 'Aguardando empresas' };
    const raw = (e.access_status_description || '').trim();
    return { cls: 'eal-chip--idle', txt: raw || '—' };
  }
}
