import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type FacialTransport = 'http_poll' | 'service_bus' | 'direct_dahua';

export interface FacialGatewaySettings {
  enabled: boolean;
  commands_queue: string;
  status_queue: string;
  has_events_secret: boolean;
  has_commands_connection_string: boolean;
  has_status_connection_string: boolean;
  transport?: FacialTransport;
  peer_origin_ip?: string;
  peer_destination_ip?: string;
  atualizado_em?: string | null;
  events_secret?: string;
  commands_connection_string?: string;
  status_connection_string?: string;
}

export interface FacialIntegrationStatus {
  integration: {
    enabled: boolean;
    configComplete: boolean;
    transport?: FacialTransport;
  };
  enrollment: {
    synced: number;
    pending: number;
    partial: number;
    failed: number;
    revoked: number;
    lastActivityAt?: string | null;
  };
  access: {
    total24h: number;
    blocked24h: number;
    lastEventAt?: string | null;
    lastDeviceId?: string | null;
    lastDeviceName?: string | null;
  };
}

export interface FacialEnrollmentDeviceResult {
  deviceId: string;
  deviceName?: string | null;
  status?: string | null;
  error?: string | null;
}

export type FacialEnrollmentAction = 'enroll' | 'revoke';
export type FacialEnrollmentStage = 'queued' | 'result' | 'skipped' | 'test';

export interface FacialEnrollmentLogItem {
  id: number;
  criado_em: string;
  direction: 'outbound' | 'inbound';
  correlation_id?: string | null;
  id_collaborator?: number | null;
  collaborator_name?: string | null;
  type?: string | null;
  command?: string | null;
  action?: FacialEnrollmentAction | null;
  stage?: FacialEnrollmentStage;
  overallStatus?: string | null;
  error?: string | null;
  devices?: FacialEnrollmentDeviceResult[];
  checks?: FacialSyncCheck[];
}

export interface FacialAccessGate {
  applied: boolean;
  skipped: boolean;
  action_registered?: string | null;
  error_code?: string | null;
  reason?: string | null;
}

export interface FacialAccessLogItem {
  id: number;
  criado_em: string;
  gateway_event_id: number;
  device_id: string;
  device_name?: string | null;
  user_id: string;
  linked_id?: string | null;
  id_collaborator?: number | null;
  collaborator_name?: string | null;
  event_time?: string | null;
  direction?: 'entrada' | 'saida' | null;
  blocked: boolean;
  antipassback: boolean;
  method?: string | null;
  status?: string | null;
  method_label?: string | null;
  status_label?: string | null;
  gate?: FacialAccessGate | null;
}

export interface FacialLogsResponse {
  type: 'enrollment' | 'access';
  logs: FacialEnrollmentLogItem[] | FacialAccessLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FacialLogsQuery {
  type: 'enrollment' | 'access';
  page?: number;
  limit?: number;
}

export interface FacialSyncCheck {
  key: string;
  ok: boolean;
  warning?: boolean;
  label: string;
}

export interface FacialSyncTestResult {
  ok: boolean;
  enabled: boolean;
  configComplete: boolean;
  transport: FacialTransport;
  eligibleCount: number;
  jobs: {
    queued: number;
    processing: number;
    synced: number;
    partial: number;
    pending: number;
    failed: number;
    lastClaimedAt?: string | null;
    oldestQueuedAt?: string | null;
  };
  checks: FacialSyncCheck[];
  warningCount: number;
  errorCount: number;
}

export interface FacialForceSyncResult {
  ok: boolean;
  alreadyRunning?: boolean;
  message?: string;
  eligible: number;
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: Array<{ id_collaborator: number; name?: string; error: string }>;
  startedAt?: string;
  durationMs?: number;
}

export interface FacialDevice {
  public_id: string;
  device_key: string;
  name: string;
  host: string;
  port: number;
  username: string;
  enabled: boolean;
  has_password: boolean;
  atualizado_em?: string | null;
}

export interface FacialDeviceInput {
  device_key: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  enabled: boolean;
}

export interface FacialDeviceTestResult {
  ok: boolean;
  deviceType?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class FacialGatewayService {
  constructor(private api: ApiService) {}

  getSettings(): Observable<{ settings: FacialGatewaySettings }> {
    return this.api.get<{ settings: FacialGatewaySettings }>('/facial/settings');
  }

  updateSettings(data: Partial<FacialGatewaySettings>): Observable<{ settings: FacialGatewaySettings }> {
    return this.api.put<{ settings: FacialGatewaySettings }>('/facial/settings', data);
  }

  getStatus(): Observable<{ status: FacialIntegrationStatus }> {
    return this.api.get<{ status: FacialIntegrationStatus }>('/facial/status');
  }

  getLogs(query: FacialLogsQuery): Observable<FacialLogsResponse> {
    const params = new HttpParams()
      .set('type', query.type)
      .set('page', String(query.page ?? 1))
      .set('limit', String(query.limit ?? 15));
    return this.api.get<FacialLogsResponse>('/facial/logs', params);
  }

  testSync(): Observable<FacialSyncTestResult> {
    return this.api.post<FacialSyncTestResult>('/facial/sync/test', {});
  }

  forceSync(): Observable<FacialForceSyncResult> {
    return this.api.post<FacialForceSyncResult>('/facial/sync/force', {});
  }

  listDevices(): Observable<{ devices: FacialDevice[] }> {
    return this.api.get<{ devices: FacialDevice[] }>('/facial/devices');
  }

  createDevice(data: FacialDeviceInput): Observable<{ device: FacialDevice }> {
    return this.api.post<{ device: FacialDevice }>('/facial/devices', data);
  }

  updateDevice(id: string, data: FacialDeviceInput): Observable<{ device: FacialDevice }> {
    return this.api.put<{ device: FacialDevice }>(`/facial/devices/${id}`, data);
  }

  deleteDevice(id: string): Observable<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(`/facial/devices/${id}`);
  }

  testDevice(id: string): Observable<FacialDeviceTestResult> {
    return this.api.post<FacialDeviceTestResult>(`/facial/devices/${id}/test`, {});
  }
}
