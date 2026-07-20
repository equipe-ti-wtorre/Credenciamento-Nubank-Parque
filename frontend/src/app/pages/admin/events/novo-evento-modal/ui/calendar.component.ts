import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DOW_SHORT,
  addMonths,
  buildMonthGrid,
  compareIso,
  monthTitle,
  startOfMonth,
  todayIso,
} from './calendar.util';

export type CalendarMode = 'range' | 'tag';

@Component({
  selector: 'app-evento-calendar',
  standalone: true,
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class EventoCalendarComponent {
  readonly mode = input.required<CalendarMode>();
  readonly rangeStart = input<string | null>(null);
  readonly rangeEnd = input<string | null>(null);
  readonly picking = input<'start' | 'end'>('start');
  readonly minDate = input<string | null>(null);
  readonly maxDate = input<string | null>(null);
  readonly tagged = input<ReadonlyMap<string, string>>(new Map());
  readonly initialMonth = input<string | null>(null);
  /** bump to force re-anchor month view */
  readonly viewKey = input(0);

  readonly dayClick = output<string>();

  private readonly viewMonth = signal(startOfMonth(new Date()));

  readonly dows = DOW_SHORT;
  readonly title = computed(() => monthTitle(this.viewMonth()));
  readonly cells = computed(() => buildMonthGrid(this.viewMonth()));
  readonly hint = computed(() =>
    this.picking() === 'start' ? 'Clique na data de início' : 'Clique na data de término',
  );

  constructor() {
    effect(() => {
      const key = this.viewKey();
      const anchor = this.initialMonth() || todayIso();
      // key força reancoragem quando o pai entra no passo 2
      void key;
      this.viewMonth.set(startOfMonth(anchor));
    });
  }

  prevMonth(): void {
    this.viewMonth.set(addMonths(this.viewMonth(), -1));
  }

  nextMonth(): void {
    this.viewMonth.set(addMonths(this.viewMonth(), 1));
  }

  onDayClick(iso: string, disabled: boolean): void {
    if (disabled) return;
    this.dayClick.emit(iso);
  }

  isDisabled(iso: string): boolean {
    if (this.mode() !== 'tag') return false;
    const min = this.minDate();
    const max = this.maxDate();
    if (!min || !max) return true;
    return compareIso(iso, min) < 0 || compareIso(iso, max) > 0;
  }

  isInRange(iso: string): boolean {
    const s = this.rangeStart();
    const e = this.rangeEnd();
    if (!s || !e) return false;
    return compareIso(iso, s) >= 0 && compareIso(iso, e) <= 0;
  }

  isRangeStart(iso: string): boolean {
    return !!this.rangeStart() && this.rangeStart() === iso;
  }

  isRangeEnd(iso: string): boolean {
    return !!this.rangeEnd() && this.rangeEnd() === iso;
  }

  tagClass(iso: string): string | null {
    const nome = this.tagged().get(iso);
    if (!nome) return null;
    return `t-${nome}`;
  }

  ariaLabel(iso: string): string {
    const tag = this.tagged().get(iso);
    return tag ? `${iso} — ${tag}` : iso;
  }
}
