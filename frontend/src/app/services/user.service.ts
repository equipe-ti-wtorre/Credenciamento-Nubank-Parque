import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface UserItem {
  id: number;
  username: string;
  nome_completo: string;
  email: string;
  departamento: string | null;
  role: 'ADMIN' | 'USER';
  is_ad_user: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface UserListFilters {
  search?: string;
  perfil?: string;
}

export interface UserListResponse {
  users: UserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserUpdatePayload {
  perfil?: 'ADMIN' | 'USER';
  ativo?: boolean;
  email?: string;
  password?: string;
  nome_completo?: string;
  departamento?: string;
}

export interface AdUsersSyncResult {
  ok: boolean;
  alreadyRunning?: boolean;
  message?: string;
  created?: number;
  updated?: number;
  linked?: number;
  skipped?: number;
  syncedTenants?: number;
  failedTenants?: number;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private api: ApiService) {}

  list(page = 1, limit = 20, filters: UserListFilters = {}): Observable<UserListResponse> {
    return this.api.get<UserListResponse>('/users', this.buildParams(page, limit, filters));
  }

  getById(id: number): Observable<{ user: UserItem }> {
    return this.api.get<{ user: UserItem }>(`/users/${id}`);
  }

  update(id: number, data: UserUpdatePayload): Observable<{ user: UserItem }> {
    return this.api.patch<{ user: UserItem }>(`/users/${id}`, data);
  }

  syncDepartments(): Observable<{ total: number; synced: number; failed: number }> {
    return this.api.post<{ total: number; synced: number; failed: number }>(
      '/users/sync-departments',
      {},
    );
  }

  syncAdUsers(): Observable<AdUsersSyncResult> {
    return this.api.post<AdUsersSyncResult>('/users/sync-ad-users', {});
  }

  syncUserAd(id: number): Observable<{ user: UserItem }> {
    return this.api.post<{ user: UserItem }>(`/users/${id}/sync-ad`, {});
  }

  private buildParams(page: number, limit: number, filters: UserListFilters): HttpParams {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.perfil === 'ADMIN' || filters.perfil === 'USER') {
      params = params.set('perfil', filters.perfil);
    }
    return params;
  }
}
