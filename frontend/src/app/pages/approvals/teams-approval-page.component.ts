import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ApprovalEntityCollaborator,
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
import { CollaboratorService } from '../../services/collaborator.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamsContextService } from '../../services/teams-context.service';

/**
 * Página focada em uma aprovação — usada pelo deep link do Teams (/aprovacoes/:id).
 * Sem lista inbox; só detalhe + aprovar/reprovar.
 */
@Component({
  selector: 'app-teams-approval-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-[calc(100vh-0px)] bg-slate-100" [class.min-h-screen]="standaloneShell()">
      <header
        class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3"
      >
        <div class="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Credenciamento · Aprovação
            </p>
            <h1 class="text-base font-semibold text-slate-900 truncate">
              {{ title() }}
            </h1>
          </div>
          <a
            *ngIf="!inTeams()"
            routerLink="/aprovacoes"
            class="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Lista
          </a>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 py-5 pb-28">
        <div *ngIf="loading()" class="rounded-xl bg-white p-8 text-center text-slate-500 text-sm">
          Carregando aprovação…
        </div>

        <div
          *ngIf="!loading() && error()"
          class="rounded-xl bg-white border border-red-100 p-6 text-center"
        >
          <p class="text-sm text-red-700">{{ error() }}</p>
          <button
            type="button"
            class="mt-4 text-sm font-semibold text-blue-600"
            (click)="carregar()"
          >
            Tentar de novo
          </button>
        </div>

        <ng-container *ngIf="!loading() && approval() as d">
          <section class="rounded-xl bg-white shadow-sm border border-slate-200/80 overflow-hidden">
            <div class="px-4 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <span
                class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                [ngClass]="entityBadgeClass(d.tipoEntidade)"
              >
                {{ entityLabel(d.tipoEntidade) }}
              </span>
              <span
                class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                [ngClass]="badgeClass(d.status)"
              >
                {{ d.status }}
              </span>
              <span class="text-xs text-slate-500 ml-auto">#{{ d.id }}</span>
            </div>

            <div
              *ngIf="d.status !== 'PENDENTE'"
              class="mx-4 mt-4 rounded-lg border px-3 py-2.5 text-sm"
              [class.border-emerald-200]="d.status === 'APROVADO'"
              [class.bg-emerald-50]="d.status === 'APROVADO'"
              [class.text-emerald-800]="d.status === 'APROVADO'"
              [class.border-rose-200]="d.status === 'REPROVADO'"
              [class.bg-rose-50]="d.status === 'REPROVADO'"
              [class.text-rose-800]="d.status === 'REPROVADO'"
              [class.border-slate-200]="d.status !== 'APROVADO' && d.status !== 'REPROVADO'"
              [class.bg-slate-50]="d.status !== 'APROVADO' && d.status !== 'REPROVADO'"
              [class.text-slate-700]="d.status !== 'APROVADO' && d.status !== 'REPROVADO'"
            >
              Esta solicitação já foi
              {{ d.status === 'APROVADO' ? 'aprovada' : d.status === 'REPROVADO' ? 'reprovada' : 'finalizada' }}
              <ng-container *ngIf="lastDecisionLabel() as who"> por {{ who }}</ng-container>.
              Não é possível uma nova decisão.
            </div>

            <div class="px-4 py-4 space-y-4" *ngIf="d.entidade as ent">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
                <p>
                  <span class="text-slate-500">{{ ent.tipo === 'EVENTO' ? 'Evento' : 'Finalidade' }}:</span>
                  {{ ent.nome || '—' }}
                </p>
                <p>
                  <span class="text-slate-500">Período:</span>
                  {{ ent.startDate | date: 'dd/MM/yyyy' }} – {{ ent.endDate | date: 'dd/MM/yyyy' }}
                </p>
                <p *ngIf="ent.empresa"><span class="text-slate-500">Empresa:</span> {{ ent.empresa }}</p>
                <p><span class="text-slate-500">Setor:</span> {{ d.setor.nome }}</p>
                <p><span class="text-slate-500">Solicitante:</span> {{ d.solicitante.nome || '—' }}</p>
                <p class="sm:col-span-2" *ngIf="ent.observacao">
                  <span class="text-slate-500">Observação:</span> {{ ent.observacao }}
                </p>
              </div>

              <div *ngIf="ent.tipo === 'ACESSO_SERVICO'">
                <p class="text-xs font-bold text-slate-500 uppercase mb-2">Colaboradores</p>
                <p *ngIf="!ent.collaborators.length" class="text-sm text-slate-500">Nenhum.</p>
                <ul class="space-y-2" *ngIf="ent.collaborators.length">
                  <li
                    *ngFor="let c of ent.collaborators"
                    class="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span class="font-medium text-slate-800">{{ c.nome }}</span>
                    <span class="text-slate-500">{{ c.documento }} · {{ c.funcao }}</span>
                    <span
                      class="ml-auto inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [ngClass]="liberacaoBadgeClass(c.statusLiberacao)"
                    >
                      {{ liberacaoLabel(c.statusLiberacao) }}
                    </span>
                  </li>
                </ul>

                <p class="text-xs font-bold text-slate-500 uppercase mb-2 mt-4">Veículos</p>
                <p *ngIf="!ent.vehicles.length" class="text-sm text-slate-500">Nenhum.</p>
                <ul class="space-y-2" *ngIf="ent.vehicles.length">
                  <li
                    *ngFor="let v of ent.vehicles"
                    class="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span class="font-medium text-slate-800">{{ v.placa }}</span>
                    <span class="text-slate-500" *ngIf="v.marca || v.modelo"
                      >{{ v.marca }} {{ v.modelo }}</span
                    >
                    <span
                      class="ml-auto inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [ngClass]="liberacaoBadgeClass(v.statusLiberacao)"
                    >
                      {{ liberacaoLabel(v.statusLiberacao) }}
                    </span>
                  </li>
                </ul>
              </div>

              <div *ngIf="d.historico?.length">
                <p class="text-xs font-bold text-slate-500 uppercase mb-3">Histórico</p>
                <ol class="relative border-l border-slate-200 ml-2 space-y-3">
                  <li *ngFor="let h of d.historico" class="relative ml-4">
                    <span
                      class="absolute -left-[1.4rem] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                      [ngClass]="historyDotClass(h.tipo)"
                    ></span>
                    <p class="text-sm font-semibold text-slate-800">{{ h.titulo }}</p>
                    <p class="text-xs text-slate-500">
                      {{ h.data | date: 'dd/MM/yyyy HH:mm' }}
                      <span *ngIf="h.usuario?.nome"> · {{ h.usuario?.nome }}</span>
                    </p>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          <!-- Painel de decisão -->
          <section
            *ngIf="d.status === 'PENDENTE' && actionMode() as mode"
            class="mt-4 rounded-xl bg-white shadow-sm border border-slate-200/80 p-4 space-y-4"
          >
            <p class="text-sm font-semibold text-slate-800">
              {{ mode === 'approve' ? 'Confirmar aprovação' : 'Confirmar reprovação' }}
            </p>

            <div *ngIf="mode === 'approve' && d.tipoEntidade === 'ACESSO_SERVICO'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Marque quem recebe acesso. Desmarque para bloquear na portaria.
              </p>

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
                      *ngIf="(d.entidade?.collaborators?.length || 0) > 0"
                      class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                      [ngClass]="
                        selectedCollaboratorCount() > 0
                          ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                          : 'bg-red-50 text-red-600'
                      "
                    >
                      {{ selectedCollaboratorCount() }} de {{ d.entidade?.collaborators?.length }}
                    </span>
                  </div>
                  <div
                    class="flex items-center gap-1 text-[12.5px] font-semibold"
                    *ngIf="(d.entidade?.collaborators?.length || 0) > 0"
                  >
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

                <p *ngIf="!(d.entidade?.collaborators?.length)" class="text-sm text-slate-500">
                  Nenhum colaborador neste acesso.
                </p>

                <div class="flex flex-col gap-2" *ngIf="d.entidade?.collaborators?.length">
                  <button
                    type="button"
                    *ngFor="let c of d.entidade?.collaborators"
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
                      <path
                        d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"
                      />
                      <circle cx="7" cy="17" r="2" />
                      <path d="M9 17h6" />
                      <circle cx="17" cy="17" r="2" />
                    </svg>
                    Veículos
                    <span
                      *ngIf="(d.entidade?.vehicles?.length || 0) > 0"
                      class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                      [ngClass]="
                        selectedVehicleCount() > 0
                          ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                          : 'bg-red-50 text-red-600'
                      "
                    >
                      {{ selectedVehicleCount() }} de {{ d.entidade?.vehicles?.length }}
                    </span>
                  </div>
                  <div
                    class="flex items-center gap-1 text-[12.5px] font-semibold"
                    *ngIf="(d.entidade?.vehicles?.length || 0) > 0"
                  >
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

                <p *ngIf="!(d.entidade?.vehicles?.length)" class="text-sm text-slate-500">
                  Nenhum veículo neste acesso.
                </p>

                <div class="flex flex-col gap-2" *ngIf="d.entidade?.vehicles?.length">
                  <button
                    type="button"
                    *ngFor="let v of d.entidade?.vehicles"
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
                      [ngClass]="
                        isVehicleSelected(v.id) ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-400'
                      "
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
                        <path
                          d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"
                        />
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
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">
                {{ mode === 'reject' ? 'Motivo (obrigatório)' : 'Comentário (opcional)' }}
              </label>
              <textarea
                rows="3"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                [(ngModel)]="comment"
                [placeholder]="mode === 'reject' ? 'Informe o motivo…' : 'Opcional…'"
              ></textarea>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700"
                [disabled]="acting()"
                (click)="cancelAction()"
              >
                Voltar
              </button>
              <button
                type="button"
                class="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                [ngClass]="mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'"
                [disabled]="acting()"
                (click)="confirmar()"
              >
                {{ acting() ? 'Processando…' : mode === 'approve' ? 'Confirmar aprovação' : 'Confirmar reprovação' }}
              </button>
            </div>
          </section>
        </ng-container>
      </main>

      <footer
        *ngIf="approval()?.status === 'PENDENTE' && !actionMode()"
        class="fixed bottom-0 inset-x-0 border-t border-slate-200 bg-white px-4 py-3 safe-pb"
      >
        <div class="max-w-3xl mx-auto flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-red-200 text-red-700 bg-red-50"
            (click)="startAction('reject')"
          >
            Reprovar
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600"
            (click)="startAction('approve')"
          >
            Aprovar
          </button>
        </div>
      </footer>
    </div>
  `,
})
export class TeamsApprovalPageComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly acting = signal(false);
  readonly approval = signal<ApprovalItem | null>(null);
  readonly error = signal<string | null>(null);
  readonly actionMode = signal<'approve' | 'reject' | null>(null);
  readonly selectedCollaboratorIds = signal<Set<number>>(new Set());
  readonly selectedVehicleIds = signal<Set<number>>(new Set());
  readonly thumbnailUrls = signal<Record<number, string>>({});
  readonly inTeams = signal(false);
  readonly standaloneShell = signal(false);

  comment = '';
  private approvalId = 0;
  private lastSilentLoadAt = 0;
  private thumbnailLoadId = 0;

  constructor(
    private route: ActivatedRoute,
    private approvalService: ApprovalService,
    private collaboratorService: CollaboratorService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
    private cdr: ChangeDetectorRef,
  ) {}

  /** Ao voltar à aba (ex.: outro membro aprovou no Teams), atualiza o status. */
  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.approvalId) {
      this.carregar({ silent: true });
    }
  }

  async ngOnInit() {
    const inTeams = await this.teamsContext.ensureInitialized();
    this.inTeams.set(inTeams);
    this.standaloneShell.set(inTeams || !document.querySelector('app-main-layout'));

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.error.set('Aprovação inválida.');
      this.loading.set(false);
      return;
    }
    this.approvalId = id;

    const action = this.route.snapshot.queryParamMap.get('action');
    this.carregar({
      after: () => {
        if (action === 'reject' || action === 'approve' || action === 'decide') {
          this.startAction(action === 'reject' ? 'reject' : 'approve');
        }
      },
    });
  }

  ngOnDestroy() {
    this.revokeThumbnails();
  }

  title(): string {
    const d = this.approval();
    return d ? approvalItemTitle(d) : `Aprovação #${this.approvalId || ''}`;
  }

  lastDecisionLabel(): string | null {
    const list = this.approval()?.decisoes ?? [];
    if (!list.length) return null;
    const last = list[list.length - 1];
    return last.usuario?.nome || null;
  }

  carregar(options: { after?: () => void; silent?: boolean } = {}) {
    if (options.silent) {
      const now = Date.now();
      if (now - this.lastSilentLoadAt < 2500) return;
      this.lastSilentLoadAt = now;
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    this.approvalService.get(this.approvalId).subscribe({
      next: (res) => {
        const item = res.approval;
        this.approval.set(item);
        this.initSelection(item);
        this.loading.set(false);
        if (item.status !== 'PENDENTE') {
          this.actionMode.set(null);
        }
        options.after?.();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        if (!options.silent) {
          this.error.set(
            this.notification.extractErrorMessage(err, 'Não foi possível carregar a aprovação.'),
          );
        }
        this.cdr.markForCheck();
      },
    });
  }

  entityLabel = approvalEntityLabel;
  entityBadgeClass = approvalEntityBadgeClass;
  badgeClass = approvalStatusBadgeClass;
  liberacaoLabel = liberacaoStatusLabel;
  liberacaoBadgeClass = liberacaoStatusBadgeClass;
  historyDotClass = approvalHistoryDotClass;

  startAction(mode: 'approve' | 'reject') {
    this.carregar({
      after: () => {
        const d = this.approval();
        if (!d || d.status !== 'PENDENTE') {
          this.notification.warning(
            d?.status === 'APROVADO'
              ? 'Solicitação já aprovada.'
              : 'Solicitação já finalizada.',
            'Outro membro da equipe já registrou a decisão.',
          );
          this.cdr.markForCheck();
          return;
        }
        this.actionMode.set(mode);
        this.comment = '';
        this.initSelection(d);
        this.cdr.markForCheck();
      },
    });
  }

  cancelAction() {
    this.actionMode.set(null);
    this.comment = '';
    this.cdr.markForCheck();
  }

  private initSelection(item: ApprovalItem) {
    this.selectedCollaboratorIds.set(
      new Set((item.entidade?.collaborators ?? []).map((c) => c.id)),
    );
    this.selectedVehicleIds.set(new Set((item.entidade?.vehicles ?? []).map((v) => v.id)));
    this.loadThumbnails(item.entidade?.collaborators ?? []);
  }

  isCollaboratorSelected(id: number) {
    return this.selectedCollaboratorIds().has(id);
  }

  isVehicleSelected(id: number) {
    return this.selectedVehicleIds().has(id);
  }

  selectedCollaboratorCount(): number {
    return this.selectedCollaboratorIds().size;
  }

  selectedVehicleCount(): number {
    return this.selectedVehicleIds().size;
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

  private loadThumbnails(list: ApprovalEntityCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.picture) continue;
      this.collaboratorService.getPictureBlob(c.picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [c.idCollaborator]: url }));
          this.cdr.markForCheck();
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
    const list = this.approval()?.entidade?.collaborators ?? [];
    this.selectedCollaboratorIds.set(selected ? new Set(list.map((c) => c.id)) : new Set());
    this.cdr.markForCheck();
  }

  markAllVehicles(selected: boolean) {
    const list = this.approval()?.entidade?.vehicles ?? [];
    this.selectedVehicleIds.set(selected ? new Set(list.map((v) => v.id)) : new Set());
    this.cdr.markForCheck();
  }

  confirmar() {
    const d = this.approval();
    const mode = this.actionMode();
    if (!d || !mode) return;

    if (mode === 'reject' && !this.comment.trim()) {
      this.notification.error('Informe o motivo da reprovação.');
      return;
    }

    this.acting.set(true);
    if (mode === 'approve') {
      const payload: {
        comentario?: string;
        approvedCollaboratorIds?: number[];
        approvedVehicleIds?: number[];
      } = { comentario: this.comment.trim() || undefined };
      if (d.tipoEntidade === 'ACESSO_SERVICO') {
        payload.approvedCollaboratorIds = [...this.selectedCollaboratorIds()];
        payload.approvedVehicleIds = [...this.selectedVehicleIds()];
      }
      this.approvalService.approve(d.id, payload).subscribe({
        next: () => this.afterDecision('Aprovado.'),
        error: (err) => this.onDecisionError(err),
      });
      return;
    }

    this.approvalService.reject(d.id, this.comment.trim()).subscribe({
      next: () => this.afterDecision('Reprovado.'),
      error: (err) => this.onDecisionError(err),
    });
  }

  private afterDecision(msg: string) {
    this.acting.set(false);
    this.actionMode.set(null);
    this.notification.success(msg);
    this.carregar();
    this.cdr.markForCheck();
  }

  private onDecisionError(err: unknown) {
    this.acting.set(false);
    this.notification.notifyHttpError(err, 'Falha ao registrar decisão.');
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.actionMode.set(null);
      this.carregar();
    }
    this.cdr.markForCheck();
  }
}
