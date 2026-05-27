import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface DashboardMetrics {
  credentialsByStatus: { label: string; total: number }[];
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
