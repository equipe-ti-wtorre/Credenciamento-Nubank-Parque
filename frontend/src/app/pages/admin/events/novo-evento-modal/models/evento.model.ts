export type TipoDiaNome = string;

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
  /** Map ISO date → id_type */
  dias: Map<string, number>;
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
