import { ChangeDetectorRef, Component, inject, OnInit, signal, ViewChild } from '@angular/core';
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
import { EventFormComponent } from './event-form.component';

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [CommonModule, FormsModule, EventFormComponent],
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
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-secondary disabled:opacity-50">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button *ngIf="isAdmin" type="button" (click)="novoEvento()" class="btn-primary">+ Novo evento</button>
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
          <button type="button" (click)="aplicarFiltros()" class="btn-primary text-sm py-1.5 px-4">Filtrar</button>
          <button type="button" (click)="limparFiltros()" class="btn-secondary text-sm py-1.5 px-4">Limpar</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Início</th>
              <th class="px-4 py-3 text-left">Término</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let e of events()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ e.name }}</td>
                <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.start) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ formatDateBr(e.end) }}</td>
                <td class="px-4 py-3 text-right">
                  <button type="button" (click)="configurar(e)" class="btn-secondary text-xs py-1 px-3">
                    Configurar
                  </button>
                </td>
              </tr>
              <tr *ngIf="events().length === 0">
                <td colspan="4" class="px-4 py-8 text-center text-slate-500">Nenhum evento encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="4" class="px-4 py-8 text-center text-slate-500">Carregando eventos...</td>
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

    <div
      *ngIf="showModal()"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Fechar" (click)="fecharModal()"></button>
      <div class="relative w-full max-w-3xl card-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-4 mb-4">
          <h3 class="text-lg font-bold text-slate-800">Novo evento</h3>
          <button type="button" (click)="fecharModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <app-event-form
          #eventFormRef
          (saved)="onEventSaved($event)"
          (cancelled)="fecharModal()"
        />
      </div>
    </div>
  `,
})
export class EventListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  readonly formatDateBr = formatDateBr;

  @ViewChild('eventFormRef') eventFormRef?: EventFormComponent;

  isAdmin = false;

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
    this.isAdmin = String(user?.role || user?.perfil || '').toUpperCase() === 'ADMIN';
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
    setTimeout(() => this.eventFormRef?.reset(), 0);
  }

  fecharModal() {
    this.showModal.set(false);
  }

  onEventSaved(event: EventDetail) {
    this.notification.success('Evento criado.');
    this.fecharModal();
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
