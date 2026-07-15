import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type CredentialStatusKey = 'ACTIVE' | 'PENDING' | 'EXPIRED' | string;

export interface DashboardMetrics {
  /**
   * `status` e a chave estavel (enum) usada para colorir o donut do dashboard.
   * Enquanto a API nao a enviar, o front normaliza a partir de `label`.
   * TODO(api): expor `status` no endpoint /reports/dashboard.
   */
  credentialsByStatus: { label: string; total: number; status?: CredentialStatusKey }[];
  accessesLast7Days: { day: string; total: number }[];
  kpis: {
    activeCompanies: number;
    pendingApproval: number;
    accessesToday: number;
  };
  topCompanies: { label: string; total: number }[];
}

export interface DenialReportItem {
  id_denial: number;
  denied_at: string;
  collaborator_name: string;
  collaborator_document: string;
  event_name: string;
  company_fancy_name: string;
  status_at_denial: string;
  reason: string;
}

export interface DenialReportFilters {
  id_event?: number | string;
  date_from?: string;
  date_to?: string;
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
      this.buildDenialParams(filters),
    );
  }

  private buildDenialParams(filters: DenialReportFilters): HttpParams {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params = params.set(key, String(value).trim());
      }
    });
    return params;
  }
}
