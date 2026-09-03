export const BRACELET_ICON_KEYS = [
  'chevrons',
  'star',
  'wrench',
  'music',
  'users',
  'door',
  'utensils',
  'mic',
  'walk',
  'briefcase',
  'binoculars',
  'shield',
] as const;

export type BraceletIconKey = (typeof BRACELET_ICON_KEYS)[number];

export const BRACELET_COLORS = [
  '#8D0DE3',
  '#6B21A8',
  '#4C1D95',
  '#1E3A8A',
  '#2563EB',
  '#0E7490',
  '#0F766E',
  '#15803D',
  '#166534',
  '#CA8A04',
  '#C2410C',
  '#B45309',
  '#BE185D',
  '#9F1239',
  '#7C2D12',
  '#6B4C9A',
  '#1E293B',
] as const;

export type BraceletColor = (typeof BRACELET_COLORS)[number];

export const DEFAULT_BRACELET_ICON: BraceletIconKey = 'chevrons';
export const DEFAULT_BRACELET_COLOR: BraceletColor = '#6B4C9A';

const ICON_SET = new Set<string>(BRACELET_ICON_KEYS);

export function normalizeBraceletIcon(value?: string | null): BraceletIconKey {
  return value && ICON_SET.has(value) ? (value as BraceletIconKey) : DEFAULT_BRACELET_ICON;
}

export function normalizeBraceletColor(value?: string | null): string {
  if (value && /^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase();
  return DEFAULT_BRACELET_COLOR;
}

export function braceletKindLabel(kind?: string | null): string {
  if (kind === 'JOGO') return 'JOGO';
  if (kind === 'SHOWDAY') return 'SHOWDAY';
  if (kind === 'BOTH') return 'SHOWDAY E JOGO';
  return '';
}

export function braceletSerial(name?: string | null): string {
  const src = (name || 'PULSEIRA').toUpperCase();
  let n = 689064;
  for (let i = 0; i < src.length; i++) n = (n * 33 + src.charCodeAt(i)) % 900000;
  return String(100000 + n).slice(0, 6);
}
