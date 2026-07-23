import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type CredentialStatusKey = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'DENIED' | 'UNKNOWN' | string;

export type DenialModuleKey = 'credential' | 'service_access' | 'event' | 'document';

export type AccessSourceKey = 'event' | 'service_collaborator' | 'service_vehicle';

export type AccessStatusFilter = 'all' | 'inside' | 'completed';

export interface DashboardMetrics {
  credentialsByStatus: {
    label: string;
    total: number;
    status: CredentialStatusKey;
    id_access_status?: number;
  }[];
  accessesLast7Days: { day: string; total: number }[];
  accessesBySourceToday: {
    event: number;
    service_collaborator: number;
    service_vehicle: number;
  };
  kpis: {
    activeCompanies: number;
    pendingApproval: number;
    accessesToday: number;
    currentlyInside: number;
    denialsLast7Days: number;
    unreadAlerts: number;
    pendingWorkflowApprovals: number;
    expiredCredentials: number;
    activeEvents: number;
  };
  topCompanies: { label: string; total: number }[];
  summary_by_status: {
    aprovados: number;
    aguardando: number;
    negados: number;
    expirados: number;
  };
  workflow: {
    pending: number;
    approved: number;
    rejected: number;
    approvalRate: number | null;
    avgApprovalHours: number | null;
  };
  masters: {
    activeCollaborators: number;
    activeVehicles: number;
    blacklistedCollaborators: number;
    blacklistedVehicles: number;
    pendingDocumentChanges: number;
    companiesByType: { label: string; total: number }[];
  };
}

export interface DenialReportItem {
  module_key: DenialModuleKey | string;
  module_label: string;
  id_denial: number;
  denied_at: string;
  collaborator_name: string;
  collaborator_document: string;
  context_name: string;
  company_fancy_name: string;
  status_at_denial: string;
  reason: string;
}

export interface DenialReportFilters {
  id_event?: number | string;
  date_from?: string;
  date_to?: string;
  module?: DenialModuleKey | string;
}

export interface AccessReportItem {
  source_key: AccessSourceKey | string;
  source_label: string;
  person_or_vehicle: string;
  document_or_plate: string;
  company_fancy_name: string;
  context_name: string;
  check_in: string;
  check_out: string | null;
  access_id: string;
  id_event: number | null;
  id_service_access: number | null;
  id_company: number | null;
}

export interface AccessReportSummary {
  total: number;
  inside: number;
  completed: number;
  by_source: {
    event: number;
    service_collaborator: number;
    service_vehicle: number;
  };
}

export interface AccessReportFilters {
  id_event?: number | string;
  id_company?: number | string;
  date_from?: string;
  date_to?: string;
  source?: AccessSourceKey | string;
  status?: AccessStatusFilter | string;
  q?: string;
}

export interface AccessReportResponse {
  data: AccessReportItem[];
  summary: AccessReportSummary;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private api: ApiService) {}

  getDashboard(): Observable<DashboardMetrics> {
    return this.api.get<DashboardMetrics>('/reports/dashboard');
  }

  getDenials(filters: DenialReportFilters = {}): Observable<{ data: DenialReportItem[] }> {
    return this.api.get<{ data: DenialReportItem[] }>(
      '/reports/denials',
      this.buildParams(filters),
    );
  }

  getAccesses(filters: AccessReportFilters = {}): Observable<AccessReportResponse> {
    return this.api.get<AccessReportResponse>('/reports/accesses', this.buildParams(filters));
  }

  exportAccesses(filters: AccessReportFilters = {}): Observable<Blob> {
    return this.api.getBlob('/reports/accesses/export', this.buildParams(filters));
  }

  private buildParams(
    filters: DenialReportFilters | AccessReportFilters | Record<string, unknown>,
  ): HttpParams {
    let params = new HttpParams();
    Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params = params.set(key, String(value).trim());
      }
    });
    return params;
  }
}
