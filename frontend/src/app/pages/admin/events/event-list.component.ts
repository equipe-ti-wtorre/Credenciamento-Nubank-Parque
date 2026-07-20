import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  EventDetail,
  EventItem,
  EventService,
  formatDateBr,
} from '../../../services/event.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_PRODUTORA,
  STATUS_APROVADO,
  STATUS_NEGADO,
  STATUS_EXPIRADO,
  statusBadgeClass,
} from '../../../services/credential.service';
import { NovoEventoModalComponent } from './novo-evento-modal/novo-evento-modal.component';

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NovoEventoModalComponent],
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
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            @if (loading()) {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Carregando…</td>
              </tr>
            } @else if (events().length === 0) {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum evento encontrado.</td>
              </tr>
            } @else {
              @for (e of events(); track e.id_event) {
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 font-medium text-slate-800">{{ e.name }}</td>
                  <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.start) }}</td>
                  <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.end) }}</td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [ngClass]="statusBadgeClass(e.id_access_status ?? 0)"
                    >
                      {{ e.access_status_description || '—' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button type="button" class="text-[var(--color-primary)] text-xs font-medium hover:underline" (click)="configurar(e)">
                      Abrir
                    </button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <div class="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <span class="text-xs text-slate-500">
            Página {{ pagination().page }} de {{ pagination().totalPages }} · {{ pagination().total }} evento(s)
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

    <app-novo-evento-modal
      [open]="showModal()"
      [lockEmpresa]="lockResponsavel"
      [defaultEmpresaId]="userCompanyId"
      (closed)="fecharModal()"
      (saved)="onEventoSalvo($event)"
    />
  `,
})
export class EventListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  readonly formatDateBr = formatDateBr;
  readonly statusBadgeClass = statusBadgeClass;
  readonly STATUS_APROVADO = STATUS_APROVADO;
  readonly STATUS_NEGADO = STATUS_NEGADO;
  readonly STATUS_EXPIRADO = STATUS_EXPIRADO;
  readonly STATUS_AGUARDANDO_APROVACAO = STATUS_AGUARDANDO_APROVACAO;
  readonly STATUS_AGUARDANDO_PRODUTORA = STATUS_AGUARDANDO_PRODUTORA;

  lockResponsavel = false;
  userCompanyId: number | null = null;

  events = signal<EventItem[]>([]);
  loading = signal(false);
  showModal = signal(false);

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterName = '';
  appliedName = '';

  constructor(
    private eventService: EventService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    const role = String(user?.role || user?.perfil || '').toUpperCase();
    this.userCompanyId = user?.id_company != null ? Number(user.id_company) : null;
    this.lockResponsavel = role === 'PRODUTORA' && this.userCompanyId != null;
    this.cdr.markForCheck();
    this.carregar();
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
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  onEventoSalvo(event: EventDetail) {
    this.showModal.set(false);
    void this.router.navigate(['/admin/eventos', event.id_event]);
  }

  configurar(e: EventItem) {
    void this.router.navigate(['/admin/eventos', e.id_event]);
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
