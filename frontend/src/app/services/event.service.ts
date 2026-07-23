import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface EventDayType {
  id_event_day_type: number;
  description: string;
}

export interface EventItem {
  id_event: number;
  name: string;
  start: string;
  end: string;
  id_access_status?: number | null;
  access_status_description?: string | null;
  id_company_responsavel?: number | null;
  company_responsavel?: EventDayCompanyBrief | null;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
  can_delete?: boolean;
  can_toggle_active?: boolean;
  has_registered_data?: boolean;
}

export interface EventDayCompanyBrief {
  id_company: number;
  company_name: string;
  fancy_name?: string | null;
  id_company_type?: number;
  company_type_description?: string;
}

export interface EventDayCompanyLink {
  id_event_day_company: number;
  company: EventDayCompanyBrief;
  producer: EventDayCompanyBrief | null;
}

export interface EventDay {
  id_event_day: number;
  date: string;
  type: EventDayType;
  companies: EventDayCompanyLink[];
}

export interface EventApprovalSummary {
  id: number;
  status: string;
  nivelAtual: number;
  niveisExigidos: number;
  idSetor: number;
}

export interface EventDetail extends EventItem {
  days: EventDay[];
  approval?: EventApprovalSummary | null;
  approvalReopened?: boolean;
  periodChanged?: boolean;
  id_aprovacao?: number | null;
  aprovacao_status?: string | null;
  id_setor?: number | null;
  id_solicitante?: number | null;
  notificar_portaria?: boolean;
  can_approve_credentials?: boolean;
  can_manage_companies?: boolean;
  is_solicitante?: boolean;
  can_change_responsavel?: boolean;
  can_toggle_active?: boolean;
  can_submit_approval?: boolean;
  can_notify_complete?: boolean;
  notified_complete_at?: string | null;
  can_delete?: boolean;
  has_registered_data?: boolean;
}

export interface EventListFilters {
  name?: string;
}

export interface EventListResponse {
  events: EventItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EventDayInput {
  date: string;
  id_type: number;
}

export interface EventCreatePayload {
  name: string;
  start: string;
  end: string;
  id_setor: number;
  id_company_responsavel: number;
  days?: EventDayInput[];
}

export interface EventDayCompanyPayload {
  id_company: number;
  id_producer?: number | null;
}

export interface EventCompanyVehicleItem {
  id_vehicle: number;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  type: string | null;
  description: string | null;
  status: boolean;
  id_access_status: number;
  access_status_description: string;
  linkIds: number[];
}

@Injectable({ providedIn: 'root' })
export class EventService {
  constructor(private api: ApiService) {}

  listTypes(): Observable<{ types: EventDayType[] }> {
    return this.api.get<{ types: EventDayType[] }>('/events/types');
  }

  listProducers(): Observable<{ producers: EventDayCompanyBrief[] }> {
    return this.api.get<{ producers: EventDayCompanyBrief[] }>('/events/producers');
  }

  listLinkableCompanies(
    idEvent: number,
  ): Observable<{ id_company_responsavel: number | null; companies: EventDayCompanyBrief[] }> {
    return this.api.get<{
      id_company_responsavel: number | null;
      companies: EventDayCompanyBrief[];
    }>(`/events/${idEvent}/linkable-companies`);
  }

  list(
    page = 1,
    limit = 20,
    filters: EventListFilters = {},
  ): Observable<EventListResponse> {
    return this.api.get<EventListResponse>('/events', this.buildParams(page, limit, filters));
  }

  get(id: number): Observable<{ event: EventDetail }> {
    return this.api.get<{ event: EventDetail }>(`/events/${id}`);
  }

  create(data: EventCreatePayload): Observable<{ event: EventDetail }> {
    return this.api.post<{ event: EventDetail }>('/events', data);
  }

  updatePeriod(
    id: number,
    data: { start: string; end: string; days?: EventDayInput[] },
  ): Observable<{ event: EventDetail }> {
    return this.api.patch<{ event: EventDetail }>(`/events/${id}/period`, data);
  }

  updateResponsavel(
    id: number,
    id_company_responsavel: number,
  ): Observable<{ event: EventDetail }> {
    return this.api.patch<{ event: EventDetail }>(`/events/${id}/responsavel`, {
      id_company_responsavel,
    });
  }

  patchStatus(id: number, ativo: boolean): Observable<{ event: EventDetail }> {
    return this.api.patch<{ event: EventDetail }>(`/events/${id}/status`, { ativo });
  }

  remove(id: number): Observable<{ removed: { deleted: boolean; id_event: number; name: string } }> {
    return this.api.delete<{ removed: { deleted: boolean; id_event: number; name: string } }>(
      `/events/${id}`,
    );
  }

  updatePreferences(
    id: number,
    data: { notificar_portaria: boolean },
  ): Observable<{ event: EventDetail }> {
    return this.api.patch<{ event: EventDetail }>(`/events/${id}/preferences`, data);
  }

