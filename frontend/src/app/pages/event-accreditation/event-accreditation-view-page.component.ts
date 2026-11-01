import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NavigationStateService } from '../../core/services/navigation-state.service';
import { redirecionarSeAcessoNegado } from '../../core/utils/acesso-negado';
import { NotificationService } from '../../core/services/notification.service';
import {
  AccreditationInternal,
  BraceletType,
  EventAccreditationItem,
  EventAccreditationService,
  formatDateTimeBr,
  formatEventDatesBr,
  isCollaboratorApproved,
  isCollaboratorBlocked,
  isCollaboratorPending,
} from '../../services/event-accreditation.service';
import { BraceletChipComponent } from '../../shared/bracelet-chip';
import { EventKindBadgeComponent } from './event-kind-badge.component';

/**
 * Página focada de inscrição interna — deep link do Teams (/credenciamento-eventos/:id).
 */
@Component({
  selector: 'app-event-accreditation-view-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, EventKindBadgeComponent, BraceletChipComponent],
  styles: [
    `
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

      :host {
        --eav-wtorre: #1d54e6;
        --eav-wtorre-soft: #eef3ff;
        --eav-font-display: 'Sora', system-ui, sans-serif;
        --eav-font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
        --eav-ink: #0f172a;
        --eav-muted: #64748b;
        --eav-faint: #94a3b8;
        --eav-line: #eef1f6;
        --eav-line-strong: #e6eaf2;
        --eav-card: #fff;
        --eav-ok: #16a34a;
        --eav-ok-bg: #e7f6ed;
        --eav-ok-line: #c7ebd4;
        --eav-wait: #d97706;
        --eav-wait-bg: #fdf3e2;
        --eav-wait-line: #f4dcae;
        --eav-danger: #dc2626;
        --eav-danger-bg: #fef2f2;
        --eav-danger-line: #fecaca;
        --eav-radius: 18px;
        display: block;
        font-family: var(--eav-font-body);
        color: var(--eav-ink);
        -webkit-font-smoothing: antialiased;
      }

      .eav-page {
        min-height: 100vh;
        background: linear-gradient(180deg, #f6f8fc, #e9edf6);
        padding: 26px 18px 40px;
      }
      .eav-wrap {
        max-width: 720px;
        margin: 0 auto;
      }
      .eav-card {
        background: var(--eav-card);
        border-radius: var(--eav-radius);
        border: 1px solid var(--eav-line);
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
        overflow: hidden;
      }
      .eav-topbar {
        margin-bottom: 16px;
        padding: 0 4px;
      }
      .eav-crumb {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--eav-faint);
      }
      .eav-title {
        font-family: var(--eav-font-display);
        font-size: 21px;
        font-weight: 700;
        margin-top: 3px;
      }
      .eav-head {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 22px 26px 18px;
        border-bottom: 1px solid var(--eav-line);
      }
      .eav-cover {
        width: 72px;
        height: 72px;
        border-radius: 14px;
        object-fit: cover;
        background: #f1f5f9;
        flex-shrink: 0;
      }
      .eav-cover-ph {
        width: 72px;
        height: 72px;
        border-radius: 14px;
        background: var(--eav-wtorre-soft);
        color: var(--eav-wtorre);
        display: grid;
        place-items: center;
        font-family: var(--eav-font-display);
        font-weight: 700;
        font-size: 22px;
        flex-shrink: 0;
      }
      .eav-head h1 {
        font-family: var(--eav-font-display);
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 8px;
        letter-spacing: -0.02em;
      }
      .eav-head-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--eav-muted);
      }
      .eav-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        padding: 8px 26px 10px;
      }
      .eav-info .f {
        display: flex;
        gap: 11px;
        padding: 12px 0;
        align-items: flex-start;
      }
      .eav-info .ib {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--eav-wtorre-soft);
        color: var(--eav-wtorre);
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .eav-info .k {
        font-size: 11px;
        font-weight: 600;
        color: var(--eav-faint);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .eav-info .v {
        font-size: 14.5px;
        font-weight: 600;
        margin-top: 2px;
      }
      .eav-section {
        padding: 20px 26px 26px;
        border-top: 1px solid var(--eav-line);
      }
      .eav-sec-title {
        font-family: var(--eav-font-display);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--eav-muted);
        margin: 0 0 8px;
      }
      .eav-sec-sub {
        font-size: 13.5px;
        color: var(--eav-muted);
        margin: 0 0 14px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .eav-br-pick {
        border: 0;
        background: none;
        padding: 0;
        cursor: pointer;
        line-height: 0;
      }
      .eav-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }
      .eav-chip {
        border: 1px solid var(--eav-line-strong);
        background: #fff;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 13.5px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .eav-chip.on {
        background: var(--eav-wtorre-soft);
        border-color: var(--eav-wtorre);
        color: var(--eav-wtorre);
      }
      .eav-btn {
        height: 42px;
        padding: 0 18px;
        border-radius: 999px;
        border: 0;
        font-family: inherit;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
      }
      .eav-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .eav-btn-pri {
        background: var(--eav-wtorre);
        color: #fff;
      }
      .eav-btn-sec {
        background: #fff;
        color: var(--eav-ink);
        border: 1px solid var(--eav-line-strong);
      }
      .eav-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 5px 12px;
        font-weight: 700;
        font-size: 12.5px;
      }
      .eav-pill.warn {
        background: var(--eav-wait-bg);
        color: var(--eav-wait);
        border: 1px solid var(--eav-wait-line);
      }
      .eav-pill.ok {
        background: var(--eav-ok-bg);
        color: var(--eav-ok);
        border: 1px solid var(--eav-ok-line);
      }
      .eav-pill.bad {
        background: var(--eav-danger-bg);
        color: var(--eav-danger);
        border: 1px solid var(--eav-danger-line);
      }
      .eav-empty,
      .eav-loading {
        padding: 48px 20px;
        text-align: center;
        color: var(--eav-muted);
      }
      @media (max-width: 640px) {
        .eav-info {
          grid-template-columns: 1fr;
        }
        .eav-head {
          padding: 18px 18px 14px;
        }
        .eav-section,
        .eav-info {
          padding-left: 18px;
          padding-right: 18px;
        }
      }
    `,
  ],
  template: `
    <div class="eav-page">
      <div class="eav-wrap">
        <div class="eav-topbar">
          <div class="eav-crumb">Credenciamento interno</div>
          <div class="eav-title">Inscrição no evento</div>
        </div>

        @if (loading()) {
          <div class="eav-card"><p class="eav-loading">Carregando…</p></div>
        } @else if (item(); as ev) {
          <div class="eav-card">
            <div class="eav-head">
              @if (coverSrc()) {
                <img [src]="coverSrc()" alt="" class="eav-cover" />
              } @else {
                <span class="eav-cover-ph">{{ ev.name.slice(0, 1) }}</span>
              }
              <div>
                <h1>{{ ev.name }}</h1>
                <div class="eav-head-meta">
                  <app-event-kind-badge [kind]="ev.event_kind" />
                  <span>{{ formatEventDatesBr(ev.event_dates, ev.start, ev.end) }}</span>
                </div>
              </div>
            </div>

            <div class="eav-info">
              <div class="f">
                <span class="ib" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                  </svg>
                </span>
                <div>
                  <div class="k">Prazo de inscrição</div>
                  <div class="v">{{ formatDateTimeBr(ev.inscription_end) }}</div>
                </div>
              </div>
              <div class="f">
                <span class="ib" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-8h6v8"/>
                  </svg>
                </span>
                <div>
                  <div class="k">Time aprovador</div>
                  <div class="v">{{ setoresLabel(ev) }}</div>
                </div>
              </div>
            </div>

            @if (ev.can_register_internal) {
              <section class="eav-section">
                <h2 class="eav-sec-title">Inscrever-me neste evento</h2>
                <p class="eav-sec-sub">Escolha uma ou mais pulseiras disponíveis para colaboradores internos.</p>
                <div class="eav-chips" role="group" aria-label="Pulseiras">
                  @for (b of bracelets(ev); track b.id_bracelet_type) {
                    <button
                      type="button"
                      class="eav-br-pick"
                      role="checkbox"
                      [attr.aria-checked]="pickedBracelets().has(b.id_bracelet_type)"
                      [class.on]="pickedBracelets().has(b.id_bracelet_type)"
                      (click)="toggleBracelet(b.id_bracelet_type)"
                    >
                      <app-bracelet-chip
                        [name]="b.name"
                        [icon]="b.icon"
                        [color]="b.color"
                        [selectable]="true"
                        [selected]="pickedBracelets().has(b.id_bracelet_type)"
                      />
                    </button>
                  }
                </div>
                <button
                  type="button"
                  class="eav-btn eav-btn-pri"
                  [disabled]="acting() || pickedBracelets().size === 0"
                  (click)="inscrever()"
                >
                  {{ acting() ? 'Enviando…' : 'Inscrever-me' }}
                </button>
              </section>
            } @else if (myInternals(ev).length) {
              <section class="eav-section">
                <h2 class="eav-sec-title">Sua inscrição</h2>
                <p class="eav-sec-sub">
                  @for (row of myInternals(ev); track row.id_event_accreditation_internal) {
                    <app-bracelet-chip
                      [name]="row.bracelet_name"
                      [icon]="row.bracelet_icon"
                      [color]="row.bracelet_color"
                    />
                    <span class="eav-pill" [class]="pillClass(row)">{{ pillLabel(row) }}</span>
                  }
                </p>
                @if (ev.inscription_open && hasPendingOwn(ev)) {
                  <button
                    type="button"
                    class="eav-btn eav-btn-sec"
                    [disabled]="acting()"
                    (click)="cancelar()"
                  >
                    {{ acting() ? 'Cancelando…' : 'Cancelar inscrição' }}
                  </button>
                }
              </section>
            } @else {
              <section class="eav-section">
                <p class="eav-sec-sub">
                  @if (!ev.internal_enabled) {
                    Este credenciamento não está aberto para inscrição interna.
                  } @else if (!ev.inscription_open) {
                    A janela de inscrição está fechada.
                  } @else {
                    Você não pode se inscrever neste credenciamento.
                  }
                </p>
              </section>
            }
          </div>
        } @else {
          <div class="eav-card"><p class="eav-empty">Credenciamento não encontrado.</p></div>
        }
      </div>
    </div>
  `,
})
export class EventAccreditationViewPageComponent implements OnInit {
  private readonly service = inject(EventAccreditationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationStateService);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly item = signal<EventAccreditationItem | null>(null);
  readonly coverSrc = signal<string | null>(null);
  readonly loading = signal(true);
  readonly acting = signal(false);
  readonly pickedBracelets = signal<Set<number>>(new Set());

