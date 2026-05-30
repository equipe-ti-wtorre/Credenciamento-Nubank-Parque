import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import {
  MaterialMovement,
  MaterialsDashboard,
  MaterialsService,
  MovementType,
  StockRow,
} from '../../../services/materials.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-merchandise-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="w-full max-w-6xl mx-auto">
      <div class="mb-5">
        <h2 class="page-section-title">Relatórios de mercadorias</h2>
        <p class="page-section-subtitle">Estoque atual, fluxo de entradas/saídas e histórico de movimentações.</p>
      </div>

      <div *ngIf="loadingDashboard()" class="text-slate-500 text-sm mb-4">Carregando indicadores...</div>

      <ng-container *ngIf="!loadingDashboard() && dashboard()">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div class="card-surface p-4">
            <p class="text-xs font-bold text-slate-500 uppercase">
              Entradas ({{ dashboard()!.days }} dias)
            </p>
            <p class="text-2xl font-bold text-emerald-700 mt-1">{{ dashboard()!.totals.entrada }}</p>
          </div>
          <div class="card-surface p-4">
            <p class="text-xs font-bold text-slate-500 uppercase">Saídas ({{ dashboard()!.days }} dias)</p>
            <p class="text-2xl font-bold text-red-700 mt-1">{{ dashboard()!.totals.saida }}</p>
          </div>
        </div>

        <div class="card-surface p-4 mb-6">
          <h3 class="text-sm font-bold text-slate-600 uppercase mb-4">Entradas vs saídas por dia</h3>
          <div class="h-72">
            <canvas baseChart [data]="barData()" [options]="barOptions" type="bar"></canvas>
          </div>
        </div>
      </ng-container>

      <div class="card-surface p-4 mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 class="text-sm font-bold text-slate-600 uppercase">Consultar estoque</h3>
          <button type="button" class="btn-secondary text-sm" (click)="loadStock()" [disabled]="loadingStock()">
            {{ loadingStock() ? 'Atualizando...' : 'Atualizar' }}
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="table-head bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left">Produto</th>
                <th class="px-4 py-3 text-left">Local</th>
                <th class="px-4 py-3 text-left">Tipo</th>
                <th class="px-4 py-3 text-left">Unidade</th>
                <th class="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of stock()" class="border-t border-slate-100">
                <td class="px-4 py-3 font-medium">{{ row.product_description }}</td>
                <td class="px-4 py-3">{{ row.location_name }}</td>
                <td class="px-4 py-3">{{ row.location_type === 'LOJA' ? 'Loja' : 'Depósito' }}</td>
                <td class="px-4 py-3">{{ row.unit_measure }}</td>
                <td class="px-4 py-3 text-right font-semibold">{{ row.balance }}</td>
              </tr>
              <tr *ngIf="!loadingStock() && stock().length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum saldo em estoque.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card-surface p-4">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-4">
          <h3 class="text-sm font-bold text-slate-600 uppercase">Histórico de movimentações</h3>
          <div class="flex flex-wrap gap-2">
            <select
              [(ngModel)]="filterType"
              name="filterType"
              class="border border-[var(--app-border)] rounded-xl px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Todos os tipos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
            </select>
            <button type="button" class="btn-primary text-sm py-1.5 px-4" (click)="loadHistory()">Filtrar</button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="table-head bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Tipo</th>
                <th class="px-4 py-3 text-left">NF</th>
                <th class="px-4 py-3 text-left">Agente</th>
                <th class="px-4 py-3 text-left">Motorista</th>
                <th class="px-4 py-3 text-left">Veículo</th>
                <th class="px-4 py-3 text-left">Itens</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let m of history()" class="border-t border-slate-100 align-top">
                <td class="px-4 py-3 text-xs whitespace-nowrap">{{ formatDate(m.criado_em) }}</td>
                <td class="px-4 py-3">
                  <span
                    class="text-xs font-semibold px-2 py-0.5 rounded-full"
                    [class.bg-emerald-100]="m.movement_type === 'ENTRADA'"
                    [class.text-emerald-800]="m.movement_type === 'ENTRADA'"
                    [class.bg-red-100]="m.movement_type === 'SAIDA'"
                    [class.text-red-800]="m.movement_type === 'SAIDA'"
                  >
                    {{ m.movement_type === 'ENTRADA' ? 'Entrada' : 'Saída' }}
                  </span>
                </td>
                <td class="px-4 py-3 font-mono text-xs">{{ m.invoice_number }}</td>
                <td class="px-4 py-3">{{ m.company_fancy_name }}</td>
                <td class="px-4 py-3">{{ m.collaborator_name }}</td>
                <td class="px-4 py-3 font-mono">{{ m.vehicle_plate }}</td>
                <td class="px-4 py-3 text-xs text-slate-600">
                  <div *ngFor="let item of m.items">
                    {{ item.product_description }} — {{ item.location_name }}: {{ item.quantity }}
                    {{ item.unit_measure }}
                  </div>
                </td>
              </tr>
              <tr *ngIf="!loadingHistory() && history().length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhuma movimentação encontrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p *ngIf="historyTotal() > 0" class="text-xs text-slate-500 mt-3">
          Exibindo {{ history().length }} de {{ historyTotal() }} registro(s)
        </p>
      </div>
    </div>
  `,
})
export class MerchandiseReportsComponent implements OnInit {
  private materials = inject(MaterialsService);
  private notification = inject(NotificationService);

  loadingDashboard = signal(true);
  loadingStock = signal(false);
  loadingHistory = signal(false);
  dashboard = signal<MaterialsDashboard | null>(null);
  stock = signal<StockRow[]>([]);
  history = signal<MaterialMovement[]>([]);
  historyTotal = signal(0);
  filterType: MovementType | '' = '';

  barData = signal<ChartConfiguration<'bar'>['data']>({
    labels: [],
    datasets: [
      { label: 'Entradas', data: [], backgroundColor: '#059669' },
      { label: 'Saídas', data: [], backgroundColor: '#dc2626' },
    ],
  });

  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    plugins: { legend: { position: 'bottom' } },
  };

  ngOnInit() {
    this.loadDashboard();
    this.loadStock();
    this.loadHistory();
  }

  loadDashboard() {
    this.loadingDashboard.set(true);
    this.materials.getDashboard(7).subscribe({
      next: (d) => {
        this.dashboard.set(d);
        this.barData.set({
          labels: d.series.map((s) => this.formatDayLabel(s.day)),
          datasets: [
            { label: 'Entradas', data: d.series.map((s) => s.entrada_count), backgroundColor: '#059669' },
            { label: 'Saídas', data: d.series.map((s) => s.saida_count), backgroundColor: '#dc2626' },
          ],
        });
        this.loadingDashboard.set(false);
      },
      error: (err) => {
        this.loadingDashboard.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar gráficos.');
      },
    });
  }

  loadStock() {
    this.loadingStock.set(true);
    this.materials.getStock().subscribe({
      next: (res) => {
        this.stock.set(res.stock);
        this.loadingStock.set(false);
      },
      error: (err) => {
        this.loadingStock.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar estoque.');
      },
    });
  }

  loadHistory() {
    this.loadingHistory.set(true);
    this.materials
      .getHistory(1, 50, {
        movement_type: this.filterType || undefined,
      })
      .subscribe({
        next: (res) => {
          this.history.set(res.movements);
          this.historyTotal.set(res.total);
          this.loadingHistory.set(false);
        },
        error: (err) => {
          this.loadingHistory.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar histórico.');
        },
      });
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('pt-BR');
  }

  formatDayLabel(day: string): string {
    const d = new Date(day + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
}
