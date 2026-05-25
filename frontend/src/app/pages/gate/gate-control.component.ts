import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
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
  GateService,
  GateValidateResponse,
  GateValidateSuccess,
} from '../../services/gate.service';
import { NotificationService } from '../../core/services/notification.service';

interface GateHistoryEntry {
  access_id: string;
  timestamp: Date;
  name: string;
  company: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  role: string;
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
    `,
  ],
  template: `
    <div class="w-full max-w-3xl mx-auto">
      <div class="mb-6">
        <h2 class="page-section-title">Portaria</h2>
        <p class="page-section-subtitle">Leia o QR Code ou informe o código de acesso</p>
      </div>

      <div class="card-surface p-6 mb-6 relative overflow-hidden">
        <label class="text-xs font-bold text-slate-500 uppercase block mb-2">Código de acesso</label>
        <input
          #scanInput
          type="text"
          [(ngModel)]="scanValue"
          (keydown.enter)="onScanSubmit($event)"
          [disabled]="processing()"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          class="w-full border-2 border-[var(--app-border)] rounded-xl px-4 py-4 text-lg font-mono tracking-wide focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          placeholder="Aguardando leitura..."
        />
        <p class="text-xs text-slate-500 mt-2">O campo mantém foco automático para leitores USB/Bluetooth.</p>
      </div>

      <div *ngIf="recentAccesses().length" class="card-surface p-4">
        <h3 class="text-sm font-bold text-slate-600 uppercase mb-3">Últimos acessos</h3>
        <ul class="space-y-2">
          <li
            *ngFor="let entry of recentAccesses()"
            class="flex flex-wrap items-center gap-2 justify-between border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
          >
            <div class="min-w-0 flex-1">
              <p class="font-semibold truncate">{{ entry.name }}</p>
              <p class="text-xs text-slate-500 truncate">
                {{ entry.company }} · {{ actionLabel(entry.action) }} ·
                {{ entry.timestamp | date: 'HH:mm:ss' }}
              </p>
            </div>
            <button
              type="button"
              class="btn-secondary text-xs shrink-0"
              (click)="openSubstituteModal(entry)"
            >
              Substituir
            </button>
          </li>
        </ul>
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
            <button type="button" class="btn-secondary shrink-0" (click)="searchSubstitute()" [disabled]="substituteSearching()">
              Buscar
            </button>
          </div>

          <div *ngIf="substituteCandidate()" class="mb-4 p-3 rounded-xl bg-slate-50 border border-[var(--app-border)] text-sm">
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
  processing = signal(false);
  feedback = signal<FeedbackState>('idle');
  lastSuccess = signal<GateValidateSuccess | null>(null);
  denyReason = signal('');
  denyCode = signal('');
  recentAccesses = signal<GateHistoryEntry[]>([]);

  showSubstituteModal = signal(false);
  substituteTarget = signal<GateHistoryEntry | null>(null);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  substituteDocTypeId: number | null = null;
  substituteDocument = '';
  substituteCandidate = signal<CollaboratorItem | null>(null);
  substituteSearching = signal(false);
  substituteSubmitting = signal(false);

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private denyAudio: HTMLAudioElement | null = null;

  ngAfterViewInit(): void {
    this.loadDocumentTypes();
    this.focusScanInput();
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
  }

  actionLabel(action: 'CHECK_IN' | 'CHECK_OUT'): string {
    return action === 'CHECK_IN' ? 'Entrada' : 'Saída';
  }

  onScanSubmit(event: Event): void {
    event.preventDefault();
    const code = this.scanValue.trim();
    if (!code || this.processing()) return;
    this.processScan(code);
  }

  private processScan(accessId: string): void {
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
      this.pushHistory({
        access_id: accessId,
        timestamp: new Date(),
        name: res.collaborator.name,
        company: res.company.fancy_name,
        action: res.action_registered,
        role: res.collaborator.role,
      });
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

  private pushHistory(entry: GateHistoryEntry): void {
    this.recentAccesses.update((list) => [entry, ...list].slice(0, 5));
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  }

  private focusScanInput(): void {
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

  openSubstituteModal(entry: GateHistoryEntry): void {
    this.substituteTarget.set(entry);
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
    this.collaboratorService
      .searchByDocument(doc, this.substituteDocTypeId)
      .subscribe({
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
