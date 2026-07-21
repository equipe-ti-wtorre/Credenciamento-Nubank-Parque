import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PatrimonialService, ServiceAccessItem } from '../../services/patrimonial.service';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../shared/actions';
import { statusBadgeClass } from '../../services/credential.service';
import { ServiceAccessCreateWizardComponent } from './service-access-create-wizard.component';

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

@Component({
  selector: 'app-service-request-list',
  standalone: true,
  imports: [
    CommonModule,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ServiceAccessCreateWizardComponent,
  ],
  template: `
    <div class="w-full sa-list">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div class="min-w-0">
          <h2 class="page-section-title">Acessos de Serviço</h2>
          <p class="page-section-subtitle">
            Cadastro de acessos com período, finalidade e vínculo de colaboradores e veículos.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" class="btn-secondary" (click)="carregar()" [disabled]="loading()">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" class="btn-primary" (click)="abrirWizard()">+ Novo acesso</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="sa-list__scroll">
          <table class="w-full text-sm sa-list__table">
            <thead class="table-head bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left">Evento</th>
                <th class="px-4 py-3 text-left">Período</th>
                <th class="px-4 py-3 text-left hidden lg:table-cell">Setor</th>
                <th class="px-4 py-3 text-left hidden md:table-cell">Solicitante</th>
                <th class="px-4 py-3 text-center">Colab.</th>
                <th class="px-4 py-3 text-center">Veíc.</th>
                <th class="px-4 py-3 text-left">Aprovação</th>
                <th class="px-4 py-3 text-left hidden sm:table-cell">Habilitado</th>
                <th class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of services()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3">
                  <p class="font-medium text-slate-800">{{ s.finalidade }}</p>
                  <p class="text-xs text-slate-500">{{ s.company_fancy_name }}</p>
                </td>
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {{ formatDateBr(s.start_date) }} — {{ formatDateBr(s.end_date) }}
                </td>
                <td class="px-4 py-3 text-slate-600 hidden lg:table-cell">
                  {{ s.setor_nome || s.requesting_department }}
                </td>
                <td class="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {{ s.solicitante?.nome || '—' }}
                </td>
                <td class="px-4 py-3 text-center tabular-nums text-slate-700 font-medium">
                  {{ s.collaborators.length || 0 }}
                </td>
                <td class="px-4 py-3 text-center tabular-nums text-slate-700 font-medium">
                  {{ s.vehicles.length || 0 }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    [ngClass]="statusBadgeClass(s.id_access_status)"
                  >
                    {{ s.access_status_description }}
                  </span>
                </td>
                <td class="px-4 py-3 hidden sm:table-cell">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    [class.bg-emerald-50]="s.status"
                    [class.text-emerald-700]="s.status"
                    [class.bg-slate-100]="!s.status"
                    [class.text-slate-600]="!s.status"
                  >
                    {{ s.status ? 'Sim' : 'Não' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <app-action-menu>
                    <app-action-btn
                      icon="grid"
                      title="Gerenciar"
                      variant="neutral"
                      (action)="abrirDetalhe(s)"
                    />
                    <app-action-dropdown *ngIf="isAdmin">
                      <button appActionDropdownItem type="button" (click)="toggleEnabled(s)">
                        <svg
                          class="action-dropdown__item-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                          <path d="M12 2v10" />
                        </svg>
                        {{ s.status ? 'Desabilitar' : 'Habilitar' }}
                      </button>
                    </app-action-dropdown>
                  </app-action-menu>
                </td>
              </tr>
              <tr *ngIf="!loading() && services().length === 0">
                <td colspan="9" class="px-4 py-8 text-center text-slate-500">
                  Nenhum acesso de serviço encontrado.
                </td>
              </tr>
              <tr *ngIf="loading()">
                <td colspan="9" class="px-4 py-8 text-center text-slate-500">Carregando...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <app-service-access-create-wizard
      [open]="showWizard()"
      [isAdmin]="isAdmin"
      [companies]="companies()"
      (closed)="onWizardClosed($event)"
      (completed)="onWizardCompleted($event)"
    />
  `,
  styles: [
    `
      .sa-list__scroll {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .sa-list__table {
        min-width: 640px;
      }
      @media (max-width: 640px) {
        .sa-list__table {
          min-width: 520px;
        }
        .sa-list__table th,
        .sa-list__table td {
          padding-left: 0.75rem;
          padding-right: 0.75rem;
        }
      }
    `,
  ],
})
export class ServiceRequestListComponent implements OnInit {
  services = signal<ServiceAccessItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  loading = signal(false);
  showWizard = signal(false);
  isAdmin = false;
  formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;

  constructor(
    private patrimonialService: PatrimonialService,
    private companyService: CompanyService,
    private notification: NotificationService,
    private authService: AuthService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.carregar();
  }

  carregarEmpresas() {
    this.companyService.list(1, 500, {}).subscribe({
      next: (res) => this.companies.set(res.companies.filter((c) => c.status)),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
  }

  carregar() {
    this.loading.set(true);
    this.patrimonialService.list(1, 50).subscribe({
      next: (res) => {
        this.services.set(res.services);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar acessos.');
      },
    });
  }

  abrirWizard() {
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.showWizard.set(true);
  }

  onWizardClosed(_event: { createdId: number | null }) {
    this.showWizard.set(false);
    this.carregar();
  }

  onWizardCompleted(event: { service: ServiceAccessItem }) {
    this.showWizard.set(false);
    this.carregar();
    this.router.navigate(['/admin/acessos-servico', event.service.id_service_access]);
  }

  abrirDetalhe(s: ServiceAccessItem) {
    this.router.navigate(['/admin/acessos-servico', s.id_service_access]);
  }

  toggleEnabled(s: ServiceAccessItem) {
    this.patrimonialService.patchEnabled(s.id_service_access, !s.status).subscribe({
      next: () => {
        this.notification.success(s.status ? 'Acesso desabilitado.' : 'Acesso habilitado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }
}
