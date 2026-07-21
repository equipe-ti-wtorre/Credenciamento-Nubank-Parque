import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { VehicleItem, VehicleService } from '../../services/vehicle.service';
import { CompanyItem, CompanyService } from '../../services/company.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ActionBtnComponent } from '../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../shared/modal/modal.component';
import { BulkImportWizardComponent } from '../../shared/bulk-import/bulk-import-wizard.component';
import { BulkImportAdapters } from '../../shared/bulk-import/bulk-import.types';

interface VehicleFormState {
  plate: string;
  brand: string;
  model: string;
  color: string;
  type: string;
  description: string;
  status: boolean;
  isBlacklisted: boolean;
  id_company: number | null;
}

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ModalComponent,
    BulkImportWizardComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-title">Frota</h2>
          <p class="page-subtitle">Veículos cadastrados por empresa.</p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-outline">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" (click)="abrirBulkModal()" class="btn-outline">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="m7 9 5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            Upload em lote
          </button>
          <button type="button" (click)="abrirModal()" class="btn-action-primary">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo veículo
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div class="stat-card">
          <div class="stat-card__icon">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
              <circle cx="7" cy="17" r="2" />
              <path d="M9 17h6" />
              <circle cx="17" cy="17" r="2" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Total (página)</p>
            <p class="stat-card__value text-slate-800">{{ stats().total }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Ativos</p>
            <p class="stat-card__value text-emerald-700">{{ stats().ativos }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Inativos</p>
            <p class="stat-card__value text-slate-600">{{ stats().inativos }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--danger">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 9 6 6" />
              <path d="m15 9-6 6" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Na blacklist</p>
            <p class="stat-card__value text-rose-700">{{ stats().blacklist }}</p>
          </div>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 gap-3" [class.md:grid-cols-5]="isAdmin" [class.md:grid-cols-4]="!isAdmin">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Placa</label>
            <input
              [(ngModel)]="filterPlate"
              (ngModelChange)="onTextFilterChange()"
              name="filterPlate"
              placeholder="ABC1D23"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Marca</label>
            <input
              [(ngModel)]="filterBrand"
              (ngModelChange)="onTextFilterChange()"
              name="filterBrand"
              placeholder="Marca ou modelo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div *ngIf="isAdmin">
            <label class="text-xs font-bold text-slate-500 uppercase">Empresa</label>
            <select
              [(ngModel)]="filterCompanyId"
              (ngModelChange)="aplicarFiltros()"
              name="filterCompanyId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todas</option>
              <option *ngFor="let c of companies()" [ngValue]="c.id_company">
                {{ c.fancy_name || c.company_name }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
            <select
              [(ngModel)]="filterType"
              (ngModelChange)="aplicarFiltros()"
              name="filterType"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option *ngFor="let t of vehicleTypes()" [value]="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Status</label>
            <select
              [(ngModel)]="filterStatus"
              (ngModelChange)="aplicarFiltros()"
              name="filterStatus"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button type="button" (click)="limparFiltros()" class="btn-link-muted">Limpar</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[900px]">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Placa</th>
              <th class="px-4 py-3 text-left">Marca</th>
              <th class="px-4 py-3 text-left">Modelo</th>
              <th class="px-4 py-3 text-left">Cor</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Empresa</th>
              <th class="px-4 py-3 text-left">Descrição</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Blacklist</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
            <tr *ngFor="let v of vehicles()" class="border-t border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3 font-mono font-semibold">{{ v.plate }}</td>
              <td class="px-4 py-3">{{ v.brand || '—' }}</td>
              <td class="px-4 py-3">{{ v.model || '—' }}</td>
              <td class="px-4 py-3">{{ v.color || '—' }}</td>
              <td class="px-4 py-3">{{ v.type || '—' }}</td>
              <td class="px-4 py-3">{{ v.company_fancy_name || '—' }}</td>
              <td class="px-4 py-3">{{ v.description || '—' }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="v.status"
                  [class.text-emerald-800]="v.status"
                  [class.bg-slate-100]="!v.status"
                  [class.text-slate-600]="!v.status"
                >
                  {{ v.status ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  *ngIf="v.is_blacklisted"
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800"
                  [title]="v.blacklist_reason || ''"
                >
                  Blacklist
                </span>
                <span *ngIf="!v.is_blacklisted" class="text-slate-400 text-xs">—</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end">
                  <app-action-menu>
                    <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(v)" />
                    <app-action-dropdown>
                      <button
                        appActionDropdownItem
                        type="button"
                        (click)="alterarStatus(v, !v.status)"
                      >
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
                        {{ v.status ? 'Desativar' : 'Ativar' }}
                      </button>
                      <button
                        appActionDropdownItem
                        type="button"
                        (click)="v.is_blacklisted ? removerBlacklist(v) : incluirBlacklist(v)"
                      >
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
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          @if (v.is_blacklisted) {
                            <path d="M9 12l2 2 4-4" />
                          } @else {
                            <path d="m9 9 6 6" />
                            <path d="m15 9-6 6" />
                          }
                        </svg>
                        {{ v.is_blacklisted ? 'Remover da blacklist' : 'Adicionar à blacklist' }}
                      </button>
                      @if (v.can_delete) {
                        <hr class="action-dropdown__divider" />
                        <button
                          appActionDropdownItem
                          type="button"
                          [danger]="true"
                          (click)="excluirVeiculo(v)"
                        >
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
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                          Excluir
                        </button>
                      }
                    </app-action-dropdown>
                  </app-action-menu>
                </div>
              </td>
            </tr>
            <tr *ngIf="vehicles().length === 0">
              <td colspan="10" class="px-4 py-8 text-center text-slate-500">Nenhum veículo encontrado.</td>
            </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="10" class="px-4 py-8 text-center text-slate-500">Carregando veículos...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>
        </div>

        <div
          *ngIf="pagination().totalPages > 1"
          class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
        >
          <span class="text-xs text-slate-500">
            Página {{ pagination().page }} de {{ pagination().totalPages }} ({{ pagination().total }} registros)
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="irPagina(pagination().page - 1)"
              [disabled]="pagination().page <= 1"
              class="btn-outline text-xs py-1 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              (click)="irPagina(pagination().page + 1)"
              [disabled]="pagination().page >= pagination().totalPages"
              class="btn-outline text-xs py-1 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editingId() ? 'Editar veículo' : 'Novo veículo'"
      size="lg"
      (close)="fecharModal()"
    >
      <form id="vehicle-form" class="space-y-3" (ngSubmit)="salvar()">
          <div *ngIf="isAdmin && !editingId()">
            <label class="text-xs font-bold text-slate-500 uppercase">Empresa</label>
            <select
              [(ngModel)]="form.id_company"
              name="id_company"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
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
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Placa</label>
            <input
              [(ngModel)]="form.plate"
              name="plate"
              required
              class="w-full mt-1 border rounded-xl px-3 py-2 text-sm font-mono uppercase"
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Marca</label>
              <input
                [(ngModel)]="form.brand"
                name="brand"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Toyota"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Modelo</label>
              <input
                [(ngModel)]="form.model"
                name="model"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Corolla"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Cor</label>
              <input
                [(ngModel)]="form.color"
                name="color"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Prata"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Tipo</label>
              <input
                [(ngModel)]="form.type"
                name="type"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
                placeholder="Ex.: Sedan"
              />
            </div>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Descrição</label>
            <input
              [(ngModel)]="form.description"
              name="description"
              class="w-full mt-1 border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div *ngIf="editingId()" class="space-y-4 pt-3 border-t border-slate-100">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">Veículo ativo</p>
                <p class="text-xs text-slate-500">Disponível para credenciamento e acessos.</p>
              </div>
              <button
                type="button"
                (click)="form.status = !form.status"
                class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                [class.border-emerald-200]="form.status"
                [class.bg-emerald-50]="form.status"
                [class.text-emerald-700]="form.status"
                [class.border-slate-200]="!form.status"
                [class.bg-white]="!form.status"
                [class.text-slate-400]="!form.status"
                [attr.aria-pressed]="form.status"
                [attr.title]="form.status ? 'Veículo ativo' : 'Veículo inativo'"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <ng-container *ngIf="form.status; else inactiveVehicleIcon">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </ng-container>
                  <ng-template #inactiveVehicleIcon>
                    <circle cx="12" cy="12" r="10" />
                  </ng-template>
                </svg>
              </button>
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">Blacklist frota</p>
                <p class="text-xs text-slate-500">Bloqueia o veículo em credenciamento e portaria.</p>
                <p *ngIf="form.isBlacklisted && blacklistReason()" class="text-xs text-rose-600 mt-1">
                  Motivo: {{ blacklistReason() }}
                </p>
              </div>
              <button
                type="button"
                (click)="onBlacklistToggleClick()"
                class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                [class.border-rose-200]="form.isBlacklisted"
                [class.bg-rose-50]="form.isBlacklisted"
                [class.text-rose-700]="form.isBlacklisted"
                [class.border-slate-200]="!form.isBlacklisted"
                [class.bg-white]="!form.isBlacklisted"
                [class.text-slate-400]="!form.isBlacklisted"
                [attr.aria-pressed]="form.isBlacklisted"
                [attr.title]="form.isBlacklisted ? 'Remover da blacklist' : 'Adicionar à blacklist'"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
        <button type="submit" form="vehicle-form" class="btn-action-primary" [disabled]="saving()">
          {{ saving() ? 'Salvando...' : (editingId() ? 'Salvar veículo' : 'Criar veículo') }}
        </button>
      </div>
    </app-modal>

    <app-bulk-import-wizard
      [open]="showBulkModal()"
      title="Upload em lote — Frota"
      subtitle="Envie a planilha, revise novos veículos e divergências, e confirme a importação."
      [adapters]="bulkAdapters"
      (closed)="showBulkModal.set(false)"
      (completed)="onBulkCompleted()"
    />
  `,
})
export class VehicleListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  vehicles = signal<VehicleItem[]>([]);
  companies = signal<CompanyItem[]>([]);
  vehicleTypes = signal<string[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  showBulkModal = signal(false);
  editingId = signal<number | null>(null);
  blacklistReason = signal<string | null>(null);
  isAdmin = false;
  form: VehicleFormState = this.emptyForm();

  readonly bulkAdapters: BulkImportAdapters = {
    downloadTemplate: () => this.vehicleService.downloadBulkTemplate(),
    preview: (file) => this.vehicleService.bulkPreview(file),
    commit: (previewId, decisions) => this.vehicleService.bulkCommit(previewId, decisions),
    templateFilename: 'template-frota-veiculos.xlsx',
  };

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterPlate = '';
  filterBrand = '';
  filterCompanyId: number | null = null;
  filterType = '';
  filterStatus = '';

  appliedPlate = '';
  appliedBrand = '';
  appliedCompanyId: number | null = null;
  appliedType = '';
  appliedStatus: boolean | undefined = undefined;

  private readonly filterDebounceMs = 500;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  stats = computed(() => {
    const list = this.vehicles();
    return {
      total: list.length,
      ativos: list.filter((v) => v.status).length,
      inativos: list.filter((v) => !v.status).length,
      blacklist: list.filter((v) => v.is_blacklisted).length,
    };
  });

  constructor(
    private vehicleService: VehicleService,
    private companyService: CompanyService,
    private authService: AuthService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || user?.perfil || '').toUpperCase() === 'ADMIN';
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.carregarTipos();
    this.carregar();
  }

  private emptyForm(): VehicleFormState {
    return {
      plate: '',
      brand: '',
      model: '',
      color: '',
      type: '',
      description: '',
      status: true,
      isBlacklisted: false,
      id_company: null,
    };
  }

  carregarEmpresas() {
    this.companyService.list(1, 500, {}).subscribe({
      next: (res) => this.companies.set(res.companies.filter((c) => c.status)),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
  }

  carregarTipos() {
    this.vehicleService.list(1, 500, {}).subscribe({
      next: (res) => {
        const types = [
          ...new Set(
            res.vehicles.map((v) => v.type?.trim()).filter((t): t is string => !!t),
          ),
        ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.vehicleTypes.set(types);
      },
      error: () => {},
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.vehicleService
      .list(page, this.pagination().limit, {
        plate: this.appliedPlate || undefined,
        brand: this.appliedBrand || undefined,
        type: this.appliedType || undefined,
        id_company: this.appliedCompanyId ?? undefined,
        status: this.appliedStatus,
      })
      .subscribe({
        next: (res) => {
          this.vehicles.set(res.vehicles);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.cdr.markForCheck();
          this.notification.notifyHttpError(err, 'Falha ao carregar frota.');
        },
      });
  }

  onTextFilterChange() {
    if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
  }

  aplicarFiltros() {
    this.appliedPlate = this.filterPlate.trim().toUpperCase();
    this.appliedBrand = this.filterBrand.trim();
    this.appliedCompanyId = this.filterCompanyId;
    this.appliedType = this.filterType.trim();
    if (this.filterStatus === 'true') this.appliedStatus = true;
    else if (this.filterStatus === 'false') this.appliedStatus = false;
    else this.appliedStatus = undefined;
    this.carregar(1);
  }

  limparFiltros() {
    if (this.filterDebounceTimer !== null) {
      clearTimeout(this.filterDebounceTimer);
      this.filterDebounceTimer = null;
    }
    this.filterPlate = '';
    this.filterBrand = '';
    this.filterCompanyId = null;
    this.filterType = '';
    this.filterStatus = '';
    this.appliedPlate = '';
    this.appliedBrand = '';
    this.appliedCompanyId = null;
    this.appliedType = '';
    this.appliedStatus = undefined;
    this.carregar(1);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  abrirModal() {
    this.editingId.set(null);
    this.blacklistReason.set(null);
    this.form = this.emptyForm();
    if (this.isAdmin) {
      this.carregarEmpresas();
    }
    this.showModal.set(true);
  }

  abrirBulkModal() {
    this.showBulkModal.set(true);
  }

  onBulkCompleted() {
    this.carregar(1);
  }

  editar(v: VehicleItem) {
    this.editingId.set(v.id_vehicle);
    this.blacklistReason.set(v.blacklist_reason || null);
    this.form = {
      plate: v.plate,
      brand: v.brand || '',
      model: v.model || '',
      color: v.color || '',
      type: v.type || '',
      description: v.description || '',
      status: v.status,
      isBlacklisted: v.is_blacklisted,
      id_company: v.id_company,
    };
    this.showModal.set(true);
  }

  fecharModal() {
    Swal.close();
    this.showModal.set(false);
    this.editingId.set(null);
    this.blacklistReason.set(null);
    this.form = this.emptyForm();
  }

  onBlacklistToggleClick() {
    this.onBlacklistToggle(!this.form.isBlacklisted);
  }

  salvar() {
    const id = this.editingId();
    if (!id && this.isAdmin && !this.form.id_company) {
      this.notification.error('Selecione a empresa do veículo.');
      return;
    }

    const payload = {
      plate: this.form.plate.trim().toUpperCase(),
      brand: this.form.brand.trim() || null,
      model: this.form.model.trim() || null,
      color: this.form.color.trim() || null,
      type: this.form.type.trim() || null,
      description: this.form.description.trim() || null,
    };

    this.saving.set(true);

    const request$ = id
      ? this.vehicleService.update(id, { ...payload, status: this.form.status })
      : this.vehicleService.create({
          ...payload,
          ...(this.isAdmin && this.form.id_company ? { id_company: this.form.id_company } : {}),
        });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notification.success(id ? 'Veículo atualizado.' : 'Veículo cadastrado.');
        this.fecharModal();
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(
          err,
          id ? 'Falha ao atualizar veículo.' : 'Falha ao cadastrar veículo.',
        );
      },
    });
  }

  onBlacklistToggle(checked: boolean) {
    const id = this.editingId();
    if (!id) return;

    if (checked) {
      Swal.fire({
        title: 'Adicionar à blacklist?',
        html: `<p class="text-sm text-slate-600 mb-3">A placa <strong class="font-mono">${this.form.plate}</strong> será bloqueada em credenciamento e portaria.</p>`,
        input: 'textarea',
        inputLabel: 'Motivo (mín. 10 caracteres)',
        inputPlaceholder: 'Descreva o motivo da restrição...',
        inputAttributes: { maxlength: '500' },
        showCancelButton: true,
        confirmButtonText: 'Adicionar à blacklist',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
        inputValidator: (value) => {
          if (!value || value.trim().length < 10) {
            return 'Informe um motivo com pelo menos 10 caracteres.';
          }
          return null;
        },
      }).then((result) => {
        if (!result.isConfirmed || !result.value) {
          this.form.isBlacklisted = false;
          return;
        }
        this.vehicleService.addBlacklist(id, result.value.trim()).subscribe({
          next: () => {
            this.form.isBlacklisted = true;
            this.blacklistReason.set(result.value.trim());
            this.notification.success('Veículo adicionado à blacklist.');
            this.carregar();
          },
          error: (err) => {
            this.notification.notifyHttpError(err, 'Falha ao adicionar à blacklist.');
          },
        });
      });
      return;
    }

    Swal.fire({
      title: 'Remover da blacklist?',
      text: `A placa ${this.form.plate} voltará a poder acessar a arena.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover da blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) {
        this.form.isBlacklisted = true;
        return;
      }
      this.vehicleService.removeBlacklist(id).subscribe({
        next: () => {
          this.form.isBlacklisted = false;
          this.blacklistReason.set(null);
          this.notification.success('Veículo removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao remover da blacklist.');
        },
      });
    });
  }

  alterarStatus(v: VehicleItem, ativar: boolean) {
    const titulo = ativar ? 'Ativar veículo?' : 'Desativar veículo?';
    const texto = ativar
      ? `A placa ${v.plate} voltará a ficar ativa no sistema.`
      : `A placa ${v.plate} será inativada (sem exclusão física).`;

    Swal.fire({
      title: titulo,
      text: texto,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ativar ? 'Ativar' : 'Desativar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: ativar ? '#059669' : '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.vehicleService.update(v.id_vehicle, { status: ativar }).subscribe({
        next: () => {
          this.notification.success(ativar ? 'Veículo ativado.' : 'Veículo desativado.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao alterar status.');
        },
      });
    });
  }

  incluirBlacklist(v: VehicleItem) {
    Swal.fire({
      title: 'Adicionar à blacklist?',
      html: `<p class="text-sm text-slate-600 mb-3">A placa <strong class="font-mono">${v.plate}</strong> será bloqueada em credenciamento e portaria.</p>`,
      input: 'textarea',
      inputLabel: 'Motivo (mín. 10 caracteres)',
      inputPlaceholder: 'Descreva o motivo da restrição...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Adicionar à blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'Informe um motivo com pelo menos 10 caracteres.';
        }
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      this.vehicleService.addBlacklist(v.id_vehicle, result.value.trim()).subscribe({
        next: () => {
          this.notification.success('Veículo adicionado à blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao adicionar à blacklist.');
        },
      });
    });
  }

  removerBlacklist(v: VehicleItem) {
    Swal.fire({
      title: 'Remover da blacklist?',
      text: `A placa ${v.plate} voltará a poder acessar a arena.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover da blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.vehicleService.removeBlacklist(v.id_vehicle).subscribe({
        next: () => {
          this.notification.success('Veículo removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao remover da blacklist.');
        },
      });
    });
  }

  excluirVeiculo(v: VehicleItem) {
    Swal.fire({
      title: 'Excluir veículo?',
      text: `A placa ${v.plate} será removida permanentemente do cadastro.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.vehicleService.delete(v.id_vehicle).subscribe({
        next: () => {
          this.notification.success('Veículo excluído.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao excluir veículo.');
        },
      });
    });
  }
}
