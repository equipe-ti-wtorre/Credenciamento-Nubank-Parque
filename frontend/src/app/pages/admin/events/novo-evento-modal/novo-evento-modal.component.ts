import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import Swal from 'sweetalert2';
import {
  EventDayCompanyBrief,
  EventDayType,
  EventDetail,
  EventService,
} from '../../../../services/event.service';
import { ApprovalService, EligibleSector } from '../../../../services/approval.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { NovoEventoStepDadosComponent } from './steps/step-dados.component';
import { NovoEventoStepDiasComponent } from './steps/step-dias.component';
import { NovoEventoStepRevisaoComponent } from './steps/step-revisao.component';
import {
  compareIso,
  eachIsoInRange,
} from './ui/calendar.util';

const SUBS: Record<number, string> = {
  1: 'Preencha os dados básicos e selecione o período no calendário.',
  2: 'Marque em quais dias ocorre montagem, show, desmontagem ou jogo. É opcional.',
  3: 'Confira tudo antes de salvar o evento.',
};

@Component({
  selector: 'app-novo-evento-modal',
  standalone: true,
  imports: [
    NovoEventoStepDadosComponent,
    NovoEventoStepDiasComponent,
    NovoEventoStepRevisaoComponent,
  ],
  templateUrl: './novo-evento-modal.component.html',
  styleUrl: './novo-evento-modal.component.scss',
})
export class NovoEventoModalComponent {
  private readonly eventService = inject(EventService);
  private readonly approvalService = inject(ApprovalService);
  private readonly notification = inject(NotificationService);

  readonly open = input(false);
  readonly lockEmpresa = input(false);
  readonly defaultEmpresaId = input<number | null>(null);

  readonly closed = output<void>();
  readonly saved = output<EventDetail>();

  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('modalBody');
  private prevOpen = false;

  readonly step = signal(1);
  readonly nome = signal('');
  readonly idSetor = signal<number | null>(null);
  readonly idEmpresa = signal<number | null>(null);
  readonly dataInicio = signal<string | null>(null);
  readonly dataFim = signal<string | null>(null);
  readonly picking = signal<'start' | 'end'>('start');
  readonly dias = signal(new Map<string, number>());
  readonly brushTypeId = signal(0);
  readonly saving = signal(false);
  readonly loadingMeta = signal(false);

  readonly sectors = signal<EligibleSector[]>([]);
  readonly producers = signal<EventDayCompanyBrief[]>([]);
  readonly types = signal<EventDayType[]>([]);
  readonly calViewKey = signal(0);

  readonly subtitle = computed(() => SUBS[this.step()] || '');
  readonly canContinueStep1 = computed(
    () =>
      !!this.nome().trim() &&
      !!this.dataInicio() &&
      !!this.dataFim() &&
      this.idSetor() != null &&
      this.idEmpresa() != null,
  );

  readonly setorNome = computed(() => {
    const id = this.idSetor();
    return this.sectors().find((s) => s.id === id)?.nome || '—';
  });

