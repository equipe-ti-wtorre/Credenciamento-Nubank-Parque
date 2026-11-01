import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavigationStateService } from '../../../core/services/navigation-state.service';
import Swal from 'sweetalert2';
import {
  EventDayCompanyBrief,
  EventDayType,
  EventService,
} from '../../../services/event.service';
import { ApprovalService, EligibleSector } from '../../../services/approval.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { NovoEventoStepDadosComponent } from './novo-evento-modal/steps/step-dados.component';
import { NovoEventoStepDiasComponent } from './novo-evento-modal/steps/step-dias.component';
import { NovoEventoStepRevisaoComponent } from './novo-evento-modal/steps/step-revisao.component';
import { compareIso, eachIsoInRange } from './novo-evento-modal/ui/calendar.util';
import {
  addDayTypeToRange,
  flattenDiasToPayload,
  removeDayType,
  toggleDayType,
} from './novo-evento-modal/models/evento.model';

const SUBS: Record<number, string> = {
  1: 'Preencha os dados básicos e selecione o período no calendário.',
  2: 'Marque em quais dias ocorre montagem, show, desmontagem ou jogo. É opcional.',
  3: 'O setor só será notificado depois, quando a produtora responsável clicar em Notificar.',
};

const STEP_DEFS = [
  { key: 1, label: 'Dados do evento' },
  { key: 2, label: 'Dias do evento' },
  { key: 3, label: 'Revisão' },
] as const;

@Component({
  selector: 'app-event-create',
  standalone: true,
  imports: [
    NovoEventoStepDadosComponent,
    NovoEventoStepDiasComponent,
    NovoEventoStepRevisaoComponent,
  ],
  templateUrl: './event-create.component.html',
  styleUrl: './event-create.component.scss',
})
export class EventCreateComponent implements OnInit, OnDestroy {
  private readonly eventService = inject(EventService);
  private readonly approvalService = inject(ApprovalService);
  private readonly notification = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationStateService);

  readonly stepDefs = STEP_DEFS;
  readonly step = signal(1);
  readonly nome = signal('');
  readonly idSetor = signal<number | null>(null);
  readonly idEmpresa = signal<number | null>(null);
  readonly dataInicio = signal<string | null>(null);
  readonly dataFim = signal<string | null>(null);
  readonly picking = signal<'start' | 'end'>('start');
  readonly dias = signal(new Map<string, number[]>());
  readonly brushTypeId = signal(0);
  readonly saving = signal(false);
  readonly loadingMeta = signal(false);
  readonly lockEmpresa = signal(false);

  readonly sectors = signal<EligibleSector[]>([]);
  readonly producers = signal<EventDayCompanyBrief[]>([]);
  readonly types = signal<EventDayType[]>([]);
  readonly calViewKey = signal(0);
  readonly coverPreview = signal<string | null>(null);
  private coverFile: File | null = null;


  private defaultEmpresaId: number | null = null;

  readonly subtitle = computed(() => SUBS[this.step()] || '');
  readonly stepLabel = computed(
    () => this.stepDefs.find((s) => s.key === this.step())?.label || '',
  );
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

  ngOnDestroy(): void {
    this.revokeCoverPreview();
  }

  onCoverPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.notification.error('A foto deve ter no máximo 2 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.notification.error('Use JPEG, PNG ou WebP.');
      return;
    }
    this.coverFile = file;
    this.revokeCoverPreview();
    this.coverPreview.set(URL.createObjectURL(file));
  }

  clearCover(): void {
    this.coverFile = null;
    this.revokeCoverPreview();
  }

  private revokeCoverPreview(): void {
    const url = this.coverPreview();
    if (url) URL.revokeObjectURL(url);
    this.coverPreview.set(null);
  }

  async ngOnInit(): Promise<void> {
    const user = await this.authService.refreshCurrentUser({ fallbackToCache: true });
    this.defaultEmpresaId = user?.id_company != null ? user.id_company : null;
    const role = String(user?.role || user?.perfil || user?.profile?.codigo || '').toUpperCase();
    this.lockEmpresa.set(role === 'PRODUTORA' && this.defaultEmpresaId != null);

    this.loadingMeta.set(true);
    try {
      await Promise.all([this.loadSectors(), this.loadProducers(), this.loadTypes()]);
      if (this.lockEmpresa() && this.defaultEmpresaId != null) {
        this.idEmpresa.set(this.defaultEmpresaId);
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

  private hasDirtyData(): boolean {
    return (
      !!this.nome().trim() ||
      this.idSetor() != null ||
      (!this.lockEmpresa() && this.idEmpresa() != null) ||
      !!this.dataInicio() ||
      this.dias().size > 0 ||
      !!this.coverFile
    );
  }

  async onClose(): Promise<void> {
    if (this.saving()) return;
    if (this.hasDirtyData()) {
      const result = await Swal.fire({
        title: 'Descartar rascunho?',
        text: 'Há dados preenchidos. Sair agora descarta o que foi informado.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Descartar',
        cancelButtonText: 'Continuar editando',
        reverseButtons: true,
      });
      if (!result.isConfirmed) return;
    }
    void this.router.navigate(['/admin/eventos']);
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
    this.dias.set(toggleDayType(this.dias(), iso, brush));
  }

  onFillPeriod(): void {
    const start = this.dataInicio();
    const end = this.dataFim();
    const brush = this.brushTypeId();
    if (!start || !end || !brush) return;
    this.dias.set(addDayTypeToRange(this.dias(), eachIsoInRange(start, end), brush));
  }

  onRemoveDayType(ev: { iso: string; id_type: number }): void {
    this.dias.set(removeDayType(this.dias(), ev.iso, ev.id_type));
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
    this.scrollTop();
  }

  goBack(): void {
    this.step.set(Math.max(1, this.step() - 1));
    this.scrollTop();
  }

  private scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const days = flattenDiasToPayload(this.dias());

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
          this.afterCreate(res.event.id_event);
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

  private afterCreate(id: number): void {
    const go = () => {
      this.saving.set(false);
      this.notification.success(
        'Evento criado. A empresa responsável será notificada por e-mail.',
      );
      void this.nav.navegar('/admin/eventos/detalhe', { public_id: String(id) });
    };
    const file = this.coverFile;
    if (!file) {
      go();
      return;
    }
    this.eventService.uploadCover(id, file).subscribe({
      next: () => go(),
      error: (err) => {
        this.notification.notifyHttpError(err, 'Evento criado, mas a foto não foi enviada.');
        go();
      },
    });
  }
}
