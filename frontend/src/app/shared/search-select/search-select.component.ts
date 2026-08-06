import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ss" [class.ss--open]="open()">
      <input
        #inputEl
        type="text"
        class="ss__input"
        [ngClass]="inputClass"
        [id]="inputId || null"
        [name]="name || null"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [attr.autocomplete]="'off'"
        [attr.role]="'combobox'"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [value]="query()"
        (input)="onInput($event)"
        (focus)="onFocus()"
        (keydown)="onKeydown($event)"
      />
      <button
        type="button"
        class="ss__chevron"
        tabindex="-1"
        aria-label="Abrir opções"
        [disabled]="disabled"
        (mousedown)="$event.preventDefault()"
        (click)="toggle()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      @if (open()) {
        <ul [id]="listId" class="ss__list" role="listbox">
          @if (allLabel) {
            <li
              role="option"
              class="ss__option"
              [class.is-active]="activeIndex() === -1"
              [class.is-selected]="!value"
              [attr.aria-selected]="!value"
              (mousedown)="$event.preventDefault(); pickAll()"
              (mouseenter)="activeIndex.set(-1)"
            >
              {{ allLabel }}
            </li>
          }
          @for (opt of filtered(); track opt.value; let i = $index) {
            <li
              role="option"
              class="ss__option"
              [class.is-active]="i === activeIndex()"
              [class.is-selected]="opt.value === value"
              [attr.aria-selected]="opt.value === value"
              (mousedown)="$event.preventDefault(); pick(opt)"
              (mouseenter)="activeIndex.set(i)"
            >
              {{ opt.label }}
            </li>
          }
          @if (!filtered().length && query()) {
            <li class="ss__empty" role="presentation">Nenhum resultado</li>
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
      .ss {
        position: relative;
      }
      .ss__input {
        width: 100%;
        padding-right: 2.25rem;
      }
      .ss__chevron {
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
        color: var(--menu-icon-inactive, #b9a3e4);
        cursor: pointer;
        border-radius: 0.375rem;
        padding: 0;
      }
      .ss__chevron:hover:not(:disabled) {
        color: var(--brand);
        background: var(--brand-tonal-bg);
      }
      .ss__chevron:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ss__chevron svg {
        width: 1rem;
        height: 1rem;
      }
      .ss--open .ss__chevron {
        color: var(--brand);
      }
      .ss__list {
        position: absolute;
        z-index: 50;
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
      .ss__option {
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        cursor: pointer;
      }
      .ss__option:hover,
      .ss__option.is-active {
        background: var(--brand-tonal-bg);
        color: var(--brand);
      }
      .ss__option.is-selected {
        background: var(--brand);
        color: #fff;
      }
      .ss__option.is-selected:hover,
      .ss__option.is-selected.is-active {
        background: var(--brand-hover, var(--brand));
        color: #fff;
      }
      .ss__empty {
        padding: 0.5rem 0.75rem;
        font-size: 0.8125rem;
        color: var(--text-muted);
      }
    `,
  ],
})
export class SearchSelectComponent implements ControlValueAccessor, OnChanges {
  @Input() options: readonly SearchSelectOption[] | SearchSelectOption[] = [];
  @Input() allLabel = '';
  @Input() placeholder = 'Buscar…';
  @Input() name = '';
  @Input() inputId = '';
  @Input() inputClass = 'form-field';

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  value = '';
  disabled = false;
  open = signal(false);
  activeIndex = signal(-1);
  query = signal('');
  filtered = signal<SearchSelectOption[]>([]);

  readonly listId = `ss-list-${Math.random().toString(36).slice(2, 9)}`;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private typing = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] && !this.typing) {
      this.syncQueryFromValue();
      if (this.open()) this.refreshFilter(this.query(), true);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    const target = (ev.target as Node) || null;
    if (target && !this.el.nativeElement.contains(target)) {
      this.commitOrRestore();
    }
  }

  writeValue(v: string | null): void {
    this.value = v ?? '';
    this.typing = false;
    this.syncQueryFromValue();
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
    this.typing = true;
    this.query.set(next);
    this.refreshFilter(next);
    this.open.set(true);
    this.activeIndex.set(this.allLabel ? -1 : 0);
  }

  onFocus() {
    this.refreshFilter(this.typing ? this.query() : '', true);
    this.open.set(true);
    this.activeIndex.set(this.allLabel ? -1 : 0);
  }

  toggle() {
    if (this.disabled) return;
    if (this.open()) {
      this.commitOrRestore();
      return;
    }
    this.refreshFilter('', true);
    this.open.set(true);
    this.activeIndex.set(this.allLabel ? -1 : 0);
    this.inputEl?.nativeElement.focus();
  }

  pickAll() {
    this.setValue('');
    this.query.set('');
    this.typing = false;
    this.close();
  }

  pick(opt: SearchSelectOption) {
    this.setValue(opt.value);
    this.query.set(opt.label);
    this.typing = false;
    this.close();
  }

  onKeydown(ev: KeyboardEvent) {
    if (!this.open() && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      this.refreshFilter(this.typing ? this.query() : '', true);
      this.open.set(true);
      return;
    }
    if (!this.open()) {
      if (ev.key === 'Escape') this.onTouched();
      return;
    }

    const list = this.filtered();
    const min = this.allLabel ? -1 : 0;
    const max = list.length - 1;

    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, max));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, min));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const idx = this.activeIndex();
      if (idx === -1 && this.allLabel) this.pickAll();
      else if (list[idx]) this.pick(list[idx]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.commitOrRestore();
    }
  }

  private setValue(next: string) {
    if (this.value === next) {
      this.onTouched();
      return;
    }
    this.value = next;
    this.onChange(next);
    this.onTouched();
  }

  private syncQueryFromValue() {
    if (!this.value) {
      this.query.set('');
      return;
    }
    const match = (this.options || []).find((o) => o.value === this.value);
    this.query.set(match?.label ?? '');
  }

  private refreshFilter(raw: string, showAll = false) {
    const q = this.normalize(raw);
    const opts = [...(this.options || [])];
    const next =
      !q || showAll
        ? opts
        : opts.filter((o) => this.normalize(o.label).includes(q));
    this.filtered.set(next);
  }

  private commitOrRestore() {
    if (this.typing) {
      const q = this.normalize(this.query());
      if (!q) {
        this.pickAll();
        return;
      }
      const exact = (this.options || []).find((o) => this.normalize(o.label) === q);
      if (exact) {
        this.pick(exact);
        return;
      }
      const partial = this.filtered();
      if (partial.length === 1) {
        this.pick(partial[0]);
        return;
      }
    }
    this.typing = false;
    this.syncQueryFromValue();
    this.close();
  }

  private close() {
    this.open.set(false);
    this.activeIndex.set(this.allLabel ? -1 : 0);
  }

  private normalize(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
}
