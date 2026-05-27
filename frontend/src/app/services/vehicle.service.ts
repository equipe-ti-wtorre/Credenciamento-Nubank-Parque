import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface VehicleItem {
  id_vehicle: number;
  id_company: number;
  plate: string;
  description: string | null;
  status: boolean;
  company_fancy_name?: string;
}

export interface VehicleListResponse {
  vehicles: VehicleItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  constructor(private api: ApiService) {}

  list(page = 1, limit = 20, plate?: string): Observable<VehicleListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (plate?.trim()) params = params.set('plate', plate.trim());
    return this.api.get<VehicleListResponse>('/vehicles', params);
  }

  create(data: {
    plate: string;
    description?: string | null;
    id_company?: number;
    status?: boolean;
  }): Observable<{ vehicle: VehicleItem }> {
    return this.api.post<{ vehicle: VehicleItem }>('/vehicles', data);
  }

  update(
    id: number,
    data: Partial<{ plate: string; description: string | null; status: boolean }>,
  ): Observable<{ vehicle: VehicleItem }> {
    return this.api.put<{ vehicle: VehicleItem }>(`/vehicles/${id}`, data);
  }
}
