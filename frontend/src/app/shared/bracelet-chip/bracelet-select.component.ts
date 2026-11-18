import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { BraceletChipComponent } from './bracelet-chip.component';

export interface BraceletSelectOption {
  id_bracelet_type: number | string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

@Component({
  selector: 'app-bracelet-select',
  standalone: true,
  imports: [BraceletChipComponent],
  host: {
    '[class.brs-host--open]': 'open()',
  },
  template: `
    <div class="brs" [class.brs--open]="open()" [class.brs--disabled]="disabled">
      <button
        type="button"
        class="brs__btn"
        [disabled]="disabled"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel"
        aria-haspopup="listbox"
        (click)="toggle()"
      >
        @if (selected(); as b) {
          <app-bracelet-chip [name]="b.name" [icon]="b.icon" [color]="b.color" />
        } @else {
          <span class="brs__ph">{{ placeholder }}</span>
        }
        <svg class="brs__caret" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6.2 8 10l4-3.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      @if (open()) {
        <ul class="brs__list" role="listbox" [attr.aria-label]="ariaLabel">
          @if (allowEmpty) {
            <li>
              <button
                type="button"
                class="brs__opt"
                [class.on]="value == null"
                role="option"
                [attr.aria-selected]="value == null"
                (click)="pick(null)"
              >
                <span class="brs__ph">{{ placeholder }}</span>
              </button>
            </li>
          }
          @for (b of options; track b.id_bracelet_type) {
            <li>
              <button
                type="button"
                class="brs__opt"
                [class.on]="isSame(b.id_bracelet_type)"
                role="option"
                [attr.aria-selected]="isSame(b.id_bracelet_type)"
                (click)="pick(b.id_bracelet_type)"
              >
                <app-bracelet-chip
                  [name]="b.name"
                  [icon]="b.icon"
                  [color]="b.color"
                  [selectable]="true"
                  [selected]="isSame(b.id_bracelet_type)"
                />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
        max-width: 18rem;
        position: relative;
        z-index: 1;
      }
      :host.brs-host--open {
        z-index: 40;
      }
      .brs {
        position: relative;
      }
      .brs__btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 2.15rem;
        padding: 3px 8px 3px 4px;
        border: 1px solid #e9e4f0;
        border-radius: 10px;
        background: #fff;
        cursor: pointer;
        text-align: left;
      }
      .brs__btn:hover:not(:disabled) {
        border-color: #d6c9e6;
      }
      .brs--open .brs__btn {
        border-color: #8d0de3;
        box-shadow: 0 0 0 3px rgba(141, 13, 227, 0.12);
      }
      .brs__btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
      .brs__btn app-bracelet-chip {
        flex: 1 1 auto;
        min-width: 0;
      }
      .brs__ph {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: #6b5b78;
        padding-left: 6px;
      }
      .brs__caret {
        width: 14px;
        height: 14px;
        flex: 0 0 14px;
        color: #6b5b78;
      }
      .brs--open .brs__caret {
        transform: rotate(180deg);
      }
      .brs__list {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        min-width: 100%;
        max-height: 16rem;
        overflow: auto;
        margin: 0;
        padding: 6px;
        list-style: none;
        background: #fff;
        border: 1px solid #e9e4f0;
        border-radius: 12px;
        box-shadow: 0 10px 28px rgba(30, 0, 47, 0.12);
      }
      .brs__opt {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 5px 6px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
      }
      .brs__opt:hover,
      .brs__opt.on {
        background: #f6f0fb;
      }
    `,
  ],
})
export class BraceletSelectComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() options: BraceletSelectOption[] = [];
  @Input() value: number | string | null = null;
  @Input() placeholder = 'Pulseira';
  @Input() allowEmpty = false;
  @Input() disabled = false;
  @Input() ariaLabel = 'Pulseira';
  @Output() valueChange = new EventEmitter<number | string | null>();

  readonly open = signal(false);

  selected(): BraceletSelectOption | null {
    if (this.value == null) return null;
    return this.options.find((b) => this.sameId(b.id_bracelet_type, this.value)) || null;
  }

  isSame(id: number | string | null): boolean {
    return this.sameId(id, this.value);
  }

  toggle(): void {
    if (this.disabled) return;
    this.open.update((v) => !v);
  }

  pick(id: number | string | null): void {
    this.open.set(false);
    if (this.sameId(id, this.value)) return;
    this.valueChange.emit(id);
  }

  private sameId(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
    if (a == null || b == null) return a == null && b == null;
    return String(a) === String(b);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
