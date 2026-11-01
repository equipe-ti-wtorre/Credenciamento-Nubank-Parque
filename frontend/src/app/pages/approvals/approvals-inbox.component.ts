import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NavigationStateService } from '../../core/services/navigation-state.service';
import {
  ApprovalEntityCollaborator,
  ApprovalEntityVehicle,
  ApprovalItem,
  ApprovalService,
  approvalEntityBadgeClass,
  approvalEntityLabel,
  approvalHistoryDotClass,
  approvalItemTitle,
  approvalStatusBadgeClass,
  approvalStatusLabel,
  liberacaoStatusBadgeClass,
  liberacaoStatusLabel,
  toPositiveId,
  toPositiveIdSet,
} from '../../services/approval.service';
import { CollaboratorService } from '../../services/collaborator.service';
import { EventAccreditationService } from '../../services/event-accreditation.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  BraceletChipComponent,
  BraceletSelectComponent,
} from '../../shared/bracelet-chip';
import { AuthService, hasPermission } from '../../core/services/auth.service';

type InboxTab = 'pending' | 'mine' | 'team';

@Component({
  selector: 'app-approvals-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    BraceletChipComponent,
    BraceletSelectComponent,
  ],
  template: `
    <div class="w-full">
      <div *ngIf="canViewApprovals()" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div class="stat-card">
          <div class="stat-card__icon">
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-500 font-medium">Pendentes para mim</p>
            <p class="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
              {{ summaryPendingCount() }}
            </p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card__icon">
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-500 font-medium">Acessos de serviço</p>
            <p class="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
              {{ summaryServiceAccessCount() }}
            </p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card__icon">
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-500 font-medium">Eventos</p>
            <p class="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
              {{ summaryEventCount() }}
            </p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card__icon">
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <circle cx="8" cy="11" r="2" />
              <path d="M5 16c.7-1.3 1.8-2 3-2s2.3.7 3 2M15 9h4M15 13h3" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-500 font-medium">Credenciamento</p>
            <p class="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
              {{ summaryAccreditationCount() }}
            </p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-card__icon">
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm text-slate-500 font-medium">Total de solicitações</p>
            <p class="text-2xl font-bold text-slate-900 leading-tight mt-0.5">
              {{ summaryTeamCount() }}
            </p>
          </div>
        </div>
      </div>

      <div class="flex gap-2 mb-4 border-b border-slate-200 overflow-x-auto">
        <button
          *ngIf="canViewApprovals()"
          type="button"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          [class.border-[var(--color-primary)]]="tab() === 'pending'"
          [class.text-[var(--color-primary-dark)]]="tab() === 'pending'"
          [class.border-transparent]="tab() !== 'pending'"
          [class.text-slate-500]="tab() !== 'pending'"
          (click)="setTab('pending')"
        >
          Pendentes para mim
          <span
            class="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold bg-sky-100 text-sky-800"
          >
            {{ summaryPendingCount() }}
          </span>
        </button>
        <button
          *ngIf="canViewApprovals()"
          type="button"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          [class.border-[var(--color-primary)]]="tab() === 'mine'"
          [class.text-[var(--color-primary-dark)]]="tab() === 'mine'"
          [class.border-transparent]="tab() !== 'mine'"
          [class.text-slate-500]="tab() !== 'mine'"
          (click)="setTab('mine')"
        >
          Minhas solicitações
          <span
            class="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold bg-slate-100 text-slate-700"
          >
            {{ summaryMineCount() }}
          </span>
        </button>
        <button
          *ngIf="canViewApprovals()"
          type="button"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          [class.border-[var(--color-primary)]]="tab() === 'team'"
          [class.text-[var(--color-primary-dark)]]="tab() === 'team'"
          [class.border-transparent]="tab() !== 'team'"
          [class.text-slate-500]="tab() !== 'team'"
          (click)="setTab('team')"
        >
          Solicitações da equipe
          <span
            class="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold bg-slate-100 text-slate-700"
          >
            {{ summaryTeamCount() }}
          </span>
        </button>
      </div>

      <p *ngIf="loading()" class="text-center text-slate-500 py-8">Carregando...</p>

      <div *ngIf="!loading()" class="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <section class="min-w-0">
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
              <svg
                class="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              Acessos de serviço
              <span class="inline-flex min-w-[1.15rem] h-4 px-1 items-center justify-center rounded-full text-[10px] font-bold bg-sky-600 text-white">
                {{ serviceAccessItems().length }}
              </span>
            </span>
          </div>
          <div class="space-y-3">
            <ng-container *ngFor="let item of serviceAccessItems()">
              <ng-container *ngTemplateOutlet="approvalCard; context: { $implicit: item }" />
            </ng-container>
            <p
              *ngIf="!serviceAccessItems().length"
              class="card-surface p-6 text-center text-sm text-slate-500"
            >
              Nenhum acesso de serviço nesta lista.
            </p>
          </div>
        </section>

        <section class="min-w-0">
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
              <svg
                class="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              Eventos
              <span class="inline-flex min-w-[1.15rem] h-4 px-1 items-center justify-center rounded-full text-[10px] font-bold bg-violet-600 text-white">
                {{ eventItems().length }}
              </span>
            </span>
          </div>
          <div class="space-y-3">
            <ng-container *ngFor="let item of eventItems()">
              <ng-container *ngTemplateOutlet="approvalCard; context: { $implicit: item }" />
            </ng-container>
            <p *ngIf="!eventItems().length" class="card-surface p-6 text-center text-sm text-slate-500">
              Nenhum evento nesta lista.
            </p>
          </div>
        </section>

        <section class="min-w-0">
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              Credenciamento
              <span class="inline-flex min-w-[1.15rem] h-4 px-1 items-center justify-center rounded-full text-[10px] font-bold bg-amber-600 text-white">
                {{ accreditationItems().length }}
              </span>
            </span>
          </div>
          <div class="space-y-3">
            <ng-container *ngFor="let item of accreditationItems()">
              <ng-container *ngTemplateOutlet="approvalCard; context: { $implicit: item }" />
            </ng-container>
            <p *ngIf="!accreditationItems().length" class="card-surface p-6 text-center text-sm text-slate-500">
              Nenhum credenciamento nesta lista.
            </p>
          </div>
        </section>
      </div>

      <ng-template #approvalCard let-item>
        <article
          class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.12)] transition duration-200 hover:-translate-y-px hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-12px_rgba(15,23,42,.18)]"
        >
          <span aria-hidden="true" class="absolute inset-y-0 left-0 w-1" [ngClass]="cardBarClass(item)"></span>

          <div class="p-5 pl-6 sm:p-6 sm:pl-7">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                  <span class="tabular-nums">{{ entityLabel(item.tipoEntidade) }} #{{ item.idEntidade }}</span>
                  <span class="h-1 w-1 rounded-full bg-slate-300"></span>
                  <span
                    class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
                  >
                    <svg
                      *ngIf="item.tipoEntidade === 'ACESSO_SERVICO'"
                      class="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                      />
                    </svg>
                    <svg
                      *ngIf="item.tipoEntidade === 'EVENTO'"
                      class="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" />
                    </svg>
                    <svg
                      *ngIf="item.tipoEntidade === 'CREDENCIAMENTO_EVENTO' || item.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO'"
                      class="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <circle cx="8" cy="12" r="2" />
                      <path d="M15 9h4M15 13h3" />
                    </svg>
                    {{ item.setor.nome }}
                  </span>
                </div>
                <h2 class="mt-1.5 break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  {{ itemTitle(item) }}
                </h2>
              </div>

              <span
                class="inline-flex shrink-0 self-start items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
                [ngClass]="statusPillClass(item)"
              >
                <span class="h-1.5 w-1.5 rounded-full" [ngClass]="statusPillDotClass(item)"></span>
                {{ statusPillLabel(item) }}
              </span>
            </div>

            <div class="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8 xl:grid-cols-1 xl:gap-5">
              <dl class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3.5 self-start sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-1">
                <div
                  class="flex items-start gap-2.5"
                  *ngIf="item.entidadeResumo?.startDate || item.entidadeResumo?.endDate"
                >
                  <svg
                    class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <div class="min-w-0">
                    <dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Período</dt>
                    <dd class="break-words tabular-nums text-sm font-medium text-slate-800">
                      {{ periodLabel(item) }}
                      <span
                        *ngIf="periodDays(item) as days"
                        class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500"
                      >
                        {{ days }} {{ days === 1 ? 'dia' : 'dias' }}
                      </span>
                    </dd>
                  </div>
                </div>

                <div class="flex items-start gap-2.5">
                  <svg
                    class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 21h18M5 21V7l7-4 7 4v14M10 21v-5h4v5" />
                  </svg>
                  <div class="min-w-0">
                    <dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time aprovador</dt>
                    <dd class="text-sm font-medium text-slate-800">{{ item.setor.nome }}</dd>
                  </div>
                </div>

                <div
                  class="flex items-start gap-2.5"
                  *ngIf="tab() !== 'mine' || item.solicitante?.nome"
                >
                  <svg
                    class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <div class="min-w-0">
                    <dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Solicitante
                    </dt>
                    <dd class="flex min-w-0 items-start gap-2 text-sm font-medium text-slate-800">
                      <span
                        *ngIf="item.solicitante?.nome"
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600"
                      >
                        {{ initials(item.solicitante.nome) }}
                      </span>
                      <span class="min-w-0 break-words">{{ item.solicitante?.nome || '—' }}</span>
                    </dd>
                  </div>
                </div>
              </dl>

              <div
                *ngIf="item.liberacaoResumo"
                class="grid min-w-0 w-full gap-3 sm:grid-cols-2 md:w-[min(340px,100%)] md:grid-cols-1 xl:w-full"
                aria-label="Resumo de liberação"
              >
                <div class="rounded-xl border px-4 py-3" [ngClass]="axisCardClass(item, 'colaboradores')">
                  <div class="flex items-center justify-between">
                    <span
                      class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Colaboradores
                    </span>
                    <span class="tabular-nums text-[11px] font-medium text-slate-400">
                      {{ item.liberacaoResumo.colaboradores.total }} no total
                    </span>
                  </div>
                  <div *ngIf="showLiberacaoCounts(item)" class="mt-2 flex items-baseline gap-2">
                    <span class="tabular-nums text-2xl font-semibold leading-none text-emerald-600">
                      {{ item.liberacaoResumo.colaboradores.liberados }}
                    </span>
                    <span class="text-xs font-medium text-slate-500">
                      {{ countLabel(item.liberacaoResumo.colaboradores.liberados, 'liberado', 'liberados') }}
                    </span>
                    <span class="ml-auto flex items-baseline gap-1.5">
                      <span
                        class="tabular-nums text-sm"
                        [class.font-bold]="axisHasBlocks(item, 'colaboradores')"
                        [class.font-semibold]="!axisHasBlocks(item, 'colaboradores')"
                        [class.text-rose-600]="axisHasBlocks(item, 'colaboradores')"
                        [class.text-slate-400]="!axisHasBlocks(item, 'colaboradores')"
                      >
                        {{ item.liberacaoResumo.colaboradores.bloqueados }}
                      </span>
                      <span
                        class="text-xs"
                        [class.font-medium]="axisHasBlocks(item, 'colaboradores')"
                        [class.text-rose-600]="axisHasBlocks(item, 'colaboradores')"
                        [class.text-slate-400]="!axisHasBlocks(item, 'colaboradores')"
                      >
                        {{
                          countLabel(
                            item.liberacaoResumo.colaboradores.bloqueados,
                            'bloqueado',
                            'bloqueados'
                          )
                        }}
                      </span>
                    </span>
                  </div>
                  <div *ngIf="!showLiberacaoCounts(item)" class="mt-2 flex items-baseline gap-2">
                    <span class="tabular-nums text-2xl font-semibold leading-none text-slate-400">—</span>
                    <span class="text-xs font-medium text-slate-500">em análise</span>
                  </div>
                  <div
                    *ngIf="showLiberacaoCounts(item) && axisHasBlocks(item, 'colaboradores')"
                    class="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    [attr.aria-valuenow]="item.liberacaoResumo.colaboradores.liberados"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="item.liberacaoResumo.colaboradores.total"
                    aria-label="Colaboradores liberados"
                  >
                    <div
                      class="h-full bg-emerald-500"
                      [style.width.%]="
                        axisShare(
                          item.liberacaoResumo.colaboradores.liberados,
                          item.liberacaoResumo.colaboradores.total
                        )
                      "
                    ></div>
                    <div
                      class="h-full bg-rose-500"
                      [style.width.%]="
                        axisShare(
                          item.liberacaoResumo.colaboradores.bloqueados,
                          item.liberacaoResumo.colaboradores.total
                        )
                      "
                    ></div>
                  </div>
                  <div
                    *ngIf="showLiberacaoCounts(item) && !axisHasBlocks(item, 'colaboradores')"
                    class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    [attr.aria-valuenow]="item.liberacaoResumo.colaboradores.liberados"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="item.liberacaoResumo.colaboradores.total"
                    aria-label="Colaboradores liberados"
                  >
                    <div
                      class="h-full rounded-full bg-emerald-500"
                      [style.width.%]="
                        axisShare(
                          item.liberacaoResumo.colaboradores.liberados,
                          item.liberacaoResumo.colaboradores.total
                        )
                      "
                    ></div>
                  </div>
                  <div
                    *ngIf="!showLiberacaoCounts(item)"
                    class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                  >
                    <div
                      class="h-full w-full rounded-full bg-[repeating-linear-gradient(45deg,#cbd5e1_0_6px,#e2e8f0_6px_12px)]"
                    ></div>
                  </div>
                </div>

                <div class="rounded-xl border px-4 py-3" [ngClass]="axisCardClass(item, 'veiculos')">
                  <div class="flex items-center justify-between">
                    <span
                      class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 17h14M3 17v-5l2-5h14l2 5v5M3 17v2M21 17v2" />
                        <circle cx="7.5" cy="17" r="1.5" />
                        <circle cx="16.5" cy="17" r="1.5" />
                      </svg>
                      Veículos
                    </span>
                    <span class="tabular-nums text-[11px] font-medium text-slate-400">
                      {{ item.liberacaoResumo.veiculos.total }} no total
                    </span>
                  </div>
                  <div *ngIf="showLiberacaoCounts(item)" class="mt-2 flex items-baseline gap-2">
                    <span class="tabular-nums text-2xl font-semibold leading-none text-emerald-600">
                      {{ item.liberacaoResumo.veiculos.liberados }}
                    </span>
                    <span class="text-xs font-medium text-slate-500">
                      {{ countLabel(item.liberacaoResumo.veiculos.liberados, 'liberado', 'liberados') }}
                    </span>
                    <span class="ml-auto flex items-baseline gap-1.5">
                      <span
                        class="tabular-nums text-sm"
                        [class.font-bold]="axisHasBlocks(item, 'veiculos')"
                        [class.font-semibold]="!axisHasBlocks(item, 'veiculos')"
                        [class.text-rose-600]="axisHasBlocks(item, 'veiculos')"
                        [class.text-slate-400]="!axisHasBlocks(item, 'veiculos')"
                      >
                        {{ item.liberacaoResumo.veiculos.bloqueados }}
                      </span>
                      <span
                        class="text-xs"
                        [class.font-medium]="axisHasBlocks(item, 'veiculos')"
                        [class.text-rose-600]="axisHasBlocks(item, 'veiculos')"
                        [class.text-slate-400]="!axisHasBlocks(item, 'veiculos')"
                      >
                        {{ countLabel(item.liberacaoResumo.veiculos.bloqueados, 'bloqueado', 'bloqueados') }}
                      </span>
                    </span>
                  </div>
                  <div *ngIf="!showLiberacaoCounts(item)" class="mt-2 flex items-baseline gap-2">
                    <span class="tabular-nums text-2xl font-semibold leading-none text-slate-400">—</span>
                    <span class="text-xs font-medium text-slate-500">em análise</span>
                  </div>
                  <div
                    *ngIf="showLiberacaoCounts(item) && axisHasBlocks(item, 'veiculos')"
                    class="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    [attr.aria-valuenow]="item.liberacaoResumo.veiculos.liberados"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="item.liberacaoResumo.veiculos.total"
                    aria-label="Veículos liberados"
                  >
                    <div
                      class="h-full bg-emerald-500"
                      [style.width.%]="
                        axisShare(item.liberacaoResumo.veiculos.liberados, item.liberacaoResumo.veiculos.total)
                      "
                    ></div>
                    <div
                      class="h-full bg-rose-500"
                      [style.width.%]="
                        axisShare(item.liberacaoResumo.veiculos.bloqueados, item.liberacaoResumo.veiculos.total)
                      "
                    ></div>
                  </div>
                  <div
                    *ngIf="showLiberacaoCounts(item) && !axisHasBlocks(item, 'veiculos')"
                    class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    [attr.aria-valuenow]="item.liberacaoResumo.veiculos.liberados"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="item.liberacaoResumo.veiculos.total"
                    aria-label="Veículos liberados"
                  >
                    <div
                      class="h-full rounded-full bg-emerald-500"
                      [style.width.%]="
                        axisShare(item.liberacaoResumo.veiculos.liberados, item.liberacaoResumo.veiculos.total)
                      "
                    ></div>
                  </div>
                  <div
                    *ngIf="!showLiberacaoCounts(item)"
                    class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                  >
                    <div
                      class="h-full w-full rounded-full bg-[repeating-linear-gradient(45deg,#cbd5e1_0_6px,#e2e8f0_6px_12px)]"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-5 flex flex-col items-stretch gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p class="flex items-center gap-1.5 text-xs text-slate-400">
                <svg
                  class="h-3.5 w-3.5"
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
                Criado em
                <span class="tabular-nums font-medium text-slate-500">
                  {{ item.criadoEm | date: 'dd/MM/yyyy' }} às {{ item.criadoEm | date: 'HH:mm' }}
                </span>
              </p>

              <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <ng-container *ngIf="tab() === 'pending' && item.status === 'PENDENTE'">
                  <button
                    type="button"
                    class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--wtorre)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 sm:w-auto"
                    (click)="abrirAcao(item, 'approve')"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Aprovar
                  </button>
                  <button
                    type="button"
                    class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 sm:w-auto"
                    (click)="abrirAcao(item, 'reject')"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    Reprovar
                  </button>
                </ng-container>

                <button
                  *ngIf="tab() === 'mine' && item.status === 'PENDENTE'"
                  type="button"
                  class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                  (click)="cancelar(item)"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 focus-visible:ring-offset-2 sm:w-auto"
                  (click)="abrirDetalhe(item)"
                >
                  Ver detalhes
                  <svg
                    class="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </article>
      </ng-template>
    </div>

    <app-modal
      [open]="detailOpen()"
      [title]="detailModalTitle()"
      [subtitle]="detailModalSubtitle()"
      size="xl"
      (close)="fecharDetalhe()"
    >
      <div *ngIf="detailLoading()" class="text-sm text-slate-500 py-8 text-center">Carregando...</div>

      <div *ngIf="!detailLoading() && detail() as d" class="space-y-5">
        <div *ngIf="d.entidade as ent">
          <p class="text-xs font-bold text-slate-500 uppercase mb-2">
            Resumo —
            <span
              [ngClass]="entityBadgeClass(ent.tipo)"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold normal-case tracking-normal"
            >
              {{ entityLabel(ent.tipo) }}
            </span>
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700">
            <p>
              <span class="text-slate-500">{{
                ent.tipo === 'ACESSO_SERVICO' ? 'Finalidade:' : 'Evento:'
              }}</span>
              {{ ent.nome || '—' }}
            </p>
            <p>
              <span class="text-slate-500">Período:</span>
              {{ ent.startDate | date: 'dd/MM/yyyy' }} – {{ ent.endDate | date: 'dd/MM/yyyy' }}
            </p>
            <p *ngIf="ent.empresa"><span class="text-slate-500">Empresa:</span> {{ ent.empresa }}</p>
            <p *ngIf="ent.departamento">
              <span class="text-slate-500">Departamento:</span> {{ ent.departamento }}
            </p>
            <p class="sm:col-span-2" *ngIf="ent.observacao">
              <span class="text-slate-500">Observação:</span> {{ ent.observacao }}
            </p>
            <p><span class="text-slate-500">Time aprovador:</span> {{ d.setor.nome }}</p>
            <p><span class="text-slate-500">Solicitante:</span> {{ d.solicitante.nome || '—' }}</p>
            <p>
              <span class="text-slate-500">Status:</span>
              <span
                class="inline-flex ml-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                [ngClass]="badgeClass(d.status)"
              >
                {{ d.status }}
              </span>
            </p>
          </div>
        </div>

        <div
          *ngIf="
            d.entidade?.tipo === 'ACESSO_SERVICO' ||
            d.entidade?.tipo === 'EVENTO' ||
            d.entidade?.tipo === 'CREDENCIAMENTO_EVENTO' ||
            d.entidade?.tipo === 'CREDENCIAMENTO_EVENTO_INTERNO'
          "
        >
          <div
            *ngIf="d.liberacaoResumo"
            class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm"
          >
            <div class="rounded-lg bg-slate-50 px-3 py-2.5">
              <p class="text-xs font-bold text-slate-500 uppercase mb-1">Colaboradores</p>
              <p *ngIf="d.status === 'APROVADO'">
                <span class="font-semibold text-emerald-700">
                  {{ d.liberacaoResumo.colaboradores.liberados }} liberados
                </span>
                <span class="text-slate-400 mx-1">·</span>
                <span class="font-semibold text-red-700">
                  {{ d.liberacaoResumo.colaboradores.bloqueados }} bloqueados
                </span>
              </p>
              <p *ngIf="d.status !== 'APROVADO'" class="font-semibold text-slate-800">
                {{ d.liberacaoResumo.colaboradores.total }}
              </p>
            </div>
            <div class="rounded-lg bg-slate-50 px-3 py-2.5">
              <p class="text-xs font-bold text-slate-500 uppercase mb-1">Veículos</p>
              <p *ngIf="d.status === 'APROVADO'">
                <span class="font-semibold text-emerald-700">
                  {{ d.liberacaoResumo.veiculos.liberados }} liberados
                </span>
                <span class="text-slate-400 mx-1">·</span>
                <span class="font-semibold text-red-700">
                  {{ d.liberacaoResumo.veiculos.bloqueados }} bloqueados
                </span>
              </p>
              <p *ngIf="d.status !== 'APROVADO'" class="font-semibold text-slate-800">
                {{ d.liberacaoResumo.veiculos.total }}
              </p>
            </div>
          </div>

          <p class="text-xs font-bold text-slate-500 uppercase mb-2">Colaboradores</p>
          <div *ngIf="!d.entidade?.collaborators?.length" class="text-sm text-slate-500">
            Nenhum colaborador inserido.
          </div>
          <div class="overflow-x-auto" *ngIf="d.entidade?.collaborators?.length">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-slate-500 uppercase border-b border-slate-100">
                  <th class="py-2 pr-3 font-semibold">Nome</th>
                  <th class="py-2 pr-3 font-semibold">Documento</th>
                  <th class="py-2 pr-3 font-semibold">Função</th>
                  <th class="py-2 pr-3 font-semibold">Pulseira</th>
                  <th class="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let c of d.entidade?.collaborators"
                  class="border-b border-slate-50 last:border-0"
                >
                  <td class="py-2 pr-3 text-slate-800 min-w-[11rem]">
                    {{ c.nome }}
                    <span class="block text-xs text-slate-500" *ngIf="c.empresa || c.fase">
                      <ng-container *ngIf="c.empresa">{{ c.empresa }}</ng-container>
                      <ng-container *ngIf="c.empresa && c.fase"> · </ng-container>
                      <ng-container *ngIf="c.fase">{{ c.fase }}</ng-container>
                      <ng-container *ngIf="c.dataDia"> · {{ c.dataDia | date: 'dd/MM/yyyy' }}</ng-container>
                    </span>
                  </td>
                  <td class="py-2 pr-3 text-slate-600 break-all">{{ c.documento }}</td>
                  <td class="py-2 pr-3 text-slate-600">{{ c.funcao }}</td>
                  <td class="py-2 pr-3 whitespace-nowrap">
                    <app-bracelet-select
                      *ngIf="canEditBracelet(c, d)"
                      [options]="braceletOptions(d)"
                      [value]="c.idBraceletType ?? null"
                      [disabled]="acting()"
                      [ariaLabel]="'Pulseira de ' + c.nome"
                      (valueChange)="onPickBracelet(c, $event, d)"
                    />
                    <app-bracelet-chip
                      *ngIf="!canEditBracelet(c, d) && (c.pulseira || c.idBraceletType)"
                      [name]="c.pulseira || ''"
                      [icon]="c.braceletIcon"
                      [color]="c.braceletColor"
                    />
                    <span *ngIf="!canEditBracelet(c, d) && !c.pulseira && !c.idBraceletType" class="text-slate-400">
                      —
                    </span>
                  </td>
                  <td class="py-2 whitespace-nowrap">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [ngClass]="liberacaoBadgeClass(c.statusLiberacao)"
                    >
                      {{ liberacaoLabel(c.statusLiberacao) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-3" *ngIf="d.entidade?.vehicles?.length">
            <p class="text-xs font-bold text-slate-500 uppercase mb-2">Veículos</p>
            <ul class="text-sm text-slate-700 space-y-2">
              <li *ngFor="let v of d.entidade?.vehicles" class="flex flex-wrap items-center gap-2">
                <span>
                  {{ v.placa }}
                  <span class="text-slate-500" *ngIf="v.marca || v.modelo">
                    — {{ v.marca }} {{ v.modelo }}
                  </span>
                  <span class="text-slate-500" *ngIf="v.empresa || v.fase">
                    ·
                    <ng-container *ngIf="v.empresa">{{ v.empresa }}</ng-container>
                    <ng-container *ngIf="v.empresa && v.fase"> · </ng-container>
                    <ng-container *ngIf="v.fase">{{ v.fase }}</ng-container>
                  </span>
                </span>
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [ngClass]="liberacaoBadgeClass(v.statusLiberacao)"
                >
                  {{ liberacaoLabel(v.statusLiberacao) }}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <p class="text-xs font-bold text-slate-500 uppercase mb-3">Histórico</p>
          <div *ngIf="!d.historico?.length" class="text-sm text-slate-500">
            Nenhum evento registrado.
          </div>
          <ol class="relative border-l border-slate-200 ml-2 space-y-4" *ngIf="d.historico?.length">
            <li *ngFor="let h of d.historico; let i = index" class="relative ml-4">
              <span
                class="absolute -left-[1.4rem] mt-1.5 h-3 w-3 rounded-full ring-2 ring-white"
                [ngClass]="historyDotClass(h.tipo)"
              ></span>
              <p class="text-sm font-semibold text-slate-800">{{ h.titulo }}</p>
              <p class="text-xs text-slate-500">
                {{ h.data | date: 'dd/MM/yyyy HH:mm:ss' }}
                <span *ngIf="h.usuario?.nome"> · {{ h.usuario?.nome }}</span>
              </p>
              <button
                *ngIf="h.detalhe"
                type="button"
                class="mt-1 text-xs font-semibold text-[var(--color-primary-dark)] hover:underline"
                (click)="toggleHistoryDetail(i)"
              >
                {{ isHistoryDetailOpen(i) ? 'Ocultar detalhes' : 'Ver detalhes' }}
              </button>
              <p
                class="text-sm text-slate-600 mt-1 whitespace-pre-line"
                *ngIf="h.detalhe && isHistoryDetailOpen(i)"
              >
                {{ h.detalhe }}
              </p>
            </li>
          </ol>
        </div>
      </div>

      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharDetalhe()">Fechar</button>
        <ng-container *ngIf="tab() === 'pending' && detail()?.status === 'PENDENTE'">
          <button
            type="button"
            class="btn-action-secondary"
            (click)="abrirAcaoDoDetalhe('reject')"
          >
            Reprovar
          </button>
          <button
            type="button"
            class="btn-action-primary"
            (click)="abrirAcaoDoDetalhe('approve')"
          >
            Aprovar
          </button>
        </ng-container>
      </div>
    </app-modal>

    <app-modal
      [open]="!!actionItem()"
      [title]="actionMode() === 'approve' ? 'Aprovar solicitação' : 'Reprovar solicitação'"
      [subtitle]="approveModalSubtitle()"
      [size]="actionMode() === 'approve' && hasSelectiveApproval() ? 'md' : 'sm'"
      (close)="fecharAcao()"
    >
      <div *ngIf="actionLoading()" class="text-sm text-slate-500 py-6 text-center">Carregando...</div>

      <form *ngIf="!actionLoading()" id="approval-action-form" (ngSubmit)="confirmarAcao()" class="space-y-5">
        <div>
          <label class="block text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2" for="approval-comment">
            Comentário
          </label>
          <textarea
            id="approval-comment"
            [(ngModel)]="actionComment"
            name="actionComment"
            rows="3"
            class="form-field rounded-xl min-h-[74px]"
            [placeholder]="
              actionMode() === 'reject'
                ? 'Informe o motivo da reprovação'
                : 'Adicione uma observação (opcional)'
            "
          ></textarea>
        </div>

        <ng-container *ngIf="actionMode() === 'approve' && hasSelectiveApproval()">
          <section>
            <div class="flex items-center justify-between gap-3 mb-2.5">
              <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Colaboradores
                <span
                  *ngIf="approveCollaborators().length"
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                  [ngClass]="
                    selectedCollaboratorCount() > 0
                      ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                      : 'bg-red-50 text-red-600'
                  "
                >
                  {{ selectedCollaboratorCount() }} de {{ approveCollaborators().length }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-[12.5px] font-semibold" *ngIf="approveCollaborators().length">
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllCollaborators(true)"
                >
                  Liberar todos
                </button>
                <span class="text-slate-300">·</span>
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllCollaborators(false)"
                >
                  Bloquear todos
                </button>
              </div>
            </div>

            <p *ngIf="!approveCollaborators().length" class="text-sm text-slate-500">
              Nenhum colaborador nesta solicitação.
            </p>

            <div class="flex flex-col gap-2" *ngIf="approveCollaborators().length">
              <div
                *ngFor="let c of approveCollaborators()"
                class="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-colors"
                [ngClass]="
                  isCollaboratorSelected(c.id)
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50/80 border-dashed border-slate-200'
                "
              >
                <button
                  type="button"
                  class="flex items-center gap-3 min-w-0 flex-1 text-left"
                  (click)="toggleCollaborator(c.id)"
                >
                  <span
                    class="shrink-0 w-5 h-5 rounded-md border-[1.5px] grid place-items-center transition-colors"
                    [ngClass]="
                      isCollaboratorSelected(c.id)
                        ? 'bg-[var(--wtorre)] border-[var(--wtorre)] text-white'
                        : 'bg-white border-slate-300 text-transparent'
                    "
                  >
                    <svg
                      class="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <img
                    *ngIf="pictureUrl(c) as url"
                    [src]="url"
                    [alt]="'Foto de ' + c.nome"
                    class="shrink-0 w-[34px] h-[34px] rounded-full object-cover border border-slate-200"
                  />
                  <span
                    *ngIf="!pictureUrl(c)"
                    class="shrink-0 w-[34px] h-[34px] rounded-full grid place-items-center text-[13px] font-semibold"
                    [ngClass]="
                      isCollaboratorSelected(c.id)
                        ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                        : 'bg-slate-100 text-slate-400'
                    "
                  >
                    {{ initials(c.nome) }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block text-sm font-medium truncate"
                      [ngClass]="isCollaboratorSelected(c.id) ? 'text-slate-900' : 'text-slate-400'"
                    >
                      {{ c.nome }}
                    </span>
                    <span
                      class="block text-[12.5px] truncate"
                      [ngClass]="isCollaboratorSelected(c.id) ? 'text-slate-500' : 'text-slate-400'"
                    >
                      {{ c.documento }} · {{ c.funcao }}
                      <ng-container *ngIf="c.empresa"> · {{ c.empresa }}</ng-container>
                      <ng-container *ngIf="c.fase"> · {{ c.fase }}</ng-container>
                    </span>
                  </span>
                </button>
                <app-bracelet-select
                  *ngIf="canEditBracelet(c, actionDetail())"
                  class="shrink-0"
                  [options]="braceletOptions(actionDetail())"
                  [value]="c.idBraceletType ?? null"
                  [disabled]="acting()"
                  [ariaLabel]="'Pulseira de ' + c.nome"
                  (valueChange)="onPickBracelet(c, $event, actionDetail())"
                />
                <app-bracelet-chip
                  *ngIf="!canEditBracelet(c, actionDetail()) && (c.pulseira || c.idBraceletType)"
                  class="shrink-0"
                  [name]="c.pulseira || ''"
                  [icon]="c.braceletIcon"
                  [color]="c.braceletColor"
                />
                <span
                  *ngIf="!isCollaboratorSelected(c.id)"
                  class="shrink-0 text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"
                >
                  Bloqueado
                </span>
              </div>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between gap-3 mb-2.5">
              <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
                Veículos
                <span
                  *ngIf="approveVehicles().length"
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                  [ngClass]="
                    selectedVehicleCount() > 0
                      ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                      : 'bg-red-50 text-red-600'
                  "
                >
                  {{ selectedVehicleCount() }} de {{ approveVehicles().length }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-[12.5px] font-semibold" *ngIf="approveVehicles().length">
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllVehicles(true)"
                >
                  Liberar todos
                </button>
                <span class="text-slate-300">·</span>
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllVehicles(false)"
                >
                  Bloquear todos
                </button>
              </div>
            </div>

            <p *ngIf="!approveVehicles().length" class="text-sm text-slate-500">Nenhum veículo nesta solicitação.</p>

            <div class="flex flex-col gap-2" *ngIf="approveVehicles().length">
              <button
                type="button"
                *ngFor="let v of approveVehicles()"
                class="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors"
                [ngClass]="
                  isVehicleSelected(v.id)
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/80 border-dashed border-slate-200'
                "
                (click)="toggleVehicle(v.id)"
              >
                <span
                  class="shrink-0 w-5 h-5 rounded-md border-[1.5px] grid place-items-center transition-colors"
                  [ngClass]="
                    isVehicleSelected(v.id)
                      ? 'bg-[var(--wtorre)] border-[var(--wtorre)] text-white'
                      : 'bg-white border-slate-300 text-transparent'
                  "
                >
                  <svg
                    class="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span
                  class="shrink-0 w-[34px] h-[34px] rounded-[9px] grid place-items-center"
                  [ngClass]="isVehicleSelected(v.id) ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-400'"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-sm font-medium truncate"
                    [ngClass]="isVehicleSelected(v.id) ? 'text-slate-900' : 'text-slate-400'"
                  >
                    {{ v.placa }}
                  </span>
                  <span
                    class="block text-[12.5px] truncate"
                    *ngIf="v.marca || v.modelo || v.empresa || v.fase"
                    [ngClass]="isVehicleSelected(v.id) ? 'text-slate-500' : 'text-slate-400'"
                  >
                    <ng-container *ngIf="v.marca || v.modelo">{{ v.marca }} {{ v.modelo }}</ng-container>
                    <ng-container *ngIf="(v.marca || v.modelo) && (v.empresa || v.fase)"> · </ng-container>
                    <ng-container *ngIf="v.empresa">{{ v.empresa }}</ng-container>
                    <ng-container *ngIf="v.empresa && v.fase"> · </ng-container>
                    <ng-container *ngIf="v.fase">{{ v.fase }}</ng-container>
                  </span>
                </span>
                <span
                  *ngIf="!isVehicleSelected(v.id)"
                  class="shrink-0 text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"
                >
                  Bloqueado
                </span>
              </button>
            </div>
          </section>

          <div class="flex gap-2.5 items-start text-[12.5px] text-slate-500 bg-slate-50 rounded-[10px] px-3.5 py-3">
            <svg
              class="w-4 h-4 shrink-0 mt-0.5 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>
              Itens desmarcados são aprovados na solicitação, mas
              <span class="font-semibold text-slate-700">não recebem credencial</span>
              na portaria.
            </span>
          </div>
        </ng-container>
      </form>

      <div
        modal-footer
        class="modal-footer !justify-between !items-center gap-3 flex-wrap sm:flex-nowrap"
      >
        <span
          *ngIf="actionMode() === 'approve' && hasSelectiveApproval() && !actionLoading()"
          class="text-[12.5px] text-slate-500 order-last sm:order-first w-full sm:w-auto"
        >
          <ng-container *ngIf="liberatedItemsCount() === 0">Nenhum item liberado</ng-container>
          <ng-container *ngIf="liberatedItemsCount() === 1">
            <span class="font-semibold text-slate-900">1</span> item liberado
          </ng-container>
          <ng-container *ngIf="liberatedItemsCount() > 1">
            <span class="font-semibold text-slate-900">{{ liberatedItemsCount() }}</span> itens liberados
          </ng-container>
        </span>
        <div class="flex gap-2.5 ml-auto">
          <button type="button" class="btn-action-secondary rounded-full" (click)="fecharAcao()">
            Cancelar
          </button>
          <button
            type="submit"
            form="approval-action-form"
            class="btn-action-primary rounded-full"
            [disabled]="acting() || actionLoading()"
          >
            <svg
              *ngIf="!acting() && actionMode() === 'approve'"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {{
              acting()
                ? 'Registrando...'
                : (actionMode() === 'approve' ? 'Confirmar aprovação' : 'Confirmar reprovação')
            }}
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class ApprovalsInboxComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationStateService);
  private readonly collaboratorService = inject(CollaboratorService);
  private readonly authService = inject(AuthService);

  tab = signal<InboxTab>('pending');
  canViewApprovals = signal(false);
  items = signal<ApprovalItem[]>([]);
  pendingSummary = signal<ApprovalItem[]>([]);
  teamSummary = signal<ApprovalItem[]>([]);
  pendingTotal = signal(0);
  mineTotal = signal(0);
  teamTotal = signal(0);
  loading = signal(false);
  detailOpen = signal(false);
  detailLoading = signal(false);
  detail = signal<ApprovalItem | null>(null);
  historyDetailOpen = signal<Set<number>>(new Set());

  actionItem = signal<ApprovalItem | null>(null);
  actionMode = signal<'approve' | 'reject'>('approve');
  actionComment = '';
  acting = signal(false);
  actionLoading = signal(false);
  actionDetail = signal<ApprovalItem | null>(null);
  selectedCollaboratorIds = signal<Set<number>>(new Set());
  selectedVehicleIds = signal<Set<number>>(new Set());
  thumbnailUrls = signal<Record<number, string>>({});
  private thumbnailLoadId = 0;

  readonly entityLabel = approvalEntityLabel;
  readonly entityBadgeClass = approvalEntityBadgeClass;
  readonly badgeClass = approvalStatusBadgeClass;
  readonly itemTitle = approvalItemTitle;
  readonly historyDotClass = approvalHistoryDotClass;
  readonly liberacaoLabel = liberacaoStatusLabel;
  readonly liberacaoBadgeClass = liberacaoStatusBadgeClass;

  private deepLinkHandled = false;

  constructor(
    private approvalService: ApprovalService,
    private eventAccreditation: EventAccreditationService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.canViewApprovals.set(hasPermission(user, 'approvals', 'view'));
    this.carregar();
  }

  ngOnDestroy() {
    this.revokeThumbnails();
  }

  private openDeepLinkIfNeeded() {
    if (this.deepLinkHandled) return;
    const idParam = this.route.snapshot.queryParamMap.get('id');
    const actionParam = this.route.snapshot.queryParamMap.get('action');
    if (!idParam) return;
    this.deepLinkHandled = true;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idParam);
    if (!uuid) {
      void this.router.navigate(['/aprovacoes'], { replaceUrl: true });
      return;
    }
    void this.router.navigate(['/aprovacoes/abrir', idParam], {
      queryParams: actionParam ? { action: actionParam } : {},
      replaceUrl: true,
    });
  }

  serviceAccessItems(): ApprovalItem[] {
    return this.items().filter((item) => item.tipoEntidade === 'ACESSO_SERVICO');
  }

  eventItems(): ApprovalItem[] {
    return this.items().filter((item) => item.tipoEntidade === 'EVENTO');
  }

  accreditationItems(): ApprovalItem[] {
    return this.items().filter(
      (item) =>
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO',
    );
  }

  summaryPendingCount(): number {
    return this.pendingTotal();
  }

  summaryMineCount(): number {
    return this.mineTotal();
  }

  summaryTeamCount(): number {
    return this.teamTotal();
  }

  summaryServiceAccessCount(): number {
    return this.teamSummary().filter((item) => item.tipoEntidade === 'ACESSO_SERVICO').length;
  }

  summaryEventCount(): number {
    return this.teamSummary().filter((item) => item.tipoEntidade === 'EVENTO').length;
  }

  summaryAccreditationCount(): number {
    return this.teamSummary().filter(
      (item) =>
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO',
    ).length;
  }

  hasSelectiveApproval(): boolean {
    const tipo = this.actionItem()?.tipoEntidade;
    return (
      tipo === 'ACESSO_SERVICO' ||
      tipo === 'EVENTO' ||
      tipo === 'CREDENCIAMENTO_EVENTO' ||
      tipo === 'CREDENCIAMENTO_EVENTO_INTERNO'
    );
  }

  approveCollaborators(): ApprovalEntityCollaborator[] {
    return this.actionDetail()?.entidade?.collaborators ?? [];
  }

  isAccreditationItem(item: ApprovalItem | null | undefined): boolean {
    const tipo = item?.tipoEntidade;
    return tipo === 'CREDENCIAMENTO_EVENTO' || tipo === 'CREDENCIAMENTO_EVENTO_INTERNO';
  }

  braceletOptions(item: ApprovalItem | null | undefined) {
    return item?.entidade?.braceletTypes ?? [];
  }

  braceletTarget(item: ApprovalItem | null | undefined): 'company' | 'internal' {
    return item?.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO' ? 'internal' : 'company';
  }

  canEditBracelet(
    c: ApprovalEntityCollaborator,
    item: ApprovalItem | null | undefined,
  ): boolean {
    if (!item || item.status !== 'PENDENTE' || !this.isAccreditationItem(item)) return false;
    if (c.statusLiberacao && c.statusLiberacao !== 'PENDENTE') return false;
    return (this.braceletOptions(item).length || 0) > 0;
  }

  onPickBracelet(
    c: ApprovalEntityCollaborator,
    idBracelet: number | string | null,
    item: ApprovalItem | null | undefined,
  ): void {
    const accreditationId = toPositiveId(item?.entidade?.idAccreditation);
    const braceletId = toPositiveId(idBracelet);
    if (!item || !c || accreditationId == null || braceletId == null) return;
    if (c.idBraceletType === braceletId) return;
    this.acting.set(true);
    this.eventAccreditation
      .changeBracelet(accreditationId, {
        target: this.braceletTarget(item),
        ids: [c.id],
        id_bracelet_type: braceletId,
      })
      .subscribe({
        next: () => {
          const option = this.braceletOptions(item).find((b) => b.id_bracelet_type === braceletId);
          this.applyLocalBracelet(item, c.id, braceletId, option?.name, option?.icon, option?.color);
          this.acting.set(false);
          this.notification.success('Pulseira atualizada.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao trocar a pulseira.');
          this.cdr.markForCheck();
        },
      });
  }

  private applyLocalBracelet(
    item: ApprovalItem,
    collaboratorId: number,
    idBraceletType: number,
    name?: string | null,
    icon?: string | null,
    color?: string | null,
  ): void {
    const patch = (current: ApprovalItem | null): ApprovalItem | null => {
      if (!current?.entidade || current.id !== item.id) return current;
      return {
        ...current,
        entidade: {
          ...current.entidade,
          collaborators: current.entidade.collaborators.map((row) =>
            row.id === collaboratorId
              ? {
                  ...row,
                  idBraceletType,
                  pulseira: name ?? row.pulseira,
                  braceletIcon: icon ?? row.braceletIcon,
                  braceletColor: color ?? row.braceletColor,
                }
              : row,
          ),
        },
      };
    };
    this.actionDetail.set(patch(this.actionDetail()));
    this.detail.set(patch(this.detail()));
  }

  approveVehicles(): ApprovalEntityVehicle[] {
    return this.actionDetail()?.entidade?.vehicles ?? [];
  }

  approveModalSubtitle(): string {
    if (this.actionMode() === 'reject') {
      return 'Informe o motivo da reprovação.';
    }
    if (this.hasSelectiveApproval()) {
      return 'Marque quem recebe acesso. Desmarque para bloquear na portaria.';
    }
    return 'Comentário opcional para o solicitante.';
  }

  private static readonly SUMMARY_PAGE_SIZE = 100;

  carregar() {
    this.loading.set(true);
    this.refreshSummaries();

    if (this.tab() === 'pending') {
      this.approvalService.listPending().subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.items.set(data);
          this.pendingSummary.set(data);
          this.pendingTotal.set(Number(res.pagination?.total) || data.length);
          this.loading.set(false);
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.items.set([]);
          this.pendingSummary.set([]);
          this.pendingTotal.set(0);
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
      });
      return;
    }

    if (this.tab() === 'team') {
      this.approvalService.listTeam(1, ApprovalsInboxComponent.SUMMARY_PAGE_SIZE).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.items.set(data);
          this.teamSummary.set(data);
          this.teamTotal.set(Number(res.pagination?.total) || data.length);
          this.loading.set(false);
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.items.set([]);
          this.teamSummary.set([]);
          this.teamTotal.set(0);
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar total de solicitações.');
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.approvalService.listMine().subscribe({
      next: (res) => {
        const data = res.data ?? [];
        this.items.set(data);
        this.mineTotal.set(Number(res.pagination?.total) || data.length);
        this.loading.set(false);
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.items.set([]);
        this.mineTotal.set(0);
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
    });
  }

  /** Mantém cards/badges de totais atualizados em qualquer aba. */
  private refreshSummaries() {
    if (this.tab() !== 'pending') {
      this.approvalService.listPending().subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.pendingSummary.set(data);
          this.pendingTotal.set(Number(res.pagination?.total) || data.length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
    if (this.tab() !== 'mine') {
      this.approvalService.listMine().subscribe({
        next: (res) => {
          this.mineTotal.set(Number(res.pagination?.total) || (res.data ?? []).length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
    if (this.tab() !== 'team') {
      this.approvalService.listTeam(1, ApprovalsInboxComponent.SUMMARY_PAGE_SIZE).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.teamSummary.set(data);
          this.teamTotal.set(Number(res.pagination?.total) || data.length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
  }

  abrirDetalhe(item: ApprovalItem) {
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detail.set(null);
    this.historyDetailOpen.set(new Set());
    this.cdr.markForCheck();
    this.approvalService.get(item.id).subscribe({
      next: (res) => {
        const fresh = res.approval;
        this.detail.set(fresh);
        this.syncItemStatus(fresh);
        this.detailLoading.set(false);
        if (fresh.status !== 'PENDENTE') {
          this.notification.info(
            `Solicitação já ${this.statusPastLabel(fresh.status)}.`,
            'Status atualizado ao abrir.',
          );
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.detailOpen.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar detalhe.');
        this.cdr.markForCheck();
      },
    });
  }

  fecharDetalhe() {
    this.detailOpen.set(false);
    this.detailLoading.set(false);
    this.detail.set(null);
    this.historyDetailOpen.set(new Set());
    this.cdr.markForCheck();
  }

  detailModalTitle(): string {
    const d = this.detail();
    if (!d) return 'Detalhes da solicitação';
    return this.itemTitle(d);
  }

  detailModalSubtitle(): string {
    const d = this.detail();
    if (!d) return 'Carregando informações...';
    return `${this.entityLabel(d.tipoEntidade)} #${d.idEntidade} · ${d.setor.nome}`;
  }

  abrirAcaoDoDetalhe(mode: 'approve' | 'reject') {
    const d = this.detail();
    if (!d) return;
    this.fecharDetalhe();
    this.abrirAcao(d, mode);
  }

  isHistoryDetailOpen(index: number): boolean {
    return this.historyDetailOpen().has(index);
  }

  toggleHistoryDetail(index: number) {
    const next = new Set(this.historyDetailOpen());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.historyDetailOpen.set(next);
    this.cdr.markForCheck();
  }

  setTab(t: InboxTab) {
    this.tab.set(t);
    this.fecharDetalhe();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: t === 'pending' ? null : t },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.carregar();
  }

  abrirAcao(item: ApprovalItem, mode: 'approve' | 'reject') {
    this.actionItem.set(item);
    this.actionMode.set(mode);
    this.actionComment = '';
    this.actionDetail.set(null);
    this.selectedCollaboratorIds.set(new Set());
    this.selectedVehicleIds.set(new Set());
    this.actionLoading.set(true);
    this.cdr.markForCheck();

    // Sempre revalida status ao entrar na ação (evita decisão duplicada com lista stale)
    this.approvalService.get(item.id).subscribe({
      next: (res) => {
        const fresh = res.approval;
        this.syncItemStatus(fresh);
        this.actionLoading.set(false);

        if (fresh.status !== 'PENDENTE') {
          this.fecharAcao();
          this.notification.warning(
            `Solicitação já ${this.statusPastLabel(fresh.status)}.`,
            'Outro membro da equipe já registrou a decisão.',
          );
          this.carregar();
          this.cdr.markForCheck();
          return;
        }

        this.actionItem.set(fresh);
        if (
          mode === 'approve' &&
          (fresh.tipoEntidade === 'ACESSO_SERVICO' ||
            fresh.tipoEntidade === 'EVENTO' ||
            fresh.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
            fresh.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO')
        ) {
          this.initApproveSelection(fresh);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading.set(false);
        this.fecharAcao();
        this.notification.notifyHttpError(err, 'Falha ao carregar dados para aprovação.');
        this.cdr.markForCheck();
      },
    });
  }

  private statusPastLabel(status: string): string {
    if (status === 'APROVADO') return 'aprovada';
    if (status === 'REPROVADO') return 'reprovada';
    if (status === 'CANCELADO') return 'cancelada';
    if (status === 'EXPIRADO') return 'finalizada (tempo de autorização expirada)';
    return 'finalizada';
  }

  /** Atualiza o card da lista com o status fresco (ao abrir solicitação). */
  private syncItemStatus(fresh: ApprovalItem) {
    this.items.update((list) =>
      list.map((it) => (it.id === fresh.id ? { ...it, status: fresh.status } : it)),
    );
    this.pendingSummary.update((list) =>
      list
        .map((it) => (it.id === fresh.id ? { ...it, status: fresh.status } : it))
        .filter((it) => it.status === 'PENDENTE'),
    );
    this.pendingTotal.set(this.pendingSummary().length);
    // Se estava em "Aguardando" e já não está pendente, some da aba pendentes
    if (this.tab() === 'pending' && fresh.status !== 'PENDENTE') {
      this.items.update((list) => list.filter((it) => it.id !== fresh.id));
    }
    const d = this.detail();
    if (d?.id === fresh.id) {
      this.detail.set({ ...d, ...fresh });
    }
  }

  private initApproveSelection(approval: ApprovalItem) {
    this.actionDetail.set(approval);
    this.selectedCollaboratorIds.set(
      toPositiveIdSet((approval.entidade?.collaborators ?? []).map((c) => c.id)),
    );
    this.selectedVehicleIds.set(
      toPositiveIdSet((approval.entidade?.vehicles ?? []).map((v) => v.id)),
    );
    this.loadThumbnails(approval.entidade?.collaborators ?? []);
    this.cdr.markForCheck();
  }

  pictureUrl(c: ApprovalEntityCollaborator): string | null {
    return this.thumbnailUrls()[c.idCollaborator] ?? null;
  }

  initials(nome: string): string {
    const parts = (nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  blockedTotal(item: ApprovalItem): number {
    const resumo = item.liberacaoResumo;
    if (!resumo) return 0;
    return Number(resumo.colaboradores?.bloqueados || 0) + Number(resumo.veiculos?.bloqueados || 0);
  }

  hasBlocks(item: ApprovalItem): boolean {
    return item.status === 'APROVADO' && this.blockedTotal(item) > 0;
  }

  showLiberacaoCounts(item: ApprovalItem): boolean {
    return item.status === 'APROVADO';
  }

  cardBarClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-500';
    if (this.hasBlocks(item)) return 'bg-orange-500';
    if (item.status === 'APROVADO') return 'bg-emerald-500';
    if (item.status === 'PENDENTE') return 'bg-amber-400';
    return 'bg-slate-300';
  }

  statusPillClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-50 text-rose-700 ring-rose-600/20';
    if (this.hasBlocks(item)) return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    if (item.status === 'APROVADO') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    if (item.status === 'PENDENTE') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    return 'bg-slate-100 text-slate-600 ring-slate-400/20';
  }

  statusPillDotClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-500';
    if (this.hasBlocks(item)) return 'bg-orange-500';
    if (item.status === 'APROVADO') return 'bg-emerald-500';
    if (item.status === 'PENDENTE') return 'bg-amber-500';
    return 'bg-slate-400';
  }

  statusPillLabel(item: ApprovalItem): string {
    if (this.hasBlocks(item)) return 'Liberado parcialmente';
    if (item.status === 'PENDENTE') return 'Aguardando aprovação';
    return approvalStatusLabel(item.status);
  }

  axisHasBlocks(item: ApprovalItem, axis: 'colaboradores' | 'veiculos'): boolean {
    if (item.status !== 'APROVADO') return false;
    return Number(item.liberacaoResumo?.[axis]?.bloqueados || 0) > 0;
  }

  axisCardClass(item: ApprovalItem, axis: 'colaboradores' | 'veiculos'): string {
    return this.axisHasBlocks(item, axis)
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-slate-200 bg-slate-50/60';
  }

  axisShare(part: number, total: number): number {
    const t = Number(total) || 0;
    if (t <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(part) / t) * 100));
  }

  countLabel(count: number, singular: string, plural: string): string {
    return Number(count) === 1 ? singular : plural;
  }

  periodDays(item: ApprovalItem): number | null {
    const start = item.entidadeResumo?.startDate;
    const end = item.entidadeResumo?.endDate;
    if (!start || !end) return null;
    const parse = (value: string) => {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
      if (!y || !m || !d) return NaN;
      return Date.UTC(y, m - 1, d);
    };
    const from = parse(start);
    const to = parse(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.max(1, Math.round((to - from) / 86400000) + 1);
  }

  periodLabel(item: ApprovalItem): string {
    const start = item.entidadeResumo?.startDate;
    const end = item.entidadeResumo?.endDate;
    if (!start && !end) return '—';
    const fmt = (value: string, opts: Intl.DateTimeFormatOptions) => {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1)
        .toLocaleDateString('pt-BR', opts)
        .replace(/\./g, '');
    };
    if (start && end) {
      const sameMonth =
        String(start).slice(0, 7) === String(end).slice(0, 7);
      const startPart = fmt(start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
      const endPart = fmt(end, { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startPart} – ${endPart}`;
    }
    return fmt((start || end) as string, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private loadThumbnails(list: ApprovalEntityCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.picture) continue;
      this.collaboratorService.getPictureBlob(c.picture).subscribe({
        next: (url) => {
          if (loadId !== this.thumbnailLoadId) return;
          this.thumbnailUrls.update((map) => ({ ...map, [c.idCollaborator]: url }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    this.thumbnailUrls.set({});
  }

  isCollaboratorSelected(id: number): boolean {
    const n = toPositiveId(id);
    return n != null && this.selectedCollaboratorIds().has(n);
  }

  isVehicleSelected(id: number): boolean {
    const n = toPositiveId(id);
    return n != null && this.selectedVehicleIds().has(n);
  }

  selectedCollaboratorCount(): number {
    return this.selectedCollaboratorIds().size;
  }

  selectedVehicleCount(): number {
    return this.selectedVehicleIds().size;
  }

  liberatedItemsCount(): number {
    return this.selectedCollaboratorCount() + this.selectedVehicleCount();
  }

  toggleCollaborator(id: number) {
    const n = toPositiveId(id);
    if (n == null) return;
    const next = new Set(this.selectedCollaboratorIds());
    if (next.has(n)) next.delete(n);
    else next.add(n);
    this.selectedCollaboratorIds.set(next);
    this.cdr.markForCheck();
  }

  toggleVehicle(id: number) {
    const n = toPositiveId(id);
    if (n == null) return;
    const next = new Set(this.selectedVehicleIds());
    if (next.has(n)) next.delete(n);
    else next.add(n);
    this.selectedVehicleIds.set(next);
    this.cdr.markForCheck();
  }

  markAllCollaborators(selected: boolean) {
    this.selectedCollaboratorIds.set(
      selected ? toPositiveIdSet(this.approveCollaborators().map((c) => c.id)) : new Set(),
    );
    this.cdr.markForCheck();
  }

  markAllVehicles(selected: boolean) {
    this.selectedVehicleIds.set(
      selected ? toPositiveIdSet(this.approveVehicles().map((v) => v.id)) : new Set(),
    );
    this.cdr.markForCheck();
  }

  fecharAcao() {
    this.actionItem.set(null);
    this.actionComment = '';
    this.actionDetail.set(null);
    this.actionLoading.set(false);
    this.selectedCollaboratorIds.set(new Set());
    this.selectedVehicleIds.set(new Set());
    this.revokeThumbnails();
  }

  confirmarAcao() {
    const item = this.actionItem();
    if (!item) return;
    if (this.actionMode() === 'reject' && !this.actionComment.trim()) {
      this.notification.error('Comentário é obrigatório ao reprovar.');
      return;
    }
    this.acting.set(true);

    if (this.actionMode() === 'approve') {
      const payload: {
        comentario?: string;
        approvedCollaboratorIds?: number[];
        approvedVehicleIds?: number[];
      } = {
        comentario: this.actionComment.trim() || undefined,
      };
      if (
        item.tipoEntidade === 'ACESSO_SERVICO' ||
        item.tipoEntidade === 'EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO'
      ) {
        payload.approvedCollaboratorIds = [...this.selectedCollaboratorIds()];
        payload.approvedVehicleIds = [...this.selectedVehicleIds()];
      }
      this.approvalService.approve(item.id, payload).subscribe({
        next: () => this.onActionSuccess(),
        error: (err) => this.onActionError(err),
      });
      return;
    }

    this.approvalService.reject(item.id, this.actionComment.trim()).subscribe({
      next: () => this.onActionSuccess(),
      error: (err) => this.onActionError(err),
    });
  }

  private onActionSuccess() {
    this.acting.set(false);
    this.fecharAcao();
    this.notification.success('Decisão registrada.');
    this.carregar();
  }

  private onActionError(err: unknown) {
    this.acting.set(false);
    this.notification.notifyHttpError(err, 'Falha ao registrar decisão.');
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status === 409) {
      this.fecharAcao();
      this.fecharDetalhe();
      this.carregar();
    }
    this.cdr.markForCheck();
  }

  cancelar(item: ApprovalItem) {
    this.approvalService.cancel(item.id).subscribe({
      next: () => {
        this.notification.success('Solicitação cancelada.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao cancelar.'),
    });
  }
}
