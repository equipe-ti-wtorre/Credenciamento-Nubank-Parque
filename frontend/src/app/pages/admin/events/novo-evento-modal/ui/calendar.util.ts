/** Helpers de data date-only (sem timezone/UTC shift). */

export const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export const DOW_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export const DOW_LONG = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Monta ISO YYYY-MM-DD a partir de Date local (nunca toISOString). */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function formatDateBrIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function sameIsoDay(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b;
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function startOfMonth(isoOrDate: string | Date): Date {
  const d = typeof isoOrDate === 'string' ? parseIsoDate(isoOrDate)! : new Date(isoOrDate);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(view: Date, delta: number): Date {
  return new Date(view.getFullYear(), view.getMonth() + delta, 1);
}

export function monthTitle(view: Date): string {
  return `${MESES[view.getMonth()]} ${view.getFullYear()}`;
}

export function diffDaysInclusive(startIso: string, endIso: string): number {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function eachIsoInRange(startIso: string, endIso: string): string[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/** Grade do mês (dom–sáb), incluindo dias do mês anterior/seguinte. */
export function buildMonthGrid(view: Date): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const prevDim = new Date(year, month, 0).getDate();
  const today = todayIso();

  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDim - i);
    const iso = toIsoDate(d);
    cells.push({ iso, day: d.getDate(), inMonth: false, isToday: iso === today });
  }
  for (let day = 1; day <= dim; day++) {
    const d = new Date(year, month, day);
    const iso = toIsoDate(d);
    cells.push({ iso, day, inMonth: true, isToday: iso === today });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const d = new Date(year, month + 1, i);
    const iso = toIsoDate(d);
    cells.push({ iso, day: i, inMonth: false, isToday: iso === today });
  }
  return cells;
}
