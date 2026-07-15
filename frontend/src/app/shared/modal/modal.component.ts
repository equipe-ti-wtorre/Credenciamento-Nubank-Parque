import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

let modalIdCounter = 0;

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open) {
      <div class="modal-root" (keydown)="onKeydown($event)">
        <button
          type="button"
          class="modal-backdrop"
          aria-label="Fechar"
          (click)="onBackdropClick()"
        ></button>

        <div
          #dialogPanel
          class="modal-panel"
          [class.modal-panel--sm]="size === 'sm'"
          [class.modal-panel--md]="size === 'md'"
          [class.modal-panel--lg]="size === 'lg'"
          [class.modal-panel--xl]="size === 'xl'"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="title ? titleId : null"
          [attr.aria-describedby]="subtitle ? subtitleId : null"
          tabindex="-1"
        >
          @if (title || showClose) {
            <div class="modal-header">
              <div class="modal-header__text">
                @if (title) {
                  <h2 [id]="titleId" class="modal-header__title">{{ title }}</h2>
                }
                @if (subtitle) {
                  <p [id]="subtitleId" class="modal-header__subtitle">{{ subtitle }}</p>
                }
                <ng-content select="[modal-header-extra]"></ng-content>
              </div>
              @if (showClose) {
                <button
                  type="button"
                  class="modal-close"
                  aria-label="Fechar"
                  (click)="close.emit()"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              }
            </div>
          }

          <div class="modal-body">
            <ng-content></ng-content>
          </div>

          <ng-content select="[modal-footer]"></ng-content>
        </div>
      </div>
    }
  `,
  styleUrl: './modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() showClose = true;
  @Input() closeOnBackdrop = true;
  @Input() focusFirstField = true;

  /** Quando true, Esc emite escapePress em vez de close (ex.: edição inline ativa). */
  @Input() interceptEscape = false;

  @Output() closed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() escapePress = new EventEmitter<void>();

  @ViewChild('dialogPanel') dialogPanel?: ElementRef<HTMLElement>;

  readonly titleId = `modal-title-${++modalIdCounter}`;
  readonly subtitleId = `modal-subtitle-${modalIdCounter}`;

  private previouslyFocused: HTMLElement | null = null;
  private focusTrapHandler = (event: KeyboardEvent) => this.handleFocusTrap(event);

  ngAfterViewInit(): void {
    if (this.open) this.onOpen();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        queueMicrotask(() => this.onOpen());
      } else {
        this.onClose();
      }
    }
  }

  ngOnDestroy(): void {
    this.detachFocusTrap();
    document.body.style.overflow = '';
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.close.emit();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.interceptEscape) {
        this.escapePress.emit();
      } else {
        this.close.emit();
      }
    }
  }

  private onOpen(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    this.attachFocusTrap();

    if (this.focusFirstField) {
      queueMicrotask(() => this.focusInitialElement());
    } else {
      queueMicrotask(() => this.dialogPanel?.nativeElement.focus());
    }
  }

  private onClose(): void {
    this.detachFocusTrap();
    document.body.style.overflow = '';
    this.previouslyFocused?.focus?.();
    this.previouslyFocused = null;
    this.closed.emit();
  }

  private focusInitialElement(): void {
    const panel = this.dialogPanel?.nativeElement;
    if (!panel) return;

    const focusable = this.getFocusableElements(panel);
    const firstInput = focusable.find(
      (el) => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA',
    );
    (firstInput ?? focusable[0] ?? panel).focus();
  }

  private attachFocusTrap(): void {
    document.addEventListener('keydown', this.focusTrapHandler, true);
  }

  private detachFocusTrap(): void {
    document.removeEventListener('keydown', this.focusTrapHandler, true);
  }

  private handleFocusTrap(event: KeyboardEvent): void {
    if (!this.open || event.key !== 'Tab') return;

    const panel = this.dialogPanel?.nativeElement;
    if (!panel) return;

    const focusable = this.getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusableElements(root: HTMLElement): HTMLElement[] {
    const selector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
    );
  }
}
