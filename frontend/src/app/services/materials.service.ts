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

export interface InvoiceParseResult {
  invoice_number: string | null;
  items: InvoiceParseItem[];
  warnings: string[];
  ocr_preview?: string;
}

export interface MovementPayload {
  id_company: number;
  invoice_number: string;
  id_collaborator: number;
  /** Relação completa: 1º motorista, demais ajudantes. */
  id_collaborators?: number[];
  id_vehicle: number;
  items: MovementItemPayload[];
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
  id_company: number;
  company_fancy_name: string;
  invoice_number: string;
  id_collaborator: number;
  collaborator_name: string;
  collaborators?: MaterialMovementCollaborator[];
  id_vehicle: number;
  vehicle_plate: string;
  photo: string | null;
  photos?: MaterialMovementPhoto[];
  criado_em: string;
  items: MovementItemDetail[];
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
    return this.api.getBlob(`/storage/merchandise/${encodeURIComponent(filename)}`);
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
}
