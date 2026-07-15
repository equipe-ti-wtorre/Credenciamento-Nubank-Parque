import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface SystemAlert {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  tipoReferencia: string | null;
  idReferencia: number | null;
  lidaEm: string | null;
  criadoEm: string;
}

export interface SystemAlertListResponse {
  data: SystemAlert[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

@Injectable({ providedIn: 'root' })
export class AlertsService {
  constructor(private api: ApiService) {}

  list(opts?: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
  }): Observable<SystemAlertListResponse> {
    let params = new HttpParams();
    if (opts?.page != null) params = params.set('page', String(opts.page));
    if (opts?.pageSize != null) params = params.set('pageSize', String(opts.pageSize));
    if (opts?.unreadOnly) params = params.set('unreadOnly', 'true');
    return this.api.get<SystemAlertListResponse>('/alerts', params);
  }

  unreadCount(): Observable<{ total: number }> {
    return this.api.get<{ total: number }>('/alerts/unread-count');
  }

  markRead(id: number): Observable<{ alert: SystemAlert }> {
    return this.api.post<{ alert: SystemAlert }>(`/alerts/${id}/read`, {});
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.api.post<{ updated: number }>('/alerts/read-all', {});
  }

  delete(id: number): Observable<{ deleted: boolean; id: number }> {
    return this.api.delete<{ deleted: boolean; id: number }>(`/alerts/${id}`);
  }

  deleteAll(): Observable<{ deleted: number }> {
    return this.api.delete<{ deleted: number }>('/alerts/clear-all');
  }
}
