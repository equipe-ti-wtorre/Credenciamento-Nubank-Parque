import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AlertsService, SystemAlert } from '../services/alerts.service';

const POLL_MS = 30_000;

@Component({
  selector: 'app-notifications-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notifications-dropdown" #root>
      <button
        #trigger
        type="button"
        class="icon-btn"
        aria-label="Notificações"
        aria-haspopup="menu"
        [attr.aria-expanded]="open"
        (click)="toggle($event)"
      >
        @if (unreadCount() > 0) {
          <span
            class="notif-count"
            [attr.aria-label]="unreadCount() + ' alertas não lidos'"
          >{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
        }
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
      </button>

      @if (open) {
        <div
          #panel
          class="notifications-dropdown__panel"
          role="menu"
          [style.top.px]="panelTop"
          [style.left.px]="panelLeft"
          (click)="$event.stopPropagation()"
        >
          <div class="notifications-dropdown__header">
            <span class="notifications-dropdown__title">Alertas</span>
            <div class="notifications-dropdown__header-actions">
              @if (unreadCount() > 0) {
                <button
                  type="button"
                  class="notifications-dropdown__mark-all"
                  [disabled]="markingAll"
                  (click)="markAllAsRead($event)"
                >
                  Marcar todas como lidas
                </button>
              }
              @if (alerts().length > 0) {
                <button
                  type="button"
                  class="notifications-dropdown__clear-all"
                  [disabled]="clearingAll"
                  (click)="clearAll($event)"
                >
                  Limpar todas as mensagens
                </button>
              }
            </div>
          </div>

          <div class="notifications-dropdown__body">
            @if (loading) {
              <p class="notifications-dropdown__empty">Carregando…</p>
            } @else if (loadError) {
              <p class="notifications-dropdown__empty">Não foi possível carregar os alertas.</p>
            } @else if (alerts().length === 0) {
              <p class="notifications-dropdown__empty">Nenhum alerta no momento.</p>
            } @else {
              <ul class="notifications-dropdown__list">
                @for (alert of alerts(); track alert.id) {
                  <li class="notifications-dropdown__row">
                    <button
                      type="button"
                      class="notifications-dropdown__item"
                      [class.notifications-dropdown__item--unread]="!alert.lidaEm"
                      role="menuitem"
                      (click)="onAlertClick(alert, $event)"
                    >
                      <span class="notifications-dropdown__item-title">{{ alert.titulo }}</span>
                      <span class="notifications-dropdown__item-msg">{{ alert.mensagem }}</span>
                      <span class="notifications-dropdown__item-time">{{
                        formatTime(alert.criadoEm)
                      }}</span>
                    </button>
                    <button
                      type="button"
                      class="notifications-dropdown__delete"
                      aria-label="Excluir alerta"
                      title="Excluir"
                      [disabled]="deletingId === alert.id"
                      (click)="deleteAlert(alert, $event)"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.9"
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
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationsDropdownComponent implements OnInit, OnDestroy {
  private static openInstance: NotificationsDropdownComponent | null = null;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly alertsApi = inject(AlertsService);
  private readonly router = inject(Router);

  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  open = false;
  panelTop = 0;
  panelLeft = 0;
  loading = false;
  loadError = false;
  markingAll = false;
  clearingAll = false;
  deletingId: number | null = null;

  readonly unreadCount = signal(0);
  readonly alerts = signal<SystemAlert[]>([]);

  private ignoreNextDocumentClick = false;
  private panelMovedToBody = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private routerSub?: Subscription;

  ngOnInit(): void {
    this.refreshUnreadCount();
    this.pollTimer = setInterval(() => this.refreshUnreadCount(), POLL_MS);
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.refreshUnreadCount();
        if (this.open) this.reloadAlerts();
      });
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.routerSub?.unsubscribe();
    this.detachPanelFromBody();
    if (NotificationsDropdownComponent.openInstance === this) {
      NotificationsDropdownComponent.openInstance = null;
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.refreshUnreadCount();
    if (this.open) this.reloadAlerts();
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open) {
      this.close();
      return;
    }
    this.ignoreNextDocumentClick = true;
    this.openMenu();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.ignoreNextDocumentClick) {
      this.ignoreNextDocumentClick = false;
      return;
    }
    if (!this.open) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    const panel = this.getPanelElement();
    if (target && panel?.contains(target)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.open) this.updatePanelPosition();
  }

  formatTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  markAllAsRead(event: MouseEvent): void {
    event.stopPropagation();
    if (this.markingAll || this.unreadCount() === 0) return;
    this.markingAll = true;
    this.alertsApi.markAllRead().subscribe({
      next: () => {
        this.runPanelUiUpdate(() => {
          this.unreadCount.set(0);
          this.alerts.update((list) =>
            list.map((a) => ({ ...a, lidaEm: a.lidaEm || new Date().toISOString() })),
          );
          this.markingAll = false;
        });
      },
      error: () => {
        this.markingAll = false;
        this.cdr.detectChanges();
      },
    });
  }

  deleteAlert(alert: SystemAlert, event: MouseEvent): void {
    event.stopPropagation();
    if (this.deletingId != null) return;
    this.deletingId = alert.id;
    this.alertsApi.delete(alert.id).subscribe({
      next: () => {
        const wasUnread = !alert.lidaEm;
        this.runPanelUiUpdate(() => {
          this.alerts.update((list) => list.filter((a) => a.id !== alert.id));
          if (wasUnread) {
            this.unreadCount.update((n) => Math.max(0, n - 1));
          }
          this.deletingId = null;
        });
      },
      error: () => {
        this.deletingId = null;
        this.cdr.detectChanges();
      },
    });
  }

  clearAll(event: MouseEvent): void {
    event.stopPropagation();
    if (this.clearingAll || this.alerts().length === 0) return;
    this.clearingAll = true;
    this.alertsApi.deleteAll().subscribe({
      next: () => {
        this.runPanelUiUpdate(() => {
          this.alerts.set([]);
          this.unreadCount.set(0);
          this.clearingAll = false;
        });
      },
      error: () => {
        this.clearingAll = false;
        this.cdr.detectChanges();
      },
    });
  }

  onAlertClick(alert: SystemAlert, event: MouseEvent): void {
    event.stopPropagation();
    const navigate = () => {
      this.close();
      if (alert.link) {
        void this.router.navigateByUrl(alert.link);
      }
    };

    if (alert.lidaEm) {
      navigate();
      return;
    }

    this.alertsApi.markRead(alert.id).subscribe({
      next: () => {
        this.alerts.update((list) =>
          list.map((a) =>
            a.id === alert.id ? { ...a, lidaEm: new Date().toISOString() } : a,
          ),
        );
        this.unreadCount.update((n) => Math.max(0, n - 1));
        navigate();
      },
      error: () => navigate(),
    });
  }

  private openMenu(): void {
    if (
      NotificationsDropdownComponent.openInstance &&
      NotificationsDropdownComponent.openInstance !== this
    ) {
      NotificationsDropdownComponent.openInstance.close();
    }

    this.open = true;
    NotificationsDropdownComponent.openInstance = this;
    this.loading = true;
    this.loadError = false;
    this.cdr.detectChanges();

    setTimeout(() => {
      this.attachPanelToBody();
      this.updatePanelPosition();
      this.cdr.detectChanges();
    }, 0);

    this.reloadAlerts();
  }

  /**
   * O painel é movido para document.body (overflow do layout).
   * Atualizações do Angular precisam ocorrer com o nó de volta no host,
   * senão a lista/badge ficam stale até reabrir o sino.
   */
  private runPanelUiUpdate(mutate: () => void): void {
    const wasOnBody = this.panelMovedToBody;
    if (wasOnBody) this.detachPanelFromBody();
    mutate();
    this.cdr.detectChanges();
    if (wasOnBody && this.open) {
      this.attachPanelToBody();
      this.updatePanelPosition();
      this.cdr.detectChanges();
    } else {
      setTimeout(() => this.updatePanelPosition(), 0);
    }
  }

  private reloadAlerts(): void {
    this.alertsApi.list({ page: 1, pageSize: 20 }).subscribe({
      next: (res) => {
        this.runPanelUiUpdate(() => {
          this.alerts.set(res.data || []);
          this.loading = false;
          this.loadError = false;
        });
        this.refreshUnreadCount();
      },
      error: () => {
        this.runPanelUiUpdate(() => {
          this.loading = false;
          this.loadError = true;
        });
      },
    });
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.detachPanelFromBody();
    if (NotificationsDropdownComponent.openInstance === this) {
      NotificationsDropdownComponent.openInstance = null;
    }
    this.cdr.detectChanges();
  }

  private refreshUnreadCount(): void {
    this.alertsApi.unreadCount().subscribe({
      next: (res) => {
        this.unreadCount.set(Number(res.total) || 0);
        this.cdr.detectChanges();
      },
      error: () => {
        /* silencioso no polling */
      },
    });
  }

  private attachPanelToBody(): void {
    const panel = this.getPanelElement();
    if (!panel || panel.parentElement === document.body) return;
    document.body.appendChild(panel);
    this.panelMovedToBody = true;
  }

  private detachPanelFromBody(): void {
    if (!this.panelMovedToBody) return;
    const panel = this.getPanelElement();
    const root = this.host.nativeElement;
    if (panel && panel.parentElement === document.body && root) {
      root.appendChild(panel);
    }
    this.panelMovedToBody = false;
  }

  private getPanelElement(): HTMLElement | null {
    return (
      this.panelRef?.nativeElement ??
      (this.host.nativeElement.querySelector(
        '.notifications-dropdown__panel',
      ) as HTMLElement | null)
    );
  }

  private updatePanelPosition(): void {
    const trigger = this.triggerRef?.nativeElement;
    const panel = this.getPanelElement();
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || panel.getBoundingClientRect().width || 360;
    const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || 200;
    const gap = 8;
    const margin = 8;

    let top = rect.bottom + gap;
    let left = rect.right - panelWidth;

    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - panelHeight - gap);
    }
    if (left < margin) left = margin;
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin;
    }

    this.panelTop = top;
    this.panelLeft = left;
  }
}
