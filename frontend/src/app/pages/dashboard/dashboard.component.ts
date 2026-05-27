import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { AuthService } from '../../core/services/auth.service';
import { DashboardMetrics, ReportsService } from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="w-full max-w-6xl">
      <h1 class="page-title">Início</h1>
      <p class="page-subtitle mb-6">Bem-vindo, {{ user?.nome_completo || user?.email }}.</p>

      <div *ngIf="loading()" class="text-slate-500 text-sm">Carregando indicadores...</div>

      <ng-container *ngIf="!loading() && metrics()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div class="card-surface p-4">
            <p class="text-xs font-bold text-slate-500 uppercase">Empresas ativas</p>
            <p class="text-2xl font-bold text-slate-800 mt-1">{{ metrics()!.kpis.activeCompanies }}</p>
          </div>
          <div class="card-surface p-4">
            <p class="text-xs font-bold text-slate-500 uppercase">Aguardando Allianz</p>
            <p class="text-2xl font-bold text-amber-700 mt-1">{{ metrics()!.kpis.pendingAllianz }}</p>
          </div>
          <div class="card-surface p-4">
            <p class="text-xs font-bold text-slate-500 uppercase">Acessos hoje</p>
            <p class="text-2xl font-bold text-emerald-700 mt-1">{{ metrics()!.kpis.accessesToday }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card-surface p-4">
            <h3 class="text-sm font-bold text-slate-600 uppercase mb-4">Credenciais por status</h3>
            <div class="h-64 flex items-center justify-center">
              <canvas
                *ngIf="doughnutData().datasets[0].data.length"
                baseChart
                [data]="doughnutData()"
                [options]="doughnutOptions"
                type="doughnut"
              ></canvas>
              <p *ngIf="!doughnutData().datasets[0].data.length" class="text-slate-400 text-sm">
                Sem dados
              </p>
            </div>
          </div>
          <div class="card-surface p-4">
            <h3 class="text-sm font-bold text-slate-600 uppercase mb-4">Acessos (últimos 7 dias)</h3>
            <div class="h-64">
              <canvas baseChart [data]="barData()" [options]="barOptions" type="bar"></canvas>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  user: Awaited<ReturnType<AuthService['getCurrentUser']>> = null;
  loading = signal(true);
  metrics = signal<DashboardMetrics | null>(null);

  doughnutData = signal<ChartConfiguration<'doughnut'>['data']>({
    labels: [],
    datasets: [{ data: [], backgroundColor: ['#059669', '#d97706', '#dc2626', '#64748b'] }],
  });

  barData = signal<ChartConfiguration<'bar'>['data']>({
    labels: [],
    datasets: [{ label: 'Acessos', data: [], backgroundColor: '#2563eb' }],
  });

  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
  };

  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  constructor(
    private authService: AuthService,
    private reportsService: ReportsService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    this.user = await this.authService.getCurrentUser();
    const role = String(this.user?.role || '').toUpperCase();
    if (['ADMIN', 'PRODUTORA', 'PADRAO'].includes(role)) {
      this.loadMetrics();
    } else {
      this.loading.set(false);
    }
  }

  loadMetrics() {
    this.loading.set(true);
    this.reportsService.getDashboard().subscribe({
      next: (m) => {
        this.metrics.set(m);
        this.doughnutData.set({
          labels: m.credentialsByStatus.map((x) => x.label),
          datasets: [
            {
              data: m.credentialsByStatus.map((x) => x.total),
              backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#94a3b8'],
            },
          ],
        });
        this.barData.set({
          labels: m.accessesLast7Days.map((x) => x.day.slice(5)),
          datasets: [{ label: 'Acessos', data: m.accessesLast7Days.map((x) => x.total), backgroundColor: '#2563eb' }],
        });
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar dashboard.');
      },
    });
  }
}
