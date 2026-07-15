import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PatrimonialService, ServiceAccessItem } from '../../services/patrimonial.service';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { ApprovalService, EligibleSector } from '../../services/approval.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../shared/actions';
import {
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_APROVADO,
  STATUS_NEGADO,
  statusBadgeClass,
} from '../../services/credential.service';

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
    FormsModule,
    RouterLink,
    ModalComponent,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Acessos de Serviço</h2>
          <p class="page-section-subtitle">
            Cadastro de acessos com período, finalidade e vínculo de colaboradores e veículos.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary" (click)="carregar()" [disabled]="loading()">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" class="btn-primary" (click)="abrirModal()">+ Novo acesso</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Finalidade</th>
              <th class="px-4 py-3 text-left">Período</th>
              <th class="px-4 py-3 text-left hidden lg:table-cell">Setor</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Solicitante</th>
              <th class="px-4 py-3 text-center">Colaboradores</th>
              <th class="px-4 py-3 text-center">Veículos</th>
              <th class="px-4 py-3 text-left">Aprovação</th>
              <th class="px-4 py-3 text-left">Habilitado</th>
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
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  [ngClass]="statusBadgeClass(s.id_access_status)"
                >
                  <svg
                    *ngIf="s.id_access_status === STATUS_APROVADO"
                    class="w-3.5 h-3.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <svg
                    *ngIf="s.id_access_status === STATUS_NEGADO"
                    class="w-3.5 h-3.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                  <svg
                    *ngIf="s.id_access_status === STATUS_AGUARDANDO_APROVACAO"
                    class="w-3.5 h-3.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <svg
                    *ngIf="s.id_access_status === STATUS_AGUARDANDO_PRODUTORA"
                    class="w-3.5 h-3.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 2h14v4H5zM5 18h14v4H5z" />
                    <path d="M8 6v2a4 4 0 0 0 8 0V6M8 18v-2a4 4 0 0 1 8 0v2" />
                  </svg>
                  {{ s.access_status_description }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="s.status"
                  [class.text-emerald-700]="s.status"
                  [class.bg-slate-100]="!s.status"
                  [class.text-slate-600]="!s.status"
                >
                  {{ s.status ? 'Sim' : 'Não' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <div class="flex justify-end">
                  <app-action-menu>
                    <app-action-btn icon="grid" title="Gerenciar" variant="neutral" (action)="abrirDetalhe(s)" />
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
                </div>
              </td>
            </tr>
            <tr *ngIf="!loading() && services().length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhum acesso cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      title="Novo acesso de serviço"
      subtitle="Cadastre período, finalidade e setor aprovador. Após criar, adicione colaboradores e veículos."
      size="lg"
      (close)="fecharModal()"
    >
      <form id="service-access-form" class="space-y-3" (ngSubmit)="salvar()">
        <div *ngIf="isAdmin">
          <label class="form-label" for="svc-company">Empresa</label>
          <select
            id="svc-company"
            [(ngModel)]="form.id_company"
            name="id_company"
            required
            class="form-select"
          >
            <option [ngValue]="null">Selecione...</option>
            <option *ngFor="let c of companies()" [ngValue]="c.id_company">
              {{ c.fancy_name || c.company_name }}
            </option>
          </select>
          <p class="text-xs text-slate-500 mt-1">
            Não encontrou a empresa?
            <a routerLink="/admin/empresas" class="text-[var(--color-primary-dark)] font-medium hover:underline">
              Cadastrar empresa
            </a>
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label" for="svc-start">Data início</label>
            <input
              id="svc-start"
              [(ngModel)]="form.start_date"
              name="start_date"
              type="date"
              required
              class="form-field"
            />
          </div>
          <div>
            <label class="form-label" for="svc-end">Data fim</label>
            <input
              id="svc-end"
              [(ngModel)]="form.end_date"
              name="end_date"
              type="date"
              required
              class="form-field"
            />
          </div>
        </div>
        <div>
          <label class="form-label" for="svc-finalidade">Finalidade</label>
          <input
            id="svc-finalidade"
            [(ngModel)]="form.finalidade"
            name="finalidade"
            required
            class="form-field"
          />
        </div>
        <div>
          <label class="form-label" for="svc-setor">Setor aprovador</label>
          <select
            id="svc-setor"
            [(ngModel)]="form.id_setor"
            name="id_setor"
            required
            class="form-select"
          >
            <option [ngValue]="null" disabled>Selecione o setor</option>
            <option *ngFor="let s of sectors()" [ngValue]="s.id">
              {{ s.nome }}
            </option>
          </select>
        </div>
        <div>
          <label class="form-label" for="svc-obs">
            Observação <span class="form-label__optional">(opcional)</span>
          </label>
          <textarea
            id="svc-obs"
            [(ngModel)]="form.observacao"
            name="observacao"
            rows="3"
            class="form-field"
          ></textarea>
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
        <button
          type="submit"
          form="service-access-form"
          class="btn-action-primary"
          [disabled]="saving()"
        >
          {{ saving() ? 'Criando...' : 'Criar e gerenciar' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ServiceRequestListComponent implements OnInit {
  services = signal<ServiceAccessItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  sectors = signal<EligibleSector[]>([]);
  isAdmin = false;
  formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;
  readonly STATUS_APROVADO = STATUS_APROVADO;
  readonly STATUS_NEGADO = STATUS_NEGADO;
  readonly STATUS_AGUARDANDO_APROVACAO = STATUS_AGUARDANDO_APROVACAO;
  readonly STATUS_AGUARDANDO_PRODUTORA = STATUS_AGUARDANDO_PRODUTORA;
  form = {
    start_date: '',
    end_date: '',
    finalidade: '',
    requesting_department: '',
    observacao: '',
    id_company: null as number | null,
    id_setor: null as number | null,
  };

  constructor(
    private patrimonialService: PatrimonialService,
    private companyService: CompanyService,
    private approvalService: ApprovalService,
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

  abrirModal() {
    this.form = {
      start_date: '',
      end_date: '',
      finalidade: '',
      requesting_department: '',
      observacao: '',
      id_company: null,
      id_setor: null,
    };
    this.approvalService.listEligibleSectors('ACESSO_SERVICO').subscribe({
      next: (res) => this.sectors.set(res.sectors),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  salvar() {
    if (this.isAdmin && !this.form.id_company) {
      this.notification.error('Selecione a empresa.');
      return;
    }
    if (!this.form.finalidade.trim()) {
      this.notification.error('Preencha a finalidade.');
      return;
    }
    if (!this.form.start_date || !this.form.end_date) {
      this.notification.error('Informe o período do acesso.');
      return;
    }
    if (!this.form.id_setor) {
      this.notification.error('Selecione o setor aprovador.');
      return;
    }
    const setorNome = this.sectors().find((s) => s.id === this.form.id_setor)?.nome?.trim();
    if (!setorNome) {
      this.notification.error('Setor aprovador inválido.');
      return;
    }
    this.saving.set(true);
    this.patrimonialService
      .create({
        start_date: this.form.start_date,
        end_date: this.form.end_date,
        finalidade: this.form.finalidade.trim(),
        requesting_department: setorNome,
        observacao: this.form.observacao.trim() || null,
        id_setor: this.form.id_setor,
        ...(this.isAdmin && this.form.id_company ? { id_company: this.form.id_company } : {}),
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.fecharModal();
          this.notification.success('Acesso criado. Adicione colaboradores e veículos.');
          this.router.navigate(['/admin/acessos-servico', res.service.id_service_access]);
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao criar acesso.');
        },
      });
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
