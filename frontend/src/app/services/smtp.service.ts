import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type EmailProvider = 'smtp' | 'acs';
export type EmailLogStatus = 'sent' | 'failed' | 'entregue' | 'bounce';

export interface SmtpSettings {
  id?: number;
  provider: EmailProvider;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from_email: string;
  from_name?: string | null;
  /** SMTP row ativo (legado) */
  ativo: boolean;
  hasPassword?: boolean;
  acs_sender?: string | null;
  acs_connection_string?: string;
  has_acs_connection_string?: boolean;
  ocultar_para?: boolean;
  /** Envio habilitado no provedor (email_provider_config.ativo) */
  email_ativo?: boolean;
}

export interface SmtpSendLog {
  id: number;
  destinatario: string;
  assunto: string;
  corpo_resumo: string | null;
  status: EmailLogStatus;
  erro_mensagem: string | null;
  message_id?: string | null;
  provider?: string | null;
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

  updateSettings(data: Partial<SmtpSettings>): Observable<{ settings: SmtpSettings }> {
    return this.api.put<{ settings: SmtpSettings }>('/smtp/settings', data);
  }

  verifyConnection(): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/smtp/verificar', {});
  }

  testSend(destinatario: string, assunto?: string, corpo?: string): Observable<{
    message: string;
    provider?: string;
    messageId?: string | null;
  }> {
    return this.api.post('/smtp/test', { destinatario, assunto, corpo });
  }

  listLogs(page = 1, limit = 20): Observable<SmtpLogsResponse> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.api.get<SmtpLogsResponse>('/smtp/logs', params);
  }
}