  readonly empresaNome = computed(() => {
    const id = this.idEmpresa();
    return this.producers().find((p) => p.id_company === id)?.company_name || '—';
  });

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !this.prevOpen) {
        untracked(() => void this.onOpen());
      }
      this.prevOpen = isOpen;
    });
  }
  @HostListener('document:keydown', ['$event'])
  onDocKey(ev: KeyboardEvent): void {
    if (!this.open() || ev.key !== 'Escape') return;
    ev.preventDefault();
    void this.requestClose();
  }

  async onOpen(): Promise<void> {
    this.reset();
    this.loadingMeta.set(true);
    try {
      await Promise.all([this.loadSectors(), this.loadProducers(), this.loadTypes()]);
      if (this.lockEmpresa() && this.defaultEmpresaId() != null) {
        this.idEmpresa.set(this.defaultEmpresaId());
      }
    } finally {
      this.loadingMeta.set(false);
    }
  }

  private loadSectors(): Promise<void> {
    return new Promise((resolve) => {
      this.approvalService.listEligibleSectors('EVENTO').subscribe({
        next: (res) => {
          this.sectors.set(res.sectors || []);
          resolve();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao carregar setores.');
          resolve();
        },
      });
    });
  }

  private loadProducers(): Promise<void> {
    return new Promise((resolve) => {
      this.eventService.listProducers().subscribe({
        next: (res) => {
          this.producers.set(res.producers || []);
          resolve();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao carregar produtoras.');
          resolve();
        },
      });
    });
  }

  private loadTypes(): Promise<void> {
    return new Promise((resolve) => {
      this.eventService.listTypes().subscribe({
        next: (res) => {
          const list = res.types || [];
          this.types.set(list);
          if (list.length && !this.brushTypeId()) {
            this.brushTypeId.set(list[0].id_event_day_type);
          }
          resolve();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao carregar tipos de dia.');
          resolve();
        },
      });
    });
  }

  reset(): void {
    this.step.set(1);
    this.nome.set('');
    this.idSetor.set(null);
    this.idEmpresa.set(this.lockEmpresa() ? this.defaultEmpresaId() : null);
    this.dataInicio.set(null);
    this.dataFim.set(null);
    this.picking.set('start');
    this.dias.set(new Map());
    this.saving.set(false);
    this.calViewKey.update((n) => n + 1);
  }

  private hasDirtyData(): boolean {
    return (
      !!this.nome().trim() ||
      this.idSetor() != null ||
      (!this.lockEmpresa() && this.idEmpresa() != null) ||
      !!this.dataInicio() ||
      this.dias().size > 0
    );
  }

  async requestClose(): Promise<void> {
    if (this.saving()) return;
    if (this.hasDirtyData()) {
      const result = await Swal.fire({
        title: 'Descartar rascunho?',
        text: 'Há dados preenchidos. Fechar agora descarta o que foi informado.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Descartar',
        cancelButtonText: 'Continuar editando',
        reverseButtons: true,
      });
      if (!result.isConfirmed) return;
    }
    this.closed.emit();
  }

  async onRangePick(iso: string): Promise<void> {
    const picking = this.picking();
    const start = this.dataInicio();
    const end = this.dataFim();

    let nextStart = start;
    let nextEnd = end;
    let nextPicking: 'start' | 'end' = picking;

    if (picking === 'start' || !start || (start && end)) {
      nextStart = iso;
      nextEnd = null;
      nextPicking = 'end';
    } else {
      if (compareIso(iso, start) < 0) {
        nextEnd = start;
        nextStart = iso;
      } else {
        nextEnd = iso;
      }
      nextPicking = 'start';
    }

    if (nextStart && nextEnd) {
      const outOfRange = [...this.dias().keys()].filter(
        (k) => compareIso(k, nextStart!) < 0 || compareIso(k, nextEnd!) > 0,
      );
      if (outOfRange.length > 0) {
        const result = await Swal.fire({
          title: 'Ajustar período?',
          text: `${outOfRange.length} dia${outOfRange.length > 1 ? 's' : ''} marcado${outOfRange.length > 1 ? 's' : ''} fica${outOfRange.length > 1 ? 'm' : ''} fora do novo período e será${outOfRange.length > 1 ? 'ão' : ''} removido${outOfRange.length > 1 ? 's' : ''}. Continuar?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Continuar',
          cancelButtonText: 'Cancelar',
          reverseButtons: true,
        });
        if (!result.isConfirmed) return;
        const next = new Map(this.dias());
        for (const k of outOfRange) next.delete(k);
        this.dias.set(next);
      }
    }

    this.dataInicio.set(nextStart);
    this.dataFim.set(nextEnd);
    this.picking.set(nextPicking);
  }

  onTagDay(iso: string): void {
    const brush = this.brushTypeId();
    if (!brush) return;
    const next = new Map(this.dias());
    if (next.get(iso) === brush) next.delete(iso);
    else next.set(iso, brush);
    this.dias.set(next);
  }

  onFillPeriod(): void {
    const start = this.dataInicio();
    const end = this.dataFim();
    const brush = this.brushTypeId();
    if (!start || !end || !brush) return;
    const next = new Map(this.dias());
    for (const iso of eachIsoInRange(start, end)) {
      if (!next.has(iso)) next.set(iso, brush);
    }
    this.dias.set(next);
  }

  onChangeDayType(ev: { iso: string; id_type: number }): void {
    const next = new Map(this.dias());
    next.set(ev.iso, ev.id_type);
    this.dias.set(next);
  }

  onRemoveDay(iso: string): void {
    const next = new Map(this.dias());
    next.delete(iso);
    this.dias.set(next);
  }

  goNext(): void {
    if (this.step() === 1 && !this.canContinueStep1()) return;
    const next = Math.min(3, this.step() + 1);
    this.step.set(next);
    if (next === 2) this.calViewKey.update((n) => n + 1);
    this.scrollBodyTop();
  }

  goBack(): void {
    this.step.set(Math.max(1, this.step() - 1));
    this.scrollBodyTop();
  }

  private scrollBodyTop(): void {
    const el = this.bodyRef()?.nativeElement;
    if (el) el.scrollTop = 0;
  }

  salvar(): void {
    if (this.saving()) return;
    const nome = this.nome().trim();
    const idSetor = this.idSetor();
    const idEmpresa = this.idEmpresa();
    const start = this.dataInicio();
    const end = this.dataFim();
    if (!nome || idSetor == null || idEmpresa == null || !start || !end) {
      this.notification.error('Preencha nome, setor, empresa responsável e período.');
      return;
    }

    const days = [...this.dias().entries()]
      .map(([date, id_type]) => ({ date, id_type }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    this.saving.set(true);
    this.eventService
      .create({
        name: nome,
        start,
        end,
        id_setor: idSetor,
        id_company_responsavel: idEmpresa,
        days: days.length ? days : undefined,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.notification.success('Evento criado.');
          this.saved.emit(res.event);
        },
        error: (err) => {
          this.saving.set(false);
          const msg =
            (err as { error?: { error?: string; message?: string } })?.error?.error ||
            (err as { error?: { message?: string } })?.error?.message ||
            'Não foi possível salvar o evento. Verifique os dados e tente novamente.';
          this.notification.error(msg);
        },
      });
  }
}
