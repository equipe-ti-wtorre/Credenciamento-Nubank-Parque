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
  GateWeekDay,
  GateServiceValidateResponse,
  GateValidateResponse,
  GateValidateSuccess,
  GateManualReleaseResult,
  GateCalendarItem,
  GateCalendarTypeKey,
  GateCalendarDetailResponse,
  GateCalendarCollaborator,
  GateCalendarVehicle,
} from '../../services/gate.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { MicrosoftProfileService } from '../../core/services/microsoft-profile.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  GateReleaseModalComponent,
  GateReleaseResult,
  GateReleaseTarget,
} from '../../shared/gate-release/gate-release-modal.component';
import { GateManualReleaseModalComponent } from '../../shared/gate-manual-release/gate-manual-release-modal.component';

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

type GateMode = 'events' | 'patrimonial' | 'calendar';

interface CalendarDayCell {
  dateKey: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  items: GateCalendarItem[];
  visibleItems: GateCalendarItem[];
  hiddenCount: number;
}

const CAL_MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const CAL_MES_ABBR = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];
const CAL_DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CAL_DAY_CHIP_LIMIT = 2;

@Component({
  selector: 'app-gate-control',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    GateReleaseModalComponent,
    GateManualReleaseModalComponent,
  ],
  templateUrl: './gate-control.component.html',
  styleUrl: './gate-control.component.scss',
})
export class GateControlComponent implements AfterViewInit, OnDestroy {
  @ViewChild('scanInput') scanInput?: ElementRef<HTMLInputElement>;
  @ViewChild('gateRoot') gateRoot?: ElementRef<HTMLElement>;

  private gateService = inject(GateService);
  private collaboratorService = inject(CollaboratorService);
  private microsoftProfile = inject(MicrosoftProfileService);
  private notify = inject(NotificationService);
  private authService = inject(AuthService);
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
  fullscreenMode = signal(false);

  /** Tick for relative-time labels ("há X min") — bumped every 30s when someone is inside. */
  private relTick = signal(0);

  gateMode = signal<GateMode>('patrimonial');
  todayCredentials = signal<GateTodayCredential[]>([]);
  todayServices = signal<GateTodayService[]>([]);
  todayLoading = signal(false);
  thumbnailUrls = signal<Record<string, string>>({});
  approverPhotoUrls = signal<Record<number, string>>({});
  successPhotoUrl = signal<string | null>(null);

  private thumbnailLoadId = 0;
  private approverPhotoLoadId = 0;

  calendarItems = signal<GateCalendarItem[]>([]);
  calendarSelected = signal<GateCalendarItem | null>(null);
  calendarDetailOpen = signal(false);
  calendarDetailLoading = signal(false);
  calendarDetailItem = signal<GateCalendarItem | null>(null);
  calendarDetailCollaborators = signal<GateCalendarCollaborator[]>([]);
  calendarDetailVehicles = signal<GateCalendarVehicle[]>([]);
  calendarLoading = signal(false);
  dayListOpen = signal(false);
  dayListDateKey = signal<string | null>(null);
  private now = new Date();
  viewYear = signal(this.now.getFullYear());
  viewMonth = signal(this.now.getMonth());

  readonly calDow = CAL_DOW;

  monthLabel = computed(() => `${CAL_MESES[this.viewMonth()]} ${this.viewYear()}`);

  todayDateKey = computed(() => {
    this.relTick();
    return this.formatLocalDateKey(new Date());
  });

  calendarCells = computed((): CalendarDayCell[] => {
    const y = this.viewYear();
    const m = this.viewMonth();
    const todayKey = this.todayDateKey();
    const items = this.calendarItems();
    const byDate = new Map<string, GateCalendarItem[]>();
    for (const item of items) {
      const list = byDate.get(item.date) || [];
      list.push(item);
      byDate.set(item.date, list);
    }

    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();
    const cellsCount = Math.ceil((startDow + daysIn) / 7) * 7;
    const cells: CalendarDayCell[] = [];

    for (let i = 0; i < cellsCount; i += 1) {
      const dayNum = i - startDow + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysIn;
      let realY = y;
      let realM = m;
      let realD = dayNum;
      if (dayNum < 1) {
        realM = m - 1;
        realD = prevDays + dayNum;
        if (realM < 0) {
          realM = 11;
          realY -= 1;
        }
      } else if (dayNum > daysIn) {
        realM = m + 1;
        realD = dayNum - daysIn;
        if (realM > 11) {
          realM = 0;
          realY += 1;
        }
      }
      const dateKey = `${realY}-${String(realM + 1).padStart(2, '0')}-${String(realD).padStart(2, '0')}`;
      const dayItems = inMonth ? byDate.get(dateKey) || [] : [];
      cells.push({
        dateKey,
        dayNum: realD,
        inMonth,
        isToday: dateKey === todayKey,
        items: dayItems,
        visibleItems: dayItems.slice(0, CAL_DAY_CHIP_LIMIT),
        hiddenCount: Math.max(0, dayItems.length - CAL_DAY_CHIP_LIMIT),
      });
    }
    return cells;
  });

