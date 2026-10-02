import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type StorageLocationType = 'DEPOSITO' | 'LOJA';

export interface StorageLocationItem {
  id_storage_location: number;
  name: string;
  type: StorageLocationType;
  status: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface ProductItem {
  id_product: number;
  description: string;
  unit_measure: string;
  manufacturer: string | null;
  status: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export type MovementType = 'ENTRADA' | 'SAIDA';
export type MovementNature = 'ESTOQUE' | 'ENTREGA';
export type OriginType = 'CREDENCIADA' | 'EVENTUAL';

export interface MaterialCompanyOption {
  id_company: number;
  name: string;
}

export interface MaterialVehicleOption {
  id_vehicle: number;
  plate: string;
  description: string | null;
}

export interface MovementItemPayload {
  id_product: number;
  id_storage_location: number;
  quantity: number;
}

export interface InvoiceProductSuggestion {
  id_product: number;
  description: string;
  unit_measure?: string;
  confidence: number;
}

export interface InvoiceParseItem {
  raw_description: string;
  quantity: number;
  id_product: number | null;
  matched_description: string | null;
  confidence: number;
  suggestions?: InvoiceProductSuggestion[];
}

export interface InvoiceParseEmitente {
  cnpj: string | null;
  legal_name: string | null;
  uf: string | null;
  municipio: string | null;
  source: string | null;
  confidence: number;
  known: boolean;
  id_external_company: number | null;
  id_company: number | null;
  total_movimentos_anteriores: number;
}

export interface InvoiceParseResult {
  invoice_number: string | null;
  nfe_key?: string | null;
  emitente?: InvoiceParseEmitente | null;
  items: InvoiceParseItem[];
  warnings: string[];
  ocr_preview?: string;
}

export interface ExternalCompany {
  id_external_company: number;
  cnpj: string | null;
  cpf: string | null;
  legal_name: string;
  trade_name: string | null;
  ie?: string | null;
  uf: string | null;
  municipio: string | null;
  cep?: string | null;
  endereco?: string | null;
  origem: 'OCR' | 'MANUAL' | 'CHAVE_ACESSO' | 'IMPORT';
  revisado: boolean;
  id_company: number | null;
  primeira_entrada?: string | null;
  ultima_entrada?: string | null;
  total_movimentos: number;
}

export interface MovementPayload {
  request_id?: string;
  movement_nature?: MovementNature;
  origin_type?: OriginType;
  id_company?: number;
  invoice_number?: string | null;
  no_invoice_reason?: 'DECLARACAO_CONTEUDO' | 'ENCOMENDA_PESSOAL' | 'REMESSA_SEM_NOTA' | 'OUTRO' | null;
  id_collaborator?: number;
  /** Relação completa: 1º motorista, demais ajudantes. */
  id_collaborators?: number[];
  id_vehicle?: number;
  sender_name?: string;
  sender_document?: string | null;
  carrier_name?: string | null;
  driver_name?: string;
  driver_document?: string;
  vehicle_plate?: string;
  volumes?: number | null;
  content_description?: string | null;
  id_recipient_collaborator?: number | null;
  recipient_area?: string | null;
  items?: MovementItemPayload[];
}

export interface StockRow {
  id_product: number;
  product_description: string;
  unit_measure: string;
  id_storage_location: number;
  location_name: string;
  location_type: StorageLocationType;
  balance: number;
}

export interface MovementItemDetail extends MovementItemPayload {
  id_material_movement_item: number;
  product_description: string;
  unit_measure: string;
  location_name: string;
  location_type: StorageLocationType;
}

export interface MaterialMovementCollaborator {
  id_collaborator: number;
  role: 'MOTORISTA' | 'AJUDANTE';
  name: string;
  document: string | null;
}

export interface MaterialMovementPhoto {
  id_material_movement_photo: number | null;
  filename: string;
  original_name: string | null;
  sort_order: number;
  criado_em?: string;
}

export interface MaterialMovement {
  id_material_movement: number;
  movement_type: MovementType;
  movement_nature?: MovementNature;
  origin_type?: OriginType;
  origem_nome?: string | null;
  id_company: number | null;
  company_fancy_name: string | null;
  invoice_number: string | null;
  no_invoice_reason?: string | null;
  id_collaborator: number | null;
  collaborator_name: string | null;
  collaborators?: MaterialMovementCollaborator[];
  id_vehicle: number | null;
  vehicle_plate: string | null;
  sender_name?: string | null;
  driver_name?: string | null;
  volumes?: number | null;
  content_description?: string | null;
  photo: string | null;
  photos?: MaterialMovementPhoto[];
  criado_em: string;
  items: MovementItemDetail[];
}

export interface LookupPlateResult {
  found: boolean;
  origin_type?: OriginType;
  vehicle?: MaterialVehicleOption & { id_company?: number; company_name?: string };
  suggestion?: {
    sender_name?: string | null;
    sender_document?: string | null;
    carrier_name?: string | null;
    driver_name?: string | null;
    driver_document?: string | null;
    vehicle_plate?: string | null;
    movement_nature?: MovementNature;
    criado_em?: string;
  };
}

export interface DashboardSeriesPoint {
  day: string;
  entrada_count: number;
  saida_count: number;
}

export interface MaterialsDashboard {
  days: number;
  series: DashboardSeriesPoint[];
  totals: { entrada: number; saida: number };
}

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  constructor(private api: ApiService) {}

  listLocations(): Observable<{ locations: StorageLocationItem[] }> {
    return this.api.get<{ locations: StorageLocationItem[] }>('/materials/locations');
  }

  createLocation(data: {
    name: string;
    type: StorageLocationType;
  }): Observable<{ location: StorageLocationItem }> {
    return this.api.post<{ location: StorageLocationItem }>('/materials/locations', data);
  }

  updateLocation(
    id: number,
    data: Partial<{ name: string; type: StorageLocationType; status: boolean }>,
  ): Observable<{ location: StorageLocationItem }> {
    return this.api.put<{ location: StorageLocationItem }>(`/materials/locations/${id}`, data);
  }

  inactivateLocation(id: number): Observable<{ location: StorageLocationItem }> {
    return this.updateLocation(id, { status: false });
  }

  activateLocation(id: number): Observable<{ location: StorageLocationItem }> {
    return this.updateLocation(id, { status: true });
  }

  listProducts(): Observable<{ products: ProductItem[] }> {
    return this.api.get<{ products: ProductItem[] }>('/materials/products');
  }

  createProduct(data: {
    description: string;
    unit_measure: string;
    manufacturer?: string | null;
  }): Observable<{ product: ProductItem }> {
    return this.api.post<{ product: ProductItem }>('/materials/products', data);
  }

  updateProduct(
    id: number,
    data: Partial<{ description: string; unit_measure: string; manufacturer: string | null; status: boolean }>,
  ): Observable<{ product: ProductItem }> {
    return this.api.put<{ product: ProductItem }>(`/materials/products/${id}`, data);
  }

  inactivateProduct(id: number): Observable<{ product: ProductItem }> {
    return this.updateProduct(id, { status: false });
  }

  activateProduct(id: number): Observable<{ product: ProductItem }> {
    return this.updateProduct(id, { status: true });
  }

  listCompaniesSelect(): Observable<{ companies: MaterialCompanyOption[] }> {
    return this.api.get<{ companies: MaterialCompanyOption[] }>('/materials/companies/select');
  }

  listVehiclesSelect(idCompany: number): Observable<{ vehicles: MaterialVehicleOption[] }> {
    const params = new HttpParams().set('id_company', String(idCompany));
    return this.api.get<{ vehicles: MaterialVehicleOption[] }>('/materials/vehicles/select', params);
  }

  listLocationsSelect(): Observable<{ locations: StorageLocationItem[] }> {
    return this.api.get<{ locations: StorageLocationItem[] }>('/materials/locations/select');
  }

  listProductsSelect(): Observable<{ products: ProductItem[] }> {
    return this.api.get<{ products: ProductItem[] }>('/materials/products/select');
  }

  registerIn(formData: FormData): Observable<{ movement: unknown }> {
    return this.api.postFormData<{ movement: unknown }>('/materials/movements/in', formData);
  }

  registerOut(formData: FormData): Observable<{ movement: unknown }> {
    return this.api.postFormData<{ movement: unknown }>('/materials/movements/out', formData);
  }

  parseInvoice(formData: FormData): Observable<InvoiceParseResult> {
    return this.api.postFormData<InvoiceParseResult>('/materials/movements/parse-invoice', formData);
  }

  getMerchandisePhoto(filename: string): Observable<Blob> {
    const name = String(filename || "").split(/[/\\]/).pop() || "";
    const params = new HttpParams().set("filename", name);
    return this.api.getBlob("/storage/merchandise", params);
  }

  getStock(): Observable<{ stock: StockRow[] }> {
    return this.api.get<{ stock: StockRow[] }>('/materials/stock');
  }

  getHistory(
    page = 1,
    limit = 50,
    filters: {
      from?: string;
      to?: string;
      movement_type?: MovementType;
      id_company?: number;
    } = {},
  ): Observable<{ movements: MaterialMovement[]; page: number; limit: number; total: number }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.movement_type) params = params.set('movement_type', filters.movement_type);
    if (filters.id_company) params = params.set('id_company', String(filters.id_company));
    return this.api.get<{ movements: MaterialMovement[]; page: number; limit: number; total: number }>(
      '/materials/history',
      params,
    );
  }

  getDashboard(days = 7): Observable<MaterialsDashboard> {
    const params = new HttpParams().set('days', String(days));
    return this.api.get<MaterialsDashboard>('/materials/dashboard', params);
  }

  lookupPlate(plate: string): Observable<LookupPlateResult> {
    const params = new HttpParams().set('plate', plate || '');
    return this.api.get<LookupPlateResult>('/materials/movements/lookup-plate', params);
  }

  suggestExternalCompanies(q: string): Observable<{ companies: ExternalCompany[] }> {
    const params = new HttpParams().set('q', q || '');
    return this.api.get<{ companies: ExternalCompany[] }>('/materials/external-companies/suggest', params);
  }

  listExternalCompanies(filters: { revisado?: number; q?: string } = {}): Observable<{ companies: ExternalCompany[] }> {
    let params = new HttpParams();
    if (filters.revisado === 0 || filters.revisado === 1) {
      params = params.set('revisado', String(filters.revisado));
    }
    if (filters.q) params = params.set('q', filters.q);
    return this.api.get<{ companies: ExternalCompany[] }>('/materials/external-companies', params);
  }

  patchExternalCompany(id: number, data: Partial<ExternalCompany> & { revisado?: boolean }): Observable<{ company: ExternalCompany }> {
    return this.api.patch<{ company: ExternalCompany }>(`/materials/external-companies/${id}`, data);
  }

  mergeExternalCompanies(idSource: number, idTarget: number): Observable<{ company: ExternalCompany }> {
    return this.api.post<{ company: ExternalCompany }>(`/materials/external-companies/${idSource}/merge`, {
      id_target: idTarget,
    });
  }
}
