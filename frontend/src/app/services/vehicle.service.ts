import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface VehicleItem {
  id_vehicle: number;
  id_company: number;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  type: string | null;
  description: string | null;
  status: boolean;
  is_blacklisted: boolean;
  can_delete?: boolean;
  blacklist_reason?: string | null;
  company_fancy_name?: string;
}

export interface VehicleListFilters {
  q?: string;
  plate?: string;
  brand?: string;
  type?: string;
  id_company?: number;
  status?: boolean;
}

export interface VehicleListResponse {
  vehicles: VehicleItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  constructor(private api: ApiService) {}

  list(page = 1, limit = 20, filters: VehicleListFilters = {}): Observable<VehicleListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    if (filters.plate?.trim()) params = params.set('plate', filters.plate.trim());
    if (filters.brand?.trim()) params = params.set('brand', filters.brand.trim());
    if (filters.type?.trim()) params = params.set('type', filters.type.trim());
    if (filters.id_company != null) params = params.set('id_company', String(filters.id_company));
    if (filters.status !== undefined) params = params.set('status', String(filters.status));
    return this.api.get<VehicleListResponse>('/vehicles', params);
  }

  create(data: {
    plate: string;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    type?: string | null;
    description?: string | null;
    id_company?: number;
    status?: boolean;
  }): Observable<{ vehicle: VehicleItem }> {
    return this.api.post<{ vehicle: VehicleItem }>('/vehicles', data);
  }

  update(
    id: number,
    data: Partial<{
      plate: string;
      brand: string | null;
      model: string | null;
      color: string | null;
      type: string | null;
      description: string | null;
      status: boolean;
    }>,
  ): Observable<{ vehicle: VehicleItem }> {
    return this.api.put<{ vehicle: VehicleItem }>(`/vehicles/${id}`, data);
  }

  addBlacklist(id: number, reason: string): Observable<{ vehicle: VehicleItem }> {
    return this.api.post<{ vehicle: VehicleItem }>(`/vehicles/${id}/blacklist`, { reason });
  }

  removeBlacklist(id: number): Observable<{ vehicle: VehicleItem }> {
    return this.api.delete<{ vehicle: VehicleItem }>(`/vehicles/${id}/blacklist`);
  }

  delete(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/vehicles/${id}`);
  }

  downloadBulkTemplate(): Observable<Blob> {
    return this.api.getBlob('/vehicles/bulk/template');
  }

  bulkPreview(file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<import('../shared/bulk-import/bulk-import.types').BulkPreviewResult>(
      '/vehicles/bulk/preview',
      form,
    );
  }

  bulkCommit(
    previewId: string,
    decisions: import('../shared/bulk-import/bulk-import.types').BulkDecision[],
  ) {
    return this.api.post<import('../shared/bulk-import/bulk-import.types').BulkCommitResult>(
      '/vehicles/bulk/commit',
      { previewId, decisions },
    );
  }
}
