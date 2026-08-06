import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-suggest-input',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SuggestInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="suggest" [class.suggest--open]="open()">
      <input
        #inputEl
        type="text"
        class="suggest__input"
        [ngClass]="inputClass"
        [id]="inputId || null"
        [name]="name || null"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [required]="required"
        [attr.autocomplete]="'off'"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.role]="'combobox'"
        [value]="value"
        (input)="onInput($event)"
        (focus)="onFocus()"
        (keydown)="onKeydown($event)"
      />
      <button
        type="button"
        class="suggest__chevron"
        tabindex="-1"
        aria-label="Abrir sugestões"
        [disabled]="disabled"
        (mousedown)="$event.preventDefault()"
        (click)="toggle()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      @if (open() && filtered().length) {
        <ul [id]="listId" class="suggest__list" role="listbox">
          @for (opt of filtered(); track opt; let i = $index) {
            <li
              role="option"
              class="suggest__option"
              [class.is-active]="i === activeIndex()"
              [attr.aria-selected]="i === activeIndex()"
              (mousedown)="$event.preventDefault(); pick(opt)"
              (mouseenter)="activeIndex.set(i)"
            >
              {{ opt }}
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
      }
      .suggest {
        position: relative;
      }
      .suggest__input {
        width: 100%;
        padding-right: 2.25rem;
      }
      .suggest__chevron {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        border: 0;
        background: transparent;
        color: var(--text-muted, #64748b);
        cursor: pointer;
        border-radius: 0.375rem;
        padding: 0;
      }
      .suggest__chevron:hover:not(:disabled) {
        color: var(--brand);
        background: var(--brand-tonal-bg);
      }
      .suggest__chevron:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .suggest__chevron svg {
        width: 1rem;
        height: 1rem;
      }
      .suggest--open .suggest__chevron {
        color: var(--brand);
      }
      .suggest__list {
        position: absolute;
        z-index: 40;
        left: 0;
        right: 0;
        top: calc(100% + 0.25rem);
        margin: 0;
        padding: 0.25rem;
        list-style: none;
        max-height: 14rem;
        overflow-y: auto;
        background: var(--color-bg-surface, #fff);
        border: 1px solid var(--app-border);
        border-radius: var(--form-radius, 0.75rem);
        box-shadow:
          0 10px 15px -3px rgba(0, 0, 0, 0.1),
          0 4px 6px -4px rgba(0, 0, 0, 0.1);
      }
      .suggest__option {
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        cursor: pointer;
      }
      .suggest__option:hover,
      .suggest__option.is-active {
        background: var(--brand-tonal-bg);
        color: var(--brand);
      }
    `,
  ],
})
export class SuggestInputComponent implements ControlValueAccessor {
  @Input() options: readonly string[] | string[] = [];
  @Input() placeholder = '';
  @Input() name = '';
  @Input() inputId = '';
  @Input() inputClass = 'form-field';
  @Input() required = false;

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  value = '';
  disabled = false;
  open = signal(false);
  activeIndex = signal(0);
  filtered = signal<string[]>([]);

  readonly listId = `suggest-list-${Math.random().toString(36).slice(2, 9)}`;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    const host = (ev.target as Node) || null;
    if (host && !this.el.nativeElement.contains(host)) {
      this.close();
    }
  }

  constructor(private el: ElementRef<HTMLElement>) {}

  writeValue(v: string | null): void {
    this.value = v ?? '';
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(ev: Event) {
    const next = (ev.target as HTMLInputElement).value;
    this.value = next;
    this.onChange(next);
    this.refreshFilter(next);
    this.open.set(true);
    this.activeIndex.set(0);
  }

  onFocus() {
    this.refreshFilter(this.value);
    if (this.filtered().length) this.open.set(true);
  }

  toggle() {
    if (this.disabled) return;
    if (this.open()) {
      this.close();
      return;
    }
    this.refreshFilter(this.value, true);
    this.open.set(this.filtered().length > 0);
    this.inputEl?.nativeElement.focus();
  }

  pick(opt: string) {
    this.value = opt;
    this.onChange(opt);
    this.onTouched();
    this.close();
  }

  onKeydown(ev: KeyboardEvent) {
    if (!this.open() && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      this.refreshFilter(this.value, true);
      this.open.set(this.filtered().length > 0);
      return;
    }
    if (!this.open()) {
      if (ev.key === 'Escape') this.onTouched();
      return;
    }
    const list = this.filtered();
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, list.length - 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (ev.key === 'Enter') {
      const opt = list[this.activeIndex()];
      if (opt) {
        ev.preventDefault();
        this.pick(opt);
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
    }
  }

  private refreshFilter(query: string, showAll = false) {
    const q = String(query || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    const opts = [...(this.options || [])];
    const next =
      !q || showAll
        ? opts
        : opts.filter((o) =>
            o
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .includes(q),
          );
    this.filtered.set(next);
    if (!next.length) this.open.set(false);
  }

  private close() {
    this.open.set(false);
    this.activeIndex.set(0);
  }
}
