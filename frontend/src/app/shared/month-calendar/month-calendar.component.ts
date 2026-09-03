import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type MonthCalendarTickKind = 'ev' | 'win';

export interface MonthCalendarTick {
  iso: string;
  kind: MonthCalendarTickKind;
}

export type MonthCalendarMode = 'range' | 'single' | 'multi';

type DayCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  inRange: boolean;
  isStart: boolean;
  isEnd: boolean;
  isSolo: boolean;
  tick: MonthCalendarTickKind | null;
};

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

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatIsoBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

@Component({
  selector: 'app-month-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './month-calendar.component.html',
  styleUrl: './month-calendar.component.scss',
})
export class MonthCalendarComponent {
  readonly weekdays = WEEKDAYS;

  readonly mode = input<MonthCalendarMode>('single');
  readonly rangeStart = input<string | null>(null);
  readonly rangeEnd = input<string | null>(null);
  readonly selected = input<string | null>(null);
  readonly selectedDates = input<string[]>([]);
  readonly ticks = input<MonthCalendarTick[]>([]);
  readonly footerText = input('');

  readonly daySelect = output<string>();
  readonly cleared = output<void>();

  private readonly view = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  readonly monthTitle = computed(() => {
    const d = this.view();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly cells = computed(() => this.buildCells());

  readonly hasSelection = computed(() => {
    if (this.mode() === 'range') return !!this.rangeStart();
    if (this.mode() === 'multi') return this.selectedDates().length > 0;
    return !!this.selected();
  });

  shiftMonth(delta: number): void {
    const d = this.view();
    this.view.set(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  onDay(cell: DayCell): void {
    if (!cell.inMonth) {
      const d = parseIsoDate(cell.iso);
      if (d) this.view.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.daySelect.emit(cell.iso);
  }

  onClear(): void {
    this.cleared.emit();
  }

  private buildCells(): DayCell[] {
    const view = this.view();
    const y = view.getFullYear();
    const m = view.getMonth();
    const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
    const today = toIsoDate(new Date());
    const multi = this.mode() === 'multi';
    const selectedSet = new Set(this.selectedDates());
    const a = this.mode() === 'range' ? this.rangeStart() : this.selected();
    const b = this.mode() === 'range' ? this.rangeEnd() : this.selected();
    const fim = b || a;
    const tickMap = new Map(this.ticks().map((t) => [t.iso, t.kind]));
    const cells: DayCell[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toIsoDate(d);
      const inMonth = d.getMonth() === m;
      if (multi) {
        cells.push({
          iso,
          day: d.getDate(),
          inMonth,
          isToday: iso === today,
          inRange: false,
          isStart: false,
          isEnd: false,
          isSolo: selectedSet.has(iso),
          tick: tickMap.get(iso) || null,
        });
        continue;
      }
      const isStart = !!(a && iso === a);
      const isEnd = !!(b && iso === b);
      const sameDay = !!(a && b && a === b);
      const inRange = !!(a && fim && a !== fim && iso > a && iso < fim);
      cells.push({
        iso,
        day: d.getDate(),
        inMonth,
        isToday: iso === today,
        inRange,
        isStart: isStart && !sameDay && !!b,
        isEnd: isEnd && !sameDay,
        isSolo: (isStart && !b) || (isStart && sameDay),
        tick: tickMap.get(iso) || null,
      });
    }
    return cells;
  }
}
