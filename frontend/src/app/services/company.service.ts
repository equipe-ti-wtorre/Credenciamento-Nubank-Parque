import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface CompanyType {
  id_company_type: number;
  description: string;
}

export interface CompanyContact {
  id_company_contact?: number;
  id_company?: number;
  name: string;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CompanyItem {
  id_company: number;
  id_company_type: number;
  cnpj: string;
  company_name: string;
  fancy_name: string | null;
  status: boolean;
  criado_em: string;
  atualizado_em: string;
  company_type: CompanyType | null;
  contacts?: CompanyContact[];
}

export interface CompanyListFilters {
  cnpj?: string;
  name?: string;
  id_company_type?: number;
}

export interface CompanyListResponse {
  companies: CompanyItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CompanyCreatePayload {
  id_company_type: number;
  cnpj: string;
  company_name: string;
  fancy_name?: string | null;
  status?: boolean;
  contacts?: CompanyContact[];
}

export type CompanyUpdatePayload = Partial<CompanyCreatePayload>;

@Injectable({ providedIn: 'root' })
export class CompanyService {
  constructor(private api: ApiService) {}

  listTypes(): Observable<{ types: CompanyType[] }> {
    return this.api.get<{ types: CompanyType[] }>('/companies/types');
  }

  list(
    page = 1,
    limit = 20,
    filters: CompanyListFilters = {},
  ): Observable<CompanyListResponse> {
    return this.api.get<CompanyListResponse>('/companies', this.buildParams(page, limit, filters));
  }

  get(id: number): Observable<{ company: CompanyItem }> {
    return this.api.get<{ company: CompanyItem }>(`/companies/${id}`);
  }

  create(data: CompanyCreatePayload): Observable<{ company: CompanyItem }> {
    return this.api.post<{ company: CompanyItem }>('/companies', data);
  }

  update(id: number, data: CompanyUpdatePayload): Observable<{ company: CompanyItem }> {
    return this.api.put<{ company: CompanyItem }>(`/companies/${id}`, data);
  }

  patchStatus(id: number, status: boolean): Observable<{ company: CompanyItem }> {
    return this.api.patch<{ company: CompanyItem }>(`/companies/${id}/status`, { status });
  }

  private buildParams(page: number, limit: number, filters: CompanyListFilters): HttpParams {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.cnpj?.trim()) {
      params = params.set('cnpj', filters.cnpj.replace(/\D/g, ''));
    }
    if (filters.name?.trim()) params = params.set('name', filters.name.trim());
    if (filters.id_company_type != null && filters.id_company_type > 0) {
      params = params.set('id_company_type', String(filters.id_company_type));
    }
    return params;
  }
}

export function formatCnpj(value: string): string {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function normalizeCnpjInput(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}
