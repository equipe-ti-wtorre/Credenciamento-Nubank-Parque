/** Sugestões de cor/tipo alinhadas ao template Excel unificado. */
export const VEHICLE_SUGGESTED_COLORS = [
  'Prata',
  'Preto',
  'Branco',
  'Cinza',
  'Vermelho',
  'Azul',
  'Verde',
  'Amarelo',
  'Bege',
  'Marrom',
] as const;

export const VEHICLE_SUGGESTED_TYPES = [
  'Sedan',
  'Hatch',
  'SUV',
  'Pickup',
  'Van',
  'Utilitário',
  'Motocicleta',
  'Caminhão',
] as const;

/** Modelos mais comuns por marca (Brasil). */
export const VEHICLE_MODELS_BY_BRAND: Record<string, string[]> = {
  Volkswagen: ['Gol', 'Voyage', 'Polo', 'Virtus', 'T-Cross', 'Nivus', 'Taos', 'Saveiro', 'Amarok', 'Delivery'],
  Chevrolet: ['Onix', 'Onix Plus', 'Tracker', 'S10', 'Spin', 'Montana', 'Equinox', 'Cruze'],
  Fiat: ['Argo', 'Mobi', 'Cronos', 'Pulse', 'Fastback', 'Toro', 'Strada', 'Fiorino', 'Ducato'],
  Toyota: ['Corolla', 'Corolla Cross', 'Yaris', 'Hilux', 'SW4', 'RAV4', 'Etios'],
  Hyundai: ['HB20', 'HB20S', 'Creta', 'Tucson', 'Santa Fe', 'HR'],
  Honda: ['Civic', 'City', 'HR-V', 'WR-V', 'CR-V', 'Fit', 'CG 160', 'Biz'],
  Renault: ['Kwid', 'Stepway', 'Logan', 'Duster', 'Oroch', 'Master', 'Kangoo'],
  Ford: ['Ka', 'EcoSport', 'Ranger', 'Territory', 'Transit', 'Maverick'],
  Nissan: ['Kicks', 'Versa', 'Frontier', 'Sentra', 'Leaf'],
  Jeep: ['Renegade', 'Compass', 'Commander', 'Wrangler'],
  'Mercedes-Benz': ['Sprinter', 'Citan', 'A-Class', 'C-Class', 'GLA'],
  BMW: ['Serie 3', 'X1', 'X3', 'X5', 'Serie 1'],
  Peugeot: ['208', '2008', '3008', 'Partner', 'Boxer'],
  Citroën: ['C3', 'C4 Cactus', 'Aircross', 'Jumpy', 'Jumper'],
  Mitsubishi: ['L200', 'Outlander', 'Pajero', 'Eclipse Cross', 'ASX'],
  Kia: ['Sportage', 'Seltos', 'Cerato', 'Stonic', 'Bongo'],
  Volvo: ['XC40', 'XC60', 'XC90', 'S60'],
  Audi: ['A3', 'A4', 'Q3', 'Q5', 'Q7'],
  Yamaha: ['Factor 150', 'Fazer 250', 'MT-03', 'NMax'],
  CAOA: ['Chery Tiggo 5X', 'Chery Tiggo 7', 'Chery Arrizo 6'],
};

export const VEHICLE_SUGGESTED_BRANDS = Object.keys(VEHICLE_MODELS_BY_BRAND).sort((a, b) =>
  a.localeCompare(b, 'pt-BR'),
);

function foldBrand(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Modelos sugeridos para a marca informada; lista vazia se marca desconhecida (texto livre). */
export function modelsForBrand(brand: string | null | undefined): string[] {
  const wanted = foldBrand(brand || '');
  if (!wanted) return [];
  const entry = Object.entries(VEHICLE_MODELS_BY_BRAND).find(([name]) => foldBrand(name) === wanted);
  return entry ? [...entry[1]] : [];
}
