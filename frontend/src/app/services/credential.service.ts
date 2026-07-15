import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export const STATUS_AGUARDANDO_PRODUTORA = 1;
export const STATUS_AGUARDANDO_APROVACAO = 2;
export const STATUS_APROVADO = 3;
export const STATUS_NEGADO = 4;

export interface CredentialCollaboratorBrief {
  id_collaborator: number;
  name: string;
  document: string;
}

export interface CredentialEventDayCompanyBrief {
  id_event_day_company: number;
  id_company: number;
  id_producer: number | null;
  company_name: string;
  company_fancy_name?: string | null;
}

export interface CredentialItem {
  id_event_day_company_collaborator: number;
  id_event_day_company: number;
  id_collaborator: number;
  id_access_status: number;
  access_status_description: string;
  id_collaborator_role: number;
  role_description: string;
  access_id: string | null;
  criado_em: string;
  atualizado_em: string;
  collaborator: CredentialCollaboratorBrief;
  event_day_company: CredentialEventDayCompanyBrief;
  event_day: { id_event_day: number; date: string };
  event: { id_event: number; name: string };
}

export interface CredentialListFilters {
  id_event?: number;
  id_event_day?: number;
  id_event_day_company?: number;
  id_access_status?: number;
}

export interface CredentialListResponse {
  credentials: CredentialItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CredentialCreatePayload {
  id_event_day_company: number;
  id_collaborator: number;
  id_collaborator_role?: number;
}

export interface CredentialStatusPayload {
  id_access_status: number;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class CredentialService {
  constructor(private api: ApiService) {}

  list(
    page = 1,
    limit = 100,
    filters: CredentialListFilters = {},
  ): Observable<CredentialListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.id_event != null) params = params.set('id_event', String(filters.id_event));
    if (filters.id_event_day != null) {
      params = params.set('id_event_day', String(filters.id_event_day));
    }
    if (filters.id_event_day_company != null) {
      params = params.set('id_event_day_company', String(filters.id_event_day_company));
    }
    if (filters.id_access_status != null) {
      params = params.set('id_access_status', String(filters.id_access_status));
    }
    return this.api.get<CredentialListResponse>('/credentials', params);
  }

  get(id: number): Observable<{ credential: CredentialItem }> {
    return this.api.get<{ credential: CredentialItem }>(`/credentials/${id}`);
  }

  create(data: CredentialCreatePayload): Observable<{ credential: CredentialItem }> {
    return this.api.post<{ credential: CredentialItem }>('/credentials', data);
  }

  updateStatus(
    id: number,
    data: CredentialStatusPayload,
  ): Observable<{ credential: CredentialItem }> {
    return this.api.patch<{ credential: CredentialItem }>(`/credentials/${id}/status`, data);
  }
}

export function statusBadgeClass(statusId: number): string {
  switch (statusId) {
    case STATUS_AGUARDANDO_PRODUTORA:
      return 'bg-slate-100 text-slate-700';
    case STATUS_AGUARDANDO_APROVACAO:
      return 'bg-amber-100 text-amber-800';
    case STATUS_APROVADO:
      return 'bg-emerald-100 text-emerald-800';
    case STATUS_NEGADO:
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
