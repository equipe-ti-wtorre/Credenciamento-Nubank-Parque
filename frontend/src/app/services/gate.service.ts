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
}
