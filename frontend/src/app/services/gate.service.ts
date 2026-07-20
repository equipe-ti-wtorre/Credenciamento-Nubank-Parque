import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface GateCollaboratorInfo {
  id_collaborator?: number;
  name: string;
  /** Documento completo (para conferência na liberação). */
  document?: string | null;
  document_masked: string;
  document_type?: string | null;
  role: string;
  picture?: string | null;
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

export type GateNextAction =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'COMPLETED'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'BLOCKED_OPEN_STAY';

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

  listCalendar(from: string, to: string): Observable<GateCalendarResponse> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.api.get<GateCalendarResponse>('/gate/calendar', params);
  }

  getCalendarDetail(
    kind: 'event' | 'service',
    sourceId: number,
    date: string,
  ): Observable<GateCalendarDetailResponse> {
    const params = new HttpParams()
      .set('kind', kind)
      .set('source_id', String(sourceId))
      .set('date', date);
    return this.api.get<GateCalendarDetailResponse>('/gate/calendar/detail', params);
  }

  validateService(access_id: string): Observable<GateServiceValidateResponse> {
    return this.api.post<GateServiceValidateResponse>('/gate/services/validate', { access_id });
  }

  substituteService(payload: {
    access_id: string;
    id_substitute_vehicle?: number;
    id_substitute_collaborator?: number;
  }): Observable<unknown> {
    return this.api.post('/gate/services/substitute', payload);
  }

  getManualReleaseMeta(): Observable<GateManualReleaseMeta> {
    return this.api.get<GateManualReleaseMeta>('/gate/manual-release/meta');
  }

  searchManualReleaseCollaborator(
    document: string,
    id_collaborator_document_type: number,
  ): Observable<{ found: boolean; collaborator: GateManualReleaseCollaborator }> {
    const params = new HttpParams()
      .set('document', document)
      .set('id_collaborator_document_type', String(id_collaborator_document_type));
    return this.api.get<{ found: boolean; collaborator: GateManualReleaseCollaborator }>(
      '/gate/manual-release/collaborators/search',
      params,
    );
  }

  /** Typeahead: busca por nome ou documento, retorna lista. */
  searchManualReleaseCollaborators(
    q: string,
  ): Observable<{ results: GateManualReleaseCollaborator[] }> {
    const params = new HttpParams().set('q', q);
    return this.api.get<{ results: GateManualReleaseCollaborator[] }>(
      '/gate/manual-release/collaborators/search',
      params,
    );
  }

  createManualRelease(
    payload: GateManualReleasePayload,
  ): Observable<{ release: GateManualReleaseResult }> {
    return this.api.post<{ release: GateManualReleaseResult }>(
      '/gate/services/manual-release',
      payload,
    );
  }

  notifyServiceApproval(
    idServiceAccess: number,
  ): Observable<{
    message: string;
    id_service_access: number;
    id_aprovacao: number;
    id_setor: number;
    setor_nome: string;
    notified: number;
  }> {
    return this.api.post(`/gate/services/${idServiceAccess}/notify-approval`, {});
  }

  cancelServiceApproval(
    idServiceAccess: number,
  ): Observable<{
    message: string;
    id_service_access: number;
    id_aprovacao: number;
    id_setor: number;
    setor_nome: string | null;
  }> {
    return this.api.post(`/gate/services/${idServiceAccess}/cancel-approval`, {});
  }
}

export interface GateManualReleaseSector {
  id: number;
  nome: string;
}

export interface GateManualReleaseCompany {
  id_company: number;
  fancy_name: string;
  company_name: string;
}

export interface GateManualReleaseMeta {
  sectors: GateManualReleaseSector[];
  companies: GateManualReleaseCompany[];
  document_types: { id_collaborator_document_type: number; description: string }[];
  roles: { id_collaborator_role: number; description: string }[];
}

export interface GateManualReleaseCollaborator {
  id_collaborator: number;
  name: string;
  document: string;
  id_collaborator_document_type?: number;
  id_collaborator_role?: number;
  is_blacklisted: boolean;
  status?: boolean;
  document_type?: { id_collaborator_document_type: number; description: string } | null;
  role?: { id_collaborator_role: number; description: string } | null;
}

export interface GateManualReleasePayload {
  id_company: number;
  id_setor: number;
  finalidade: string;
  observacao: string;
  id_collaborators?: number[];
  collaborators?: {
    id_collaborator_document_type: number;
    id_collaborator_role: number;
    document: string;
    name: string;
    rg?: string | null;
    phone?: string | null;
  }[];
}

export interface GateManualReleaseResult {
  id_service_access: number;
  id_aprovacao: number;
  id_setor: number;
  setor_nome: string;
  finalidade: string;
  company: { id_company: number; fancy_name: string };
  collaborator: {
    id_collaborator: number;
    name: string;
    document: string;
    role_description: string;
  };
  collaborators?: {
    id_collaborator: number;
    name: string;
    document: string;
    role_description: string | null;
  }[];
}

export type GateWeekDayStatus = 'accessed' | 'missed' | 'waiting' | 'none';

export interface GateWeekDay {
  date: string;
  weekday: string;
  status: GateWeekDayStatus;
  is_today: boolean;
}

export interface GateApprovedBy {
  id?: number;
  name: string;
  initials: string;
  sector: string | null;
  decided_at: string | null;
}

export interface GateTodayService {
  kind: 'vehicle' | 'collaborator';
  id: number;
  access_id: string;
  vehicle?: { plate: string; description?: string };
  collaborator?: GateCollaboratorInfo;
  company: { name: string };
  finalidade: string;
  check_in: string | null;
  check_out: string | null;
  next_action: GateNextAction;
  block_reason?: string | null;
  start_date: string | null;
  end_date: string | null;
  week_days: GateWeekDay[];
  approved_by: GateApprovedBy | null;
  rejected_by?: GateApprovedBy | null;
  id_service_access?: number;
  id_aprovacao?: number | null;
  id_setor?: number | null;
  setor_nome?: string | null;
}

export interface GateServiceValidateResponse {
  access_allowed: boolean;
  type?: 'SERVICE';
  kind?: 'vehicle' | 'collaborator';
  vehicle?: { plate: string };
  collaborator?: { name: string; document_masked: string; role: string; picture?: string | null };
  company?: { fancy_name: string };
  action_registered?: 'CHECK_IN' | 'CHECK_OUT';
  reason?: string;
  error_code?: string;
}

export type GateCalendarTypeKey = 'show' | 'sport' | 'setup' | 'teardown' | 'service';

export interface GateCalendarItem {
  key: string;
  kind: 'event' | 'service';
  source_id: number;
  date: string;
  name: string;
  start_date: string;
  end_date: string;
  type_key: GateCalendarTypeKey;
  type_label: string;
  status_id: number;
  status_label: string;
  company_name?: string | null;
  department?: string | null;
  companies_count?: number;
  collaborators_count?: number;
  vehicles_count?: number;
}

export interface GateCalendarResponse {
  items: GateCalendarItem[];
  from: string;
  to: string;
}

export interface GateCalendarCollaborator {
  id: number;
  name: string;
  document_masked: string;
  document_type?: string | null;
  role?: string | null;
  company_name?: string | null;
}

export interface GateCalendarVehicle {
  id: number;
  plate: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
}

export interface GateCalendarDetailResponse {
  item: GateCalendarItem;
  collaborators: GateCalendarCollaborator[];
  vehicles: GateCalendarVehicle[];
}
