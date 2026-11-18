import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  BlocklistItem,
  BlocklistSearchResult,
  BlocklistService,
} from '../../../services/blocklist.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService, hasPermission } from '../../../core/services/auth.service';
import { ModalComponent } from '../../../shared/modal/modal.component';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../../shared/actions';
import { BlocklistPeriodType, formatBlocklistPeriod } from '../../../shared/blocklist-notice';

@Component({
  selector: 'app-blocklist-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ActionMenuComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Gestão de bloqueio</h2>
          <p class="page-section-subtitle">
            Impede o acesso do colaborador à arena por prazo, por eventos ou de forma permanente.
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-action-secondary" (click)="carregar()" [disabled]="loading()">
            Atualizar
          </button>
          <button *ngIf="canCreate()" type="button" class="btn-action-primary" (click)="abrirModal()">
            + Novo bloqueio
          </button>
        </div>
      </div>

      <div class="card-surface p-4 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div class="md:col-span-2">
            <label class="text-xs font-bold text-slate-500 uppercase" for="bl-q">Busca</label>
            <input
              id="bl-q"
              [(ngModel)]="filterQ"
              (ngModelChange)="onFilterChange()"
              name="filterQ"
              placeholder="Nome ou documento"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase" for="bl-type">Tipo</label>
            <select
              id="bl-type"
              [(ngModel)]="filterType"
              (ngModelChange)="aplicarFiltros()"
              name="filterType"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="permanent">Permanente</option>
              <option value="days">Por dias</option>
              <option value="events">Por eventos</option>
            </select>
          </div>
          <div>
            <button type="button" class="btn-outline-primary w-full justify-center" (click)="limparFiltros()">
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div class="card-surface tabela-rolavel">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Colaborador</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Documento</th>
              <th class="px-4 py-3 text-left">Prazo</th>
              <th class="px-4 py-3 text-left hidden lg:table-cell">Motivo</th>
              <th class="px-4 py-3 text-left hidden lg:table-cell">Incluído por</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items()" class="border-t border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3">
                <div class="font-medium text-slate-800">{{ item.name }}</div>
                <div class="text-xs text-slate-500 md:hidden">{{ item.document }}</div>
              </td>
              <td class="px-4 py-3 font-mono text-slate-600 hidden md:table-cell">{{ item.document }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                  {{ tipoLabel(item.block_type) }}
                </span>
                <div class="text-xs text-slate-500 mt-1">{{ remainingLabel(item) }}</div>
              </td>
              <td class="px-4 py-3 text-slate-600 hidden lg:table-cell max-w-xs truncate" [title]="item.reason">
                {{ item.reason }}
              </td>
              <td class="px-4 py-3 text-slate-600 hidden lg:table-cell">
                <div>{{ item.blocked_by_name || '—' }}</div>
                <div class="text-xs text-slate-400">{{ item.criado_em | date: 'dd/MM/yyyy HH:mm' }}</div>
              </td>
              <td class="px-4 py-3 text-right">
                <app-action-menu>
                  <app-action-btn
                    *ngIf="canEdit()"
                    icon="edit"
                    title="Editar prazo"
                    variant="neutral"
                    (action)="abrirModal(item)"
                  />
                  <app-action-dropdown *ngIf="canDelete()">
                    <button appActionDropdownItem type="button" (click)="remover(item)">
                      Remover bloqueio
                    </button>
                  </app-action-dropdown>
                </app-action-menu>
              </td>
            </tr>
            <tr *ngIf="!loading() && items().length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                Nenhum colaborador bloqueado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div *ngIf="pagination().totalPages > 1" class="flex justify-end gap-2 mt-4">
        <button
          type="button"
          class="btn-action-secondary"
          [disabled]="pagination().page <= 1"
          (click)="carregar(pagination().page - 1)"
        >
          Anterior
        </button>
        <button
          type="button"
          class="btn-action-secondary"
          [disabled]="pagination().page >= pagination().totalPages"
          (click)="carregar(pagination().page + 1)"
        >
          Próxima
        </button>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editing() ? 'Editar bloqueio' : 'Novo bloqueio'"
      size="md"
      (close)="fecharModal()"
    >
      <form id="blocklist-form" class="space-y-4" (ngSubmit)="salvar()">
        <div *ngIf="!editing()">
          <label class="form-label" for="bl-search">Colaborador</label>
          <input
            id="bl-search"
            [(ngModel)]="searchQ"
            name="searchQ"
            (ngModelChange)="onSearchChange()"
            placeholder="Buscar por nome ou documento"
            class="form-field"
            autocomplete="off"
          />
          <div *ngIf="searchResults().length" class="mt-2 border border-slate-200 rounded-xl overflow-hidden">
            <button
              *ngFor="let c of searchResults()"
              type="button"
              class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-t first:border-t-0 border-slate-100"
              [disabled]="c.is_blocklisted"
              (click)="selecionar(c)"
            >
              <span class="font-medium">{{ c.name }}</span>
              <span class="text-slate-500"> · {{ c.document }}</span>
              <span *ngIf="c.is_blocklisted" class="text-rose-600 text-xs"> · já bloqueado</span>
            </button>
          </div>
          <p *ngIf="selected()" class="text-sm text-slate-700 mt-2">
            Selecionado: <strong>{{ selected()!.name }}</strong> · {{ selected()!.document }}
          </p>
        </div>
        <div *ngIf="editing()">
          <p class="text-sm text-slate-700">
            <strong>{{ editing()!.name }}</strong> · {{ editing()!.document }}
          </p>
        </div>

        <div>
          <label class="form-label" for="bl-reason">Motivo</label>
          <textarea
            id="bl-reason"
            [(ngModel)]="formReason"
            name="reason"
            rows="3"
            maxlength="500"
            class="form-field"
            placeholder="Descreva o motivo da restrição (mín. 10 caracteres)"
          ></textarea>
        </div>

        <fieldset>
          <legend class="form-label">Período de bloqueio</legend>
          <div class="space-y-2 mt-1">
            <label class="flex items-center gap-2 text-sm">
              <input type="radio" name="blockType" [(ngModel)]="formType" value="permanent" />
              Permanente
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="radio" name="blockType" [(ngModel)]="formType" value="days" />
              Por dias
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="radio" name="blockType" [(ngModel)]="formType" value="events" />
              Por eventos
            </label>
          </div>
          <div *ngIf="formType !== 'permanent'" class="mt-3">
            <label class="form-label" for="bl-value">
              {{ formType === 'days' ? 'Quantidade de dias' : 'Quantidade de eventos sem acesso' }}
            </label>
            <input
              id="bl-value"
              type="number"
              min="1"
              [(ngModel)]="formValue"
              name="blockValue"
              class="form-field"
            />
          </div>
        </fieldset>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
        <button type="submit" form="blocklist-form" class="btn-action-primary" [disabled]="saving()">
          {{ saving() ? 'Salvando...' : editing() ? 'Salvar bloqueio' : 'Bloquear colaborador' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class BlocklistListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private filterTimer: ReturnType<typeof setTimeout> | null = null;

  items = signal<BlocklistItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editing = signal<BlocklistItem | null>(null);
  selected = signal<BlocklistSearchResult | null>(null);
  searchResults = signal<BlocklistSearchResult[]>([]);
  canCreate = signal(false);
  canEdit = signal(false);
  canDelete = signal(false);
  pagination = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  filterQ = '';
  filterType = '';
  searchQ = '';
  formReason = '';
  formType: BlocklistPeriodType = 'permanent';
  formValue: number | null = 30;

  constructor(
    private blocklistService: BlocklistService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.canCreate.set(hasPermission(user, 'collaborator_blocklist', 'create'));
    this.canEdit.set(hasPermission(user, 'collaborator_blocklist', 'edit'));
    this.canDelete.set(hasPermission(user, 'collaborator_blocklist', 'delete'));
    this.carregar();
  }

  tipoLabel(type: string): string {
    if (type === 'days') return 'Por dias';
    if (type === 'events') return 'Por eventos';
    return 'Permanente';
  }

  remainingLabel(item: BlocklistItem): string {
    return formatBlocklistPeriod(item) || '—';
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.blocklistService
      .list(page, this.pagination().limit, {
        q: this.filterQ,
        block_type: this.filterType || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar a lista de bloqueio.');
          this.cdr.markForCheck();
        },
      });
  }

  onFilterChange() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.aplicarFiltros(), 350);
  }

  aplicarFiltros() {
    this.carregar(1);
  }

  limparFiltros() {
    this.filterQ = '';
    this.filterType = '';
    this.carregar(1);
  }

  abrirModal(item?: BlocklistItem) {
    this.editing.set(item || null);
    this.selected.set(null);
    this.searchQ = '';
    this.searchResults.set([]);
    this.formReason = item?.reason || '';
    this.formType = item?.block_type || 'permanent';
    this.formValue = item?.block_value ?? (item?.block_type === 'events' ? 5 : 30);
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
    this.editing.set(null);
    this.selected.set(null);
    this.searchResults.set([]);
  }

  onSearchChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const q = this.searchQ.trim();
    if (q.length < 2) {
      this.searchResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.blocklistService.searchCollaborators(q).subscribe({
        next: (res) => {
          this.searchResults.set(res.results || []);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao buscar colaboradores.');
        },
      });
    }, 250);
  }

  selecionar(c: BlocklistSearchResult) {
    if (c.is_blocklisted) return;
    this.selected.set(c);
    this.searchQ = c.name;
    this.searchResults.set([]);
  }

  salvar() {
    const reason = this.formReason.trim();
    if (reason.length < 10) {
      this.notification.error('Informe um motivo com pelo menos 10 caracteres.');
      return;
    }
    if (this.formType !== 'permanent' && (!this.formValue || this.formValue < 1)) {
      this.notification.error(
        this.formType === 'days'
          ? 'Informe a quantidade de dias.'
          : 'Informe a quantidade de eventos.',
      );
      return;
    }

    const editing = this.editing();
    this.saving.set(true);

    if (editing) {
      this.blocklistService
        .update(editing.id_collaborator, {
          reason,
          block_type: this.formType,
          block_value: this.formType === 'permanent' ? null : this.formValue,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.fecharModal();
            this.notification.success('Bloqueio atualizado.');
            this.carregar();
          },
          error: (err) => {
            this.saving.set(false);
            this.notification.notifyHttpError(err, 'Falha ao atualizar o bloqueio.');
            this.cdr.markForCheck();
          },
        });
      return;
    }

    const selected = this.selected();
    if (!selected) {
      this.saving.set(false);
      this.notification.error('Selecione um colaborador.');
      return;
    }

    this.blocklistService
      .create({
        id_collaborator: selected.id_collaborator,
        reason,
        block_type: this.formType,
        block_value: this.formType === 'permanent' ? null : this.formValue,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.fecharModal();
          this.notification.success('Colaborador bloqueado.');
          this.carregar(1);
        },
        error: (err) => {
          this.saving.set(false);
          this.notification.notifyHttpError(err, 'Falha ao bloquear o colaborador.');
          this.cdr.markForCheck();
        },
      });
  }

  remover(item: BlocklistItem) {
    Swal.fire({
      title: 'Remover bloqueio?',
      text: `"${item.name}" voltará a poder ser credenciado.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover bloqueio',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.blocklistService.remove(item.id_collaborator).subscribe({
        next: () => {
          this.notification.success('Bloqueio removido.');
          this.carregar();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao remover o bloqueio.');
        },
      });
    });
  }
}
