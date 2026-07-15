import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
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
                <p *ngIf="!ent.collaborators?.length" class="text-sm text-slate-500">Nenhum.</p>
                <ul class="space-y-2" *ngIf="ent.collaborators?.length">
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
                <p *ngIf="!ent.vehicles?.length" class="text-sm text-slate-500">Nenhum.</p>
                <ul class="space-y-2" *ngIf="ent.vehicles?.length">
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

            <ng-container *ngIf="mode === 'approve' && d.tipoEntidade === 'ACESSO_SERVICO'">
              <p class="text-xs text-slate-500">
                Marque quem recebe acesso. Desmarque para bloquear na portaria.
              </p>
              <div class="space-y-2" *ngIf="d.entidade?.collaborators?.length">
                <div class="flex justify-between items-center">
                  <p class="text-xs font-bold text-slate-500 uppercase">Colaboradores</p>
                  <div class="flex gap-2 text-xs">
                    <button type="button" class="text-blue-600 font-semibold" (click)="markAllCollaborators(true)">
                      Todos
                    </button>
                    <button type="button" class="text-slate-500" (click)="markAllCollaborators(false)">
                      Nenhum
                    </button>
                  </div>
                </div>
                <label
                  *ngFor="let c of d.entidade?.collaborators"
                  class="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    class="rounded border-slate-300"
                    [checked]="isCollaboratorSelected(c.id)"
                    (change)="toggleCollaborator(c.id)"
                  />
                  <span>{{ c.nome }}</span>
                </label>
              </div>
              <div class="space-y-2" *ngIf="d.entidade?.vehicles?.length">
                <div class="flex justify-between items-center">
                  <p class="text-xs font-bold text-slate-500 uppercase">Veículos</p>
                  <div class="flex gap-2 text-xs">
                    <button type="button" class="text-blue-600 font-semibold" (click)="markAllVehicles(true)">
                      Todos
                    </button>
                    <button type="button" class="text-slate-500" (click)="markAllVehicles(false)">
                      Nenhum
                    </button>
                  </div>
                </div>
                <label
                  *ngFor="let v of d.entidade?.vehicles"
                  class="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    class="rounded border-slate-300"
                    [checked]="isVehicleSelected(v.id)"
                    (change)="toggleVehicle(v.id)"
                  />
                  <span>{{ v.placa }}</span>
                </label>
              </div>
            </ng-container>

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
export class TeamsApprovalPageComponent implements OnInit {
  readonly loading = signal(true);
  readonly acting = signal(false);
  readonly approval = signal<ApprovalItem | null>(null);
  readonly error = signal<string | null>(null);
  readonly actionMode = signal<'approve' | 'reject' | null>(null);
  readonly selectedCollaboratorIds = signal<Set<number>>(new Set());
  readonly selectedVehicleIds = signal<Set<number>>(new Set());
  readonly inTeams = signal(false);
  readonly standaloneShell = signal(false);

  comment = '';
  private approvalId = 0;

  constructor(
    private route: ActivatedRoute,
    private approvalService: ApprovalService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    const inTeams = await this.teamsContext.ensureInitialized();
    this.inTeams.set(inTeams);
    // Fora do MainLayout quando a rota for usada em shell próprio do Teams
    this.standaloneShell.set(inTeams || !document.querySelector('app-main-layout'));

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.error.set('Aprovação inválida.');
      this.loading.set(false);
      return;
    }
    this.approvalId = id;

    const action = this.route.snapshot.queryParamMap.get('action');
    this.carregar(() => {
      if (action === 'reject' || action === 'approve' || action === 'decide') {
        this.startAction(action === 'reject' ? 'reject' : 'approve');
      }
    });
  }

  title(): string {
    const d = this.approval();
    return d ? approvalItemTitle(d) : `Aprovação #${this.approvalId || ''}`;
  }

  carregar(after?: () => void) {
    this.loading.set(true);
    this.error.set(null);
    this.approvalService.get(this.approvalId).subscribe({
      next: (res) => {
        const item = res.approval;
        this.approval.set(item);
        this.initSelection(item);
        this.loading.set(false);
        after?.();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          this.notification.extractErrorMessage(err, 'Não foi possível carregar a aprovação.'),
        );
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
    const d = this.approval();
    if (!d || d.status !== 'PENDENTE') return;
    this.actionMode.set(mode);
    this.comment = '';
    this.initSelection(d);
    this.cdr.markForCheck();
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
  }

  isCollaboratorSelected(id: number) {
    return this.selectedCollaboratorIds().has(id);
  }

  isVehicleSelected(id: number) {
    return this.selectedVehicleIds().has(id);
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
    this.cdr.markForCheck();
  }
}
