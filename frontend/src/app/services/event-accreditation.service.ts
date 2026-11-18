import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type EventAccreditationInviteStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'SKIPPED';
export type EventAccreditationInviteMode = 'now' | 'schedule' | 'skip';

export interface EventAccreditationInviteFile {
  id_event_accreditation_invite_file: number;
  original_name: string;
  filename: string;
  mime: string;
  size_bytes: number;
  criado_em?: string;
}

export interface EventAccreditationInvite {
  id_event_accreditation_invite: number;
  id_event_accreditation: number;
  subject: string;
  html: string;
  send_at?: string | null;
  sent_at?: string | null;
  status: EventAccreditationInviteStatus;
  files: EventAccreditationInviteFile[];
}

export type EventAccreditationKind = 'SHOWDAY' | 'JOGO';
export type BraceletKind = 'SHOWDAY' | 'JOGO' | 'BOTH';
export type IndicationStatus = 'INDICACAO' | 'AGUARDANDO_APROVACAO' | 'APROVADO' | 'NEGADO';

export interface BraceletType {
  id_bracelet_type: number;
  name: string;
  event_kind: BraceletKind;
  icon?: string;
  color?: string;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface AccreditationCompanyBrief {
  id_company: number;
  company_name: string;
  fancy_name?: string | null;
  cnpj?: string | null;
  status?: boolean;
}

export type AccreditationDecideAction = 'approve' | 'block' | 'unblock';

export const BLOCK_REASONS = [
  'Documento divergente',
  'Sem antecedente liberado',
  'Foto reprovada',
  'Fora do escopo do evento',
  'Bloqueio permanente (histórico)',
  'Outro',
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

export interface AccreditationCollaborator {
  id_event_accreditation_collaborator: number;
  id_event_accreditation_company: number;
  id_collaborator: number;
  id_collaborator_role: number;
  id_bracelet_type: number;
  id_access_status: number;
  access_status_description: string | null;
  collaborator_name: string;
  collaborator_document: string;
  collaborator_picture?: string | null;
  role_description: string;
  bracelet_name: string;
  bracelet_kind: BraceletKind;
  bracelet_icon?: string;
  bracelet_color?: string;
  criado_em?: string;
  decided_by?: number | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_reason?: string | null;
}

export interface AccreditationSector {
  id_setor: number;
  nome: string;
  approvers_count?: number;
  can_add_companies?: boolean;
  can_notify_companies?: boolean;
}

export interface AccreditationCompany {
  id_event_accreditation_company: number;
  id_company: number;
  id_setor?: number | null;
  setor_nome?: string | null;
  company_name: string;
  fancy_name?: string | null;
  logo?: string | null;
  indication_status: IndicationStatus;
  indicated_complete_at: string | null;
  id_aprovacao: number | null;
  aprovacao_status: string | null;
  can_indicate: boolean;
  can_complete: boolean;
  can_notify_sector?: boolean;
  can_notify_owner?: boolean;
  missing_photo_count?: number;
  can_decide?: boolean;
  can_remove?: boolean;
  collaborators: AccreditationCollaborator[];
}

export interface EventAccreditationKpis {
  companies_total: number;
  companies_pending: number;
  companies_waiting: number;
  companies_approved: number;
  companies_denied: number;
  collaborators_total: number;
  collaborators_waiting: number;
  collaborators_approved: number;
  collaborators_denied: number;
  internals_total?: number;
  internals_waiting?: number;
  internals_approved?: number;
  internals_denied?: number;
}

export interface AccreditationInternal {
  id_event_accreditation_internal: number;
  id_event_accreditation: number;
  id_usuario: number;
  nome_completo: string;
  email: string;
  departamento: string | null;
  id_bracelet_type: number;
  bracelet_name: string;
  bracelet_kind: BraceletKind;
  bracelet_icon?: string;
  bracelet_color?: string;
  id_access_status: number;
  access_status_description: string | null;
  criado_em?: string;
  decided_by?: number | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_reason?: string | null;
}

export interface EventAccreditationItem {
  public_id?: string;
  id_event_accreditation: number;
  name: string;
  event_kind: EventAccreditationKind;
  start: string;
  end: string;
  event_dates?: string[];
  inscription_start: string;
  inscription_end: string;
  inscription_open: boolean;
  id_access_status: number | null;
  access_status_description: string | null;
  id_setor: number | null;
  setor_nome?: string | null;
  setores?: AccreditationSector[];
  id_solicitante?: number | null;
  id_company_responsavel?: number | null;
  company_responsavel?: AccreditationCompanyBrief | null;
  ativo: boolean;
  internal_enabled?: boolean;
  photo_required?: boolean;
  cover?: string | null;
  cover_url?: string | null;
  cover_thumb?: string | null;
  criado_em?: string;
  atualizado_em?: string;
  bracelet_types?: BraceletType[];
  internal_bracelet_types?: BraceletType[];
  companies?: AccreditationCompany[];
  internals?: AccreditationInternal[];
  my_internal?: AccreditationInternal | null;
  my_internals?: AccreditationInternal[];
  can_register_internal?: boolean;
  kpis?: EventAccreditationKpis;
  setor_approvers_count?: number;
  can_manage?: boolean;
  can_decide?: boolean;
  can_decide_internal?: boolean;
  can_notify?: boolean;
  can_toggle_active?: boolean;
  can_delete?: boolean;
  can_export?: boolean;
  cycle_complete?: boolean;
  companies_total?: number;
  companies_completed?: number;
  pending_count?: number;
}

export type EventAccreditationListSituation = 'todos' | 'abertos' | 'encerrados';
export type EventAccreditationListSort = 'nome' | 'data' | 'prazo';

export interface EventAccreditationListFilters {
  name?: string;
  event_kind?: string;
  id_access_status?: number | null;
  situation?: EventAccreditationListSituation;
  sort?: EventAccreditationListSort;
  dir?: 'asc' | 'desc';
}

export interface EventAccreditationFilterCounts {
  todos: number;
  abertos: number;
  encerrados: number;
}

export interface EventAccreditationListResponse {
  items: EventAccreditationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filter_counts?: EventAccreditationFilterCounts;
}

export interface EventAccreditationCreatePayload {
  name: string;
  event_kind: EventAccreditationKind;
  start: string;
  end: string;
  event_dates?: string[];
  inscription_start: string;
  inscription_end: string;
  id_setor?: number;
  setores: number[];
  companies?: number[];
  bracelet_types: number[];
  internal_enabled?: boolean;
  photo_required?: boolean;
  internal_bracelet_types?: number[];
}

export function formatDateBr(value?: string | null): string {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

export function normalizeEventDates(
  dates?: string[] | null,
  start?: string | null,
  end?: string | null,
): string[] {
  const raw = dates?.length ? dates : [start, end].filter(Boolean);
  return [
    ...new Set(
      raw
        .map((value) => String(value || '').slice(0, 10))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    ),
  ].sort();
}

export function formatEventDatesBr(
  dates?: string[] | null,
  start?: string | null,
  end?: string | null,
): string {
  const list = normalizeEventDates(dates, start, end);
  if (!list.length) return '—';
  if (list.length === 1) return formatDateBr(list[0]);
  if (list.length === 2) return `${formatDateBr(list[0])} e ${formatDateBr(list[1])}`;
  const first = Date.parse(`${list[0]}T00:00:00`);
  const last = Date.parse(`${list[list.length - 1]}T00:00:00`);
  const spanDays = Math.round((last - first) / 86400000) + 1;
  if (spanDays === list.length) {
    return `${formatDateBr(list[0])} → ${formatDateBr(list[list.length - 1])}`;
  }
  const head = list.slice(0, -1).map(formatDateBr).join(', ');
  return `${head} e ${formatDateBr(list[list.length - 1])}`;
}

export function formatDateTimeBr(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function kindLabel(kind?: string | null): string {
  if (kind === 'JOGO') return 'Jogo';
  if (kind === 'SHOWDAY') return 'Showday';
  if (kind === 'BOTH') return 'Showday e Jogo';
  return kind || '—';
}

export function indicationLabel(status?: string | null): string {
  switch (status) {
    case 'INDICACAO':
      return 'Em indicação';
    case 'AGUARDANDO_APROVACAO':
      return 'Aguardando aprovação';
    case 'APROVADO':
      return 'Aprovado';
    case 'NEGADO':
      return 'Negado';
    default:
      return status || '—';
  }
}

export function isCollaboratorPending(status?: number | null): boolean {
  const st = Number(status);
  return st === 1 || st === 2;
}

export function isCollaboratorApproved(status?: number | null): boolean {
  return Number(status) === 3;
}

export function isCollaboratorBlocked(status?: number | null): boolean {
  const st = Number(status);
  return st === 4 || st === 5;
}

@Injectable({ providedIn: 'root' })
export class EventAccreditationService {
  constructor(private api: ApiService) {}

  list(
    page = 1,
    limit = 20,
    filters: EventAccreditationListFilters = {},
  ): Observable<EventAccreditationListResponse> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.name) params = params.set('name', filters.name);
    if (filters.event_kind) params = params.set('event_kind', filters.event_kind);
    if (filters.id_access_status) {
      params = params.set('id_access_status', String(filters.id_access_status));
    }
    if (filters.situation && filters.situation !== 'todos') {
      params = params.set('situation', filters.situation);
    }
    if (filters.sort) params = params.set('sort', filters.sort);
    if (filters.dir) params = params.set('dir', filters.dir);
    return this.api.get<EventAccreditationListResponse>('/event-accreditations', params);
  }

  get(id: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.get<{ item: EventAccreditationItem }>(`/event-accreditations/${id}`);
  }

  create(payload: EventAccreditationCreatePayload): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>('/event-accreditations', payload);
  }

  duplicate(id: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(`/event-accreditations/${id}/duplicate`, {});
  }

  update(id: number, payload: Partial<EventAccreditationCreatePayload>): Observable<{ item: EventAccreditationItem }> {
    return this.api.patch<{ item: EventAccreditationItem }>(`/event-accreditations/${id}`, payload);
  }

  patchStatus(id: number, ativo: boolean): Observable<{ item: EventAccreditationItem }> {
    return this.api.patch<{ item: EventAccreditationItem }>(`/event-accreditations/${id}/status`, {
      ativo,
    });
  }

  remove(id: number): Observable<{
    removed: { deleted: boolean; id_event_accreditation: number; name: string };
  }> {
    return this.api.delete<{
      removed: { deleted: boolean; id_event_accreditation: number; name: string };
    }>(`/event-accreditations/${id}`);
  }

  addCollaborator(
    id: number,
    idCompany: number,
    payload: {
      id_collaborator: number;
      id_collaborator_role: number;
      id_bracelet_type: number | string;
    },
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/companies/${idCompany}/collaborators`,
      payload,
    );
  }

  downloadCompanyBulkTemplate(id: number, idCompany: number): Observable<Blob> {
    return this.api.getBlob(
      `/event-accreditations/${id}/companies/${idCompany}/bulk-import/template`,
    );
  }

  bulkImportPreview(id: number, idCompany: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkPreviewResult
    >(`/event-accreditations/${id}/companies/${idCompany}/bulk-import/preview`, form);
  }

  bulkImportConfirm(
    id: number,
    idCompany: number,
    previewToken: string,
    decisoes: import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmBody['decisoes'],
  ) {
    return this.api.post<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmResult
    >(`/event-accreditations/${id}/companies/${idCompany}/bulk-import/confirm`, {
      previewToken,
      decisoes,
    });
  }

  removeCollaborator(
    id: number,
    idCompany: number,
    linkId: number,
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.delete<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/companies/${idCompany}/collaborators/${linkId}`,
    );
  }

