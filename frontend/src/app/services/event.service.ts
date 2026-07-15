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
  criado_em?: string;
  atualizado_em?: string;
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
  days?: EventDayInput[];
}

export interface EventDayCompanyPayload {
  id_company: number;
  id_producer?: number | null;
}

@Injectable({ providedIn: 'root' })
export class EventService {
  constructor(private api: ApiService) {}

  listTypes(): Observable<{ types: EventDayType[] }> {
    return this.api.get<{ types: EventDayType[] }>('/events/types');
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
    data: { start: string; end: string },
  ): Observable<{ event: EventDetail }> {
    return this.api.patch<{ event: EventDetail }>(`/events/${id}/period`, data);
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
