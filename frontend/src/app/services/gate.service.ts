import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface GateCollaboratorInfo {
  name: string;
  document_masked: string;
  role: string;
}

export interface GateCompanyInfo {
  fancy_name: string;
}

export interface GateValidateSuccess {
  access_allowed: true;
  type: 'EVENT';
  collaborator: GateCollaboratorInfo;
  company: GateCompanyInfo;
  action_registered: 'CHECK_IN' | 'CHECK_OUT';
  access_id?: string;
  id_event_day_company_collaborator?: number;
  event_name?: string;
}

export interface GateValidateDenied {
  access_allowed: false;
  reason: string;
  error_code: string;
}

export type GateValidateResponse = GateValidateSuccess | GateValidateDenied;

export type GateNextAction = 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED';

export interface GateTodayCredential {
  id: number;
  access_id: string;
  collaborator: GateCollaboratorInfo;
  company: { name: string };
  event_name: string;
  access_check_in: string | null;
  access_check_out: string | null;
  next_action: GateNextAction;
}

export interface GateTodayListResponse {
  credentials: GateTodayCredential[];
}

export interface GateSubstitutePayload {
  access_id: string;
  id_substitute_collaborator: number;
}

export interface GateSubstituteResponse {
  access_id: string;
  id_event_day_company_collaborator: number;
  id_substitute_collaborator: number;
  substitute: {
    name: string;
    document_masked: string;
  };
}

@Injectable({ providedIn: 'root' })
export class GateService {
  constructor(private api: ApiService) {}

  validateEvent(access_id: string): Observable<GateValidateResponse> {
    return this.api.post<GateValidateResponse>('/gate/events/validate', { access_id });
  }

  substituteEvent(payload: GateSubstitutePayload): Observable<GateSubstituteResponse> {
    return this.api.post<GateSubstituteResponse>('/gate/events/substitute', payload);
  }

  listToday(): Observable<GateTodayListResponse> {
    return this.api.get<GateTodayListResponse>('/gate/events/today');
  }

  listTodayServices(): Observable<{
    services: GateTodayService[];
  }> {
    return this.api.get('/gate/services/today');
  }

  validateService(access_id: string): Observable<GateServiceValidateResponse> {
    return this.api.post<GateServiceValidateResponse>('/gate/services/validate', { access_id });
  }

  substituteService(payload: {
    access_id: string;
    id_substitute_vehicle: number;
  }): Observable<unknown> {
    return this.api.post('/gate/services/substitute', payload);
  }
}

export interface GateTodayService {
  id: number;
  access_id: string;
  vehicle: { plate: string; description?: string };
  company: { name: string };
  service_type: string;
  check_in: string | null;
  check_out: string | null;
  next_action: GateNextAction;
}

export interface GateServiceValidateResponse {
  access_allowed: boolean;
  type?: 'SERVICE';
  vehicle?: { plate: string };
  company?: { fancy_name: string };
  action_registered?: 'CHECK_IN' | 'CHECK_OUT';
  reason?: string;
  error_code?: string;
}
