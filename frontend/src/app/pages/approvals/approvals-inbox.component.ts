import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  liberacaoStatusBadgeClass,
  liberacaoStatusLabel,
} from '../../services/approval.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModalComponent } from '../../shared/modal/modal.component';

@Component({
  selector: 'app-approvals-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="w-full">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
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
      </div>

      <div class="flex gap-2 mb-4 border-b border-slate-200">
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-2"
          [class.border-[var(--color-primary)]]="tab() === 'pending'"
          [class.text-[var(--color-primary-dark)]]="tab() === 'pending'"
          [class.border-transparent]="tab() !== 'pending'"
          [class.text-slate-500]="tab() !== 'pending'"
          (click)="setTab('pending')"
        >
          Pendentes para mim
          <span
            *ngIf="summaryPendingCount() > 0"
            class="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold bg-sky-100 text-sky-800"
          >
            {{ summaryPendingCount() }}
          </span>
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-2"
          [class.border-[var(--color-primary)]]="tab() === 'mine'"
          [class.text-[var(--color-primary-dark)]]="tab() === 'mine'"
          [class.border-transparent]="tab() !== 'mine'"
          [class.text-slate-500]="tab() !== 'mine'"
          (click)="setTab('mine')"
        >
          Minhas solicitações
          <span
            *ngIf="tab() === 'mine' && items().length > 0"
            class="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-bold bg-slate-100 text-slate-700"
          >
            {{ items().length }}
          </span>
        </button>
      </div>

      <p *ngIf="loading()" class="text-center text-slate-500 py-8">Carregando...</p>

      <div *ngIf="!loading()" class="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
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
      </div>

      <ng-template #approvalCard let-item>
        <article class="card-surface p-5 sm:p-6 flex flex-col gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0 text-sm text-slate-500">
              <svg
                *ngIf="item.tipoEntidade === 'ACESSO_SERVICO'"
                class="w-4 h-4 shrink-0 text-slate-400"
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
                class="w-4 h-4 shrink-0 text-slate-400"
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
              <span class="truncate font-medium">
                {{ entityLabel(item.tipoEntidade) }} #{{ item.idEntidade }}
              </span>
            </div>
            <span
              class="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide"
              [ngClass]="badgeClass(item.status)"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true"></span>
              {{ item.status }}
            </span>
          </div>

          <div
            class="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6"
            [class.sm:justify-between]="item.tipoEntidade === 'ACESSO_SERVICO' && item.liberacaoResumo"
          >
            <div class="min-w-0 flex-1 space-y-3">
              <h3 class="text-xl sm:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
                {{ itemTitle(item) }}
              </h3>

              <dl class="space-y-2.5 text-sm">
                <div
                  class="flex items-start gap-2.5"
                  *ngIf="item.entidadeResumo?.startDate || item.entidadeResumo?.endDate"
                >
                  <svg
                    class="w-4 h-4 mt-0.5 shrink-0 text-slate-400"
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
                    <dt class="inline text-slate-500">Período</dt>
                    <dd class="inline text-slate-800 font-semibold ml-1.5">
                      {{ item.entidadeResumo?.startDate | date: 'dd/MM' }} –
                      {{ item.entidadeResumo?.endDate | date: 'dd/MM/yyyy' }}
                    </dd>
                  </div>
                </div>

                <div class="flex items-start gap-2.5">
                  <svg
                    class="w-4 h-4 mt-0.5 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 21h18" />
                    <path d="M5 21V7l7-4 7 4v14" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                  <div class="min-w-0">
                    <dt class="inline text-slate-500">Setor</dt>
                    <dd class="inline text-slate-800 font-semibold ml-1.5">{{ item.setor.nome }}</dd>
                  </div>
                </div>

                <div class="flex items-start gap-2.5" *ngIf="tab() === 'pending'">
                  <svg
                    class="w-4 h-4 mt-0.5 shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <div class="min-w-0">
                    <dt class="inline text-slate-500">Solicitante</dt>
                    <dd class="inline text-slate-800 font-semibold ml-1.5">
                      {{ item.solicitante.nome || '—' }}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            <aside
              *ngIf="item.tipoEntidade === 'ACESSO_SERVICO' && item.liberacaoResumo"
              class="sm:w-[13.5rem] sm:shrink-0 grid grid-cols-2 sm:grid-cols-1 gap-2"
              aria-label="Resumo de liberação"
            >
              <div class="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Colaboradores
                </p>
                <div *ngIf="item.status === 'APROVADO'">
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                      {{ item.liberacaoResumo.colaboradores.liberados }}
                    </span>
                    <span class="text-xs font-medium text-emerald-700/80">liberados</span>
                  </div>
                  <div class="mt-1 flex items-baseline gap-1.5">
                    <span class="text-lg font-bold tabular-nums text-red-700 leading-none">
                      {{ item.liberacaoResumo.colaboradores.bloqueados }}
                    </span>
                    <span class="text-xs font-medium text-red-700/80">bloqueados</span>
                  </div>
                </div>
                <div *ngIf="item.status !== 'APROVADO'" class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-bold tabular-nums text-slate-800 leading-none">
                    {{ item.liberacaoResumo.colaboradores.total }}
                  </span>
                  <span class="text-xs font-medium text-slate-500">total</span>
                </div>
              </div>

              <div class="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Veículos
                </p>
                <div *ngIf="item.status === 'APROVADO'">
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-2xl font-bold tabular-nums text-emerald-700 leading-none">
                      {{ item.liberacaoResumo.veiculos.liberados }}
                    </span>
                    <span class="text-xs font-medium text-emerald-700/80">liberados</span>
                  </div>
                  <div class="mt-1 flex items-baseline gap-1.5">
                    <span class="text-lg font-bold tabular-nums text-red-700 leading-none">
                      {{ item.liberacaoResumo.veiculos.bloqueados }}
                    </span>
                    <span class="text-xs font-medium text-red-700/80">bloqueados</span>
                  </div>
                </div>
                <div *ngIf="item.status !== 'APROVADO'" class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-bold tabular-nums text-slate-800 leading-none">
                    {{ item.liberacaoResumo.veiculos.total }}
                  </span>
                  <span class="text-xs font-medium text-slate-500">total</span>
                </div>
              </div>
            </aside>
          </div>

          <div class="border-t border-slate-100 pt-3 flex items-center gap-2 text-xs text-slate-400">
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
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>Criado em {{ item.criadoEm | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <ng-container *ngIf="tab() === 'pending' && item.status === 'PENDENTE'">
              <button
                type="button"
                class="inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-semibold px-4 bg-[var(--wtorre)] text-white hover:brightness-95 transition-[filter]"
                (click)="abrirAcao(item, 'approve')"
              >
                <svg
                  class="w-3.5 h-3.5"
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
                class="inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-semibold px-4 bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                (click)="abrirAcao(item, 'reject')"
              >
                <svg
                  class="w-3.5 h-3.5"
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
              class="inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-semibold px-4 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
              (click)="cancelar(item)"
            >
              Cancelar
            </button>

            <button
              type="button"
              class="inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-semibold px-4 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors"
              (click)="abrirDetalhe(item)"
            >
              <svg
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8M8 17h8M8 9h2" />
              </svg>
              Detalhes
            </button>
          </div>
        </article>
      </ng-template>
    </div>

    <app-modal
      [open]="detailOpen()"
      [title]="detailModalTitle()"
      [subtitle]="detailModalSubtitle()"
      size="lg"
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
              <span class="text-slate-500">{{ ent.tipo === 'EVENTO' ? 'Evento:' : 'Finalidade:' }}</span>
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
            <p><span class="text-slate-500">Setor:</span> {{ d.setor.nome }}</p>
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

        <div *ngIf="d.entidade?.tipo === 'ACESSO_SERVICO'">
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
                  <th class="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let c of d.entidade?.collaborators"
                  class="border-b border-slate-50 last:border-0"
                >
                  <td class="py-2 pr-3 text-slate-800">{{ c.nome }}</td>
                  <td class="py-2 pr-3 text-slate-600">{{ c.documento }}</td>
                  <td class="py-2 pr-3 text-slate-600">{{ c.funcao }}</td>
                  <td class="py-2">
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
      [size]="actionMode() === 'approve' && isServiceAccessAction() ? 'md' : 'sm'"
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

        <ng-container *ngIf="actionMode() === 'approve' && isServiceAccessAction()">
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
              Nenhum colaborador neste acesso.
            </p>

            <div class="flex flex-col gap-2" *ngIf="approveCollaborators().length">
              <button
                type="button"
                *ngFor="let c of approveCollaborators()"
                class="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors"
                [ngClass]="
                  isCollaboratorSelected(c.id)
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/80 border-dashed border-slate-200'
                "
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
                <span
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
                  </span>
                </span>
                <span
                  *ngIf="!isCollaboratorSelected(c.id)"
                  class="shrink-0 text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"
                >
                  Bloqueado
                </span>
              </button>
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

            <p *ngIf="!approveVehicles().length" class="text-sm text-slate-500">Nenhum veículo neste acesso.</p>

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
                    *ngIf="v.marca || v.modelo"
                    [ngClass]="isVehicleSelected(v.id) ? 'text-slate-500' : 'text-slate-400'"
                  >
                    {{ v.marca }} {{ v.modelo }}
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
          *ngIf="actionMode() === 'approve' && isServiceAccessAction() && !actionLoading()"
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
export class ApprovalsInboxComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  tab = signal<'pending' | 'mine'>('pending');
  items = signal<ApprovalItem[]>([]);
  pendingSummary = signal<ApprovalItem[]>([]);
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
    private notification: NotificationService,
  ) {}

  ngOnInit() {
    this.carregar();
  }

  private openDeepLinkIfNeeded() {
    if (this.deepLinkHandled) return;
    const idParam = this.route.snapshot.queryParamMap.get('id');
    const actionParam = this.route.snapshot.queryParamMap.get('action');
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) return;
    this.deepLinkHandled = true;

    // Compat: ?id= → página focada /aprovacoes/:id
    const query: Record<string, string> = {};
    if (actionParam) query['action'] = actionParam;
    void this.router.navigate(['/aprovacoes', id], {
      queryParams: query,
      replaceUrl: true,
    });
  }

  serviceAccessItems(): ApprovalItem[] {
    return this.items().filter((item) => item.tipoEntidade === 'ACESSO_SERVICO');
  }

  eventItems(): ApprovalItem[] {
    return this.items().filter((item) => item.tipoEntidade === 'EVENTO');
  }

  summaryPendingCount(): number {
    return this.pendingSummary().length;
  }

  summaryServiceAccessCount(): number {
    return this.pendingSummary().filter((item) => item.tipoEntidade === 'ACESSO_SERVICO').length;
  }

  summaryEventCount(): number {
    return this.pendingSummary().filter((item) => item.tipoEntidade === 'EVENTO').length;
  }

  isServiceAccessAction(): boolean {
    return this.actionItem()?.tipoEntidade === 'ACESSO_SERVICO';
  }

  approveCollaborators(): ApprovalEntityCollaborator[] {
    return this.actionDetail()?.entidade?.collaborators ?? [];
  }

  approveVehicles(): ApprovalEntityVehicle[] {
    return this.actionDetail()?.entidade?.vehicles ?? [];
  }

  approveModalSubtitle(): string {
    if (this.actionMode() === 'reject') {
      return 'Informe o motivo da reprovação.';
    }
    if (this.isServiceAccessAction()) {
      return 'Marque quem recebe acesso. Desmarque para bloquear na portaria.';
    }
    return 'Comentário opcional para o solicitante.';
  }

  carregar() {
    this.loading.set(true);
    if (this.tab() === 'pending') {
      this.approvalService.listPending().subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.items.set(data);
          this.pendingSummary.set(data);
          this.loading.set(false);
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.items.set([]);
          this.pendingSummary.set([]);
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.approvalService.listMine().subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.items.set([]);
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
    });

    this.approvalService.listPending().subscribe({
      next: (res) => {
        this.pendingSummary.set(res.data ?? []);
        this.cdr.markForCheck();
      },
      error: () => {
        /* resumo é opcional nesta aba */
      },
    });
  }

  abrirDetalhe(item: ApprovalItem) {
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detail.set(null);
    this.historyDetailOpen.set(new Set());
    this.cdr.markForCheck();
    this.approvalService.get(item.id).subscribe({
      next: (res) => {
        this.detail.set(res.approval);
        this.detailLoading.set(false);
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

  setTab(t: 'pending' | 'mine') {
    this.tab.set(t);
    this.fecharDetalhe();
    this.carregar();
  }

  abrirAcao(item: ApprovalItem, mode: 'approve' | 'reject') {
    this.actionItem.set(item);
    this.actionMode.set(mode);
    this.actionComment = '';
    this.actionDetail.set(null);
    this.selectedCollaboratorIds.set(new Set());
    this.selectedVehicleIds.set(new Set());

    if (mode !== 'approve' || item.tipoEntidade !== 'ACESSO_SERVICO') {
      this.cdr.markForCheck();
      return;
    }

    const cached = this.detail()?.id === item.id ? this.detail() : null;
    if (cached?.entidade) {
      this.initApproveSelection(cached);
      return;
    }

    this.actionLoading.set(true);
    this.approvalService.get(item.id).subscribe({
      next: (res) => {
        this.initApproveSelection(res.approval);
        this.actionLoading.set(false);
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

  private initApproveSelection(approval: ApprovalItem) {
    this.actionDetail.set(approval);
    this.selectedCollaboratorIds.set(
      new Set((approval.entidade?.collaborators ?? []).map((c) => c.id)),
    );
    this.selectedVehicleIds.set(new Set((approval.entidade?.vehicles ?? []).map((v) => v.id)));
    this.cdr.markForCheck();
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

  isCollaboratorSelected(id: number): boolean {
    return this.selectedCollaboratorIds().has(id);
  }

  isVehicleSelected(id: number): boolean {
    return this.selectedVehicleIds().has(id);
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
    const next = new Set(this.selectedCollaboratorIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedCollaboratorIds.set(next);
    this.cdr.markForCheck();
  }

  toggleVehicle(id: number) {
    const next = new Set(this.selectedVehicleIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedVehicleIds.set(next);
    this.cdr.markForCheck();
  }

  markAllCollaborators(selected: boolean) {
    this.selectedCollaboratorIds.set(
      selected ? new Set(this.approveCollaborators().map((c) => c.id)) : new Set(),
    );
    this.cdr.markForCheck();
  }

  markAllVehicles(selected: boolean) {
    this.selectedVehicleIds.set(
      selected ? new Set(this.approveVehicles().map((v) => v.id)) : new Set(),
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
      if (item.tipoEntidade === 'ACESSO_SERVICO') {
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
