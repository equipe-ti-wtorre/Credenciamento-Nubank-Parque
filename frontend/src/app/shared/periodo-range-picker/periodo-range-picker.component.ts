import {
  Component,
  ElementRef,
  HostListener,
  Input,
  computed,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

export interface PeriodoRangeValue {
  inicio: string;
  fim: string;
}

type DayCell = {
  date: Date;
  iso: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
  isToday: boolean;
};

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function daysBetweenInclusive(inicio: string, fim: string): number {
  const a = parseIso(inicio);
  const b = parseIso(fim);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = [
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

@Component({
  selector: 'app-periodo-range-picker',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeriodoRangePickerComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => PeriodoRangePickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="prp" [class.is-invalid]="showError()" [class.is-inline]="inline" [class.is-open]="panelOpen()">
      <label class="prp-label" [attr.for]="inputId">{{ label }}</label>

      <button
        [id]="inputId"
        type="button"
        class="prp-trigger"
        [disabled]="disabled"
        [attr.aria-expanded]="panelOpen()"
        aria-haspopup="dialog"
        (click)="onTriggerClick()"
      >
        <svg class="prp-trigger__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span class="prp-trigger__text" [class.is-placeholder]="!displayRange()">
          @if (displayRange(); as r) {
            {{ formatBr(r.inicio) }} — {{ formatBr(r.fim) }}
          } @else if (draftStart()) {
            {{ formatBr(draftStart()!) }} — …
          } @else {
            {{ placeholder }}
          }
        </span>
        @if (daysCount() > 0) {
          <span class="prp-trigger__days">{{ daysCount() }} {{ daysCount() === 1 ? 'dia' : 'dias' }}</span>
        }
      </button>

      <div class="prp-error-slot" aria-live="polite">
        @if (showError()) {
          <p class="prp-error">
            {{ draftStart() && !draftEnd() ? 'Selecione a data final do período.' : 'Informe o período do acesso.' }}
          </p>
        }
      </div>

      @if (panelOpen()) {
        <div
          class="prp-panel"
          [class.prp-panel--inline]="inline"
          role="group"
          [attr.aria-label]="label"
        >
          <div class="prp-nav">
            <button type="button" class="prp-nav__btn" aria-label="Mês anterior" [disabled]="disabled" (click)="shiftMonth(-1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span class="prp-nav__title">{{ monthTitle() }}</span>
            <button type="button" class="prp-nav__btn" aria-label="Próximo mês" [disabled]="disabled" (click)="shiftMonth(1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>

          <div class="prp-weekdays">
            @for (w of weekdays; track $index) {
              <span>{{ w }}</span>
            }
          </div>

          <div class="prp-grid">
            @for (cell of cells(); track cell.iso + '-' + cell.inMonth) {
              <button
                type="button"
                class="prp-day"
                [class.is-out]="!cell.inMonth"
                [class.is-disabled]="cell.disabled || disabled"
                [class.is-today]="cell.isToday"
                [class.is-start]="cell.isStart"
                [class.is-end]="cell.isEnd"
                [class.is-range]="cell.inRange"
                [disabled]="cell.disabled || disabled"
                (click)="pick(cell)"
              >
                {{ cell.day }}
              </button>
            }
          </div>

          <div class="prp-foot">
            <span class="prp-foot__label">Período selecionado</span>
            <button type="button" class="prp-clear" [disabled]="disabled" (click)="clear($event)">Limpar</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --prp-h: 2.5rem;
      }
      .prp {
        position: relative;
        font-family: var(--font-body, 'Plus Jakarta Sans', system-ui, sans-serif);
      }
      .prp.is-inline {
        position: static;
      }
      .prp-label {
        display: block;
        margin-bottom: 8px;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .prp-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: var(--prp-h);
        padding: 0 14px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        cursor: pointer;
        text-align: left;
        color: #1e293b;
        font-size: 0.875rem;
        font-weight: 500;
      }
      .prp-trigger:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--wtorre, #1d54e6) 35%, #e2e8f0);
      }
      .prp-trigger:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--wtorre-focus-ring, rgba(29, 84, 230, 0.22));
        border-color: var(--wtorre, #1d54e6);
      }
      .prp.is-invalid .prp-trigger {
        border-color: var(--danger, #e11d48);
      }
      .prp-trigger:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .prp-trigger__icon {
        width: 18px;
        height: 18px;
        flex: none;
        color: #94a3b8;
      }
      .prp-trigger__text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .prp-trigger__text.is-placeholder {
        color: #94a3b8;
        font-weight: 500;
      }
      .prp-trigger__days {
        flex: none;
        font-size: 0.8125rem;
        font-weight: 500;
        color: #94a3b8;
        white-space: nowrap;
      }
      .prp-error-slot {
        min-height: 1.125rem;
        margin-top: 4px;
      }
      .prp-error {
        margin: 0;
        font-size: 0.75rem;
        color: var(--danger, #e11d48);
        line-height: 1.25;
      }
      .prp-panel {
        margin-top: 8px;
        padding: 14px 14px 12px;
        border-radius: 14px;
        border: 1px solid #e8ecf2;
        background: #fff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      }
      .prp-panel--inline {
        position: static;
        z-index: auto;
        box-shadow: none;
      }
      .prp-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .prp-nav__title {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 0.9375rem;
        font-weight: 700;
        color: #0f172a;
      }
      .prp-nav__btn {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        cursor: pointer;
        color: #64748b;
      }
      .prp-nav__btn svg {
        width: 16px;
        height: 16px;
      }
      .prp-nav__btn:hover:not(:disabled) {
        background: #f1f5f9;
        color: var(--wtorre, #1d54e6);
      }
      .prp-nav__btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .prp-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        margin-bottom: 6px;
      }
      .prp-weekdays span {
        text-align: center;
        font-size: 0.75rem;
        font-weight: 600;
        color: #94a3b8;
        padding: 4px 0;
      }
      .prp-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }
      .prp-day {
        aspect-ratio: 1;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font-size: 0.875rem;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
      }
      .prp-day:hover:not(:disabled):not(.is-start):not(.is-end) {
        background: #eef3fe;
        color: var(--wtorre, #1d54e6);
      }
      .prp-day.is-out {
        color: #cbd5e1;
        font-weight: 500;
      }
      .prp-day.is-today:not(.is-start):not(.is-end) {
        box-shadow: inset 0 0 0 1.5px var(--wtorre, #1d54e6);
      }
      .prp-day.is-range {
        background: #e8eefd;
        border-radius: 0;
        color: var(--wtorre, #1d54e6);
      }
      .prp-day.is-start,
      .prp-day.is-end {
        background: var(--wtorre, #1d54e6);
        color: #fff;
        border-radius: 10px;
      }
      .prp-day.is-start.is-range {
        border-radius: 10px 0 0 10px;
      }
      .prp-day.is-end.is-range {
        border-radius: 0 10px 10px 0;
      }
      .prp-day.is-start.is-end {
        border-radius: 10px;
      }
      .prp-day.is-disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .prp-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #eef1f6;
      }
      .prp-foot__label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: #94a3b8;
      }
      .prp-clear {
        border: 0;
        background: transparent;
        color: var(--wtorre, #1d54e6);
        font-size: 0.8125rem;
        font-weight: 700;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 6px;
      }
      .prp-clear:hover:not(:disabled) {
        background: #eef3fe;
      }
      .prp-clear:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class PeriodoRangePickerComponent implements ControlValueAccessor, Validator {
  /** Quando true, o calendário fica sempre visível. */
  @Input() inline = false;
  @Input() label = 'Período do acesso';
  @Input() placeholder = 'Selecione o intervalo';
  @Input() inputId = 'periodo-range';
  @Input() minDate: string | null = null;
  @Input() maxDate: string | null = null;

  readonly weekdays = WEEKDAYS;
  readonly formatBr = formatBr;

  open = signal(false);
  disabled = false;
  private touched = false;
  private valueSig = signal<PeriodoRangeValue | null>(null);
  draftStart = signal<string | null>(null);
  draftEnd = signal<string | null>(null);
  viewMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  value = this.valueSig.asReadonly();

  panelOpen = computed(() => this.inline || this.open());

  /** Intervalo completo para o campo (valor confirmado ou rascunho completo). */
  displayRange = computed((): PeriodoRangeValue | null => {
    const v = this.valueSig();
    if (v?.inicio && v?.fim) return v;
    const a = this.draftStart();
    const b = this.draftEnd();
    if (a && b) return { inicio: a, fim: b };
    return null;
  });

  daysCount = computed(() => {
    const r = this.displayRange();
    if (!r) return 0;
    return daysBetweenInclusive(r.inicio, r.fim);
  });

  monthTitle = computed(() => {
    const d = this.viewMonth();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  cells = computed(() => this.buildCells());

  private onChange: (v: PeriodoRangeValue | null) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};
  private parentInvalid = false;
  private parentTouched = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  @Input() set controlInvalid(v: boolean) {
    this.parentInvalid = !!v;
  }
  @Input() set controlTouched(v: boolean) {
    this.parentTouched = !!v;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (this.inline || !this.open()) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.open.set(false);
      this.markTouched();
      // Seleção incompleta ao fechar: garante revalidação do form pai.
      if (this.draftStart() && !this.draftEnd()) {
        this.onValidatorChange();
      }
    }
  }

  writeValue(value: PeriodoRangeValue | null): void {
    this.valueSig.set(value && value.inicio && value.fim ? value : null);
    this.draftStart.set(value?.inicio ?? null);
    this.draftEnd.set(value?.fim ?? null);
    if (value?.inicio) {
      const d = parseIso(value.inicio);
      if (d) this.viewMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  registerOnChange(fn: (v: PeriodoRangeValue | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  validate(_control: AbstractControl): ValidationErrors | null {
    const v = this.valueSig();
    if (!v?.inicio || !v?.fim) return { periodoRequired: true };
    return null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  showError(): boolean {
    const incomplete = !!(this.draftStart() && !this.draftEnd());
    const empty = !this.valueSig()?.inicio || !this.valueSig()?.fim;
    const invalid = incomplete || empty || this.parentInvalid;
    if (!invalid) return false;
    // Com seleção incompleta (um clique), mostra erro ao fechar o painel ou ao tentar continuar.
    if (incomplete) {
      return this.parentTouched || (this.touched && !this.panelOpen());
    }
    return this.parentTouched || this.touched;
  }

  onTriggerClick() {
    if (this.disabled) return;
    this.markTouched();
    if (!this.inline) {
      this.open.update((o) => !o);
    }
  }

  shiftMonth(delta: number) {
    const cur = this.viewMonth();
    this.viewMonth.set(new Date(cur.getFullYear(), cur.getMonth() + delta, 1));
  }

  clear(ev: Event) {
    ev.stopPropagation();
    this.draftStart.set(null);
    this.draftEnd.set(null);
    this.valueSig.set(null);
    this.onChange(null);
    this.onValidatorChange();
    this.markTouched();
  }

  pick(cell: DayCell) {
    if (cell.disabled || this.disabled) return;
    const start = this.draftStart();
    const end = this.draftEnd();

    if (!start || (start && end)) {
      this.draftStart.set(cell.iso);
      this.draftEnd.set(null);
      if (this.valueSig()) {
        this.valueSig.set(null);
        this.onChange(null);
        this.onValidatorChange();
      }
      this.markTouched();
      return;
    }

    if (cell.iso < start) {
      this.draftStart.set(cell.iso);
      this.draftEnd.set(null);
      if (this.valueSig()) {
        this.valueSig.set(null);
        this.onChange(null);
        this.onValidatorChange();
      }
      this.markTouched();
      return;
    }

    this.draftEnd.set(cell.iso);
    const next: PeriodoRangeValue = { inicio: start, fim: cell.iso };
    this.valueSig.set(next);
    this.onChange(next);
    this.onValidatorChange();
    this.markTouched();
    if (!this.inline) {
      this.open.set(false);
    }
  }

  private markTouched() {
    this.touched = true;
    this.onTouched();
  }

  private buildCells(): DayCell[] {
    const view = this.viewMonth();
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const gridStart = new Date(year, month, 1 - startPad);
    const todayIso = toIso(new Date());
    const start = this.draftStart();
    const end = this.draftEnd();
    const min = this.minDate;
    const max = this.maxDate;
    const cells: DayCell[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const iso = toIso(d);
      const inMonth = d.getMonth() === month;
      const disabled = !!(min && iso < min) || !!(max && iso > max);
      const isStart = start === iso;
      const isEnd = end === iso;
      const inRange = !!(start && end && iso > start && iso < end);
      cells.push({
        date: d,
        iso,
        day: d.getDate(),
        inMonth,
        disabled,
        isStart,
        isEnd,
        inRange,
        isToday: iso === todayIso,
      });
    }
    return cells;
  }
}
