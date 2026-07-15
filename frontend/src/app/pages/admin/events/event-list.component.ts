import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  EventDayInput,
  EventDayType,
  EventItem,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import { ApprovalService, EligibleSector } from '../../../services/approval.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalComponent } from '../../../shared/modal/modal.component';
import {
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_APROVADO,
  STATUS_NEGADO,
  statusBadgeClass,
} from '../../../services/credential.service';

interface EventFormState {
  name: string;
  start: string;
  end: string;
  id_setor: number | null;
  days: EventDayInput[];
}

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Eventos</h2>
          <p class="page-section-subtitle">
            Orquestração de eventos, dias de operação e empresas permitidas por dia.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-action-secondary disabled:opacity-50">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" (click)="novoEvento()" class="btn-action-primary">+ Novo evento</button>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="filterName"
              name="filterName"
              placeholder="Nome do evento"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <button type="button" (click)="aplicarFiltros()" class="btn-action-primary text-sm py-1.5 px-4">Filtrar</button>
          <button type="button" (click)="limparFiltros()" class="btn-action-secondary text-sm py-1.5 px-4">Limpar</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Início</th>
              <th class="px-4 py-3 text-left">Término</th>
              <th class="px-4 py-3 text-left">Aprovação</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let e of events()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ e.name }}</td>
                <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.start) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.end) }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    [ngClass]="statusBadgeClass(e.id_access_status || 0)"
                  >
                    <svg
                      *ngIf="e.id_access_status === STATUS_APROVADO"
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
                      *ngIf="e.id_access_status === STATUS_NEGADO"
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
                      *ngIf="e.id_access_status === STATUS_AGUARDANDO_APROVACAO"
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
                      *ngIf="e.id_access_status === STATUS_AGUARDANDO_PRODUTORA"
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
                    {{ e.access_status_description || '—' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="configurar(e)" class="btn-action-tonal text-xs py-1.5 px-3">
                    Configurar evento
                  </button>
                </td>
              </tr>
              <tr *ngIf="events().length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum evento encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Carregando eventos...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>

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
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              (click)="irPagina(pagination().page + 1)"
              [disabled]="pagination().page >= pagination().totalPages"
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      title="Novo evento"
      subtitle="Informe nome, período, setor aprovador e dias opcionais do evento."
      size="xl"
      (close)="fecharModal()"
    >
      <form id="event-form" class="space-y-4" (ngSubmit)="salvar()">
          <div>
            <label class="form-label" for="event-name">Nome</label>
            <input
              id="event-name"
              [(ngModel)]="form.name"
              name="eventName"
              required
              class="form-field"
            />
          </div>
          <div>
            <label class="form-label" for="event-setor">Setor aprovador</label>
            <select
              id="event-setor"
              [(ngModel)]="form.id_setor"
              name="idSetor"
              required
              class="form-select"
            >
              <option [ngValue]="null" disabled>Selecione o setor</option>
              <option *ngFor="let s of eligibleSectors()" [ngValue]="s.id">
                {{ s.nome }}
              </option>
            </select>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="form-label" for="event-start">Data início</label>
              <input
                id="event-start"
                type="date"
                [(ngModel)]="form.start"
                name="eventStart"
                required
                class="form-field"
              />
            </div>
            <div>
              <label class="form-label" for="event-end">Data término</label>
              <input
                id="event-end"
                type="date"
                [(ngModel)]="form.end"
                name="eventEnd"
                required
                class="form-field"
              />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="form-label mb-0">Dias do evento</label>
              <button type="button" (click)="adicionarDia()" class="btn-action-tonal text-xs">+ Dia</button>
            </div>
            <p class="text-xs text-slate-500 mb-2">Opcional. Cada data deve estar entre início e término.</p>
            <div *ngIf="form.days.length === 0" class="text-sm text-slate-500 py-2">Nenhum dia adicionado.</div>
            <div
              *ngFor="let day of form.days; let i = index"
              class="border border-[var(--app-border)] rounded-xl p-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-2"
            >
              <div class="md:col-span-2 flex justify-between items-center">
                <span class="text-xs font-semibold text-slate-600">Dia {{ i + 1 }}</span>
                <button type="button" (click)="removerDia(i)" class="text-xs text-rose-600 hover:underline">Remover</button>
              </div>
              <div>
                <label class="text-xs text-slate-500">Data</label>
                <input
                  type="date"
                  [(ngModel)]="day.date"
                  [name]="'day_date_' + i"
                  required
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label class="text-xs text-slate-500">Tipo</label>
                <select
                  [(ngModel)]="day.id_type"
                  [name]="'day_type_' + i"
                  required
                  class="w-full mt-0.5 border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option [ngValue]="0" disabled>Selecione</option>
                  <option *ngFor="let t of types()" [ngValue]="t.id_event_day_type">{{ t.description }}</option>
                </select>
              </div>
            </div>
          </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary">Cancelar</button>
        <button type="submit" form="event-form" [disabled]="saving()" class="btn-action-primary">
          {{ saving() ? 'Salvando...' : 'Salvar evento' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class EventListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  readonly formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;
  readonly STATUS_APROVADO = STATUS_APROVADO;
  readonly STATUS_NEGADO = STATUS_NEGADO;
  readonly STATUS_AGUARDANDO_APROVACAO = STATUS_AGUARDANDO_APROVACAO;
  readonly STATUS_AGUARDANDO_PRODUTORA = STATUS_AGUARDANDO_PRODUTORA;

  isAdmin = false;

  events = signal<EventItem[]>([]);
  types = signal<EventDayType[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);

  eligibleSectors = signal<EligibleSector[]>([]);

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterName = '';
  appliedName = '';

  form: EventFormState = this.emptyForm();

  constructor(
    private eventService: EventService,
    private approvalService: ApprovalService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || user?.perfil || '').toUpperCase() === 'ADMIN';
    this.cdr.markForCheck();
    this.carregarTipos();
    this.carregar();
  }

  private emptyForm(): EventFormState {
    return { name: '', start: '', end: '', id_setor: null, days: [] };
  }

  carregarTipos() {
    this.eventService.listTypes().subscribe({
      next: (res) => this.types.set(res.types),
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de dia.'),
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.eventService
      .list(page, this.pagination().limit, {
        name: this.appliedName || undefined,
      })
      .subscribe({
        next: (res) => {
          this.events.set(res.events);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.cdr.markForCheck();
          this.notification.error(this.extractError(err) || 'Falha ao carregar eventos.');
        },
      });
  }

  aplicarFiltros() {
    this.appliedName = this.filterName.trim();
    this.carregar(1);
  }

  limparFiltros() {
    this.filterName = '';
    this.appliedName = '';
    this.carregar(1);
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  novoEvento() {
    this.form = this.emptyForm();
    this.approvalService.listEligibleSectors('EVENTO').subscribe({
      next: (res) => this.eligibleSectors.set(res.sectors),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar setores.'),
    });
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
    this.form = this.emptyForm();
  }

  adicionarDia() {
    const defaultType = this.types()[0]?.id_event_day_type ?? 0;
    this.form.days.push({ date: this.form.start || '', id_type: defaultType });
  }

  removerDia(index: number) {
    this.form.days.splice(index, 1);
  }

  configurar(e: EventItem) {
    void this.router.navigate(['/admin/eventos', e.id_event]);
  }

  salvar() {
    if (!this.form.name.trim()) {
      this.notification.error('Nome do evento é obrigatório.');
      return;
    }
    if (!this.form.start || !this.form.end) {
      this.notification.error('Informe as datas de início e término.');
      return;
    }
    if (this.form.start > this.form.end) {
      this.notification.error('A data de início deve ser anterior ou igual à data de término.');
      return;
    }
    if (!this.form.id_setor) {
      this.notification.error('Selecione o setor aprovador.');
      return;
    }

    for (let i = 0; i < this.form.days.length; i++) {
      const d = this.form.days[i];
      if (!d.date) {
        this.notification.error(`Informe a data do dia ${i + 1}.`);
        return;
      }
      if (d.date < this.form.start || d.date > this.form.end) {
        this.notification.error(
          `A data do dia ${i + 1} deve estar entre o início e o término do evento.`,
        );
        return;
      }
      if (!d.id_type || d.id_type <= 0) {
        this.notification.error(`Selecione o tipo do dia ${i + 1}.`);
        return;
      }
    }

    const payload = {
      name: this.form.name.trim(),
      start: this.form.start,
      end: this.form.end,
      id_setor: this.form.id_setor,
      days:
        this.form.days.length > 0
          ? this.form.days.map((d) => ({ date: d.date, id_type: d.id_type }))
          : undefined,
    };

    this.saving.set(true);
    this.eventService.create(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notification.success('Evento criado.');
        this.fecharModal();
        void this.router.navigate(['/admin/eventos', res.event.id_event]);
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao criar evento.');
      },
    });
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
