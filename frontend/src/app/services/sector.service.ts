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
  public_id?: string;
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
  public_id?: string;
  id?: number;
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
  public_id: string;
  usuario_public_id?: string;
  nome: string;
  email: string;
  papel: SectorPapel;
  ativo: boolean;
  fluxos?: ApprovalEntityType[];
}

export interface SectorFlow {
  tipoEntidade: ApprovalEntityType;
  niveisExigidos?: number;
  ativo: boolean;
}

export interface SectorListResponse {
  sectors: SectorItem[];
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

  getById(id: string): Observable<{ sector: SectorItem }> {
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
    id: string,
    data: { nome?: string; descricao?: string; contacts?: SectorContactPayload[] },
  ): Observable<{ sector: SectorItem }> {
    return this.api.put(`/sectors/${id}`, data);
  }

  listContacts(id: string): Observable<{ contacts: SectorContact[] }> {
    return this.api.get<{ contacts: SectorContact[] }>(`/sectors/${id}/contacts`);
  }

  addContact(id: string, data: SectorContactPayload): Observable<{ contacts: SectorContact[] }> {
    return this.api.post(`/sectors/${id}/contacts`, data);
  }

  updateContact(
    id: string,
    contactId: string,
    data: SectorContactPayload,
  ): Observable<{ contacts: SectorContact[] }> {
    return this.api.put(`/sectors/${id}/contacts/${contactId}`, data);
  }

  removeContact(id: string, contactId: string): Observable<{ contacts: SectorContact[] }> {
    return this.api.delete(`/sectors/${id}/contacts/${contactId}`);
  }

  patchStatus(id: string, ativo: boolean): Observable<{ sector: SectorItem }> {
    return this.api.patch(`/sectors/${id}/status`, { ativo });
  }

  listMembers(id: string): Observable<{ members: SectorMember[] }> {
    return this.api.get<{ members: SectorMember[] }>(`/sectors/${id}/members`);
  }

  addMember(
    id: string,
    data: { usuario_public_id: string; papel: SectorPapel; fluxos?: ApprovalEntityType[] },
  ): Observable<{ members: SectorMember[] }> {
    return this.api.post(`/sectors/${id}/members`, data);
  }

  patchMemberFlow(
    id: string,
    linkId: string,
    data: { tipoEntidade: ApprovalEntityType; ativo: boolean },
  ): Observable<{ members: SectorMember[] }> {
    return this.api.patch(`/sectors/${id}/members/${linkId}/flows`, data);
  }

  updateMember(
    id: string,
    linkId: string,
    data: { papel?: SectorPapel; ativo?: boolean },
  ): Observable<{ members: SectorMember[] }> {
    return this.api.patch(`/sectors/${id}/members/${linkId}`, data);
  }

  removeMember(id: string, linkId: string): Observable<{ members: SectorMember[] }> {
    return this.api.delete(`/sectors/${id}/members/${linkId}`);
  }

  getFlows(id: string): Observable<{ flows: SectorFlow[] }> {
    return this.api.get<{ flows: SectorFlow[] }>(`/sectors/${id}/flows`);
  }

  updateFlows(
    id: string,
    flows: Pick<SectorFlow, 'tipoEntidade' | 'ativo'>[],
  ): Observable<{ flows: SectorFlow[] }> {
    return this.api.put(`/sectors/${id}/flows`, { flows });
  }
}
