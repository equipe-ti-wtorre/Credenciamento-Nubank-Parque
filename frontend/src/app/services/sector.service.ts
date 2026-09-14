import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { ApprovalEntityType } from './approval.service';

export type SectorPapel = 'SOLICITANTE' | 'APROVADOR' | 'GESTOR';

export interface SectorSelectItem {
  id: number;
  nome: string;
}

export interface SectorContact {
  id?: number;
  idSetor?: number;
  nome: string;
  telefone?: string | null;
  ramal?: string | null;
  email?: string | null;
}

export interface SectorContactPayload {
  nome: string;
  telefone?: string | null;
  ramal?: string | null;
  email?: string | null;
}

export interface SectorItem {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  membrosAtivos: number;
  fluxosConfigurados: number;
  contatosCadastrados?: number;
  contacts?: SectorContact[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface SectorMember {
  linkId: number;
  idUsuario: number;
  nome: string;
  email: string;
  papel: SectorPapel;
  ativo: boolean;
}

export interface SectorFlow {
  id?: number;
  tipoEntidade: ApprovalEntityType;
  niveisExigidos?: number;
  ativo: boolean;
}

export interface SectorListResponse {
  data: SectorItem[];
  pagination: { page: number; limit: number; total: number };
}

export const SECTOR_PAPEL_LABELS: Record<SectorPapel, string> = {
  SOLICITANTE: 'Solicitante',
  APROVADOR: 'Aprovador',
  GESTOR: 'Gestor',
};

@Injectable({ providedIn: 'root' })
export class SectorService {
  constructor(private api: ApiService) {}

  listSelect(): Observable<{ sectors: SectorSelectItem[] }> {
    return this.api.get<{ sectors: SectorSelectItem[] }>('/sectors/select');
  }

  list(page = 1, limit = 20): Observable<SectorListResponse> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.api.get<SectorListResponse>('/sectors', params);
  }

  getById(id: number): Observable<{ sector: SectorItem }> {
    return this.api.get<{ sector: SectorItem }>(`/sectors/${id}`);
  }

  create(data: {
    nome: string;
    descricao?: string;
    contacts?: SectorContactPayload[];
  }): Observable<{ sector: SectorItem }> {
    return this.api.post('/sectors', data);
  }

  update(
    id: number,
    data: { nome?: string; descricao?: string; contacts?: SectorContactPayload[] },
  ): Observable<{ sector: SectorItem }> {
    return this.api.put(`/sectors/${id}`, data);
  }

  listContacts(id: number): Observable<{ contacts: SectorContact[] }> {
    return this.api.get<{ contacts: SectorContact[] }>(`/sectors/${id}/contacts`);
  }

  addContact(id: number, data: SectorContactPayload): Observable<{ contacts: SectorContact[] }> {
    return this.api.post(`/sectors/${id}/contacts`, data);
  }

  updateContact(
    id: number,
    contactId: number,
    data: SectorContactPayload,
  ): Observable<{ contacts: SectorContact[] }> {
    return this.api.put(`/sectors/${id}/contacts/${contactId}`, data);
  }

  removeContact(id: number, contactId: number): Observable<{ contacts: SectorContact[] }> {
    return this.api.delete(`/sectors/${id}/contacts/${contactId}`);
  }

  patchStatus(id: number, ativo: boolean): Observable<{ sector: SectorItem }> {
    return this.api.patch(`/sectors/${id}/status`, { ativo });
  }

  listMembers(id: number): Observable<{ members: SectorMember[] }> {
    return this.api.get<{ members: SectorMember[] }>(`/sectors/${id}/members`);
  }

  addMember(id: number, data: { idUsuario: number; papel: SectorPapel }): Observable<{ members: SectorMember[] }> {
    return this.api.post(`/sectors/${id}/members`, data);
  }

  updateMember(
    id: number,
    linkId: number,
    data: { papel?: SectorPapel; ativo?: boolean },
  ): Observable<{ members: SectorMember[] }> {
    return this.api.patch(`/sectors/${id}/members/${linkId}`, data);
  }

  removeMember(id: number, linkId: number): Observable<{ members: SectorMember[] }> {
    return this.api.delete(`/sectors/${id}/members/${linkId}`);
  }

  getFlows(id: number): Observable<{ flows: SectorFlow[] }> {
    return this.api.get<{ flows: SectorFlow[] }>(`/sectors/${id}/flows`);
  }

  updateFlows(id: number, flows: Pick<SectorFlow, 'tipoEntidade' | 'ativo'>[]): Observable<{ flows: SectorFlow[] }> {
    return this.api.put(`/sectors/${id}/flows`, { flows });
  }
}
