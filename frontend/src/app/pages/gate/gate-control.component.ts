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
  GateService,
  GateTodayCredential,
  GateTodayService,
  GateServiceValidateResponse,
  GateValidateResponse,
  GateValidateSuccess,
} from '../../services/gate.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModalComponent } from '../../shared/modal/modal.component';

interface GateSubstituteTarget {
  access_id: string;
  name: string;
}

type FeedbackState = 'idle' | 'success' | 'denied';

export type GateStatusFilter = 'todos' | 'wait' | 'in' | 'done';
export type GateTypeFilter = 'todos' | 'veiculo' | 'colaborador';

const GATE_DATABASE_TIMEZONE_OFFSET = '-03:00';
const GATE_DISPLAY_TIMEZONE = 'America/Sao_Paulo';

interface GateStats {
  total: number;
  wait: number;
  in: number;
  done: number;
  veiculo: number;
  colaborador: number;
}

@Component({
  selector: 'app-gate-control',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  templateUrl: './gate-control.component.html',
  styleUrl: './gate-control.component.scss',
})
export class GateControlComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scanInput') scanInput?: ElementRef<HTMLInputElement>;

  private gateService = inject(GateService);
  private collaboratorService = inject(CollaboratorService);
  private notify = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  scanValue = '';
  manualSearch = signal('');
  statusFilter = signal<GateStatusFilter>('todos');
  typeFilter = signal<GateTypeFilter>('todos');
  processing = signal(false);
  feedback = signal<FeedbackState>('idle');
  lastSuccess = signal<GateValidateSuccess | null>(null);
  lastServiceSuccess = signal<GateServiceValidateResponse | null>(null);
  denyReason = signal('');
  denyCode = signal('');
  refreshSpin = signal(false);

  /** Tick for relative-time labels ("há X min") — bumped every 30s when someone is inside. */
  private relTick = signal(0);

  gateMode = signal<'events' | 'patrimonial'>('patrimonial');
  todayCredentials = signal<GateTodayCredential[]>([]);
  todayServices = signal<GateTodayService[]>([]);
  todayLoading = signal(false);
  thumbnailUrls = signal<Record<string, string>>({});
  successPhotoUrl = signal<string | null>(null);

  private thumbnailLoadId = 0;

  stats = computed((): GateStats => {
    this.relTick();
    if (this.gateMode() === 'patrimonial') {
      const list = this.todayServices();
      return {
        total: list.length,
        wait: list.filter((r) => r.next_action === 'CHECK_IN').length,
        in: list.filter((r) => r.next_action === 'CHECK_OUT').length,
        done: list.filter((r) => r.next_action === 'COMPLETED').length,
        veiculo: list.filter((r) => r.kind === 'vehicle').length,
        colaborador: list.filter((r) => r.kind === 'collaborator').length,
      };
    }
    const list = this.todayCredentials();
    return {
      total: list.length,
      wait: list.filter((r) => r.next_action === 'CHECK_IN').length,
      in: list.filter((r) => r.next_action === 'CHECK_OUT').length,
      done: list.filter((r) => r.next_action === 'COMPLETED').length,
      veiculo: 0,
      colaborador: list.length,
    };
  });

  filteredTodayCredentials = computed(() => {
    this.relTick();
    const q = this.manualSearch().trim().toLowerCase();
    const status = this.statusFilter();
    return this.todayCredentials().filter((row) => {
      if (status === 'wait' && row.next_action !== 'CHECK_IN') return false;
      if (status === 'in' && row.next_action !== 'CHECK_OUT') return false;
      if (status === 'done' && row.next_action !== 'COMPLETED') return false;
      if (q) {
        const haystack = [
          row.collaborator.name,
          row.collaborator.document_masked,
          row.collaborator.role,
          row.company.name,
          row.event_name,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  filteredTodayServices = computed(() => {
    this.relTick();
    const q = this.manualSearch().trim().toLowerCase();
    const status = this.statusFilter();
    const type = this.typeFilter();
    return this.todayServices().filter((row) => {
      if (type === 'veiculo' && row.kind !== 'vehicle') return false;
      if (type === 'colaborador' && row.kind !== 'collaborator') return false;
      if (status === 'wait' && row.next_action !== 'CHECK_IN') return false;
      if (status === 'in' && row.next_action !== 'CHECK_OUT') return false;
      if (status === 'done' && row.next_action !== 'COMPLETED') return false;
      if (q) {
        const parts = [row.company.name, row.finalidade, row.kind];
        if (row.vehicle) parts.push(row.vehicle.plate);
        if (row.collaborator) {
          parts.push(row.collaborator.name, row.collaborator.document_masked, row.collaborator.role);
        }
        if (!parts.join(' ').toLowerCase().includes(q)) return false;
      }
      return true;
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
  private relTimer: ReturnType<typeof setInterval> | null = null;
  private refreshSpinTimer: ReturnType<typeof setTimeout> | null = null;
  private denyAudio: HTMLAudioElement | null = null;
  private skipNextFocusRestore = false;

  ngAfterViewInit(): void {
    this.loadDocumentTypes();
    this.loadTodayList();
    this.focusScanInput();
    this.relTimer = setInterval(() => {
      const hasInside =
        this.todayCredentials().some((r) => r.next_action === 'CHECK_OUT') ||
        this.todayServices().some((r) => r.next_action === 'CHECK_OUT');
      if (hasInside) {
        this.relTick.update((n) => n + 1);
        this.cdr.markForCheck();
      }
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.relTimer) clearInterval(this.relTimer);
    if (this.refreshSpinTimer) clearTimeout(this.refreshSpinTimer);
    this.revokeThumbnails();
    this.clearSuccessPhoto();
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

  setStatusFilter(filter: GateStatusFilter): void {
    this.statusFilter.set(filter);
  }

  setTypeFilter(filter: GateTypeFilter): void {
    this.typeFilter.set(filter);
  }

  onRefreshClick(): void {
    this.refreshSpin.set(true);
    if (this.refreshSpinTimer) clearTimeout(this.refreshSpinTimer);
    this.refreshSpinTimer = setTimeout(() => {
      this.refreshSpin.set(false);
      this.cdr.markForCheck();
    }, 600);
    this.loadTodayList();
  }

  actionLabel(action: 'CHECK_IN' | 'CHECK_OUT'): string {
    return action === 'CHECK_IN' ? 'Entrada' : 'Saída';
  }

  private parseGateDate(value: string | null): Date | null {
    if (!value) return null;

    const trimmed = value.trim();
    const mysqlDateTime = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/,
    );
    const normalized = mysqlDateTime
      ? `${mysqlDateTime[1]}T${mysqlDateTime[2]}${mysqlDateTime[3] || ''}${GATE_DATABASE_TIMEZONE_OFFSET}`
      : trimmed;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  formatClock(value: string | null): string {
    const d = this.parseGateDate(value);
    if (!d) return '—';
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: GATE_DISPLAY_TIMEZONE,
    });
  }

  /** @deprecated Prefer formatClock for UI; kept for compatibility. */
  formatTimestamp(value: string | null): string {
    return this.formatClock(value);
  }

  relFrom(value: string | null): string {
    this.relTick();
    const d = this.parseGateDate(value);
    if (!d) return '';
    const ts = d.getTime();
    const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    return `há ${Math.floor(m / 60)}h ${m % 60}min`;
  }

  setGateMode(mode: 'events' | 'patrimonial'): void {
    this.gateMode.set(mode);
    this.manualSearch.set('');
    this.statusFilter.set('todos');
    this.typeFilter.set('todos');
    this.loadTodayList();
    this.focusScanInput();
  }

  loadTodayList(): void {
    this.todayLoading.set(true);
    if (this.gateMode() === 'patrimonial') {
      this.gateService.listTodayServices().subscribe({
        next: (res) => {
          this.todayServices.set(res.services);
          this.todayLoading.set(false);
          this.loadThumbnailsFromServices(res.services);
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.todayLoading.set(false);
          this.notify.error(err.error?.message || 'Falha ao carregar serviços do dia.');
          this.cdr.markForCheck();
        },
      });
      return;
    }
    this.gateService.listToday().subscribe({
      next: (res) => {
        this.todayCredentials.set(res.credentials);
        this.todayLoading.set(false);
        this.loadThumbnailsFromCredentials(res.credentials);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.todayLoading.set(false);
        this.notify.error(err.error?.message || 'Falha ao carregar credenciais do dia.');
        this.cdr.markForCheck();
      },
    });
  }

  pictureUrl(accessId: string): string | null {
    return this.thumbnailUrls()[accessId] ?? null;
  }

  initials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private loadThumbnailsFromCredentials(list: GateTodayCredential[]): void {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const row of list) {
      const picture = row.collaborator.picture;
      if (!picture) continue;
      this.collaboratorService.getPictureBlob(picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [row.access_id]: url }));
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
    }
  }

  private loadThumbnailsFromServices(list: GateTodayService[]): void {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const row of list) {
      const picture = row.collaborator?.picture;
      if (!picture) continue;
      this.collaboratorService.getPictureBlob(picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [row.access_id]: url }));
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
    }
  }

  private revokeThumbnails(): void {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }

  private loadSuccessPhoto(picture: string | null | undefined): void {
    this.clearSuccessPhoto();
    if (!picture) return;
    this.collaboratorService.getPictureBlob(picture).subscribe({
      next: (blob) => {
        this.successPhotoUrl.set(URL.createObjectURL(blob));
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  private clearSuccessPhoto(): void {
    const url = this.successPhotoUrl();
    if (url) URL.revokeObjectURL(url);
    this.successPhotoUrl.set(null);
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

  onManualValidateService(row: GateTodayService): void {
    if (this.processing() || row.next_action === 'COMPLETED') return;
    this.skipNextFocusRestore = true;
    this.processScan(row.access_id);
  }

  private processScan(accessId: string): void {
    if (this.processing()) return;
    this.processing.set(true);
    if (this.gateMode() === 'patrimonial') {
      this.gateService.validateService(accessId).subscribe({
        next: (res) => this.handleServiceValidateResponse(res),
        error: (err: HttpErrorResponse) => this.handleValidateError(err),
      });
      return;
    }
    this.gateService.validateEvent(accessId).subscribe({
      next: (res) => this.handleValidateResponse(accessId, res),
      error: (err: HttpErrorResponse) => this.handleValidateError(err),
    });
  }

  private handleServiceValidateResponse(res: GateServiceValidateResponse): void {
    this.processing.set(false);
    this.scanValue = '';
    if (res.access_allowed) {
      this.denyReason.set('');
      this.lastServiceSuccess.set(res);
      this.lastSuccess.set(null);
      this.feedback.set('success');
      this.loadSuccessPhoto(res.collaborator?.picture);
      this.clearFeedbackTimer();
      this.feedbackTimer = setTimeout(() => {
        this.feedback.set('idle');
        this.lastServiceSuccess.set(null);
        this.clearSuccessPhoto();
        this.focusScanInput();
        this.cdr.markForCheck();
      }, 2000);
      this.loadTodayList();
      this.cdr.markForCheck();
      return;
    }
    this.showDenied(res.reason || 'Acesso negado.', res.error_code || 'DENIED');
  }

  private handleValidateResponse(_accessId: string, res: GateValidateResponse): void {
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
    this.lastServiceSuccess.set(null);
    this.feedback.set('success');
    this.loadSuccessPhoto(res.collaborator.picture);
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      this.feedback.set('idle');
      this.lastSuccess.set(null);
      this.clearSuccessPhoto();
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
