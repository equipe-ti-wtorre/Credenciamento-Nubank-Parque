import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type WhatsappLogStatus = 'sent' | 'failed';

export type WhatsappSessionStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'action_required'
  | 'failed';

export interface WhatsappSettings {
  provider: 'openwa';
  base_url: string | null;
  has_api_key: boolean;
  session_id: string | null;
  default_country_code: string;
  ativo: boolean;
  atualizado_em?: string;
}

export interface WhatsappSettingsPayload {
  base_url?: string;
  api_key?: string;
  session_id?: string;
  default_country_code?: string;
  ativo?: boolean;
}

export interface WhatsappSession {
  id: string;
  name: string;
  status: WhatsappSessionStatus;
  phone: string | null;
  pushName: string | null;
  connectedAt: string | null;
  lastActive: string | null;
  lastError: string | null;
  createdAt?: string | null;
}

export interface WhatsappLimits {
  pacing_enabled: boolean;
  warmup_schedule: number[];
  cold_cap_enabled: boolean;
  cold_daily_cap: number[];
  breaker_threshold: number;
  breaker_cooldown_minutes: number;
  simulate_typing: boolean;
  simulate_typing_max_ms: number;
  env_path?: string;
  defaults?: {
    warmup_schedule: number[];
    cold_daily_cap: number[];
    breaker_threshold: number;
    breaker_cooldown_minutes: number;
    simulate_typing_max_ms: number;
  };
}

export interface WhatsappLimitsSaveResponse {
  limits: WhatsappLimits;
  restart: { requested: boolean; ok: boolean; message: string };
  message: string;
}

export interface WhatsappStatus {
  configured: boolean;
  ativo: boolean;
  session_name: string | null;
  gateway: { ok: boolean; version: string | null; message: string | null };
  session: WhatsappSession | null;
}

export interface WhatsappQrResponse {
  status: WhatsappSessionStatus;
  qrCode: string | null;
  session: WhatsappSession | null;
}

export interface WhatsappSendLog {
  id: number;
  destinatario: string;
  chat_id: string | null;
  corpo_resumo: string | null;
  status: WhatsappLogStatus;
  erro_mensagem: string | null;
  message_id: string | null;
  provider: string | null;
  criado_em: string;
}

export interface WhatsappLogsResponse {
  logs: WhatsappSendLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface WhatsappLogsQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: WhatsappLogStatus | '';
}

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  constructor(private api: ApiService) {}

  getSettings(): Observable<{ settings: WhatsappSettings }> {
    return this.api.get<{ settings: WhatsappSettings }>('/whatsapp/settings');
  }

  updateSettings(data: WhatsappSettingsPayload): Observable<{ settings: WhatsappSettings }> {
    return this.api.put<{ settings: WhatsappSettings }>('/whatsapp/settings', data);
  }

  getStatus(): Observable<WhatsappStatus> {
    return this.api.get<WhatsappStatus>('/whatsapp/status');
  }

  getQr(): Observable<WhatsappQrResponse> {
    return this.api.get<WhatsappQrResponse>('/whatsapp/qr');
  }

  startSession(): Observable<{ message: string; session: WhatsappSession }> {
    return this.api.post('/whatsapp/session/start', {});
  }

  stopSession(): Observable<{ message: string; session: WhatsappSession }> {
    return this.api.post('/whatsapp/session/stop', {});
  }

  testSend(
    destinatario: string,
    mensagem?: string,
  ): Observable<{ message: string; chatId?: string; messageId?: string | null }> {
    return this.api.post('/whatsapp/test', { destinatario, mensagem });
  }

  getLimits(): Observable<{ limits: WhatsappLimits }> {
    return this.api.get<{ limits: WhatsappLimits }>('/whatsapp/limits');
  }

  updateLimits(
    data: Omit<WhatsappLimits, 'env_path' | 'defaults'> & { restart?: boolean },
  ): Observable<WhatsappLimitsSaveResponse> {
    return this.api.put<WhatsappLimitsSaveResponse>('/whatsapp/limits', data);
  }

  listLogs(query: WhatsappLogsQuery = {}): Observable<WhatsappLogsResponse> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('limit', String(query.limit ?? 20));
    if (query.q?.trim()) params = params.set('q', query.q.trim());
    if (query.status) params = params.set('status', query.status);
    return this.api.get<WhatsappLogsResponse>('/whatsapp/logs', params);
  }
}
