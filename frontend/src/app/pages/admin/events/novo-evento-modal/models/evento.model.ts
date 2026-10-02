export type TipoDiaNome = string;

/** Map ISO date → lista de id_type (vários tipos no mesmo dia). */
export type DiasMap = Map<string, number[]>;

export interface DiaEventoMarked {
  data: string; // YYYY-MM-DD
  tipo: TipoDiaNome;
  id_type: number;
}

export interface EventoWizardState {
  nome: string;
  setorAprovadorId: number | null;
  empresaResponsavelId: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  dias: DiasMap;
}

export function cloneDias(dias: DiasMap): DiasMap {
  const next = new Map<string, number[]>();
  for (const [iso, ids] of dias) next.set(iso, [...ids]);
  return next;
}

export function toggleDayType(dias: DiasMap, iso: string, typeId: number): DiasMap {
  const next = cloneDias(dias);
  const current = next.get(iso) || [];
  const idx = current.indexOf(typeId);
  if (idx >= 0) {
    current.splice(idx, 1);
    if (current.length === 0) next.delete(iso);
    else next.set(iso, current);
  } else {
    current.push(typeId);
    next.set(iso, current);
  }
  return next;
}

export function addDayTypeToRange(dias: DiasMap, isos: string[], typeId: number): DiasMap {
  const next = cloneDias(dias);
  for (const iso of isos) {
    const current = next.get(iso) || [];
    if (!current.includes(typeId)) {
      current.push(typeId);
      next.set(iso, current);
    }
  }
  return next;
}

export function removeDayType(dias: DiasMap, iso: string, typeId: number): DiasMap {
  const next = cloneDias(dias);
  const current = next.get(iso) || [];
  const filtered = current.filter((id) => id !== typeId);
  if (filtered.length === 0) next.delete(iso);
  else next.set(iso, filtered);
  return next;
}

export function flattenDiasToPayload(dias: DiasMap): { date: string; id_type: number }[] {
  const out: { date: string; id_type: number }[] = [];
  for (const [date, ids] of dias) {
    for (const id_type of ids) {
      out.push({ date, id_type });
    }
  }
  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id_type - b.id_type,
  );
}

export function pluralTipo(nome: string, n: number): string {
  const lower = nome.toLowerCase();
  if (n === 1) return lower;
  if (lower.endsWith('m')) return `${lower.slice(0, -1)}ns`;
  if (lower.endsWith('ão')) return `${lower.slice(0, -2)}ões`;
  if (lower.endsWith('el')) return `${lower.slice(0, -2)}éis`;
  return `${lower}s`;
}

/** Classe CSS segura para tipo (sem acentos/espaços). */
export function tipoCssKey(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}