  submitApproval(id: number): Observable<{ event: EventDetail }> {
    return this.api.post<{ event: EventDetail }>(`/events/${id}/submit-approval`, {});
  }

  notifyCompanyComplete(
    idEvent: number,
    idCompany: number,
  ): Observable<{ event: EventDetail }> {
    return this.api.post<{ event: EventDetail }>(
      `/events/${idEvent}/companies/${idCompany}/notify-complete`,
      {},
    );
  }

  addCompanyToDay(
    idEventDay: number,
    data: EventDayCompanyPayload,
  ): Observable<{ link: unknown }> {
    return this.api.post<{ link: unknown }>(`/events/days/${idEventDay}/companies`, data);
  }

  removeCompanyFromDay(idEventDayCompany: number): Observable<{ removed: unknown }> {
    return this.api.delete<{ removed: unknown }>(
      `/events/days/companies/${idEventDayCompany}`,
    );
  }

  syncCompanyPhases(
    idEvent: number,
    idCompany: number,
    phases: string[],
  ): Observable<{ event: EventDetail }> {
    return this.api.put<{ event: EventDetail }>(
      `/events/${idEvent}/companies/${idCompany}/phases`,
      { phases },
    );
  }

  removeCompanyFromEvent(
    idEvent: number,
    idCompany: number,
  ): Observable<{ removed: { id_event: number; id_company: number; removed_links: number[] } }> {
    return this.api.delete<{
      removed: { id_event: number; id_company: number; removed_links: number[] };
    }>(`/events/${idEvent}/companies/${idCompany}`);
  }

  previewCompanyCredentialsBulk(
    idEvent: number,
    idCompany: number,
    file: File,
  ): Observable<{
    previewId: string;
    summary: { total: number; create: number; link: number; update: number; error: number };
    rows: Array<{
      line: number;
      status: string;
      incoming: { name?: string; document?: string; role?: string };
      message?: string;
    }>;
  }> {
    const form = new FormData();
    form.append('file', file);
    return this.api.postFormData(`/events/${idEvent}/companies/${idCompany}/credentials/bulk/preview`, form);
  }

  commitCompanyCredentialsBulk(
    idEvent: number,
    idCompany: number,
    previewId: string,
    decisions: Array<{ line: number; action: 'create' | 'link' | 'skip' }>,
  ): Observable<{
    created: number;
    linked: number;
    skipped: number;
    credentialsCreated: number;
    errors: Array<{ line: number; reason: string }>;
  }> {
    return this.api.post(`/events/${idEvent}/companies/${idCompany}/credentials/bulk/commit`, {
      previewId,
      decisions,
    });
  }

  listVehicleCounts(idEvent: number): Observable<{ counts: Record<number, number> }> {
    return this.api.get<{ counts: Record<number, number> }>(`/events/${idEvent}/vehicle-counts`);
  }

  listCompanyVehicles(
    idEvent: number,
    idCompany: number,
  ): Observable<{ vehicles: EventCompanyVehicleItem[] }> {
    return this.api.get<{ vehicles: EventCompanyVehicleItem[] }>(
      `/events/${idEvent}/companies/${idCompany}/vehicles`,
    );
  }

  addCompanyVehicle(
    idEvent: number,
    idCompany: number,
    id_vehicle: number,
  ): Observable<{ vehicle: EventCompanyVehicleItem; created: number; skipped: number }> {
    return this.api.post(`/events/${idEvent}/companies/${idCompany}/vehicles`, { id_vehicle });
  }

  removeCompanyVehicle(
    idEvent: number,
    idCompany: number,
    idVehicle: number,
  ): Observable<{ removed: boolean; id_vehicle: number; count: number }> {
    return this.api.delete(`/events/${idEvent}/companies/${idCompany}/vehicles/${idVehicle}`);
  }

  downloadCompanyBulkTemplate(idEvent: number, idCompany: number): Observable<Blob> {
    return this.api.getBlob(`/events/${idEvent}/companies/${idCompany}/bulk-import/template`);
  }

  previewCompanyBulkImport(idEvent: number, idCompany: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkPreviewResult
    >(`/events/${idEvent}/companies/${idCompany}/bulk-import/preview`, form);
  }

  confirmCompanyBulkImport(
    idEvent: number,
    idCompany: number,
    previewToken: string,
    decisoes: import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmBody['decisoes'],
  ) {
    return this.api.post<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmResult
    >(`/events/${idEvent}/companies/${idCompany}/bulk-import/confirm`, {
      previewToken,
      decisoes,
    });
  }

  private buildParams(page: number, limit: number, filters: EventListFilters): HttpParams {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.name?.trim()) params = params.set('name', filters.name.trim());
    return params;
  }
}

export function formatDateBr(iso: string): string {
  if (!iso) return '—';
  const part = String(iso).slice(0, 10);
  const [y, m, d] = part.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
