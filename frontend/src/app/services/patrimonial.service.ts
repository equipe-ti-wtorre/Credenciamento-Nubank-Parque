import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { VehicleItem } from './vehicle.service';

export interface ServiceAccessItem {
  id_service_access: number;
  id_company: number;
  id_access_status: number;
  access_status_description: string;
  service_type: string;
  description: string | null;
  company_fancy_name?: string;
  vehicles: {
    id_service_access_vehicle: number;
    id_vehicle: number;
    plate: string;
    access_id: string | null;
    check_in: string | null;
    check_out: string | null;
  }[];
  dates: string[];
}

@Injectable({ providedIn: 'root' })
export class PatrimonialService {
  constructor(private api: ApiService) {}

  list(page = 1, limit = 20): Observable<{
    services: ServiceAccessItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.api.get('/patrimonial/services', params);
  }

  create(data: {
    service_type: string;
    description?: string | null;
    dates: string[];
    id_vehicles: number[];
    id_company?: number;
  }): Observable<{ service: ServiceAccessItem }> {
    return this.api.post<{ service: ServiceAccessItem }>('/patrimonial/services', data);
  }

  patchStatus(
    id: number,
    body: { id_access_status: number; reason?: string },
  ): Observable<{ service: ServiceAccessItem }> {
    return this.api.patch<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/status`,
      body,
    );
  }
}

export type { VehicleItem };