  completeCompany(id: number, idCompany: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/companies/${idCompany}/complete`,
      {},
    );
  }

  listSectors(): Observable<{ sectors: { id: number; nome: string }[] }> {
    return this.api.get<{ sectors: { id: number; nome: string }[] }>('/event-accreditations/sectors');
  }

  addSectorCompanies(
    id: number,
    idSetor: number,
    companies: number[],
  ): Observable<{ item: EventAccreditationItem; added: number }> {
    return this.api.post<{ item: EventAccreditationItem; added: number }>(
      `/event-accreditations/${id}/sectors/${idSetor}/companies`,
      { companies },
    );
  }

  removeSectorCompany(
    id: number,
    idSetor: number,
    idCompany: number,
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.delete<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/sectors/${idSetor}/companies/${idCompany}`,
    );
  }

  notifySectorCompanies(
    id: number,
    idSetor: number,
    payload: { id_company?: number } = {},
  ): Observable<{ item: EventAccreditationItem; sent: number; companies: number }> {
    return this.api.post<{ item: EventAccreditationItem; sent: number; companies: number }>(
      `/event-accreditations/${id}/sectors/${idSetor}/notify-companies`,
      payload,
    );
  }

  notifySectorIndication(id: number, idCompany: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/companies/${idCompany}/notify-sector`,
      {},
    );
  }

  notifyOwnerValidated(id: number, idCompany: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/companies/${idCompany}/notify-owner`,
      {},
    );
  }

  registerInternal(
    id: number,
    payload: { id_bracelet_type?: number; id_bracelet_types?: number[] },
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/internal/register`,
      payload,
    );
  }

  unregisterInternal(id: number): Observable<{ item: EventAccreditationItem }> {
    return this.api.delete<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/internal/register`,
    );
  }

  changeBracelet(
    id: number,
    payload: {
      target: 'company' | 'internal';
      id?: number | string;
      ids?: Array<number | string>;
      id_bracelet_type: number | string;
    },
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.patch<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/collaborators/bracelet`,
      payload,
    );
  }

  decideCollaborators(
    id: number,
    payload: {
      action: AccreditationDecideAction;
      ids: number[];
      reason?: string;
      note?: string;
      target?: 'company' | 'internal';
    },
  ): Observable<{ item: EventAccreditationItem }> {
    return this.api.post<{ item: EventAccreditationItem }>(
      `/event-accreditations/${id}/collaborators/decide`,
      payload,
    );
  }

  notifyCompanies(
    id: number,
    payload: { id_company?: number } = {},
  ): Observable<{ item: EventAccreditationItem; sent: number; companies: number }> {
    return this.api.post<{ item: EventAccreditationItem; sent: number; companies: number }>(
      `/event-accreditations/${id}/notify-companies`,
      payload,
    );
  }

  uploadCover(id: number, file: File): Observable<{ item: EventAccreditationItem; cover: string }> {
    const form = new FormData();
    form.append('cover', file, file.name);
    return this.api.postFormData<{ item: EventAccreditationItem; cover: string }>(
      `/event-accreditations/${id}/cover`,
      form,
    );
  }

  getCoverBlob(filename: string): Observable<string> {
    const name = String(filename || '').split(/[/\\]/).pop() || '';
    const params = new HttpParams().set('filename', name);
    return this.api.getImageDataUrl('/storage/event-accreditation-covers', params);
  }

  getInvite(id: number): Observable<{ invite: EventAccreditationInvite; item: EventAccreditationItem }> {
    return this.api.get<{ invite: EventAccreditationInvite; item: EventAccreditationItem }>(
      `/event-accreditations/${id}/invite`,
    );
  }

  saveInvite(
    id: number,
    payload: { subject: string; html: string },
  ): Observable<{ invite: EventAccreditationInvite }> {
    return this.api.put<{ invite: EventAccreditationInvite }>(`/event-accreditations/${id}/invite`, payload);
  }

  uploadInviteFile(id: number, file: File): Observable<{ invite: EventAccreditationInvite }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<{ invite: EventAccreditationInvite }>(
      `/event-accreditations/${id}/invite/files`,
      form,
    );
  }

  deleteInviteFile(id: number, fileId: number): Observable<{ invite: EventAccreditationInvite }> {
    return this.api.delete<{ invite: EventAccreditationInvite }>(
      `/event-accreditations/${id}/invite/files/${fileId}`,
    );
  }

  sendInvite(
    id: number,
    payload: { mode: EventAccreditationInviteMode },
  ): Observable<{
    invite: EventAccreditationInvite;
    sent: number;
    companies: number;
    scheduled?: boolean;
    send_at?: string;
    item: EventAccreditationItem;
  }> {
    return this.api.post(`/event-accreditations/${id}/invite/send`, payload);
  }

  exportXlsx(id: number): Observable<Blob> {
    return this.api.getBlob(`/event-accreditations/${id}/export`);
  }

  listCompanies(): Observable<{ companies: AccreditationCompanyBrief[] }> {
    return this.api.get<{ companies: AccreditationCompanyBrief[] }>('/event-accreditations/companies');
  }

  listBraceletTypes(opts: { event_kind?: string; includeInactive?: boolean } = {}): Observable<{
    types: BraceletType[];
  }> {
    let params = new HttpParams();
    if (opts.event_kind) params = params.set('event_kind', opts.event_kind);
    if (opts.includeInactive) params = params.set('includeInactive', '1');
    return this.api.get<{ types: BraceletType[] }>('/event-accreditations/bracelet-types', params);
  }

  createBraceletType(payload: {
    name: string;
    event_kind: BraceletKind;
    icon?: string;
    color?: string;
    ativo?: boolean;
  }): Observable<{ type: BraceletType }> {
    return this.api.post<{ type: BraceletType }>('/event-accreditations/bracelet-types', payload);
  }

  updateBraceletType(
    id: number,
    payload: Partial<{ name: string; event_kind: BraceletKind; icon: string; color: string; ativo: boolean }>,
  ): Observable<{ type: BraceletType }> {
    return this.api.patch<{ type: BraceletType }>(`/event-accreditations/bracelet-types/${id}`, payload);
  }
}
