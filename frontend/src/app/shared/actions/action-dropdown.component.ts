import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-action-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="action-dropdown" #root>
      <button
        #trigger
        type="button"
        class="action-btn action-btn--neutral"
        aria-label="Mais ações"
        aria-haspopup="menu"
        [attr.aria-expanded]="open"
        (click)="toggle($event)"
      >
        <svg
          class="action-btn__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      @if (open) {
        <div
          #panel
          class="action-dropdown__panel"
          role="menu"
          [style.top.px]="panelTop"
          [style.left.px]="panelLeft"
          (click)="onPanelClick($event)"
        >
          <ng-content></ng-content>
        </div>
      }
    </div>
  `,
})
export class ActionDropdownComponent implements OnDestroy {
  private static openInstance: ActionDropdownComponent | null = null;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  open = false;
  panelTop = 0;
  panelLeft = 0;
  private ignoreNextDocumentClick = false;
  private panelMovedToBody = false;

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
    if (this.open) {
      this.updatePanelPosition();
    }
  }

  ngOnDestroy(): void {
    this.detachPanelFromBody();
    if (ActionDropdownComponent.openInstance === this) {
      ActionDropdownComponent.openInstance = null;
    }
  }

  private openMenu(): void {
    if (
      ActionDropdownComponent.openInstance &&
      ActionDropdownComponent.openInstance !== this
    ) {
      ActionDropdownComponent.openInstance.close();
    }

    this.open = true;
    ActionDropdownComponent.openInstance = this;
    this.cdr.detectChanges();

    setTimeout(() => {
      this.attachPanelToBody();
      this.updatePanelPosition();
      this.focusFirstItem();
      this.cdr.detectChanges();
    }, 0);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.detachPanelFromBody();
    if (ActionDropdownComponent.openInstance === this) {
      ActionDropdownComponent.openInstance = null;
    }
    this.cdr.detectChanges();
  }

  onPanelClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button[appActionDropdownItem]')) {
      this.close();
    }
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
      (this.host.nativeElement.querySelector('.action-dropdown__panel') as HTMLElement | null)
    );
  }

  private updatePanelPosition(): void {
    const trigger = this.triggerRef?.nativeElement;
    const panel = this.getPanelElement();
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || panel.getBoundingClientRect().width || 200;
    const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || 100;
    const gap = 4;
    const margin = 8;

    let top = rect.bottom + gap;
    let left = rect.right - panelWidth;

    if (top + panelHeight > window.innerHeight - margin) {
      top = rect.top - panelHeight - gap;
    }
    if (top < margin) {
      top = margin;
    }
    if (left < margin) {
      left = margin;
    }
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin;
    }

    this.panelTop = top;
    this.panelLeft = left;
  }

  private focusFirstItem(): void {
    const panel = this.getPanelElement();
    if (!panel) return;
    const firstItem = panel.querySelector(
      'button[appActionDropdownItem]',
    ) as HTMLElement | null;
    firstItem?.focus();
  }
}
