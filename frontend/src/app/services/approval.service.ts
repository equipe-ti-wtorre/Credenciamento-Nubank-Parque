import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type ApprovalEntityType =
  | 'EVENTO'
  | 'ACESSO_SERVICO'
  | 'CREDENCIAMENTO_EVENTO'
  | 'CREDENCIAMENTO_EVENTO_INTERNO';
export type ApprovalStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'CANCELADO' | 'EXPIRADO';

export type ApprovalHistoryType =
  | 'CRIACAO'
  | 'INSERCAO_DADOS'
  | 'ALTERACAO'
  | 'APROVACAO'
  | 'REPROVACAO'
  | 'CANCELAMENTO';

export interface ApprovalSectorBrief {
  id: number;
  nome: string;
}

export interface ApprovalUserBrief {
  id: number;
  nome: string | null;
  empresa?: string | null;
}

export interface ApprovalDecision {
  id: number;
  nivel: number;
  usuario: ApprovalUserBrief;
  decisao: 'APROVADO' | 'REPROVADO';
  comentario: string | null;
  decididoEm: string;
}

export interface ApprovalEntityResumo {
  nome: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ApprovalLiberacaoAxis {
  liberados: number;
  bloqueados: number;
  total: number;
}

export interface ApprovalLiberacaoResumo {
  colaboradores: ApprovalLiberacaoAxis;
  veiculos: ApprovalLiberacaoAxis;
}

export type ApprovalLiberacaoStatus = 'APROVADO' | 'BLOQUEADO' | 'REPROVADO' | 'PENDENTE';

export interface ApprovalBraceletType {
  id_bracelet_type: number;
  name: string;
  icon?: string | null;
  color?: string | null;
}

export interface ApprovalEntityCollaborator {
  /** public_id (UUID) da linha de vínculo — é o valor enviado em approvedCollaboratorIds. */
  id: number;
  public_id?: string;
  idCollaborator: number;
  nome: string;
  documento: string;
  funcao: string;
  picture?: string | null;
  empresa?: string | null;
  fase?: string | null;
  pulseira?: string | null;
  idBraceletType?: number | null;
  braceletIcon?: string | null;
  braceletColor?: string | null;
  dataDia?: string | null;
  criadoEm?: string | null;
  statusLiberacao?: ApprovalLiberacaoStatus;
}

export interface ApprovalEntityVehicle {
  /** public_id (UUID) da linha de vínculo — é o valor enviado em approvedVehicleIds. */
  id: number;
  public_id?: string;
  idVehicle: number;
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  empresa?: string | null;
  fase?: string | null;
  dataDia?: string | null;
  criadoEm?: string | null;
  statusLiberacao?: ApprovalLiberacaoStatus;
}

export interface ApprovalEntityDetail {
  tipo: ApprovalEntityType;
  id: number;
  idAccreditation?: number | null;
  nome: string | null;
  startDate: string | null;
  endDate: string | null;
  empresa: string | null;
  departamento: string | null;
  observacao: string | null;
  criadoEm?: string | null;
  atualizadoEm?: string | null;
  braceletTypes?: ApprovalBraceletType[];
  collaborators: ApprovalEntityCollaborator[];
  vehicles: ApprovalEntityVehicle[];
}

export interface ApprovalHistoryItem {
  tipo: ApprovalHistoryType;
  titulo: string;
  data: string;
  usuario: ApprovalUserBrief | null;
  detalhe?: string | null;
}

export interface ApprovalItem {
  id: number;
  tipoEntidade: ApprovalEntityType;
  idEntidade: number;
  setor: ApprovalSectorBrief;
  solicitante: ApprovalUserBrief;
  nivelAtual: number;
  niveisExigidos: number;
  /** Quantidade de ciclos da mesma entidade. Reenvio quando maior que 1. */
  ciclo?: number;
  status: ApprovalStatus;
  criadoEm: string;
  finalizadoEm: string | null;
  entidadeResumo?: ApprovalEntityResumo | null;
  liberacaoResumo?: ApprovalLiberacaoResumo | null;
  entidade?: ApprovalEntityDetail | null;
  decisoes?: ApprovalDecision[];
  historico?: ApprovalHistoryItem[];
}

export interface EligibleSector {
  id: number;
  nome: string;
  niveisExigidos: number;
}

export interface ApprovalListResponse {
  data: ApprovalItem[];
  pagination: { page: number; pageSize: number; total: number };
}

/**
 * A API expõe os itens da entidade (colaboradores/veículos) com `public_id` da linha de
 * vínculo e sem `id` numérico. O adaptador global não preenche `id` para colaboradores
 * (a heurística por `documento` grava em `id_collaborator`), então normalizamos aqui:
 * `id` passa a ser o UUID, que é o que a aprovação seletiva envia de volta.
 */
function normalizeEntityItem<T extends { id: number; public_id?: string }>(item: T): T {
  if (item && item.id == null && item.public_id) {
    return { ...item, id: item.public_id as unknown as number };
  }
  return item;
}

export function normalizeApprovalItem(item: ApprovalItem): ApprovalItem {
  const entidade = item?.entidade;
  if (!entidade) return item;
  return {
    ...item,
    entidade: {
      ...entidade,
      collaborators: (entidade.collaborators ?? []).map(normalizeEntityItem),
      vehicles: (entidade.vehicles ?? []).map(normalizeEntityItem),
    },
  };
}

function normalizeList(res: ApprovalListResponse): ApprovalListResponse {
  return { ...res, data: (res.data ?? []).map(normalizeApprovalItem) };
}

@Injectable({ providedIn: 'root' })
export class ApprovalService {
  constructor(private api: ApiService) {}

