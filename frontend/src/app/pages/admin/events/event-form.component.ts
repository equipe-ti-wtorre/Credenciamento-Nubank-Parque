import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  EventCreatePayload,
  EventDayType,
  EventDetail,
  EventService,
} from '../../../services/event.service';
import { CompanyItem, CompanyService } from '../../../services/company.service';
import { NotificationService } from '../../../core/services/notification.service';

const TYPE_PRODUTORA = 'Produtora';

const INPUT_CLASS =
  'w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form class="space-y-5" [formGroup]="eventForm" (ngSubmit)="salvar()">
      <div class="card-surface p-4 space-y-4">
        <h4 class="text-sm font-bold text-slate-700 uppercase tracking-wide">Capa do evento</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome do evento</label>
            <input
              type="text"
              formControlName="name"
              class="${INPUT_CLASS}"
              placeholder="Ex.: Festival Verão 2026"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Produtora responsável</label>
            <select formControlName="id_producer" class="${INPUT_CLASS} bg-white">
              <option [ngValue]="null" disabled>Selecione a produtora</option>
              <option *ngFor="let p of producers()" [ngValue]="p.id_company">
                {{ p.company_name }}
              </option>
            </select>
            <p *ngIf="producers().length === 0 && !loadingProducers()" class="text-xs text-amber-600 mt-1">
              Nenhuma produtora cadastrada. Cadastre uma empresa do tipo Produtora primeiro.
            </p>
          </div>
        </div>
        <div>
          <label class="text-xs font-bold text-slate-500 uppercase">Descrição</label>
          <textarea
            formControlName="description"
            rows="3"
            class="${INPUT_CLASS} resize-y min-h-[4rem]"
            placeholder="Opcional"
          ></textarea>
        </div>
      </div>

      <div class="card-surface p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-sm font-bold text-slate-700 uppercase tracking-wide">Dias operacionais</h4>
            <p class="text-xs text-slate-500 mt-0.5">Adicione pelo menos um dia. O período do evento será calculado automaticamente.</p>
          </div>
          <button type="button" (click)="adicionarDia()" class="btn-secondary text-xs py-1.5 px-3">
            + Adicionar dia
          </button>
        </div>

        <div formArrayName="days" class="space-y-2">
          <div
            *ngFor="let dayCtrl of daysFormArray.controls; let i = index"
            [formGroupName]="i"
            class="flex flex-col sm:flex-row sm:items-end gap-2 border border-[var(--app-border)] rounded-xl p-3"
          >
            <div class="flex-1 min-w-0">
              <label class="text-xs text-slate-500">Data</label>
              <input type="date" formControlName="date" class="${INPUT_CLASS}" />
            </div>
            <div class="flex-1 min-w-0">
              <label class="text-xs text-slate-500">Tipo</label>
              <select formControlName="id_type" class="${INPUT_CLASS} bg-white">
                <option [ngValue]="null" disabled>Selecione</option>
                <option *ngFor="let t of types()" [ngValue]="t.id_event_day_type">{{ t.description }}</option>
              </select>
            </div>
            <button
              type="button"
              (click)="removerDia(i)"
              [disabled]="daysFormArray.length <= 1"
              class="shrink-0 p-2 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              title="Remover dia"
              aria-label="Remover dia"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <button type="button" (click)="cancelar()" class="btn-secondary">Cancelar</button>
        <button
          type="submit"
          [disabled]="eventForm.invalid || saving()"
          class="btn-primary disabled:opacity-50"
        >
          {{ saving() ? 'Salvando...' : 'Salvar evento' }}
        </button>
      </div>
    </form>
  `,
})
export class EventFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly eventService = inject(EventService);
  private readonly companyService = inject(CompanyService);
  private readonly notification = inject(NotificationService);

  @Output() saved = new EventEmitter<EventDetail>();
  @Output() cancelled = new EventEmitter<void>();

  eventForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    id_producer: [null as number | null, Validators.required],
    description: [''],
    days: this.fb.array<FormGroup>([]),
  });

  types = signal<EventDayType[]>([]);
  producers = signal<CompanyItem[]>([]);
  loadingProducers = signal(true);
  saving = signal(false);

  get daysFormArray(): FormArray<FormGroup> {
    return this.eventForm.get('days') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    this.carregarTipos();
    this.carregarProdutoras();
    this.adicionarDia();
  }

  reset(): void {
    this.eventForm.reset({ name: '', id_producer: null, description: '' });
    this.daysFormArray.clear();
    this.adicionarDia();
    this.saving.set(false);
    this.cdr.markForCheck();
  }

  private carregarTipos(): void {
    this.eventService.listTypes().subscribe({
      next: (res) => {
        this.types.set(res.types);
        const defaultType = this.defaultDayTypeId();
        if (defaultType) {
          for (const ctrl of this.daysFormArray.controls) {
            if (ctrl.get('id_type')?.value == null) {
              ctrl.patchValue({ id_type: defaultType });
            }
          }
        }
        this.cdr.markForCheck();
      },
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de dia.'),
    });
  }

  private carregarProdutoras(): void {
    this.loadingProducers.set(true);
    this.companyService.list(1, 100, {}).subscribe({
      next: (res) => {
        const allowed = res.companies.filter(
          (c) => c.company_type?.description === TYPE_PRODUTORA && c.status,
        );
        this.producers.set(allowed);
        this.loadingProducers.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingProducers.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar produtoras.');
        this.cdr.markForCheck();
      },
    });
  }

  private defaultDayTypeId(): number | null {
    const first = this.types()[0]?.id_event_day_type;
    return first != null ? first : null;
  }

  adicionarDia(): void {
    const defaultType = this.defaultDayTypeId();
    this.daysFormArray.push(
      this.fb.group({
        date: ['', Validators.required],
        id_type: [defaultType, Validators.required],
      }),
    );
  }

  removerDia(index: number): void {
    if (this.daysFormArray.length <= 1) return;
    this.daysFormArray.removeAt(index);
  }

  cancelar(): void {
    this.cancelled.emit();
  }

  salvar(): void {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    const raw = this.eventForm.getRawValue();
    const days = (raw.days as Array<{ date: string; id_type: number }>) || [];
    const payload: EventCreatePayload = {
      name: String(raw.name).trim(),
      id_producer: Number(raw.id_producer),
      description: String(raw.description || '').trim() || null,
      days: days.map((d) => ({
        date: d.date,
        id_type: Number(d.id_type),
      })),
    };

    this.saving.set(true);
    this.eventService.create(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.saved.emit(res.event);
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao criar evento.');
        this.cdr.markForCheck();
      },
    });
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
