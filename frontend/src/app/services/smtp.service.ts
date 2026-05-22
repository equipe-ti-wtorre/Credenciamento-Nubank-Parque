import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface SmtpSettings {
  id?: number;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from_email: string;
  from_name?: string | null;
  ativo: boolean;
  hasPassword?: boolean;
}

export interface SmtpSendLog {
  id: number;
  destinatario: string;
  assunto: string;
  corpo_resumo: string | null;
  status: 'sent' | 'failed';
  erro_mensagem: string | null;
  criado_em: string;
}

export interface SmtpLogsResponse {
  logs: SmtpSendLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class SmtpService {
  constructor(private api: ApiService) {}

  getSettings(): Observable<{ settings: SmtpSettings | null }> {
    return this.api.get<{ settings: SmtpSettings | null }>('/smtp/settings');
  }

  updateSettings(data: SmtpSettings): Observable<{ settings: SmtpSettings }> {
    return this.api.put<{ settings: SmtpSettings }>('/smtp/settings', data);
  }

  testSend(destinatario: string, assunto?: string, corpo?: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/smtp/test', { destinatario, assunto, corpo });
  }

  listLogs(page = 1, limit = 20): Observable<SmtpLogsResponse> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.api.get<SmtpLogsResponse>('/smtp/logs', params);
  }
}
