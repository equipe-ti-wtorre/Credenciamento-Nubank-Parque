import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  action: string;
  module: string;
  ip: string | null;
  client_type: string | null;
  request_id: string | null;
  metadata: unknown;
  created_at: string;
}

export interface ErrorLogItem {
  id: number;
  level: string;
  module: string;
  message: string;
  status_code: number | null;
  user_id: number | null;
  ip: string | null;
  client_type: string | null;
  request_id: string | null;
  path: string | null;
  method: string | null;
  stack: string | null;
  metadata: unknown;
  created_at: string;
}

export interface AuditFilters {
  module?: string;
  action?: string;
  user_id?: string;
  from?: string;
  to?: string;
}

export interface ErrorFilters {
  module?: string;
  level?: string;
  status_code?: string;
  from?: string;
  to?: string;
}

export interface SystemReportsListResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class SystemReportsService {
  constructor(private api: ApiService) {}

  listAudit(
    page = 1,
    limit = 20,
    filters: AuditFilters = {},
  ): Observable<SystemReportsListResponse<AuditLogItem>> {
    return this.api.get<SystemReportsListResponse<AuditLogItem>>(
      '/system-reports/audit',
      this.buildParams(page, limit, filters),
    );
  }

  listErrors(
    page = 1,
    limit = 20,
    filters: ErrorFilters = {},
  ): Observable<SystemReportsListResponse<ErrorLogItem>> {
    return this.api.get<SystemReportsListResponse<ErrorLogItem>>(
      '/system-reports/errors',
      this.buildParams(page, limit, filters),
    );
  }

  exportAudit(filters: AuditFilters = {}): Observable<Blob> {
    return this.api.getBlob('/system-reports/audit/export', this.buildFilterParams(filters));
  }

  exportErrors(filters: ErrorFilters = {}): Observable<Blob> {
    return this.api.getBlob('/system-reports/errors/export', this.buildFilterParams(filters));
  }

  private buildParams(
    page: number,
    limit: number,
    filters: AuditFilters | ErrorFilters,
  ): HttpParams {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.appendFilters(params, filters);
  }

  private buildFilterParams(filters: AuditFilters | ErrorFilters): HttpParams {
    return this.appendFilters(new HttpParams(), filters);
  }

  private appendFilters(
    params: HttpParams,
    filters: AuditFilters | ErrorFilters,
  ): HttpParams {
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params = params.set(key, String(value).trim());
      }
    });
    return params;
  }
}
