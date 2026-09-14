import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { BlocklistPeriodType } from '../shared/blocklist-notice';

export interface BlocklistItem {
  id_collaborator: number;
  name: string;
  document: string;
  document_type: { id_collaborator_document_type: number; description: string } | null;
  role: { id_collaborator_role: number; description: string } | null;
  status: boolean;
  reason: string;
  block_type: BlocklistPeriodType;
  block_value: number | null;
  blocked_until: string | null;
  remaining_days: number | null;
  remaining_events: number | null;
  events_elapsed: number | null;
  criado_em: string;
  id_usuario: number | null;
  blocked_by_name: string | null;
}

export interface BlocklistSearchResult {
  id_collaborator: number;
  name: string;
  document: string;
  status: boolean;
  document_type: { id_collaborator_document_type: number; description: string } | null;
  role: { id_collaborator_role: number; description: string } | null;
  is_blocklisted: boolean;
  block_type: BlocklistPeriodType | null;
}

export interface BlocklistCreatePayload {
  id_collaborator: number;
  reason: string;
  block_type: BlocklistPeriodType;
  block_value?: number | null;
}

export interface BlocklistUpdatePayload {
  reason?: string;
  block_type?: BlocklistPeriodType;
  block_value?: number | null;
}

export interface BlocklistListResponse {
  items: BlocklistItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class BlocklistService {
  constructor(private api: ApiService) {}

  list(page = 1, limit = 20, filters: { q?: string; block_type?: string } = {}): Observable<BlocklistListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    if (filters.block_type) params = params.set('block_type', filters.block_type);
    return this.api.get<BlocklistListResponse>('/blocklist', params);
  }

  get(id: number): Observable<{ item: BlocklistItem }> {
    return this.api.get<{ item: BlocklistItem }>(`/blocklist/${id}`);
  }

  searchCollaborators(q: string, limit = 12): Observable<{ results: BlocklistSearchResult[] }> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.api.get<{ results: BlocklistSearchResult[] }>('/blocklist/collaborators/search', params);
  }

  create(payload: BlocklistCreatePayload): Observable<{ item: BlocklistItem }> {
    return this.api.post<{ item: BlocklistItem }>('/blocklist', payload);
  }

  update(id: number, payload: BlocklistUpdatePayload): Observable<{ item: BlocklistItem }> {
    return this.api.patch<{ item: BlocklistItem }>(`/blocklist/${id}`, payload);
  }

  remove(id: number): Observable<{ success: boolean; id_collaborator: number }> {
    return this.api.delete<{ success: boolean; id_collaborator: number }>(`/blocklist/${id}`);
  }
}
