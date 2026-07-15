import { Component, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import {
  PatrimonialService,
  ServiceAccessCollaborator,
  ServiceAccessItem,
  ServiceAccessVehicle,
} from '../../services/patrimonial.service';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
} from '../../services/collaborator.service';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { ApprovalService, EligibleSector } from '../../services/approval.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService, AuthUser, isSuperAdmin } from '../../core/services/auth.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import { ServiceAccessBulkImportWizardComponent } from './service-access-bulk-import-wizard.component';

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

type ModalMode = 'search' | 'create';

@Component({
  selector: 'app-service-access-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ModalComponent, ServiceAccessBulkImportWizardComponent],
  styles: [
    `
      :host {
        --cred-ink: #14182b;
        --cred-ink-2: #5a6178;
        --cred-ink-3: #8b91a7;
        --cred-line: #e6e8f0;
        --cred-ok: #16a34a;
        --cred-ok-soft: #e7f6ec;
        --cred-warn-soft: #fdf3e3;
        --cred-warn-ink: #9a6a12;
        --cred-off: #64748b;
        --cred-off-soft: #eef0f4;
        --cred-field-h: 40px;
      }

      .cred-back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--wtorre, var(--color-primary));
        font-weight: 600;
        font-size: 14px;
        text-decoration: none;
        margin-bottom: 18px;
        transition: opacity 0.15s ease;
      }
      .cred-back:hover {
        opacity: 0.7;
      }
      .cred-back svg {
        width: 16px;
        height: 16px;
      }

      .cred-header {
        background: var(--color-bg-surface, #fff);
        border: 1px solid var(--cred-line);
        border-radius: 16px;
        padding: 24px 26px;
        box-shadow:
          0 1px 2px rgba(20, 24, 43, 0.04),
          0 8px 24px rgba(20, 24, 43, 0.04);
        margin-bottom: 1.25rem;
      }

      .cred-header__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
      }

      .cred-titlerow {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .cred-title {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 26px;
        line-height: 1.15;
        letter-spacing: -0.01em;
        margin: 0;
        color: var(--cred-ink);
      }

      .chip {
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
      .chip__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .chip--warn {
        background: var(--cred-warn-soft);
        color: var(--cred-warn-ink);
      }
      .chip--ok {
        background: var(--cred-ok-soft);
        color: var(--cred-ok);
      }
      .chip--danger {
        background: #fff1f2;
        color: #e11d48;
      }
      .chip--muted {
        background: var(--cred-off-soft);
        color: var(--cred-off);
      }

      .cred-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 18px;
        margin-top: 16px;
      }
      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 14px;
        color: var(--cred-ink-2);
      }
      .meta-item svg {
        width: 16px;
        height: 16px;
        color: var(--cred-ink-3);
        flex: none;
      }
      .meta-item strong {
        color: var(--cred-ink);
        font-weight: 600;
      }
      .meta-sep {
        width: 1px;
        height: 16px;
        background: var(--cred-line);
      }
      .cred-note {
        margin: 12px 0 0;
        font-size: 13.5px;
        color: var(--cred-ink-2);
      }

      .cred-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 14px;
        flex: none;
      }

      .cred-toggle {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: var(--cred-field-h);
        padding: 0 6px 0 14px;
        border: 1px solid var(--cred-line);
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
        user-select: none;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .cred-toggle:hover {
        border-color: #d3d7e4;
      }
      .cred-toggle:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .cred-toggle__label {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--cred-ink);
        min-width: 92px;
        text-align: right;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        justify-content: flex-end;
      }
      .cred-toggle__label .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--cred-off);
        transition: background 0.15s ease;
      }
      .cred-toggle__switch {
        position: relative;
        width: 42px;
        height: 24px;
        border-radius: 999px;
        background: #cbd0dd;
        transition: background 0.18s ease;
        flex: none;
      }
      .cred-toggle__switch::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        transition: transform 0.18s ease;
      }
      .cred-toggle.is-on {
        background: var(--cred-ok-soft);
        border-color: transparent;
      }
      .cred-toggle.is-on .cred-toggle__switch {
        background: var(--cred-ok);
      }
      .cred-toggle.is-on .cred-toggle__switch::after {
        transform: translateX(18px);
      }
      .cred-toggle.is-on .cred-toggle__label {
        color: var(--cred-ok);
      }
      .cred-toggle.is-on .cred-toggle__label .dot {
        background: var(--cred-ok);
      }

      .cred-btn-row {
        display: flex;
        gap: 10px;
      }
      .cred-btn {
        height: var(--cred-field-h);
        padding: 0 20px;
        border-radius: 999px;
        font-family: var(--font-body);
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        border: 1px solid transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.05s ease;
        white-space: nowrap;
      }
      .cred-btn:active {
        transform: translateY(1px);
      }
      .cred-btn--ghost {
        background: #fff;
        border-color: var(--cred-line);
        color: var(--cred-ink);
      }
      .cred-btn--ghost:hover {
        border-color: #d3d7e4;
        background: #fafbfe;
      }
      .cred-btn--primary {
        background: var(--wtorre, var(--color-primary));
        color: #fff;
      }
      .cred-btn--primary:hover {
        background: var(--wtorre-hover, var(--color-primary-dark));
      }

      .cred-header.is-disabled .cred-titlerow .cred-title,
      .cred-header.is-disabled .cred-meta,
      .cred-header.is-disabled .cred-note {
        opacity: 0.55;
      }
      .cred-header.is-disabled .cred-btn--primary {
        background: var(--cred-off-soft);
        color: var(--cred-ink-3);
        pointer-events: none;
      }

      @media (max-width: 720px) {
        .cred-header__top {
          flex-direction: column;
          align-items: stretch;
        }
        .cred-actions {
          align-items: stretch;
        }
        .cred-toggle {
          justify-content: space-between;
        }
        .cred-toggle__label {
          min-width: 0;
        }
        .cred-btn-row {
          flex-direction: column;
        }
        .cred-btn {
          width: 100%;
        }
        .meta-sep {
          display: none;
        }
      }
    `,
  ],
  template: `
    <div class="w-full">
      <a routerLink="/admin/acessos-servico" class="cred-back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Voltar para lista
      </a>

      <ng-container *ngIf="!loading() && service(); else loadingState">
        <div class="cred-header" [class.is-disabled]="!service()!.status">
          <div class="cred-header__top">
            <div class="cred-info">
              <div class="cred-titlerow">
                <h1 class="cred-title">{{ service()!.finalidade }}</h1>
                <span class="chip" [ngClass]="statusChipClass(service()!.id_access_status)">
                  <span class="chip__dot"></span>
                  {{ service()!.access_status_description }}
                </span>
              </div>

              <div class="cred-meta">
                <span class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {{ formatDateBr(service()!.start_date) }}
                  <span style="color: var(--cred-ink-3)">—</span>
                  {{ formatDateBr(service()!.end_date) }}
                </span>
                <span class="meta-sep"></span>
                <span class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h.01M14 17h.01" />
                  </svg>
                  <strong>{{ service()!.company_fancy_name || '—' }}</strong>
                </span>
                <span class="meta-sep"></span>
                <span class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 20V8a2 2 0 0 1 2-2h3l2-3h2l2 3h3a2 2 0 0 1 2 2v12" />
                    <path d="M3 20h18" />
                  </svg>
                  Setor: <strong>{{ service()!.setor_nome || service()!.requesting_department || '—' }}</strong>
                </span>
                <span class="meta-sep"></span>
                <span class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                  </svg>
                  Solicitante: <strong>{{ service()!.solicitante?.nome || '—' }}</strong>
                </span>
              </div>

              <p *ngIf="service()!.observacao" class="cred-note">
                Observação: {{ service()!.observacao }}
              </p>
            </div>

            <div class="cred-actions">
              <button
                type="button"
                class="cred-toggle"
                [class.is-on]="service()!.status"
                role="switch"
                [attr.aria-checked]="service()!.status"
                aria-label="Habilitação do acesso"
                [disabled]="togglingEnabled()"
                (click)="toggleEnabled()"
              >
                <span class="cred-toggle__label">
                  <span class="dot"></span>
                  {{ service()!.status ? 'Habilitado' : 'Desabilitado' }}
                </span>
                <span class="cred-toggle__switch"></span>
              </button>

              <div class="cred-btn-row">
                <button
                  *ngIf="service()!.id_access_status !== 3 && service()!.id_access_status !== 4"
                  type="button"
                  class="cred-btn cred-btn--ghost"
                  (click)="abrirModalEditar()"
                >
                  Editar
                </button>
                <button
                  *ngIf="service()!.id_access_status === 3 || service()!.id_access_status === 4"
                  type="button"
                  class="cred-btn cred-btn--ghost"
                  (click)="abrirModalPeriodo()"
                >
                  Ajustar período
                </button>
                <button type="button" class="cred-btn cred-btn--ghost" (click)="carregar()">
                  Atualizar
                </button>
                <button type="button" class="cred-btn cred-btn--ghost" (click)="abrirBulk()">
                  Upload XLSX
                </button>
                <ng-container *ngIf="canDecideWorkflow()">
                  <button
                    type="button"
                    class="cred-btn cred-btn--primary"
                    (click)="abrirDecisao('approve')"
                  >
                    Aprovar acesso
                  </button>
                  <button
                    type="button"
                    class="cred-btn cred-btn--ghost"
                    (click)="abrirDecisao('reject')"
                  >
                    Reprovar
                  </button>
                </ng-container>
              </div>
            </div>
          </div>
        </div>

        <div class="card-surface p-5 mb-4">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <h3 class="text-base font-bold text-slate-800 shrink-0">Colaboradores</h3>
            <span
              *ngIf="relationsDirty()"
              class="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
            >
              Alterações não salvas
            </span>
            <div class="flex flex-wrap items-center gap-2 ml-auto">
              <div class="relative w-56 max-w-full">
                <ng-container *ngIf="headerColabCandidate() as found; else headerColabSearch">
                  <div
                    class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div class="min-w-0">
                      <p class="font-medium text-slate-800 truncate">{{ found.name }}</p>
                      <p class="text-xs text-slate-500 font-mono truncate">{{ found.document }}</p>
                    </div>
                    <button
                      type="button"
                      class="text-xs text-slate-500 hover:text-slate-800 shrink-0"
                      (click)="limparHeaderColab()"
                    >
                      Limpar
                    </button>
                  </div>
                </ng-container>
                <ng-template #headerColabSearch>
                  <input
                    type="search"
                    [(ngModel)]="colabHeaderQuery"
                    (ngModelChange)="onColabHeaderSearchChange($event)"
                    name="colabHeaderQuery"
                    placeholder="Nome ou documento..."
                    class="form-field w-full"
                    autocomplete="off"
                  />
                  <div
                    *ngIf="colabHeaderSearching()"
                    class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
                  >
                    Buscando...
                  </div>
                  <ul
                    *ngIf="!colabHeaderSearching() && colabHeaderResults().length > 0"
                    class="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto card-surface border border-slate-200 rounded-xl shadow-lg z-20 min-w-[16rem]"
                  >
                    <li *ngFor="let c of colabHeaderResults()">
                      <button
                        type="button"
                        class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        [disabled]="c.is_blacklisted"
                        [class.opacity-50]="c.is_blacklisted"
                        (click)="selecionarHeaderColab(c)"
                      >
                        <p class="text-sm font-medium text-slate-800">{{ c.name }}</p>
                        <p class="text-xs text-slate-500 font-mono">
                          {{ c.document }}
                          <span *ngIf="c.is_blacklisted" class="text-rose-600"> · blacklist</span>
                        </p>
                      </button>
                    </li>
                  </ul>
                  <p
                    *ngIf="
                      colabHeaderQuery.trim().length >= 2 &&
                      !colabHeaderSearching() &&
                      colabHeaderResults().length === 0
                    "
                    class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20 min-w-[16rem]"
                  >
                    Nenhum colaborador encontrado. Clique em Incluir para cadastrar.
                  </p>
                </ng-template>
              </div>
              <button
                type="button"
                class="btn-primary text-xs py-2 px-4 shrink-0"
                [disabled]="colabSaving()"
                (click)="incluirColaboradorHeader()"
              >
                Incluir
              </button>
              <button
                type="button"
                class="btn-secondary text-xs py-2 px-3 shrink-0"
                [disabled]="!relationsDirty() || relationsSaving()"
                (click)="descartarRelacoes()"
              >
                Descartar
              </button>
              <button
                type="button"
                class="btn-primary text-xs py-2 px-4 shrink-0"
                [disabled]="!relationsDirty() || relationsSaving()"
                (click)="salvarRelacoes()"
              >
                {{ relationsSaving() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-500 mb-3">
            Inclua ou remova na lista e clique em <strong>Salvar</strong> para gravar e notificar os aprovadores uma única vez.
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs uppercase text-slate-500 border-b">
                <th class="py-2 text-left w-14">Foto</th>
                <th class="py-2 text-left">Nome</th>
                <th class="py-2 text-left">Documento</th>
                <th class="py-2 text-left">Função</th>
                <th class="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of draftCollaborators()" class="border-b border-slate-100">
                <td class="py-2">
                  <img
                    *ngIf="pictureUrl(c) as url"
                    [src]="url"
                    [alt]="'Foto de ' + c.collaborator_name"
                    class="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div
                    *ngIf="!pictureUrl(c)"
                    class="w-10 h-10 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0 border border-slate-200"
                    aria-hidden="true"
                  >
                    {{ initials(c.collaborator_name) }}
                  </div>
                </td>
                <td class="py-2">
                  {{ c.collaborator_name }}
                  <span
                    *ngIf="c.id_service_access_collaborator < 0"
                    class="ml-1 text-[10px] uppercase tracking-wide text-amber-700"
                    >novo</span
                  >
                </td>
                <td class="py-2 font-mono text-xs">{{ c.collaborator_document }}</td>
                <td class="py-2">{{ c.role_description }}</td>
                <td class="py-2 text-right">
                  <button
                    type="button"
                    class="text-xs text-rose-600 hover:underline"
                    (click)="removerColaborador(c)"
                  >
                    Remover
                  </button>
                </td>
              </tr>
              <tr *ngIf="draftCollaborators().length === 0">
                <td colspan="5" class="py-4 text-center text-slate-500">Nenhum colaborador vinculado.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card-surface p-5">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <h3 class="text-base font-bold text-slate-800 shrink-0">Veículos</h3>
            <span
              *ngIf="relationsDirty()"
              class="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
            >
              Alterações não salvas
            </span>
            <div class="flex flex-wrap items-center gap-2 ml-auto">
              <div class="relative w-56 max-w-full">
                <ng-container *ngIf="headerVeicCandidate() as found; else headerVeicSearch">
                  <div
                    class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div class="min-w-0">
                      <p class="font-medium text-slate-800 font-mono truncate">{{ found.plate }}</p>
                      <p class="text-xs text-slate-500 truncate">
                        {{ found.brand || '—' }} {{ found.model || '' }}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="text-xs text-slate-500 hover:text-slate-800 shrink-0"
                      (click)="limparHeaderVeic()"
                    >
                      Limpar
                    </button>
                  </div>
                </ng-container>
                <ng-template #headerVeicSearch>
                  <input
                    type="search"
                    [(ngModel)]="veicHeaderQuery"
                    (ngModelChange)="onVeicHeaderSearchChange($event)"
                    name="veicHeaderQuery"
                    placeholder="Placa, marca ou modelo..."
                    class="form-field w-full"
                    autocomplete="off"
                  />
                  <div
                    *ngIf="veicHeaderSearching()"
                    class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
                  >
                    Buscando...
                  </div>
                  <ul
                    *ngIf="!veicHeaderSearching() && veicHeaderResults().length > 0"
                    class="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto card-surface border border-slate-200 rounded-xl shadow-lg z-20 min-w-[16rem]"
                  >
                    <li *ngFor="let v of veicHeaderResults()">
                      <button
                        type="button"
                        class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        (click)="selecionarHeaderVeic(v)"
                      >
                        <p class="text-sm font-medium text-slate-800 font-mono">{{ v.plate }}</p>
                        <p class="text-xs text-slate-500">
                          {{ v.brand || '—' }} {{ v.model || '' }}
                          <span *ngIf="v.description"> · {{ v.description }}</span>
                        </p>
                      </button>
                    </li>
                  </ul>
                  <p
                    *ngIf="
                      veicHeaderQuery.trim().length >= 2 &&
                      !veicHeaderSearching() &&
                      veicHeaderResults().length === 0
                    "
                    class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20 min-w-[16rem]"
                  >
                    Nenhum veículo encontrado. Clique em Incluir para cadastrar.
                  </p>
                </ng-template>
              </div>
              <button
                type="button"
                class="btn-primary text-xs py-2 px-4 shrink-0"
                [disabled]="veicSaving()"
                (click)="incluirVeiculoHeader()"
              >
                Incluir
              </button>
              <button
                type="button"
                class="btn-secondary text-xs py-2 px-3 shrink-0"
                [disabled]="!relationsDirty() || relationsSaving()"
                (click)="descartarRelacoes()"
              >
                Descartar
              </button>
              <button
                type="button"
                class="btn-primary text-xs py-2 px-4 shrink-0"
                [disabled]="!relationsDirty() || relationsSaving()"
                (click)="salvarRelacoes()"
              >
                {{ relationsSaving() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-500 mb-3">
            Inclua ou remova na lista e clique em <strong>Salvar</strong> para gravar e notificar os aprovadores uma única vez.
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs uppercase text-slate-500 border-b">
                <th class="py-2 text-left">Placa</th>
                <th class="py-2 text-left">Marca</th>
                <th class="py-2 text-left">Modelo</th>
                <th class="py-2 text-left hidden sm:table-cell">Cor</th>
                <th class="py-2 text-left hidden md:table-cell">Tipo</th>
                <th class="py-2 text-left hidden lg:table-cell">Descrição</th>
                <th class="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let v of draftVehicles()" class="border-b border-slate-100">
                <td class="py-2 font-medium font-mono">
                  {{ v.plate }}
                  <span
                    *ngIf="v.id_service_access_vehicle < 0"
                    class="ml-1 text-[10px] uppercase tracking-wide text-amber-700"
                    >novo</span
                  >
                </td>
                <td class="py-2 text-slate-600">{{ v.brand || '—' }}</td>
                <td class="py-2 text-slate-600">{{ v.model || '—' }}</td>
                <td class="py-2 text-slate-600 hidden sm:table-cell">{{ v.color || '—' }}</td>
                <td class="py-2 text-slate-600 hidden md:table-cell">{{ v.type || '—' }}</td>
                <td class="py-2 text-slate-600 hidden lg:table-cell">{{ v.vehicle_description || '—' }}</td>
                <td class="py-2 text-right">
                  <button
                    type="button"
                    class="text-xs text-rose-600 hover:underline"
                    (click)="removerVeiculo(v)"
                  >
                    Remover
                  </button>
                </td>
              </tr>
              <tr *ngIf="draftVehicles().length === 0">
                <td colspan="7" class="py-4 text-center text-slate-500">Nenhum veículo vinculado.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <ng-template #loadingState>
        <p class="text-slate-500 text-sm py-8 text-center">Carregando acesso...</p>
      </ng-template>
    </div>

    <app-modal
      [open]="showColabModal()"
      title="Adicionar colaborador"
      [subtitle]="
        colabMode() === 'search'
          ? 'Busque por nome ou documento e selecione a função no acesso.'
          : 'Cadastre um novo colaborador com os dados completos.'
      "
      [size]="colabMode() === 'create' ? 'lg' : 'md'"
      (close)="fecharModalColab()"
    >
      <div class="flex gap-2 mb-4">
        <button
          type="button"
          class="text-xs py-1.5 px-3"
          [class.btn-primary]="colabMode() === 'search'"
          [class.btn-secondary]="colabMode() !== 'search'"
          (click)="setColabMode('search')"
        >
          Buscar
        </button>
        <button
          type="button"
          class="text-xs py-1.5 px-3"
          [class.btn-primary]="colabMode() === 'create'"
          [class.btn-secondary]="colabMode() !== 'create'"
          (click)="setColabMode('create')"
        >
          Cadastrar
        </button>
      </div>

      <form id="colab-form" (ngSubmit)="salvarColaborador()">
        <div class="space-y-3" *ngIf="colabMode() === 'search'">
          <div class="relative">
            <label class="form-label" for="colab-search">Nome ou documento</label>
            <ng-container *ngIf="colabCandidate() as found; else colabSearchField">
              <div class="mt-1 flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div class="text-sm min-w-0">
                  <p class="font-medium text-slate-800">{{ found.name }}</p>
                  <p class="text-slate-500 font-mono text-xs">{{ found.document }}</p>
                  <p *ngIf="found.is_blacklisted" class="text-xs text-rose-600 mt-1">Na blacklist</p>
                </div>
                <button type="button" class="btn-secondary text-xs py-1 px-2 shrink-0" (click)="limparColabCandidate()">
                  Trocar
                </button>
              </div>
            </ng-container>
            <ng-template #colabSearchField>
              <input
                id="colab-search"
                type="text"
                [(ngModel)]="colabSearchQuery"
                (ngModelChange)="onColabSearchChange($event)"
                name="colabSearchQuery"
                autocomplete="off"
                placeholder="Nome ou documento (mín. 2 caracteres)"
                class="form-field mt-1"
              />
              <div
                *ngIf="colabSearching()"
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Buscando...
              </div>
              <ul
                *ngIf="!colabSearching() && colabSearchResults().length > 0"
                class="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto card-surface border border-slate-200 rounded-xl shadow-lg z-20"
              >
                <li *ngFor="let c of colabSearchResults()">
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    [class.opacity-50]="c.is_blacklisted"
                    [disabled]="c.is_blacklisted"
                    (click)="selecionarColaborador(c)"
                  >
                    <p class="text-sm font-medium text-slate-800">{{ c.name }}</p>
                    <p class="text-xs text-slate-500 font-mono">
                      {{ c.document }}
                      <span *ngIf="c.is_blacklisted" class="text-rose-600"> · blacklist</span>
                    </p>
                  </button>
                </li>
              </ul>
              <p
                *ngIf="
                  colabSearchQuery.trim().length >= 2 &&
                  !colabSearching() &&
                  colabSearchResults().length === 0
                "
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Nenhum colaborador encontrado. Use Cadastrar para criar um novo.
              </p>
            </ng-template>
          </div>
          <div>
            <label class="form-label" for="colab-role-search">Função no acesso</label>
            <select
              id="colab-role-search"
              [(ngModel)]="colabRoleId"
              name="colabRoleIdSearch"
              class="form-select"
            >
              <option [ngValue]="null">Selecione...</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">
                {{ r.description }}
              </option>
            </select>
          </div>
        </div>

        <div class="space-y-3" *ngIf="colabMode() === 'create'">
          <div>
            <label class="form-label" for="colab-doc-type">Tipo de documento</label>
            <select
              id="colab-doc-type"
              [(ngModel)]="colabForm.id_collaborator_document_type"
              name="colabFormDocType"
              class="form-select"
              required
            >
              <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                {{ t.description }}
              </option>
            </select>
          </div>
          <div>
            <label class="form-label" for="colab-document">Documento</label>
            <input
              id="colab-document"
              [(ngModel)]="colabForm.document"
              name="colabFormDocument"
              class="form-field font-mono"
              required
            />
          </div>
          <div>
            <label class="form-label" for="colab-name">Nome completo</label>
            <input
              id="colab-name"
              [(ngModel)]="colabForm.name"
              name="colabFormName"
              class="form-field"
              required
            />
          </div>
          <div>
            <label class="form-label" for="colab-role-create">Função</label>
            <select
              id="colab-role-create"
              [(ngModel)]="colabForm.id_collaborator_role"
              name="colabFormRole"
              class="form-select"
              required
            >
              <option [ngValue]="null">Selecione...</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">
                {{ r.description }}
              </option>
            </select>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="colab-rg">
                RG <span class="form-label__optional">(opcional)</span>
              </label>
              <input id="colab-rg" [(ngModel)]="colabForm.rg" name="colabFormRg" class="form-field" />
            </div>
            <div>
              <label class="form-label" for="colab-phone">
                Telefone <span class="form-label__optional">(opcional)</span>
              </label>
              <input
                id="colab-phone"
                [(ngModel)]="colabForm.phone"
                name="colabFormPhone"
                class="form-field"
              />
            </div>
          </div>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModalColab()">Cancelar</button>
        <button type="submit" form="colab-form" class="btn-action-primary" [disabled]="colabSaving()">
          {{ colabSaving() ? 'Incluindo...' : 'Incluir na lista' }}
        </button>
      </div>
    </app-modal>

    <app-modal
      [open]="showVeicModal()"
      title="Adicionar veículo"
      [subtitle]="
        veicMode() === 'search'
          ? 'Busque por placa, marca ou modelo na frota da empresa.'
          : 'Cadastre um novo veículo com os dados completos.'
      "
      [size]="veicMode() === 'create' ? 'lg' : 'md'"
      (close)="fecharModalVeic()"
    >
      <div class="flex gap-2 mb-4">
        <button
          type="button"
          class="text-xs py-1.5 px-3"
          [class.btn-primary]="veicMode() === 'search'"
          [class.btn-secondary]="veicMode() !== 'search'"
          (click)="setVeicMode('search')"
        >
          Buscar
        </button>
        <button
          type="button"
          class="text-xs py-1.5 px-3"
          [class.btn-primary]="veicMode() === 'create'"
          [class.btn-secondary]="veicMode() !== 'create'"
          (click)="setVeicMode('create')"
        >
          Cadastrar
        </button>
      </div>

      <form id="veic-form" (ngSubmit)="salvarVeiculo()">
        <div class="space-y-3" *ngIf="veicMode() === 'search'">
          <div class="relative">
            <label class="form-label" for="veic-search">Placa, marca ou modelo</label>
            <ng-container *ngIf="veicCandidate() as found; else veicSearchField">
              <div class="mt-1 flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div class="text-sm min-w-0">
                  <p class="font-medium text-slate-800 font-mono">{{ found.plate }}</p>
                  <p class="text-slate-500 text-xs">
                    {{ found.brand || '—' }} {{ found.model || '' }}
                    <span *ngIf="found.description"> · {{ found.description }}</span>
                  </p>
                </div>
                <button type="button" class="btn-secondary text-xs py-1 px-2 shrink-0" (click)="limparVeicCandidate()">
                  Trocar
                </button>
              </div>
            </ng-container>
            <ng-template #veicSearchField>
              <input
                id="veic-search"
                type="text"
                [(ngModel)]="veicSearchQuery"
                (ngModelChange)="onVeicSearchChange($event)"
                name="veicSearchQuery"
                autocomplete="off"
                placeholder="Placa, marca ou modelo (mín. 2 caracteres)"
                class="form-field mt-1"
              />
              <div
                *ngIf="veicSearching()"
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Buscando...
              </div>
              <ul
                *ngIf="!veicSearching() && veicSearchResults().length > 0"
                class="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto card-surface border border-slate-200 rounded-xl shadow-lg z-20"
              >
                <li *ngFor="let v of veicSearchResults()">
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    (click)="selecionarVeiculo(v)"
                  >
                    <p class="text-sm font-medium text-slate-800 font-mono">{{ v.plate }}</p>
                    <p class="text-xs text-slate-500">
                      {{ v.brand || '—' }} {{ v.model || '' }}
                      <span *ngIf="v.description"> · {{ v.description }}</span>
                    </p>
                  </button>
                </li>
              </ul>
              <p
                *ngIf="
                  veicSearchQuery.trim().length >= 2 &&
                  !veicSearching() &&
                  veicSearchResults().length === 0
                "
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Nenhum veículo encontrado. Use Cadastrar para criar um novo.
              </p>
            </ng-template>
          </div>
        </div>

        <div class="space-y-3" *ngIf="veicMode() === 'create'">
          <p class="text-sm text-slate-600">
            Empresa: <span class="font-medium text-slate-800">{{ service()?.company_fancy_name }}</span>
          </p>
          <div>
            <label class="form-label" for="veic-plate">Placa</label>
            <input
              id="veic-plate"
              [(ngModel)]="veicForm.plate"
              name="veicFormPlate"
              class="form-field font-mono uppercase"
              placeholder="ABC1D23"
              required
            />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="veic-brand">Marca</label>
              <input
                id="veic-brand"
                [(ngModel)]="veicForm.brand"
                name="veicFormBrand"
                class="form-field"
                placeholder="Ex.: Toyota"
                required
              />
            </div>
            <div>
              <label class="form-label" for="veic-model">Modelo</label>
              <input
                id="veic-model"
                [(ngModel)]="veicForm.model"
                name="veicFormModel"
                class="form-field"
                placeholder="Ex.: Corolla"
                required
              />
            </div>
            <div>
              <label class="form-label" for="veic-color">Cor</label>
              <input
                id="veic-color"
                [(ngModel)]="veicForm.color"
                name="veicFormColor"
                class="form-field"
                placeholder="Ex.: Prata"
                required
              />
            </div>
            <div>
              <label class="form-label" for="veic-type">Tipo</label>
              <input
                id="veic-type"
                [(ngModel)]="veicForm.type"
                name="veicFormType"
                class="form-field"
                placeholder="Ex.: Sedan"
                required
              />
            </div>
          </div>
          <div>
            <label class="form-label" for="veic-description">
              Descrição <span class="form-label__optional">(opcional)</span>
            </label>
            <input
              id="veic-description"
              [(ngModel)]="veicForm.description"
              name="veicFormDescription"
              class="form-field"
            />
          </div>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModalVeic()">Cancelar</button>
        <button type="submit" form="veic-form" class="btn-action-primary" [disabled]="veicSaving()">
          {{ veicSaving() ? 'Incluindo...' : 'Incluir na lista' }}
        </button>
      </div>
    </app-modal>

    <app-service-access-bulk-import-wizard
      [open]="showBulkModal()"
      [serviceAccessId]="serviceId"
      [accessName]="service()?.finalidade || ''"
      [companyName]="service()?.company_fancy_name || ''"
      (closed)="fecharBulk()"
      (completed)="onBulkCompleted()"
    />

    <app-modal
      [open]="showEditModal()"
      title="Editar acesso"
      subtitle="Atualize período, finalidade, setor aprovador e observação."
      size="md"
      (close)="fecharModalEditar()"
    >
      <form id="edit-access-form" class="space-y-3" (ngSubmit)="salvarEdicao()">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label" for="edit-start">Data início</label>
            <input
              id="edit-start"
              type="date"
              [(ngModel)]="editForm.start_date"
              name="editStartDate"
              required
              class="form-field"
            />
          </div>
          <div>
            <label class="form-label" for="edit-end">Data fim</label>
            <input
              id="edit-end"
              type="date"
              [(ngModel)]="editForm.end_date"
              name="editEndDate"
              required
              class="form-field"
            />
          </div>
        </div>
        <div>
          <label class="form-label" for="edit-finalidade">Finalidade</label>
          <input
            id="edit-finalidade"
            [(ngModel)]="editForm.finalidade"
            name="editFinalidade"
            required
            class="form-field"
          />
        </div>
        <div>
          <label class="form-label" for="edit-setor">Setor aprovador</label>
          <select
            id="edit-setor"
            [(ngModel)]="editForm.id_setor"
            name="editSetor"
            required
            class="form-select"
          >
            <option [ngValue]="null" disabled>Selecione o setor</option>
            <option *ngFor="let s of sectors()" [ngValue]="s.id">{{ s.nome }}</option>
          </select>
        </div>
        <div>
          <label class="form-label" for="edit-obs">
            Observação <span class="form-label__optional">(opcional)</span>
          </label>
          <textarea
            id="edit-obs"
            [(ngModel)]="editForm.observacao"
            name="editObs"
            rows="3"
            class="form-field"
          ></textarea>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModalEditar()">Cancelar</button>
        <button
          type="submit"
          form="edit-access-form"
          class="btn-action-primary"
          [disabled]="editSaving()"
        >
          {{ editSaving() ? 'Salvando...' : 'Salvar alterações' }}
        </button>
      </div>
    </app-modal>

    <app-modal
      [open]="!!decisionMode()"
      [title]="decisionMode() === 'approve' ? 'Aprovar acesso' : 'Reprovar acesso'"
      [subtitle]="
        decisionMode() === 'reject'
          ? 'Informe o motivo da reprovação. A decisão segue o fluxo do setor aprovador.'
          : 'Confirme a aprovação pelo setor. Comentário opcional.'
      "
      size="sm"
      (close)="fecharDecisao()"
    >
      <form id="service-approval-form" (ngSubmit)="confirmarDecisao()">
        <label class="form-label" for="service-approval-comment">Comentário</label>
        <textarea
          id="service-approval-comment"
          [(ngModel)]="decisionComment"
          name="decisionComment"
          rows="3"
          class="form-field"
          [placeholder]="decisionMode() === 'reject' ? 'Comentário obrigatório' : 'Comentário opcional'"
        ></textarea>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharDecisao()">Cancelar</button>
        <button
          type="submit"
          form="service-approval-form"
          class="btn-action-primary"
          [disabled]="decisionActing()"
        >
          {{
            decisionActing()
              ? 'Registrando...'
              : decisionMode() === 'approve'
                ? 'Confirmar aprovação'
                : 'Confirmar reprovação'
          }}
        </button>
      </div>
    </app-modal>
    <app-modal
      [open]="showPeriodModal()"
      title="Ajustar período"
      subtitle="A alteração reabre o fluxo de aprovação. Quem já tinha credencial permanece até a nova decisão."
      size="sm"
      (close)="fecharModalPeriodo()"
    >
      <form id="period-access-form" class="space-y-3" (ngSubmit)="salvarPeriodo()">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label" for="period-start">Data início</label>
            <input
              id="period-start"
              type="date"
              [(ngModel)]="periodForm.start_date"
              name="periodStartDate"
              required
              class="form-field"
            />
          </div>
          <div>
            <label class="form-label" for="period-end">Data fim</label>
            <input
              id="period-end"
              type="date"
              [(ngModel)]="periodForm.end_date"
              name="periodEndDate"
              required
              class="form-field"
            />
          </div>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModalPeriodo()">Cancelar</button>
        <button
          type="submit"
          form="period-access-form"
          class="btn-action-primary"
          [disabled]="periodSaving()"
        >
          {{ periodSaving() ? 'Salvando...' : 'Salvar e reenviar' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ServiceAccessDetailComponent implements OnInit, OnDestroy {
  service = signal<ServiceAccessItem | null>(null);
  loading = signal(true);
  togglingEnabled = signal(false);
  private currentUser: AuthUser | null = null;
  formatDateBr = formatDateBr;

  showEditModal = signal(false);
  editSaving = signal(false);
  showPeriodModal = signal(false);
  periodSaving = signal(false);
  periodForm = { start_date: '', end_date: '' };
  sectors = signal<EligibleSector[]>([]);
  editForm = {
    start_date: '',
    end_date: '',
    finalidade: '',
    observacao: '',
    id_setor: null as number | null,
  };

  decisionMode = signal<'approve' | 'reject' | null>(null);
  decisionComment = '';
  decisionActing = signal(false);

  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);

  colabHeaderQuery = '';
  colabHeaderResults = signal<CollaboratorItem[]>([]);
  headerColabCandidate = signal<CollaboratorItem | null>(null);
  colabHeaderSearching = signal(false);
  private colabHeaderSearchTimer: ReturnType<typeof setTimeout> | null = null;

  veicHeaderQuery = '';
  veicHeaderResults = signal<VehicleItem[]>([]);
  headerVeicCandidate = signal<VehicleItem | null>(null);
  veicHeaderSearching = signal(false);
  private veicHeaderSearchTimer: ReturnType<typeof setTimeout> | null = null;

  showColabModal = signal(false);
  colabMode = signal<ModalMode>('search');
  colabSearchQuery = '';
  colabSearchResults = signal<CollaboratorItem[]>([]);
  colabCandidate = signal<CollaboratorItem | null>(null);
  colabSearching = signal(false);
  colabSaving = signal(false);
  colabRoleId: number | null = null;
  colabForm = this.emptyColabForm();
  private colabSearchTimer: ReturnType<typeof setTimeout> | null = null;

  thumbnailUrls = signal<Record<number, string>>({});
  private thumbnailLoadId = 0;

  showVeicModal = signal(false);
  veicMode = signal<ModalMode>('search');
  veicSearchQuery = '';
  veicSearchResults = signal<VehicleItem[]>([]);
  veicCandidate = signal<VehicleItem | null>(null);
  veicSearching = signal(false);
  veicSaving = signal(false);
  veicForm = this.emptyVeicForm();
  private veicSearchTimer: ReturnType<typeof setTimeout> | null = null;

  showBulkModal = signal(false);

  draftCollaborators = signal<ServiceAccessCollaborator[]>([]);
  draftVehicles = signal<ServiceAccessVehicle[]>([]);
  relationsDirty = signal(false);
  relationsSaving = signal(false);
  private savedRelationsSnapshot = '';
  private draftLinkSeq = -1;

  serviceId = 0;

  constructor(
    private route: ActivatedRoute,
    private patrimonialService: PatrimonialService,
    private collaboratorService: CollaboratorService,
    private vehicleService: VehicleService,
    private approvalService: ApprovalService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    this.currentUser = await this.authService.getCurrentUser();
    this.serviceId = Number(this.route.snapshot.paramMap.get('id'));
    this.carregar();
    this.carregarSetores();
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => {
        this.documentTypes.set(res.types);
        if (res.types[0]) {
          this.colabForm.id_collaborator_document_type = res.types[0].id_collaborator_document_type;
        }
      },
    });
    this.collaboratorService.listRoles().subscribe({
      next: (res) => {
        this.roles.set(res.roles);
      },
    });
  }

  private lastSilentLoadAt = 0;

  /** Se a aprovação foi feita em outra aba (/aprovacoes/:id), recarrega ao voltar. */
  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.serviceId) {
      this.carregar({ silent: true });
    }
  }

  @HostListener('window:focus')
  onWindowFocus() {
    if (this.serviceId) {
      this.carregar({ silent: true });
    }
  }

  ngOnDestroy() {
    if (this.colabSearchTimer) clearTimeout(this.colabSearchTimer);
    if (this.veicSearchTimer) clearTimeout(this.veicSearchTimer);
    if (this.colabHeaderSearchTimer) clearTimeout(this.colabHeaderSearchTimer);
    if (this.veicHeaderSearchTimer) clearTimeout(this.veicHeaderSearchTimer);
    this.revokeThumbnails();
  }

  private emptyColabForm() {
    return {
      id_collaborator_document_type: null as number | null,
      id_collaborator_role: null as number | null,
      document: '',
      name: '',
      rg: '',
      phone: '',
    };
  }

  private emptyVeicForm() {
    return {
      plate: '',
      brand: '',
      model: '',
      color: '',
      type: '',
      description: '',
    };
  }

  onColabHeaderSearchChange(term: string) {
    if (this.colabHeaderSearchTimer) clearTimeout(this.colabHeaderSearchTimer);
    this.headerColabCandidate.set(null);
    const q = String(term || '').trim();
    if (q.length < 2) {
      this.colabHeaderResults.set([]);
      this.colabHeaderSearching.set(false);
      return;
    }
    this.colabHeaderSearchTimer = setTimeout(() => this.buscarColaboradoresHeader(q), 300);
  }

  buscarColaboradoresHeader(term: string) {
    this.colabHeaderSearching.set(true);
    this.collaboratorService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.colabHeaderSearching.set(false);
        this.colabHeaderResults.set(res.collaborators);
      },
      error: (err) => {
        this.colabHeaderSearching.set(false);
        this.colabHeaderResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar colaboradores.');
      },
    });
  }

  selecionarHeaderColab(item: CollaboratorItem) {
    if (item.is_blacklisted) {
      this.notification.error('Colaborador está na blacklist.');
      return;
    }
    const roleId = item.id_collaborator_role || this.colabRoleId;
    if (!roleId) {
      this.notification.error('Colaborador sem função cadastrada.');
      return;
    }
    this.colabHeaderResults.set([]);
    this.colabHeaderQuery = '';
    this.headerColabCandidate.set(null);
    this.addCollaboratorToDraft(item, roleId);
  }

  limparHeaderColab() {
    this.headerColabCandidate.set(null);
    this.colabHeaderQuery = '';
    this.colabHeaderResults.set([]);
  }

  incluirColaboradorHeader() {
    const q = this.colabHeaderQuery.trim();
    if (q) {
      this.abrirModalColab(q);
    } else {
      this.abrirModalColab();
      this.setColabMode('create');
    }
  }

  onVeicHeaderSearchChange(term: string) {
    if (this.veicHeaderSearchTimer) clearTimeout(this.veicHeaderSearchTimer);
    this.headerVeicCandidate.set(null);
    const q = String(term || '').trim();
    if (q.length < 2) {
      this.veicHeaderResults.set([]);
      this.veicHeaderSearching.set(false);
      return;
    }
    this.veicHeaderSearchTimer = setTimeout(() => this.buscarVeiculosHeader(q), 300);
  }

  buscarVeiculosHeader(term: string) {
    this.veicHeaderSearching.set(true);
    this.vehicleService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.veicHeaderSearching.set(false);
        this.veicHeaderResults.set(res.vehicles.filter((v) => !v.is_blacklisted));
      },
      error: (err) => {
        this.veicHeaderSearching.set(false);
        this.veicHeaderResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar veículos.');
      },
    });
  }

  selecionarHeaderVeic(item: VehicleItem) {
    if (item.is_blacklisted) {
      this.notification.error('Veículo está na blacklist.');
      return;
    }
    this.veicHeaderResults.set([]);
    this.veicHeaderQuery = '';
    this.headerVeicCandidate.set(null);
    this.addVehicleToDraft(item);
  }

  limparHeaderVeic() {
    this.headerVeicCandidate.set(null);
    this.veicHeaderQuery = '';
    this.veicHeaderResults.set([]);
  }

  incluirVeiculoHeader() {
    const q = this.veicHeaderQuery.trim();
    if (q) {
      this.abrirModalVeic(q);
    } else {
      this.abrirModalVeic();
      this.setVeicMode('create');
    }
  }

  carregar(options: { silent?: boolean } = {}) {
    if (options.silent) {
      const now = Date.now();
      if (now - this.lastSilentLoadAt < 2500) return;
      this.lastSilentLoadAt = now;
    } else {
      this.loading.set(true);
    }
    this.patrimonialService.getById(this.serviceId).subscribe({
      next: (res) => {
        this.applyService(res.service);
        this.loading.set(false);
        this.carregarSetores();
      },
      error: (err) => {
        this.loading.set(false);
        if (!options.silent) {
          this.notification.notifyHttpError(err, 'Falha ao carregar acesso.');
        }
      },
    });
  }

  private applyService(svc: ServiceAccessItem) {
    this.service.set(svc);
    this.syncDraftFromService(svc);
    this.loadThumbnails(svc.collaborators || []);
  }

  private relationsSnapshot(
    collaborators: ServiceAccessCollaborator[],
    vehicles: ServiceAccessVehicle[],
  ): string {
    return JSON.stringify({
      c: collaborators
        .map((x) => [Number(x.id_collaborator), Number(x.id_collaborator_role)] as const)
        .sort((a, b) => a[0] - b[0]),
      v: vehicles
        .map((x) => Number(x.id_vehicle))
        .sort((a, b) => a - b),
    });
  }

  private syncDraftFromService(svc: ServiceAccessItem) {
    const collaborators = [...(svc.collaborators || [])];
    const vehicles = [...(svc.vehicles || [])];
    this.draftCollaborators.set(collaborators);
    this.draftVehicles.set(vehicles);
    this.savedRelationsSnapshot = this.relationsSnapshot(collaborators, vehicles);
    this.relationsDirty.set(false);
  }

  private markRelationsDirty() {
    this.relationsDirty.set(
      this.relationsSnapshot(this.draftCollaborators(), this.draftVehicles()) !==
        this.savedRelationsSnapshot,
    );
  }

  private nextDraftLinkId(): number {
    const id = this.draftLinkSeq;
    this.draftLinkSeq -= 1;
    return id;
  }

  private addCollaboratorToDraft(item: CollaboratorItem, roleId: number) {
    if (this.draftCollaborators().some((c) => c.id_collaborator === item.id_collaborator)) {
      this.notification.error('Colaborador já está na lista.');
      return;
    }
    const role =
      this.roles().find((r) => r.id_collaborator_role === roleId)?.description ||
      item.role?.description ||
      '—';
    this.draftCollaborators.update((list) => [
      ...list,
      {
        id_service_access_collaborator: this.nextDraftLinkId(),
        id_collaborator: item.id_collaborator,
        collaborator_name: item.name,
        collaborator_document: item.document,
        collaborator_picture: item.picture || null,
        id_collaborator_role: roleId,
        role_description: role,
        access_id: null,
        access_check_in: null,
        access_check_out: null,
        id_substitute: null,
      },
    ]);
    this.markRelationsDirty();
    this.notification.success('Colaborador incluído na lista. Clique em Salvar para confirmar.');
    void this.loadThumbnails(this.draftCollaborators());
  }

  private addVehicleToDraft(item: VehicleItem) {
    if (this.draftVehicles().some((v) => v.id_vehicle === item.id_vehicle)) {
      this.notification.error('Veículo já está na lista.');
      return;
    }
    this.draftVehicles.update((list) => [
      ...list,
      {
        id_service_access_vehicle: this.nextDraftLinkId(),
        id_vehicle: item.id_vehicle,
        plate: item.plate,
        brand: item.brand,
        model: item.model,
        color: item.color,
        type: item.type,
        vehicle_description: item.description || null,
        access_id: null,
        check_in: null,
        check_out: null,
        id_substitute_vehicle: null,
      },
    ]);
    this.markRelationsDirty();
    this.notification.success('Veículo incluído na lista. Clique em Salvar para confirmar.');
  }

  descartarRelacoes() {
    const svc = this.service();
    if (!svc) return;
    this.syncDraftFromService(svc);
    this.notification.success('Alterações descartadas.');
  }

  salvarRelacoes() {
    if (!this.relationsDirty() || this.relationsSaving()) return;
    this.relationsSaving.set(true);
    this.patrimonialService
      .syncRelations(this.serviceId, {
        collaborators: this.draftCollaborators().map((c) => ({
          id_collaborator: c.id_collaborator,
          id_collaborator_role: c.id_collaborator_role,
        })),
        vehicles: this.draftVehicles().map((v) => ({
          id_vehicle: v.id_vehicle,
        })),
      })
      .subscribe({
        next: (res) => {
          this.relationsSaving.set(false);
          this.service.set(res.service);
          this.syncDraftFromService(res.service);
          this.loadThumbnails(res.service.collaborators || []);
          if (res.relationsChanged) {
            this.notification.success(
              Number(res.service.id_access_status) === 2
                ? 'Relação salva. Aprovadores notificados.'
                : 'Relação salva.',
            );
          } else {
            this.notification.success('Nenhuma alteração para salvar.');
          }
        },
        error: (err) => {
          this.relationsSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao salvar colaboradores/veículos.');
        },
      });
  }

  pictureUrl(c: ServiceAccessCollaborator): string | null {
    return this.thumbnailUrls()[c.id_collaborator] ?? null;
  }

  initials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private loadThumbnails(list: ServiceAccessCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.collaborator_picture) continue;
      this.collaboratorService.getPictureBlob(c.collaborator_picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [c.id_collaborator]: url }));
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }

  canDecideWorkflow(): boolean {
    const svc = this.service();
    const user = this.currentUser;
    if (!svc || !user) return false;
    if (svc.id_access_status !== 2) return false;
    if (svc.aprovacao_status !== 'PENDENTE' || !svc.id_aprovacao) return false;
    if (!svc.id_setor) return false;
    if (isSuperAdmin(user)) return true;
    return !!user.sectorMemberships?.some(
      (m) =>
        m.sectorId === svc.id_setor && (m.papel === 'APROVADOR' || m.papel === 'GESTOR'),
    );
  }

  abrirDecisao(mode: 'approve' | 'reject') {
    // Revalida status ao entrar na solicitação antes de abrir o modal
    this.patrimonialService.getById(this.serviceId).subscribe({
      next: (res) => {
        this.applyService(res.service);
        if (!this.canDecideWorkflow()) {
          this.notification.warning(
            Number(res.service.id_access_status) === 3
              ? 'Acesso já aprovado.'
              : 'Solicitação já finalizada.',
            'Não é possível uma nova decisão por outro membro.',
          );
          return;
        }
        this.decisionComment = '';
        this.decisionMode.set(mode);
      },
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao atualizar status do acesso.'),
    });
  }

  fecharDecisao() {
    this.decisionMode.set(null);
    this.decisionComment = '';
    this.decisionActing.set(false);
  }

  confirmarDecisao() {
    const svc = this.service();
    const mode = this.decisionMode();
    if (!svc?.id_aprovacao || !mode) return;
    if (mode === 'reject' && !this.decisionComment.trim()) {
      this.notification.error('Informe o motivo da reprovação.');
      return;
    }
    this.decisionActing.set(true);
    const req =
      mode === 'approve'
        ? this.approvalService.approve(svc.id_aprovacao, {
            comentario: this.decisionComment.trim() || undefined,
            approvedCollaboratorIds: this.draftCollaborators().map((c) => c.id_collaborator),
            approvedVehicleIds: this.draftVehicles().map((v) => v.id_vehicle),
          })
        : this.approvalService.reject(svc.id_aprovacao, this.decisionComment.trim());
    req
      .pipe(switchMap(() => this.patrimonialService.getById(this.serviceId)))
      .subscribe({
        next: (res) => {
          this.decisionActing.set(false);
          this.fecharDecisao();
          this.applyService(res.service);
          this.loading.set(false);
          this.notification.success(
            mode === 'approve' ? 'Acesso aprovado.' : 'Acesso reprovado.',
          );
        },
        error: (err) => {
          this.decisionActing.set(false);
          this.notification.notifyHttpError(
            err,
            mode === 'approve' ? 'Falha ao aprovar.' : 'Falha ao reprovar.',
          );
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status: number }).status)
              : 0;
          if (status === 409) {
            this.fecharDecisao();
            this.carregar({ silent: true });
          }
        },
      });
  }

  statusChipClass(idAccessStatus: number): string {
    if (idAccessStatus === 3) return 'chip--ok';
    if (idAccessStatus === 4) return 'chip--danger';
    if (idAccessStatus === 1 || idAccessStatus === 2) return 'chip--warn';
    return 'chip--muted';
  }

  toggleEnabled() {
    const current = this.service();
    if (!current || this.togglingEnabled()) return;
    const next = !current.status;
    this.togglingEnabled.set(true);
    this.patrimonialService.patchEnabled(this.serviceId, next).subscribe({
      next: (res) => {
        this.togglingEnabled.set(false);
        this.service.set(res.service);
        this.notification.success(next ? 'Acesso habilitado.' : 'Acesso desabilitado.');
      },
      error: (err) => {
        this.togglingEnabled.set(false);
        this.notification.notifyHttpError(err, 'Falha ao alterar habilitação.');
      },
    });
  }

  private toDateInput(value: string | null | undefined): string {
    return String(value || '').slice(0, 10);
  }

  abrirModalEditar() {
    const svc = this.service();
    if (!svc) return;
    if (svc.id_access_status === 3 || svc.id_access_status === 4) {
      this.notification.error('Para alterar datas de acesso aprovado/negado, use Ajustar período.');
      return;
    }
    this.carregarSetores();
    this.editForm = {
      start_date: this.toDateInput(svc.start_date),
      end_date: this.toDateInput(svc.end_date),
      finalidade: svc.finalidade || '',
      observacao: svc.observacao || '',
      id_setor: svc.id_setor ?? null,
    };
    this.showEditModal.set(true);
  }

  fecharModalEditar() {
    this.showEditModal.set(false);
  }

  abrirModalPeriodo() {
    const svc = this.service();
    if (!svc || (svc.id_access_status !== 3 && svc.id_access_status !== 4)) return;
    this.periodForm = {
      start_date: this.toDateInput(svc.start_date),
      end_date: this.toDateInput(svc.end_date),
    };
    this.showPeriodModal.set(true);
  }

  fecharModalPeriodo() {
    this.showPeriodModal.set(false);
  }

  salvarPeriodo() {
    const svc = this.service();
    if (!svc) return;
    if (!this.periodForm.start_date || !this.periodForm.end_date) {
      this.notification.error('Informe as datas de início e fim.');
      return;
    }
    if (this.periodForm.end_date < this.periodForm.start_date) {
      this.notification.error('Data fim deve ser igual ou posterior à data início.');
      return;
    }
    this.periodSaving.set(true);
    this.patrimonialService
      .updatePeriod(svc.id_service_access, {
        start_date: this.periodForm.start_date,
        end_date: this.periodForm.end_date,
      })
      .subscribe({
        next: (res) => {
          this.periodSaving.set(false);
          this.service.set(res.service);
          this.syncDraftFromService(res.service);
          this.fecharModalPeriodo();
          this.notification.success('Período atualizado. Aguardando nova aprovação.');
        },
        error: (err) => {
          this.periodSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao ajustar período.');
        },
      });
  }

  carregarSetores() {
    this.approvalService.listEligibleSectors('ACESSO_SERVICO').subscribe({
      next: (res) => {
        const list = [...res.sectors];
        const svc = this.service();
        if (svc?.id_setor && !list.some((s) => s.id === svc.id_setor)) {
          list.unshift({
            id: svc.id_setor,
            nome: svc.setor_nome || `Setor #${svc.id_setor}`,
            niveisExigidos: 1,
          });
        }
        this.sectors.set(list);
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
  }

  salvarEdicao() {
    if (!this.editForm.start_date || !this.editForm.end_date || !this.editForm.finalidade.trim()) {
      this.notification.error('Preencha datas e finalidade.');
      return;
    }
    if (!this.editForm.id_setor) {
      this.notification.error('Selecione o setor aprovador.');
      return;
    }
    if (this.editForm.end_date < this.editForm.start_date) {
      this.notification.error('Data fim deve ser igual ou posterior à data início.');
      return;
    }
    const setorNome = this.sectors().find((s) => s.id === this.editForm.id_setor)?.nome?.trim();
    if (!setorNome) {
      this.notification.error('Setor aprovador inválido.');
      return;
    }
    this.editSaving.set(true);
    this.patrimonialService
      .update(this.serviceId, {
        start_date: this.editForm.start_date,
        end_date: this.editForm.end_date,
        finalidade: this.editForm.finalidade.trim(),
        requesting_department: setorNome,
        observacao: this.editForm.observacao.trim() || null,
        id_setor: this.editForm.id_setor,
      })
      .subscribe({
        next: (res) => {
          this.editSaving.set(false);
          this.service.set(res.service);
          this.syncDraftFromService(res.service);
          this.fecharModalEditar();
          if (Number(res.service?.id_access_status) === 2) {
            this.notification.success('Acesso atualizado. Aguardando aprovação.');
          } else {
            this.notification.success('Acesso atualizado.');
          }
          this.loadThumbnails(res.service.collaborators || []);
        },
        error: (err) => {
          this.editSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao salvar alterações.');
        },
      });
  }

  setColabMode(mode: ModalMode) {
    this.colabMode.set(mode);
    this.colabSearchResults.set([]);
    this.colabCandidate.set(null);
    this.colabSearchQuery = '';
  }

  abrirModalColab(prefill = '') {
    this.colabMode.set('search');
    this.colabSearchQuery = String(prefill || '').trim();
    this.colabSearchResults.set([]);
    this.colabCandidate.set(null);
    this.colabForm = this.emptyColabForm();
    const types = this.documentTypes();
    if (types[0]) this.colabForm.id_collaborator_document_type = types[0].id_collaborator_document_type;
    this.colabForm.id_collaborator_role = this.colabRoleId;
    this.showColabModal.set(true);
    if (this.colabSearchQuery.length >= 2) {
      this.buscarColaboradores(this.colabSearchQuery);
    }
  }

  fecharModalColab() {
    this.showColabModal.set(false);
    if (this.colabSearchTimer) clearTimeout(this.colabSearchTimer);
  }

  onColabSearchChange(term: string) {
    if (this.colabSearchTimer) clearTimeout(this.colabSearchTimer);
    this.colabCandidate.set(null);
    const q = String(term || '').trim();
    if (q.length < 2) {
      this.colabSearchResults.set([]);
      this.colabSearching.set(false);
      return;
    }
    this.colabSearchTimer = setTimeout(() => this.buscarColaboradores(q), 300);
  }

  buscarColaboradores(term: string) {
    this.colabSearching.set(true);
    this.collaboratorService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.colabSearching.set(false);
        this.colabSearchResults.set(res.collaborators);
      },
      error: (err) => {
        this.colabSearching.set(false);
        this.colabSearchResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar colaboradores.');
      },
    });
  }

  selecionarColaborador(item: CollaboratorItem) {
    if (item.is_blacklisted) {
      this.notification.error('Colaborador está na blacklist.');
      return;
    }
    this.colabCandidate.set(item);
    this.colabSearchResults.set([]);
    this.colabSearchQuery = '';
    this.colabRoleId = item.id_collaborator_role || this.colabRoleId;
  }

  limparColabCandidate() {
    this.colabCandidate.set(null);
  }

  salvarColaborador() {
    if (this.colabMode() === 'search') {
      this.vincularColaboradorExistente();
      return;
    }
    this.criarEVincularColaborador();
  }

  private vincularColaboradorExistente() {
    const candidate = this.colabCandidate();
    if (!candidate || !this.colabRoleId) {
      this.notification.error('Busque um colaborador e selecione a função.');
      return;
    }
    if (candidate.is_blacklisted) {
      this.notification.error('Colaborador está na blacklist.');
      return;
    }
    this.addCollaboratorToDraft(candidate, this.colabRoleId);
    this.fecharModalColab();
  }

  private criarEVincularColaborador() {
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
          this.addCollaboratorToDraft(res.collaborator, form.id_collaborator_role!);
          this.fecharModalColab();
        },
        error: (err) => {
          this.colabSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar colaborador.');
        },
      });
  }

  removerColaborador(item: ServiceAccessCollaborator) {
    this.draftCollaborators.update((list) =>
      list.filter((c) => c.id_collaborator !== item.id_collaborator),
    );
    this.markRelationsDirty();
  }

  setVeicMode(mode: ModalMode) {
    this.veicMode.set(mode);
    this.veicSearchResults.set([]);
    this.veicCandidate.set(null);
    this.veicSearchQuery = '';
  }

  abrirModalVeic(prefill = '') {
    this.veicMode.set('search');
    this.veicSearchQuery = String(prefill || '').trim();
    this.veicSearchResults.set([]);
    this.veicCandidate.set(null);
    this.veicForm = this.emptyVeicForm();
    this.showVeicModal.set(true);
    if (this.veicSearchQuery.length >= 2) {
      this.buscarVeiculos(this.veicSearchQuery);
    }
  }

  fecharModalVeic() {
    this.showVeicModal.set(false);
    if (this.veicSearchTimer) clearTimeout(this.veicSearchTimer);
  }

  onVeicSearchChange(term: string) {
    if (this.veicSearchTimer) clearTimeout(this.veicSearchTimer);
    this.veicCandidate.set(null);
    const q = String(term || '').trim();
    if (q.length < 2) {
      this.veicSearchResults.set([]);
      this.veicSearching.set(false);
      return;
    }
    this.veicSearchTimer = setTimeout(() => this.buscarVeiculos(q), 300);
  }

  buscarVeiculos(term: string) {
    this.veicSearching.set(true);
    this.vehicleService.list(1, 15, { q: term, status: true }).subscribe({
      next: (res) => {
        this.veicSearching.set(false);
        this.veicSearchResults.set(res.vehicles.filter((v) => !v.is_blacklisted));
      },
      error: (err) => {
        this.veicSearching.set(false);
        this.veicSearchResults.set([]);
        this.notification.notifyHttpError(err, 'Falha ao buscar veículos.');
      },
    });
  }

  selecionarVeiculo(item: VehicleItem) {
    if (item.is_blacklisted) {
      this.notification.error('Veículo está na blacklist.');
      return;
    }
    this.veicCandidate.set(item);
    this.veicSearchResults.set([]);
    this.veicSearchQuery = '';
  }

  limparVeicCandidate() {
    this.veicCandidate.set(null);
  }

  salvarVeiculo() {
    if (this.veicMode() === 'search') {
      this.vincularVeiculoExistente();
      return;
    }
    this.criarEVincularVeiculo();
  }

  private vincularVeiculoExistente() {
    const candidate = this.veicCandidate();
    if (!candidate) {
      this.notification.error('Busque e selecione um veículo.');
      return;
    }
    this.addVehicleToDraft(candidate);
    this.fecharModalVeic();
  }

  private criarEVincularVeiculo() {
    const svc = this.service();
    const form = this.veicForm;
    if (
      !svc ||
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
        id_company: svc.id_company,
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
          this.addVehicleToDraft(res.vehicle);
          this.fecharModalVeic();
        },
        error: (err) => {
          this.veicSaving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao cadastrar veículo.');
        },
      });
  }

  removerVeiculo(item: ServiceAccessVehicle) {
    this.draftVehicles.update((list) => list.filter((v) => v.id_vehicle !== item.id_vehicle));
    this.markRelationsDirty();
  }

  abrirBulk() {
    this.showBulkModal.set(true);
  }

  fecharBulk() {
    this.showBulkModal.set(false);
  }

  onBulkCompleted() {
    this.carregar();
  }
}