  readonly formatDateTimeBr = formatDateTimeBr;
  readonly formatEventDatesBr = formatEventDatesBr;

  ngOnInit(): void {
    const id = this.nav.obter('/credenciamento-eventos/detalhe')?.public_id || '';
    if (!id) {
      this.loading.set(false);
      void this.router.navigate(['/admin/credenciamento-eventos']);
      return;
    }
    this.load(id as never);
  }

  setoresLabel(ev: EventAccreditationItem): string {
    const names = (ev.setores || []).map((s) => s.nome).filter(Boolean);
    if (names.length) return names.join(', ');
    return ev.setor_nome || '—';
  }

  bracelets(ev: EventAccreditationItem): BraceletType[] {
    return ev.internal_bracelet_types || [];
  }

  toggleBracelet(id: number): void {
    const next = new Set(this.pickedBracelets());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.pickedBracelets.set(next);
  }

  myInternals(ev: EventAccreditationItem): AccreditationInternal[] {
    if (ev.my_internals?.length) return ev.my_internals;
    return ev.my_internal ? [ev.my_internal] : [];
  }

  hasPendingOwn(ev: EventAccreditationItem): boolean {
    return this.myInternals(ev).some((row) => this.isPending(row));
  }

  isPending(row: AccreditationInternal): boolean {
    return isCollaboratorPending(row.id_access_status);
  }

