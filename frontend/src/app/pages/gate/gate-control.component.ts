import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorService,
} from '../../services/collaborator.service';
import {
  GateNextAction,
  GateService,
  GateTodayCredential,
  GateValidateResponse,
  GateValidateSuccess,
} from '../../services/gate.service';
import { NotificationService } from '../../core/services/notification.service';

interface GateSubstituteTarget {
  access_id: string;
  name: string;
}

type FeedbackState = 'idle' | 'success' | 'denied';

@Component({
  selector: 'app-gate-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      @keyframes gate-deny-blink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.55;
        }
      }
      .gate-deny-blink {
        animation: gate-deny-blink 0.55s ease-in-out infinite;
      }
      .gate-scan-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
  template: `
    <div class="w-full max-w-6xl mx-auto" data-gate-root>
      <div class="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 class="page-section-title">Portaria</h2>
          <p class="page-section-subtitle">
            Leitor de código ativo — use a tabela abaixo como contingência manual
          </p>
        </div>
        <p class="text-xs text-slate-500" *ngIf="processing()">Processando leitura...</p>
      </div>

      <!-- UX primária: input discreto para scanner -->
      <label class="gate-scan-sr">
        Leitura de código de acesso
        <input
          #scanInput
          type="text"
          [(ngModel)]="scanValue"
          (keydown.enter)="onScanSubmit($event)"
          [disabled]="processing()"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
      </label>

      <!-- UX secundária: lista manual -->
      <div class="card-surface p-4 mb-6" data-gate-manual>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 class="text-sm font-bold text-slate-600 uppercase">Credenciais de hoje</h3>
          <button
            type="button"
            class="btn-secondary text-xs shrink-0"
            (click)="loadTodayList()"
            [disabled]="todayLoading()"
          >
            {{ todayLoading() ? 'Atualizando...' : 'Atualizar lista' }}
          </button>
        </div>

        <input
          type="search"
          [(ngModel)]="manualSearch"
          placeholder="Buscar por nome, documento ou empresa..."
          class="w-full mb-4 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
          data-gate-manual-search
        />

        <p *ngIf="todayLoading()" class="text-sm text-slate-500 py-6 text-center">Carregando credenciais...</p>
        <p *ngIf="!todayLoading() && todayCredentials().length === 0" class="text-sm text-slate-500 py-6 text-center">
          Nenhuma credencial aprovada para o dia operacional atual.
        </p>

        <div *ngIf="!todayLoading() && todayCredentials().length > 0" class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="border-b border-[var(--app-border)] text-xs uppercase text-slate-500">
                <th class="py-2 pr-2 font-bold">Nome</th>
                <th class="py-2 pr-2 font-bold">Documento</th>
                <th class="py-2 pr-2 font-bold hidden md:table-cell">Função</th>
                <th class="py-2 pr-2 font-bold hidden lg:table-cell">Empresa</th>
                <th class="py-2 pr-2 font-bold">Entrada</th>
                <th class="py-2 pr-2 font-bold">Saída</th>
                <th class="py-2 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let row of filteredTodayCredentials()"
                class="border-b border-[var(--app-border)] last:border-0 hover:bg-slate-50/80"
              >
                <td class="py-2 pr-2 font-medium">{{ row.collaborator.name }}</td>
                <td class="py-2 pr-2 font-mono text-xs">{{ row.collaborator.document_masked }}</td>
                <td class="py-2 pr-2 hidden md:table-cell text-slate-600">{{ row.collaborator.role }}</td>
                <td class="py-2 pr-2 hidden lg:table-cell text-slate-600">{{ row.company.name }}</td>
                <td class="py-2 pr-2 text-xs whitespace-nowrap">
                  {{ formatTimestamp(row.access_check_in) }}
                </td>
                <td class="py-2 pr-2 text-xs whitespace-nowrap">
                  {{ formatTimestamp(row.access_check_out) }}
                </td>
                <td class="py-2 text-right whitespace-nowrap">
                  <div class="flex justify-end gap-1 flex-wrap">
                    <button
                      type="button"
                      class="text-xs px-2 py-1 rounded-lg font-semibold disabled:opacity-40"
                      [class.bg-emerald-600]="row.next_action === 'CHECK_IN'"
                      [class.text-white]="row.next_action === 'CHECK_IN'"
                      [class.bg-amber-600]="row.next_action === 'CHECK_OUT'"
                      [class.text-white]="row.next_action === 'CHECK_OUT'"
                      [class.bg-slate-200]="row.next_action === 'COMPLETED'"
                      [class.text-slate-500]="row.next_action === 'COMPLETED'"
                      [disabled]="row.next_action === 'COMPLETED' || processing()"
                      (click)="onManualValidate(row)"
                      [title]="manualActionTitle(row.next_action)"
                    >
                      {{ manualActionLabel(row.next_action) }}
                    </button>
                    <button
                      type="button"
                      class="text-xs px-2 py-1 rounded-lg font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                      [disabled]="processing()"
                      (click)="openSubstituteModal(row)"
                    >
                      Substituir
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2">
            Exibindo {{ filteredTodayCredentials().length }} de {{ todayCredentials().length }} credencial(is)
          </p>
        </div>
      </div>

      <div
        *ngIf="feedback() === 'success' && lastSuccess()"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-600 text-white"
      >
        <div class="text-center max-w-lg">
          <p class="text-sm uppercase tracking-widest opacity-90 mb-2">Acesso autorizado</p>
          <p class="text-4xl md:text-5xl font-bold mb-3">{{ lastSuccess()!.collaborator.name }}</p>
          <p class="text-xl opacity-95">{{ lastSuccess()!.collaborator.role }}</p>
          <p class="text-lg mt-2 opacity-90">{{ lastSuccess()!.company.fancy_name }}</p>
          <p class="text-2xl font-semibold mt-6">{{ actionLabel(lastSuccess()!.action_registered) }}</p>
        </div>
      </div>

      <div
        *ngIf="feedback() === 'denied'"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-700 text-white gate-deny-blink"
      >
        <div class="text-center max-w-lg px-4">
          <p class="text-sm uppercase tracking-widest opacity-90 mb-4">Acesso negado</p>
          <p class="text-3xl md:text-4xl font-bold leading-tight">{{ denyReason() }}</p>
          <p *ngIf="denyCode()" class="text-sm mt-4 opacity-80 font-mono">{{ denyCode() }}</p>
        </div>
      </div>

      <div
        *ngIf="showSubstituteModal()"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        data-gate-substitute-modal
      >
        <button type="button" class="absolute inset-0 bg-slate-900/50" (click)="closeSubstituteModal()"></button>
        <div class="relative w-full max-w-lg card-surface p-6 shadow-xl">
          <h3 class="text-lg font-bold mb-1">Substituir colaborador</h3>
          <p class="text-sm text-slate-500 mb-4" *ngIf="substituteTarget()">
            Credencial: {{ substituteTarget()!.name }}
          </p>

          <label class="text-xs font-bold text-slate-500 uppercase">Tipo de documento</label>
          <select
            class="w-full mt-1 mb-3 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            [(ngModel)]="substituteDocTypeId"
          >
            <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
              {{ t.description }}
            </option>
          </select>

          <label class="text-xs font-bold text-slate-500 uppercase">CPF / Passaporte</label>
          <div class="flex gap-2 mt-1 mb-4">
            <input
              type="text"
              [(ngModel)]="substituteDocument"
              class="flex-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
              placeholder="Documento do substituto"
              (keydown.enter)="searchSubstitute()"
            />
            <button
              type="button"
              class="btn-secondary shrink-0"
              (click)="searchSubstitute()"
              [disabled]="substituteSearching()"
            >
              Buscar
            </button>
          </div>

          <div
            *ngIf="substituteCandidate()"
            class="mb-4 p-3 rounded-xl bg-slate-50 border border-[var(--app-border)] text-sm"
          >
            <p class="font-semibold">{{ substituteCandidate()!.name }}</p>
            <p class="text-slate-500">{{ substituteCandidate()!.document }}</p>
            <p *ngIf="substituteCandidate()!.is_blacklisted" class="text-red-600 text-xs mt-1 font-bold">
              Colaborador na lista de bloqueio
            </p>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" (click)="closeSubstituteModal()">Cancelar</button>
            <button
              type="button"
              class="btn-primary"
              (click)="confirmSubstitute()"
              [disabled]="!substituteCandidate() || substituteCandidate()!.is_blacklisted || substituteSubmitting()"
            >
              Confirmar substituição
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class GateControlComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scanInput') scanInput?: ElementRef<HTMLInputElement>;

  private gateService = inject(GateService);
  private collaboratorService = inject(CollaboratorService);
  private notify = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  scanValue = '';
  manualSearch = '';
  processing = signal(false);
  feedback = signal<FeedbackState>('idle');
  lastSuccess = signal<GateValidateSuccess | null>(null);
  denyReason = signal('');
  denyCode = signal('');

  todayCredentials = signal<GateTodayCredential[]>([]);
  todayLoading = signal(false);

  filteredTodayCredentials = computed(() => {
    const q = this.manualSearch.trim().toLowerCase();
    const list = this.todayCredentials();
    if (!q) return list;
    return list.filter((row) => {
      const haystack = [
        row.collaborator.name,
        row.collaborator.document_masked,
        row.collaborator.role,
        row.company.name,
        row.event_name,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  showSubstituteModal = signal(false);
  substituteTarget = signal<GateSubstituteTarget | null>(null);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  substituteDocTypeId: number | null = null;
  substituteDocument = '';
  substituteCandidate = signal<CollaboratorItem | null>(null);
  substituteSearching = signal(false);
  substituteSubmitting = signal(false);

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private denyAudio: HTMLAudioElement | null = null;
  private skipNextFocusRestore = false;

  ngAfterViewInit(): void {
    this.loadDocumentTypes();
    this.loadTodayList();
    this.focusScanInput();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showSubstituteModal()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-gate-manual]') || target.closest('[data-gate-substitute-modal]')) {
      return;
    }
    this.focusScanInput();
  }

  actionLabel(action: 'CHECK_IN' | 'CHECK_OUT'): string {
    return action === 'CHECK_IN' ? 'Entrada' : 'Saída';
  }

  manualActionLabel(next: GateNextAction): string {
    if (next === 'CHECK_IN') return 'Entrada';
    if (next === 'CHECK_OUT') return 'Saída';
    return 'Concluído';
  }

  manualActionTitle(next: GateNextAction): string {
    if (next === 'CHECK_IN') return 'Registrar entrada';
    if (next === 'CHECK_OUT') return 'Registrar saída';
    return 'Fluxo já concluído';
  }

  formatTimestamp(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  loadTodayList(): void {
    this.todayLoading.set(true);
    this.gateService.listToday().subscribe({
      next: (res) => {
        this.todayCredentials.set(res.credentials);
        this.todayLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.todayLoading.set(false);
        this.notify.error(err.error?.message || 'Falha ao carregar credenciais do dia.');
        this.cdr.markForCheck();
      },
    });
  }

  onScanSubmit(event: Event): void {
    event.preventDefault();
    if (this.processing()) return;
    const code = this.scanValue.trim();
    if (!code) return;
    this.processScan(code);
  }

  onManualValidate(row: GateTodayCredential): void {
    if (this.processing() || row.next_action === 'COMPLETED') return;
    this.skipNextFocusRestore = true;
    this.processScan(row.access_id);
  }

  private processScan(accessId: string): void {
    if (this.processing()) return;
    this.processing.set(true);
    this.gateService.validateEvent(accessId).subscribe({
      next: (res) => this.handleValidateResponse(accessId, res),
      error: (err: HttpErrorResponse) => this.handleValidateError(err),
    });
  }

  private handleValidateResponse(accessId: string, res: GateValidateResponse): void {
    this.processing.set(false);
    this.scanValue = '';

    if (res.access_allowed) {
      this.showSuccess(res);
      this.loadTodayList();
      return;
    }

    this.showDenied(res.reason, res.error_code);
  }

  private handleValidateError(err: HttpErrorResponse): void {
    this.processing.set(false);
    this.scanValue = '';
    const body = err.error as { reason?: string; error_code?: string; message?: string } | null;
    const reason = body?.reason || body?.message || 'Falha ao validar credencial.';
    const code = body?.error_code || `HTTP_${err.status}`;
    this.showDenied(reason, code);
  }

  private showSuccess(res: GateValidateSuccess): void {
    this.lastSuccess.set(res);
    this.feedback.set('success');
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      this.feedback.set('idle');
      this.lastSuccess.set(null);
      this.focusScanInput();
      this.cdr.markForCheck();
    }, 2000);
    this.cdr.markForCheck();
  }

  private showDenied(reason: string, code: string): void {
    this.denyReason.set(reason);
    this.denyCode.set(code);
    this.feedback.set('denied');
    this.playDenyBeep();
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      this.feedback.set('idle');
      this.focusScanInput();
      this.cdr.markForCheck();
    }, 3500);
    this.cdr.markForCheck();
  }

  private playDenyBeep(): void {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      if (!this.denyAudio) {
        this.denyAudio = new Audio(
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==',
        );
      }
      void this.denyAudio.play().catch(() => undefined);
    }
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  }

  private focusScanInput(): void {
    if (this.skipNextFocusRestore) {
      this.skipNextFocusRestore = false;
      return;
    }
    setTimeout(() => this.scanInput?.nativeElement?.focus(), 50);
  }

  private loadDocumentTypes(): void {
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => {
        this.documentTypes.set(res.types);
        if (res.types.length) {
          this.substituteDocTypeId = res.types[0].id_collaborator_document_type;
        }
      },
      error: () => this.notify.error('Não foi possível carregar tipos de documento.'),
    });
  }

  openSubstituteModal(row: GateTodayCredential): void {
    this.substituteTarget.set({
      access_id: row.access_id,
      name: row.collaborator.name,
    });
    this.substituteDocument = '';
    this.substituteCandidate.set(null);
    this.showSubstituteModal.set(true);
  }

  closeSubstituteModal(): void {
    this.showSubstituteModal.set(false);
    this.substituteTarget.set(null);
    this.focusScanInput();
  }

  searchSubstitute(): void {
    const doc = this.substituteDocument.trim();
    if (!doc || this.substituteDocTypeId == null) return;
    this.substituteSearching.set(true);
    this.collaboratorService.searchByDocument(doc, this.substituteDocTypeId).subscribe({
      next: (res) => {
        this.substituteCandidate.set(res.collaborator);
        this.substituteSearching.set(false);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.substituteSearching.set(false);
        this.substituteCandidate.set(null);
        this.notify.error(err.error?.message || 'Colaborador não encontrado.');
        this.cdr.markForCheck();
      },
    });
  }

  confirmSubstitute(): void {
    const target = this.substituteTarget();
    const candidate = this.substituteCandidate();
    if (!target || !candidate || candidate.is_blacklisted) return;

    this.substituteSubmitting.set(true);
    this.gateService
      .substituteEvent({
        access_id: target.access_id,
        id_substitute_collaborator: candidate.id_collaborator,
      })
      .subscribe({
        next: () => {
          this.substituteSubmitting.set(false);
          this.notify.success('Substituição registrada com sucesso.');
          this.closeSubstituteModal();
          this.loadTodayList();
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.substituteSubmitting.set(false);
          this.notify.error(err.error?.message || 'Falha ao registrar substituição.');
          this.cdr.markForCheck();
        },
      });
  }
}
