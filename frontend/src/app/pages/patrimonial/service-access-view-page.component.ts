import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  PatrimonialService,
  ServiceAccessCollaborator,
  ServiceAccessItem,
  ServiceAccessVehicle,
} from '../../services/patrimonial.service';
import { CollaboratorService } from '../../services/collaborator.service';
import { NotificationService } from '../../core/services/notification.service';
import { TeamsContextService } from '../../services/teams-context.service';

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // Fallback para timestamps MySQL "YYYY-MM-DD HH:mm:ss" sem timezone.
    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/,
    );
    if (match) {
      const [, y, m, d, hh, mm] = match;
      return `${d}/${m}/${y} ${hh}:${mm}`;
    }
    return String(value);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Página focada em um acesso de serviço — usada pelo deep link do Teams (/acessos-servico/:id).
 * Somente leitura: cabeçalho + colaboradores + veículos.
 */
@Component({
  selector: 'app-service-access-view-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-[calc(100vh-0px)] bg-slate-100" [class.min-h-screen]="standaloneShell()">
      <header
        class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3"
      >
        <div class="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Credenciamento · Acesso de serviço
            </p>
            <h1 class="text-base font-semibold text-slate-900 truncate">
              {{ title() }}
            </h1>
          </div>
          <a
            *ngIf="!inTeams()"
            routerLink="/admin/acessos-servico"
            class="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Lista
          </a>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 py-5 pb-10">
        <div *ngIf="loading()" class="rounded-xl bg-white p-8 text-center text-slate-500 text-sm">
          Carregando acesso de serviço…
        </div>

        <div
          *ngIf="!loading() && error()"
          class="rounded-xl bg-white border border-red-100 p-6 text-center"
        >
          <p class="text-sm text-red-700">{{ error() }}</p>
          <button
            type="button"
            class="mt-4 text-sm font-semibold text-blue-600"
            (click)="carregar()"
          >
            Tentar de novo
          </button>
        </div>

        <ng-container *ngIf="!loading() && service() as svc">
          <section class="rounded-xl bg-white shadow-sm border border-slate-200/80 overflow-hidden">
            <div class="px-4 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <span
                class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                [ngClass]="statusBadgeClass(svc.id_access_status)"
              >
                {{ svc.access_status_description || '—' }}
              </span>
              <span
                *ngIf="!svc.status"
                class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600"
              >
                Desabilitado
              </span>
              <span class="text-xs text-slate-500 ml-auto">#{{ svc.id_service_access }}</span>
            </div>

            <div class="px-4 py-4 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
                <p>
                  <span class="text-slate-500">Finalidade:</span>
                  {{ svc.finalidade || '—' }}
                </p>
                <p>
                  <span class="text-slate-500">Período:</span>
                  {{ formatDateBr(svc.start_date) }} – {{ formatDateBr(svc.end_date) }}
                </p>
                <p>
                  <span class="text-slate-500">Empresa:</span>
                  {{ svc.company_fancy_name || '—' }}
                </p>
                <p>
                  <span class="text-slate-500">Setor:</span>
                  {{ svc.setor_nome || svc.requesting_department || '—' }}
                </p>
                <p>
                  <span class="text-slate-500">Solicitante:</span>
                  {{ svc.solicitante?.nome || '—' }}
                </p>
                <p class="sm:col-span-2" *ngIf="svc.observacao">
                  <span class="text-slate-500">Observação:</span> {{ svc.observacao }}
                </p>
              </div>

              <section>
                <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2.5">
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Colaboradores
                  <span
                    *ngIf="svc.collaborators.length > 0"
                    class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]"
                  >
                    {{ svc.collaborators.length }}
                  </span>
                </div>

                <p *ngIf="!svc.collaborators.length" class="text-sm text-slate-500">
                  Nenhum colaborador neste acesso.
                </p>

                <ul class="space-y-2" *ngIf="svc.collaborators.length">
                  <li
                    *ngFor="let c of svc.collaborators"
                    class="flex items-center gap-3 text-sm rounded-xl bg-slate-50 px-3.5 py-2.5 border border-slate-100"
                  >
                    <img
                      *ngIf="pictureUrl(c) as url"
                      [src]="url"
                      [alt]="'Foto de ' + c.collaborator_name"
                      class="shrink-0 w-[34px] h-[34px] rounded-full object-cover border border-slate-200"
                    />
                    <span
                      *ngIf="!pictureUrl(c)"
                      class="shrink-0 w-[34px] h-[34px] rounded-full grid place-items-center text-[13px] font-semibold bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]"
                    >
                      {{ initials(c.collaborator_name) }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium text-slate-900 truncate">{{
                        c.collaborator_name
                      }}</span>
                      <span class="block text-[12.5px] text-slate-500 truncate">
                        {{ c.collaborator_document }}
                        <ng-container *ngIf="c.role_description">
                          · {{ c.role_description }}
                        </ng-container>
                      </span>
                      <span
                        class="mt-1 flex flex-wrap items-center gap-1.5"
                        *ngIf="c.access_check_in || c.access_check_out"
                      >
                        <span
                          *ngIf="c.access_check_in"
                          class="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium"
                        >
                          Entrada: {{ formatDateTimeBr(c.access_check_in) }}
                        </span>
                        <span
                          *ngIf="c.access_check_out"
                          class="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 text-[11px] font-medium"
                        >
                          Saída: {{ formatDateTimeBr(c.access_check_out) }}
                        </span>
                      </span>
                      <span
                        class="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        [ngClass]="accessBadgeClass(c.access_id, c.access_check_in)"
                        *ngIf="!c.access_check_in"
                      >
                        {{ accessBadgeLabel(c.access_id, c.access_check_in) }}
                      </span>
                    </span>
                  </li>
                </ul>
              </section>

              <section>
                <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2.5">
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path
                      d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"
                    />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                  Veículos
                  <span
                    *ngIf="svc.vehicles.length > 0"
                    class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]"
                  >
                    {{ svc.vehicles.length }}
                  </span>
                </div>

                <p *ngIf="!svc.vehicles.length" class="text-sm text-slate-500">
                  Nenhum veículo neste acesso.
                </p>

                <ul class="space-y-2" *ngIf="svc.vehicles.length">
                  <li
                    *ngFor="let v of svc.vehicles"
                    class="rounded-xl bg-slate-50 px-3.5 py-2.5 border border-slate-100"
                  >
                    <div class="flex flex-wrap items-center gap-2 text-sm">
                      <span class="font-medium text-slate-900">{{ v.plate }}</span>
                      <span class="text-slate-500" *ngIf="vehicleSubtitle(v) as sub">{{ sub }}</span>
                      <span
                        class="text-slate-400 text-[12.5px]"
                        *ngIf="v.vehicle_description"
                      >
                        · {{ v.vehicle_description }}
                      </span>
                    </div>
                    <div
                      class="mt-1 flex flex-wrap items-center gap-1.5"
                      *ngIf="v.check_in || v.check_out"
                    >
                      <span
                        *ngIf="v.check_in"
                        class="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium"
                      >
                        Entrada: {{ formatDateTimeBr(v.check_in) }}
                      </span>
                      <span
                        *ngIf="v.check_out"
                        class="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2 py-0.5 text-[11px] font-medium"
                      >
                        Saída: {{ formatDateTimeBr(v.check_out) }}
                      </span>
                    </div>
                    <div
                      class="mt-1"
                      *ngIf="!v.check_in"
                    >
                      <span
                        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        [ngClass]="accessBadgeClass(v.access_id, v.check_in)"
                      >
                        {{ accessBadgeLabel(v.access_id, v.check_in) }}
                      </span>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
          </section>

          <p *ngIf="!inTeams()" class="mt-4 text-center">
            <a
              [routerLink]="['/admin/acessos-servico', svc.id_service_access]"
              class="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Abrir gestão completa
            </a>
          </p>
        </ng-container>
      </main>
    </div>
  `,
})
export class ServiceAccessViewPageComponent implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly service = signal<ServiceAccessItem | null>(null);
  readonly error = signal<string | null>(null);
  readonly thumbnailUrls = signal<Record<number, string>>({});
  readonly inTeams = signal(false);
  readonly standaloneShell = signal(false);

  formatDateBr = formatDateBr;
  formatDateTimeBr = formatDateTimeBr;

  private serviceId = 0;
  private lastSilentLoadAt = 0;
  private thumbnailLoadId = 0;

  constructor(
    private route: ActivatedRoute,
    private patrimonialService: PatrimonialService,
    private collaboratorService: CollaboratorService,
    private notification: NotificationService,
    private teamsContext: TeamsContextService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.serviceId) {
      this.carregar({ silent: true });
    }
  }

  async ngOnInit() {
    const inTeams = await this.teamsContext.ensureInitialized();
    this.inTeams.set(inTeams);
    this.standaloneShell.set(inTeams || !document.querySelector('app-main-layout'));

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.error.set('Acesso de serviço inválido.');
      this.loading.set(false);
      return;
    }
    this.serviceId = id;
    this.carregar();
  }

  ngOnDestroy() {
    this.revokeThumbnails();
  }

  title(): string {
    const svc = this.service();
    if (!svc) return `Serviço #${this.serviceId || ''}`;
    return svc.finalidade
      ? `${svc.finalidade} · #${svc.id_service_access}`
      : `Serviço #${svc.id_service_access}`;
  }

  carregar(options: { silent?: boolean } = {}) {
    if (options.silent) {
      const now = Date.now();
      if (now - this.lastSilentLoadAt < 2500) return;
      this.lastSilentLoadAt = now;
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    this.patrimonialService.getById(this.serviceId).subscribe({
      next: (res) => {
        this.service.set(res.service);
        this.loadThumbnails(res.service.collaborators || []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        if (!options.silent) {
          this.error.set(
            this.notification.extractErrorMessage(
              err,
              'Não foi possível carregar o acesso de serviço.',
            ),
          );
        }
        this.cdr.markForCheck();
      },
    });
  }

  statusBadgeClass(idAccessStatus: number): string {
    if (idAccessStatus === 3) return 'bg-emerald-50 text-emerald-800';
    if (idAccessStatus === 4) return 'bg-rose-50 text-rose-800';
    if (idAccessStatus === 1 || idAccessStatus === 2) return 'bg-amber-50 text-amber-800';
    return 'bg-slate-100 text-slate-600';
  }

  pictureUrl(c: ServiceAccessCollaborator): string | null {
    return this.thumbnailUrls()[c.id_collaborator] ?? null;
  }

  initials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  vehicleSubtitle(v: ServiceAccessVehicle): string | null {
    const parts = [v.brand, v.model, v.color].map((x) => String(x || '').trim()).filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  accessBadgeLabel(accessId: string | null, checkIn: string | null): string {
    if (checkIn) return 'Presente';
    return accessId ? 'Aguardando entrada' : 'Sem acesso liberado';
  }

  accessBadgeClass(accessId: string | null, checkIn: string | null): string {
    if (checkIn) return 'bg-emerald-50 text-emerald-700';
    return accessId ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500';
  }

  private loadThumbnails(list: ServiceAccessCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.collaborator_picture) continue;
      this.collaboratorService.getPictureBlob(c.collaborator_picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [c.id_collaborator]: url }));
          this.cdr.markForCheck();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }
}
