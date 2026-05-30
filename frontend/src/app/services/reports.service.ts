import { Injectable } from '@angular/core';
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
    pendingAllianz: number;
    accessesToday: number;
  };
  topCompanies: { label: string; total: number }[];
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private api: ApiService) {}

  getDashboard(): Observable<DashboardMetrics> {
    return this.api.get<DashboardMetrics>('/reports/dashboard');
  }
}
