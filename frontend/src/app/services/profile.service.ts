import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { PermissionAction } from '../config/modules.config';

export interface ProfilePermission {
  modulo: string;
  acao: PermissionAction;
}

export interface AccessProfile {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  is_system: boolean;
  is_super_admin: boolean;
  requires_company: boolean;
  ativo: boolean;
  user_count?: number;
  permissions: ProfilePermission[];
  criado_em?: string;
  atualizado_em?: string;
}

export interface ModulesCatalogGroup {
  name: string;
  modules: Array<{
    key: string;
    label: string;
    actions: Array<{ key: PermissionAction; label: string }>;
  }>;
}

export interface ModulesCatalog {
  actions: Array<{ key: PermissionAction; label: string }>;
  groups: ModulesCatalogGroup[];
}

export interface ProfileCreatePayload {
  nome: string;
  descricao?: string | null;
  requires_company?: boolean;
  permissions: ProfilePermission[];
}

export interface ProfileUpdatePayload extends Partial<ProfileCreatePayload> {
  ativo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  constructor(private api: ApiService) {}

  list(): Observable<{ profiles: AccessProfile[] }> {
    return this.api.get<{ profiles: AccessProfile[] }>('/profiles');
  }

  getModulesCatalog(): Observable<ModulesCatalog> {
    return this.api.get<ModulesCatalog>('/profiles/modules');
  }

  getById(id: number): Observable<{ profile: AccessProfile }> {
    return this.api.get<{ profile: AccessProfile }>(`/profiles/${id}`);
  }

  create(data: ProfileCreatePayload): Observable<{ profile: AccessProfile }> {
    return this.api.post<{ profile: AccessProfile }>('/profiles', data);
  }

  update(id: number, data: ProfileUpdatePayload): Observable<{ profile: AccessProfile }> {
    return this.api.patch<{ profile: AccessProfile }>(`/profiles/${id}`, data);
  }

  remove(id: number): Observable<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(`/profiles/${id}`);
  }
}
