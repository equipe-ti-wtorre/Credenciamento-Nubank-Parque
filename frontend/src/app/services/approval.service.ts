import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type ApprovalEntityType = 'EVENTO' | 'ACESSO_SERVICO';
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

export interface ApprovalEntityCollaborator {
  id: number;
  idCollaborator: number;
  nome: string;
  documento: string;
  funcao: string;
  picture?: string | null;
  criadoEm?: string | null;
  statusLiberacao?: ApprovalLiberacaoStatus;
}

export interface ApprovalEntityVehicle {
  id: number;
  idVehicle: number;
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  criadoEm?: string | null;
  statusLiberacao?: ApprovalLiberacaoStatus;
}

export interface ApprovalEntityDetail {
  tipo: ApprovalEntityType;
  id: number;
  nome: string | null;
  startDate: string | null;
  endDate: string | null;
  empresa: string | null;
  departamento: string | null;
  observacao: string | null;
  criadoEm?: string | null;
  atualizadoEm?: string | null;
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

@Injectable({ providedIn: 'root' })
export class ApprovalService {
  constructor(private api: ApiService) {}

  listPending(page = 1, pageSize = 20): Observable<ApprovalListResponse> {
    const params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    return this.api.get<ApprovalListResponse>('/approvals/pending', params);
  }

  countPending(): Observable<{ total: number }> {
    return this.api.get<{ total: number }>('/approvals/pending/count');
  }

  listMine(page = 1, pageSize = 20, status?: ApprovalStatus): Observable<ApprovalListResponse> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (status) params = params.set('status', status);
    return this.api.get<ApprovalListResponse>('/approvals/mine', params);
  }

  get(id: number): Observable<{ approval: ApprovalItem }> {
    return this.api.get<{ approval: ApprovalItem }>(`/approvals/${id}`);
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
  return tipo === 'EVENTO' ? 'Evento' : 'Acesso de serviço';
}

export function approvalEntityBadgeClass(tipo: ApprovalEntityType | string): string {
  return tipo === 'EVENTO'
    ? 'bg-violet-100 text-violet-800'
    : 'bg-sky-100 text-sky-800';
}

export function approvalEntityCardAccentClass(tipo: ApprovalEntityType | string): string {
  return tipo === 'EVENTO' ? 'border-l-violet-500' : 'border-l-sky-500';
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