  dayListItems = computed(() => {
    const key = this.dayListDateKey();
    if (!key) return [];
    return this.calendarItems()
      .filter((item) => item.date === key)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  dayListTitle = computed(() => {
    const key = this.dayListDateKey();
    if (!key) return '';
    return this.formatFullDateKey(key);
  });

  dayListSubtitle = computed(() => {
    const n = this.dayListItems().length;
    if (n === 0) return 'Nenhum item';
    if (n === 1) return '1 item';
    return `${n} itens`;
  });

  upcomingItems = computed(() => {
    const today = this.todayDateKey();
    const seen = new Set<string>();
    const out: GateCalendarItem[] = [];
    for (const item of this.calendarItems()) {
      if (item.date < today) continue;
      const uniq = `${item.kind}:${item.source_id}:${item.date}`;
      if (seen.has(uniq)) continue;
      seen.add(uniq);
      out.push(item);
    }
    return out.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  });

  stats = computed((): GateStats => {
    this.relTick();
    if (this.gateMode() === 'calendar') {
      return { total: 0, wait: 0, in: 0, done: 0, veiculo: 0, colaborador: 0 };
    }
    if (this.gateMode() === 'patrimonial') {
      const list = this.todayServices();
      return {
        total: list.length,
        wait: list.filter(
          (r) => r.next_action === 'CHECK_IN' || r.next_action === 'PENDING_APPROVAL',
        ).length,
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
    const rank: Record<string, number> = {
      CHECK_IN: 0,
      PENDING_APPROVAL: 1,
      CHECK_OUT: 2,
      COMPLETED: 3,
      REJECTED: 4,
    };
    const entryTs = (row: GateTodayService): number => {
      const raw =
        row.check_in ||
        row.approved_by?.decided_at ||
        row.rejected_by?.decided_at ||
        null;
      if (!raw) return 0;
      const ms = new Date(raw).getTime();
      return Number.isFinite(ms) ? ms : 0;
    };
    return this.todayServices()
      .filter((row) => {
        if (type === 'veiculo' && row.kind !== 'vehicle') return false;
        if (type === 'colaborador' && row.kind !== 'collaborator') return false;
        if (
          status === 'wait' &&
          row.next_action !== 'CHECK_IN' &&
          row.next_action !== 'PENDING_APPROVAL'
        ) {
          return false;
        }
        if (status === 'in' && row.next_action !== 'CHECK_OUT') return false;
        if (status === 'done' && row.next_action !== 'COMPLETED') return false;
        if (q) {
          const parts = [row.company.name, row.finalidade, row.kind];
          if (row.vehicle) parts.push(row.vehicle.plate);
          if (row.collaborator) {
            parts.push(
              row.collaborator.name,
              row.collaborator.document_masked,
              row.collaborator.role,
            );
          }
          if (!parts.join(' ').toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ra = rank[a.next_action] ?? 9;
        const rb = rank[b.next_action] ?? 9;
        if (ra !== rb) return ra - rb;
        const ta = entryTs(a);
        const tb = entryTs(b);
        if (ta !== tb) return tb - ta;
        const na = String(
          a.collaborator?.name || a.vehicle?.plate || a.finalidade || '',
        ).toLocaleLowerCase('pt-BR');
        const nb = String(
          b.collaborator?.name || b.vehicle?.plate || b.finalidade || '',
        ).toLocaleLowerCase('pt-BR');
        return na.localeCompare(nb, 'pt-BR');
      });
  });

  showReleaseModal = signal(false);
  releaseTarget = signal<GateReleaseTarget | null>(null);
  operatorName = signal('');

  showManualReleaseModal = signal(false);

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
  private listRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshSpinTimer: ReturnType<typeof setTimeout> | null = null;
  private denyAudio: HTMLAudioElement | null = null;
  private skipNextFocusRestore = false;
  private readonly onFullscreenChange = (): void => {
    if (!document.fullscreenElement && this.fullscreenMode()) {
      this.exitFullscreenMode(false);
    }
  };

  ngAfterViewInit(): void {
    this.loadDocumentTypes();
    this.loadTodayList();
    this.focusScanInput();
    void this.authService.getCurrentUser().then((user) => {
      this.operatorName.set(user?.nome_completo || '');
      this.cdr.markForCheck();
    });
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.relTimer = setInterval(() => {
      const hasInside =
        this.todayCredentials().some((r) => r.next_action === 'CHECK_OUT') ||
        this.todayServices().some((r) => r.next_action === 'CHECK_OUT');
      if (hasInside) {
        this.relTick.update((n) => n + 1);
        this.cdr.markForCheck();
      }
    }, 30_000);
    this.listRefreshTimer = setInterval(() => {
      if (!this.processing()) {
        this.loadTodayList();
      }
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.relTimer) clearInterval(this.relTimer);
    if (this.listRefreshTimer) clearInterval(this.listRefreshTimer);
    if (this.refreshSpinTimer) clearTimeout(this.refreshSpinTimer);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.exitFullscreenMode(true);
    this.revokeThumbnails();
    this.revokeApproverPhotos();
    this.clearSuccessPhoto();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showSubstituteModal() || this.showReleaseModal() || this.showManualReleaseModal()) return;
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

  toggleFullscreen(): void {
    if (this.fullscreenMode()) {
      this.exitFullscreenMode(true);
    } else {
      this.enterFullscreenMode();
    }
  }

  private enterFullscreenMode(): void {
    this.fullscreenMode.set(true);
    document.body.classList.add('gate-kiosk');
    const el = this.gateRoot?.nativeElement;
    if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => {
        /* CSS kiosk fallback when Fullscreen API is blocked */
      });
    }
    this.cdr.markForCheck();
  }

  private exitFullscreenMode(exitNative: boolean): void {
    this.fullscreenMode.set(false);
    document.body.classList.remove('gate-kiosk');
    if (exitNative && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  actionLabel(action: 'CHECK_IN' | 'CHECK_OUT'): string {
    return action === 'CHECK_IN' ? 'Entrada' : 'Saída';
  }

  isSingleDay(row: GateTodayService): boolean {
    return !!row.start_date && row.start_date === row.end_date;
  }

  /** Ex.: "Sex, 18/07" para o pill de dia único. */
  formatDayPill(date: string | null): string {
    if (!date) return '';
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const dayMonth = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
  }

  dayTitle(day: GateWeekDay): string {
    const labels: Record<GateWeekDay['status'], string> = {
      accessed: 'Acessou',
      missed: 'Não acessou',
      waiting: 'Aguardando',
      none: 'Sem acesso no dia',
    };
    const d = new Date(`${day.date}T00:00:00`);
    const dateLabel = Number.isNaN(d.getTime())
      ? day.date
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${dateLabel} · ${labels[day.status]}${day.is_today ? ' (hoje)' : ''}`;
  }

  /** Ex.: "14/07 16:22" para a data da aprovação. */
  formatShortDateTime(value: string | null): string {
    const d = this.parseGateDate(value);
    if (!d) return '';
    const date = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: GATE_DISPLAY_TIMEZONE,
    });
    const time = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: GATE_DISPLAY_TIMEZONE,
    });
    return `${date} ${time}`;
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

  setGateMode(mode: GateMode): void {
    this.gateMode.set(mode);
    this.manualSearch.set('');
    this.statusFilter.set('todos');
    this.typeFilter.set('todos');
    this.calendarSelected.set(null);
    this.closeCalendarDetail();
    this.closeDayList();
    this.loadTodayList();
    this.focusScanInput();
  }

  loadTodayList(): void {
    if (this.gateMode() === 'calendar') {
      this.loadCalendar();
      return;
    }
    this.todayLoading.set(true);
    if (this.gateMode() === 'patrimonial') {
      this.gateService.listTodayServices().subscribe({
        next: (res) => {
          this.todayServices.set(res.services);
          this.todayLoading.set(false);
          this.loadThumbnailsFromServices(res.services);
          void this.loadApproverPhotos(res.services);
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
    this.revokeApproverPhotos();
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

  private calendarRangeKeys(): { from: string; to: string } {
    const y = this.viewYear();
    const m = this.viewMonth();
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const cellsCount = Math.ceil((startDow + daysIn) / 7) * 7;
    const gridStart = new Date(y, m, 1 - startDow);
    const gridEnd = new Date(y, m, 1 - startDow + cellsCount - 1);
    return {
      from: this.formatLocalDateKey(gridStart),
      to: this.formatLocalDateKey(gridEnd),
    };
  }

  loadCalendar(): void {
    const { from, to } = this.calendarRangeKeys();
    this.calendarLoading.set(true);
    this.gateService.listCalendar(from, to).subscribe({
      next: (res) => {
        this.calendarItems.set(res.items || []);
        this.calendarLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.calendarLoading.set(false);
        this.notify.error(err.error?.message || 'Falha ao carregar o calendário.');
        this.cdr.markForCheck();
      },
    });
  }

  prevCalendarMonth(): void {
    let m = this.viewMonth() - 1;
    let y = this.viewYear();
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    this.viewMonth.set(m);
    this.viewYear.set(y);
    this.closeCalendarDetail();
    this.closeDayList();
    this.loadCalendar();
  }

  nextCalendarMonth(): void {
    let m = this.viewMonth() + 1;
    let y = this.viewYear();
    if (m > 11) {
      m = 0;
      y += 1;
    }
    this.viewMonth.set(m);
    this.viewYear.set(y);
    this.closeCalendarDetail();
    this.closeDayList();
    this.loadCalendar();
  }

  goCalendarToday(): void {
    const now = new Date();
    this.viewYear.set(now.getFullYear());
    this.viewMonth.set(now.getMonth());
    this.closeCalendarDetail();
    this.closeDayList();
    this.loadCalendar();
  }

  openCalendarItem(item: GateCalendarItem): void {
    this.closeDayList();
    this.calendarSelected.set(item);
    this.calendarDetailItem.set(item);
    this.calendarDetailCollaborators.set([]);
    this.calendarDetailVehicles.set([]);
    this.calendarDetailOpen.set(true);
    this.calendarDetailLoading.set(true);
    this.gateService.getCalendarDetail(item.kind, item.source_id, item.date).subscribe({
      next: (res: GateCalendarDetailResponse) => {
        this.calendarDetailItem.set(res.item);
        this.calendarDetailCollaborators.set(res.collaborators || []);
        this.calendarDetailVehicles.set(res.vehicles || []);
        this.calendarDetailLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.calendarDetailLoading.set(false);
        this.notify.error(err.error?.message || 'Falha ao carregar o detalhe.');
        this.cdr.markForCheck();
      },
    });
  }

  openDayList(cell: CalendarDayCell): void {
    if (!cell.inMonth) return;
    this.closeCalendarDetail();
    this.dayListDateKey.set(cell.dateKey);
    this.dayListOpen.set(true);
  }

  closeDayList(): void {
    this.dayListOpen.set(false);
    this.dayListDateKey.set(null);
  }

  closeCalendarDetail(): void {
    this.calendarDetailOpen.set(false);
    this.calendarDetailLoading.set(false);
    this.calendarSelected.set(null);
    this.calendarDetailItem.set(null);
    this.calendarDetailCollaborators.set([]);
    this.calendarDetailVehicles.set([]);
  }

  calendarDetailSubtitle(): string {
    const item = this.calendarDetailItem();
    if (!item) return '';
    const kindLabel = item.kind === 'event' ? 'Evento' : 'Solicitação de serviço';
    return `${kindLabel} · ${this.formatFullCalendarDate(item)}`;
  }

  chipClass(typeKey: GateCalendarTypeKey): string {
    switch (typeKey) {
      case 'sport':
        return 'chip-sport';
      case 'setup':
      case 'teardown':
        return 'chip-setup';
      case 'service':
        return 'chip-service';
      default:
        return 'chip-show';
    }
  }

  railColor(typeKey: GateCalendarTypeKey): string {
    switch (typeKey) {
      case 'sport':
        return 'var(--ok)';
      case 'setup':
      case 'teardown':
        return '#7c3aed';
      case 'service':
        return '#0ea5e9';
      default:
        return 'var(--wtorre)';
    }
  }

  isLiveToday(item: GateCalendarItem): boolean {
    return item.date === this.todayDateKey();
  }

  formatCalendarPeriod(item: GateCalendarItem): string {
    const start = this.formatBrDate(item.start_date);
    const end = this.formatBrDate(item.end_date);
    if (start === end) return start;
    return `${start} — ${end}`;
  }

  formatUpcomingWhen(item: GateCalendarItem): string {
    const d = new Date(`${item.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return item.date;
    const dow = CAL_DOW[d.getDay()];
    return `${dow} · ${String(d.getDate()).padStart(2, '0')} ${CAL_MES_ABBR[d.getMonth()]}`;
  }

  upcomingDateParts(item: GateCalendarItem): { d: string; m: string } {
    const d = new Date(`${item.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return { d: '--', m: '---' };
    return {
      d: String(d.getDate()).padStart(2, '0'),
      m: CAL_MES_ABBR[d.getMonth()],
    };
  }

  formatFullCalendarDate(item: GateCalendarItem): string {
    return this.formatFullDateKey(item.date);
  }

  formatFullDateKey(dateKey: string): string {
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    return `${CAL_DOW[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} de ${CAL_MESES[d.getMonth()]} de ${d.getFullYear()}`;
  }

  formatBrDatePublic(dateKey: string): string {
    return this.formatBrDate(dateKey);
  }

  private formatBrDate(dateKey: string): string {
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private formatLocalDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  pictureUrl(accessId: string): string | null {
    return this.thumbnailUrls()[accessId] ?? null;
  }

  approverPhotoUrl(userId: number | undefined | null): string | null {
    if (userId == null) return null;
    return this.approverPhotoUrls()[userId] ?? null;
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

  private async loadApproverPhotos(list: GateTodayService[]): Promise<void> {
    this.revokeApproverPhotos();
    const loadId = ++this.approverPhotoLoadId;
    const ids = [
      ...new Set(
        list
          .map((row) => row.approved_by?.id)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    await Promise.all(
      ids.map(async (id) => {
        const url = await this.microsoftProfile.fetchUserPhotoObjectUrl(id);
        if (!url) return;
        if (loadId !== this.approverPhotoLoadId) {
          URL.revokeObjectURL(url);
          return;
        }
        this.approverPhotoUrls.update((map) => ({ ...map, [id]: url }));
        this.cdr.markForCheck();
      }),
    );
  }

  private revokeThumbnails(): void {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }

  private revokeApproverPhotos(): void {
    for (const url of Object.values(this.approverPhotoUrls())) {
      URL.revokeObjectURL(url);
    }
    this.approverPhotoUrls.set({});
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
    if (row.next_action === 'CHECK_IN') {
      this.openReleaseModal({
        access_id: row.access_id,
        collaborator: row.collaborator,
        company_name: row.company.name,
      });
      return;
    }
    this.processScan(row.access_id);
  }

  onManualValidateService(row: GateTodayService): void {
    if (
      this.processing() ||
      row.next_action === 'COMPLETED' ||
      row.next_action === 'PENDING_APPROVAL'
    ) {
      return;
    }
    this.skipNextFocusRestore = true;
    if (row.next_action === 'CHECK_IN' && row.kind === 'collaborator' && row.collaborator) {
      this.openReleaseModal({
        access_id: row.access_id,
        collaborator: row.collaborator,
        company_name: row.company.name,
      });
      return;
    }
    this.processScan(row.access_id);
  }

  private openReleaseModal(target: GateReleaseTarget): void {
    this.releaseTarget.set(target);
    this.showReleaseModal.set(true);
  }

  /**
   * Scan de colaborador aguardando entrada abre o wizard de liberação;
   * demais casos (saída, veículos, código fora da lista) validam direto.
   */
  private tryOpenReleaseFromScan(accessId: string): boolean {
    if (this.showReleaseModal()) return false;
    if (this.gateMode() === 'patrimonial') {
      const row = this.todayServices().find((r) => r.access_id === accessId);
      if (row && row.kind === 'collaborator' && row.collaborator && row.next_action === 'CHECK_IN') {
        this.openReleaseModal({
          access_id: row.access_id,
          collaborator: row.collaborator,
          company_name: row.company.name,
        });
        return true;
      }
      return false;
    }
    const row = this.todayCredentials().find((r) => r.access_id === accessId);
    if (row && row.next_action === 'CHECK_IN') {
      this.openReleaseModal({
        access_id: row.access_id,
        collaborator: row.collaborator,
        company_name: row.company.name,
      });
      return true;
    }
    return false;
  }

  onReleaseConfirm(result: GateReleaseResult): void {
    this.showReleaseModal.set(false);
    this.releaseTarget.set(null);
    this.executeValidation(result.access_id);
  }

  onReleaseClose(): void {
    this.showReleaseModal.set(false);
    this.releaseTarget.set(null);
    this.focusScanInput();
  }

  openManualRelease(): void {
    this.showManualReleaseModal.set(true);
  }

  onManualReleaseClose(): void {
    this.showManualReleaseModal.set(false);
    this.focusScanInput();
  }

  onManualReleaseSubmitted(_result: GateManualReleaseResult): void {
    this.showManualReleaseModal.set(false);
    this.loadTodayList();
    this.focusScanInput();
  }

  notifyingIds = signal<Record<number, boolean>>({});
  cancellingIds = signal<Record<number, boolean>>({});

  isNotifying(row: GateTodayService): boolean {
    const id = row.id_service_access;
    return id != null && !!this.notifyingIds()[id];
  }

  isCancelling(row: GateTodayService): boolean {
    const id = row.id_service_access;
    return id != null && !!this.cancellingIds()[id];
  }

  onNotifySector(row: GateTodayService): void {
    const id = row.id_service_access;
    if (!id || this.processing() || this.isNotifying(row) || this.isCancelling(row)) return;
    this.notifyingIds.update((m) => ({ ...m, [id]: true }));
    this.gateService.notifyServiceApproval(id).subscribe({
      next: (res) => {
        this.notifyingIds.update((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        this.notify.success(res.message || `Setor ${res.setor_nome} notificado.`);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.notifyingIds.update((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        this.notify.error(err.error?.message || 'Não foi possível notificar o setor.');
        this.cdr.markForCheck();
      },
    });
  }

  onCancelPending(row: GateTodayService): void {
    const id = row.id_service_access;
    if (!id || this.processing() || this.isNotifying(row) || this.isCancelling(row)) return;
    const label =
      row.collaborator?.name || row.vehicle?.plate || row.finalidade || 'esta solicitação';
    if (!window.confirm(`Reprovar a liberação de ${label}?`)) return;

    this.cancellingIds.update((m) => ({ ...m, [id]: true }));
    this.gateService.cancelServiceApproval(id).subscribe({
      next: (res) => {
        this.cancellingIds.update((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        this.notify.success(res.message || 'Solicitação reprovada.');
        this.todayServices.update((list) =>
          list.map((r) =>
            r.id_service_access === id
              ? {
                  ...r,
                  next_action: 'REJECTED' as const,
                  id_aprovacao: null,
                  id_setor: null,
                  setor_nome: null,
                  approved_by: null,
                }
              : r,
          ),
        );
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.cancellingIds.update((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        this.notify.error(err.error?.message || 'Não foi possível cancelar a solicitação.');
        this.cdr.markForCheck();
      },
    });
  }

  onReleasePictureUpdated(evt: { access_id: string; picture: string }): void {
    this.todayCredentials.update((list) =>
      list.map((r) =>
        r.access_id === evt.access_id
          ? { ...r, collaborator: { ...r.collaborator, picture: evt.picture } }
          : r,
      ),
    );
    this.todayServices.update((list) =>
      list.map((r) =>
        r.access_id === evt.access_id && r.collaborator
          ? { ...r, collaborator: { ...r.collaborator, picture: evt.picture } }
          : r,
      ),
    );
    this.collaboratorService.getPictureBlob(evt.picture).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const previous = this.thumbnailUrls()[evt.access_id];
        if (previous) URL.revokeObjectURL(previous);
        this.thumbnailUrls.update((map) => ({ ...map, [evt.access_id]: url }));
        this.cdr.markForCheck();
      },
      error: () => undefined,
    });
  }

  private processScan(accessId: string): void {
    if (this.processing()) return;
    if (this.tryOpenReleaseFromScan(accessId)) {
      this.scanValue = '';
      return;
    }
    this.executeValidation(accessId);
  }

  private executeValidation(accessId: string): void {
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