  pillClass(row: AccreditationInternal): string {
    if (isCollaboratorApproved(row.id_access_status)) return 'ok';
    if (isCollaboratorBlocked(row.id_access_status)) return 'bad';
    return 'warn';
  }

  pillLabel(row: AccreditationInternal): string {
    if (isCollaboratorApproved(row.id_access_status)) return 'Aprovado';
    if (isCollaboratorBlocked(row.id_access_status)) return 'Bloqueado';
    return 'Pendente';
  }

  inscrever(): void {
    const ev = this.item();
    const braceletIds = [...this.pickedBracelets()];
    if (!ev || !braceletIds.length) {
      this.notification.error('Selecione ao menos uma pulseira.');
      return;
    }
    this.acting.set(true);
    this.service.registerInternal(ev.id_event_accreditation, { id_bracelet_types: braceletIds }).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.pickedBracelets.set(new Set());
        this.applyItem(res.item);
        this.notification.success(
          braceletIds.length === 1
            ? 'Inscrição enviada para aprovação.'
            : `${braceletIds.length} inscrições enviadas para aprovação.`,
        );
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao se inscrever.');
        this.cdr.markForCheck();
      },
    });
  }

  cancelar(): void {
    const ev = this.item();
    if (!ev) return;
    this.acting.set(true);
    this.service.unregisterInternal(ev.id_event_accreditation).subscribe({
      next: (res) => {
        this.acting.set(false);
        this.applyItem(res.item);
        this.notification.success('Inscrição cancelada.');
      },
      error: (err) => {
        this.acting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao cancelar a inscrição.');
        this.cdr.markForCheck();
      },
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (res) => {
        this.applyItem(res.item);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.item.set(null);
        if (!redirecionarSeAcessoNegado(err, this.router, this.notification, '/admin/credenciamento-eventos')) {
          this.notification.notifyHttpError(err, 'Falha ao carregar o credenciamento.');
        }
        this.cdr.markForCheck();
      },
    });
  }

  private applyItem(item: EventAccreditationItem): void {
    this.item.set(item);
    this.coverSrc.set(null);
    if (item.cover) {
      this.service.getCoverBlob(item.cover).subscribe({
        next: (url) => {
          this.coverSrc.set(url);
          this.cdr.markForCheck();
        },
        error: () => {},
      });
    }
    this.cdr.markForCheck();
  }
}