  listPending(page = 1, pageSize = 20): Observable<ApprovalListResponse> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    return this.api.get<ApprovalListResponse>('/approvals/pending', params).pipe(map(normalizeList));
  }

  countPending(): Observable<{ total: number }> {
    return this.api.get<{ total: number }>('/approvals/pending/count');
  }

  listMine(page = 1, pageSize = 20, status?: ApprovalStatus): Observable<ApprovalListResponse> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (status) params = params.set('status', status);
    return this.api.get<ApprovalListResponse>('/approvals/mine', params).pipe(map(normalizeList));
  }

  listTeam(page = 1, pageSize = 20, status?: ApprovalStatus): Observable<ApprovalListResponse> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (status) params = params.set('status', status);
    return this.api.get<ApprovalListResponse>('/approvals/team', params).pipe(map(normalizeList));
  }

  get(id: number): Observable<{ approval: ApprovalItem }> {
    return this.api
      .get<{ approval: ApprovalItem }>(`/approvals/${id}`)
      .pipe(map((res) => ({ ...res, approval: normalizeApprovalItem(res.approval) })));
  }

  approve(
    id: number,
    options: {
      comentario?: string;
      approvedCollaboratorIds?: number[];
      approvedVehicleIds?: number[];
    } = {},
  ): Observable<{ result: unknown }> {
    return this.api.post(`/approvals/${id}/approve`, {
      comentario: options.comentario || null,
      approvedCollaboratorIds: options.approvedCollaboratorIds,
      approvedVehicleIds: options.approvedVehicleIds,
    });
  }

  reject(id: number, comentario: string): Observable<{ result: unknown }> {
    return this.api.post(`/approvals/${id}/reject`, { comentario });
  }

  cancel(id: number, comentario?: string): Observable<{ result: unknown }> {
    return this.api.post(`/approvals/${id}/cancel`, { comentario: comentario || null });
  }

  listEligibleSectors(tipoEntidade: ApprovalEntityType): Observable<{ sectors: EligibleSector[] }> {
    return this.api.get<{ sectors: EligibleSector[] }>(`/approvals/sectors/${tipoEntidade}`);
  }
}

