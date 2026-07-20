import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface CompanyUserItem {
  id: number;
  username: string;
  nome_completo: string;
  email: string;
  id_company: number | null;
  company_name: string | null;
  id_perfil: number | null;
  role: string | null;
  profile: {
    id: number;
    codigo: string;
    nome: string;
    requires_company?: boolean;
  } | null;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface CompanyUserListResponse {
  users: CompanyUserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CompanyUserCreatePayload {
  id_company?: number;
  nome_completo: string;
  email: string;
  profile_codigo?: 'EMPRESA_GESTOR' | 'EMPRESA_SOLICITANTE';
  send_invite?: boolean;
  password?: string;
}

export interface CompanyUserUpdatePayload {
  nome_completo?: string;
  email?: string;
  profile_codigo?: 'EMPRESA_GESTOR' | 'EMPRESA_SOLICITANTE';
  ativo?: boolean;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class CompanyUsersService {
  constructor(private api: ApiService) {}

  list(
    page = 1,
    limit = 20,
    filters: {
      search?: string;
      id_company?: number;
      profile_codigo?: string;
      ativo?: boolean;
    } = {},
  ): Observable<CompanyUserListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.id_company != null) params = params.set('id_company', String(filters.id_company));
    if (filters.profile_codigo) params = params.set('profile_codigo', filters.profile_codigo);
    if (filters.ativo !== undefined) params = params.set('ativo', filters.ativo ? '1' : '0');
    return this.api.get<CompanyUserListResponse>('/company-users', params);
  }

  create(data: CompanyUserCreatePayload): Observable<{ user: CompanyUserItem; invite: unknown }> {
    return this.api.post('/company-users', data);
  }

  update(id: number, data: CompanyUserUpdatePayload): Observable<{ user: CompanyUserItem }> {
    return this.api.patch(`/company-users/${id}`, data);
  }

  resendInvite(id: number): Observable<{ user: CompanyUserItem; invite: unknown }> {
    return this.api.post(`/company-users/${id}/resend-invite`, {});
  }
}
