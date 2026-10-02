import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface AuditUser {
  id: number;
  name: string | null;
  email: string | null;
}

export interface AuditResource {
  type?: string;
  id?: number | string;
  [key: string]: unknown;
}

export interface AuditHttpContext {
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
}

export interface AuditMetadata {
  event?: string;
  outcome?: string;
  resource?: AuditResource | null;
  changes?: unknown;
  http?: AuditHttpContext;
  [key: string]: unknown;
}

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  action: string;
  module: string;
  ip: string | null;
  client_type: string | null;
  request_id: string | null;
  metadata: AuditMetadata | null;
  created_at: string;
  user: AuditUser | null;
}

export interface AuditFilters {
  module?: string;
  action?: string;
  user_id?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface AuditListResponse {
  items: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditFilterOptions {
  modules: string[];
  actions: string[];
  users: AuditUser[];
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  constructor(private api: ApiService) {}

  list(
    page = 1,
    limit = 20,
    filters: AuditFilters = {},
  ): Observable<AuditListResponse> {
    return this.api.get<AuditListResponse>('/audit', this.buildParams(page, limit, filters));
  }

  filters(): Observable<AuditFilterOptions> {
    return this.api.get<AuditFilterOptions>('/audit/filters');
  }

  export(filters: AuditFilters = {}): Observable<Blob> {
    return this.api.getBlob('/audit/export', this.buildFilterParams(filters));
  }

  private buildParams(page: number, limit: number, filters: AuditFilters): HttpParams {
    return this.appendFilters(
      new HttpParams().set('page', String(page)).set('limit', String(limit)),
      filters,
    );
  }

  private buildFilterParams(filters: AuditFilters): HttpParams {
    return this.appendFilters(new HttpParams(), filters);
  }

  private appendFilters(params: HttpParams, filters: AuditFilters): HttpParams {
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params = params.set(key, String(value).trim());
      }
    });
    return params;
  }
}