export function approvalStatusBadgeClass(status: ApprovalStatus | string): string {
  switch (status) {
    case 'APROVADO':
      return 'bg-emerald-100 text-emerald-800';
    case 'REPROVADO':
      return 'bg-red-100 text-red-800';
    case 'CANCELADO':
    case 'EXPIRADO':
      return 'bg-slate-100 text-slate-600';
    case 'PENDENTE':
    default:
      return 'bg-amber-100 text-amber-800';
  }
}

export function approvalStatusLabel(status: ApprovalStatus | string): string {
  switch (status) {
    case 'APROVADO':
      return 'Aprovado';
    case 'REPROVADO':
      return 'Reprovado';
    case 'CANCELADO':
      return 'Cancelado';
    case 'EXPIRADO':
      return 'Tempo de autorização expirada';
    case 'PENDENTE':
    default:
      return 'Pendente';
  }
}

export function liberacaoStatusLabel(status?: ApprovalLiberacaoStatus | string | null): string {
  switch (status) {
    case 'APROVADO':
      return 'Aprovado';
    case 'BLOQUEADO':
      return 'Bloqueado';
    case 'REPROVADO':
      return 'Reprovado';
    case 'PENDENTE':
    default:
      return 'Pendente';
  }
}

export function liberacaoStatusBadgeClass(status?: ApprovalLiberacaoStatus | string | null): string {
  switch (status) {
    case 'APROVADO':
      return 'bg-emerald-100 text-emerald-800';
    case 'BLOQUEADO':
    case 'REPROVADO':
      return 'bg-red-100 text-red-800';
    case 'PENDENTE':
    default:
      return 'bg-amber-100 text-amber-800';
  }
}

export function approvalEntityLabel(tipo: ApprovalEntityType | string): string {
  if (tipo === 'EVENTO') return 'Evento';
  if (tipo === 'CREDENCIAMENTO_EVENTO') return 'Credenciamento';
  if (tipo === 'CREDENCIAMENTO_EVENTO_INTERNO') return 'Credenciamento (internos)';
  return 'Acesso de serviço';
}

export function approvalEntityBadgeClass(tipo: ApprovalEntityType | string): string {
  if (tipo === 'EVENTO') return 'bg-violet-100 text-violet-800';
  if (tipo === 'CREDENCIAMENTO_EVENTO') return 'bg-amber-100 text-amber-800';
  if (tipo === 'CREDENCIAMENTO_EVENTO_INTERNO') return 'bg-violet-100 text-violet-800';
  return 'bg-sky-100 text-sky-800';
}

export function approvalEntityCardAccentClass(tipo: ApprovalEntityType | string): string {
  if (tipo === 'EVENTO') return 'border-l-violet-500';
  if (tipo === 'CREDENCIAMENTO_EVENTO') return 'border-l-amber-500';
  if (tipo === 'CREDENCIAMENTO_EVENTO_INTERNO') return 'border-l-violet-500';
  return 'border-l-sky-500';
}

export function approvalItemTitle(item: ApprovalItem): string {
  const nome = item.entidadeResumo?.nome || item.entidade?.nome;
  if (nome) return nome;
  return `${approvalEntityLabel(item.tipoEntidade)} #${item.idEntidade}`;
}

export function approvalHistoryDotClass(tipo: ApprovalHistoryType | string): string {
  switch (tipo) {
    case 'APROVACAO':
      return 'bg-emerald-500';
    case 'REPROVACAO':
      return 'bg-red-500';
    case 'CANCELAMENTO':
      return 'bg-slate-400';
    case 'ALTERACAO':
      return 'bg-amber-500';
    case 'INSERCAO_DADOS':
      return 'bg-sky-500';
    case 'CRIACAO':
    default:
      return 'bg-[var(--color-primary)]';
  }
}

const PUBLIC_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toPositiveId(id: number | string | null | undefined): number | null {
  if (typeof id === 'string' && PUBLIC_ID_RE.test(id.trim())) return id.trim() as never;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function toPositiveIdSet(
  ids: Array<number | string | null | undefined> | null | undefined,
): Set<number> {
  const set = new Set<number>();
  for (const raw of ids || []) {
    const n = toPositiveId(raw);
    if (n != null) set.add(n);
  }
  return set;
}
