import { Component, input } from '@angular/core';
import { kindLabel } from '../../services/event-accreditation.service';

@Component({
  selector: 'app-event-kind-badge',
  standalone: true,
  template: `
    <span class="ekb" [class]="'ekb ekb--' + tone() + (compact() ? ' ekb--sm' : '')">
      <span class="ekb__ico" aria-hidden="true">
        @if (tone() === 'jogo') {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 3c2.2 2.4 3.4 5.6 3.4 9S14.2 18.6 12 21M12 3c-2.2 2.4-3.4 5.6-3.4 9S9.8 18.6 12 21"/>
            <path d="M4.2 8.5h15.6M4.2 15.5h15.6"/>
          </svg>
        } @else if (tone() === 'both') {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <circle cx="8.5" cy="12" r="5.2"/>
            <circle cx="15.5" cy="12" r="5.2"/>
          </svg>
        } @else {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M9 18V6l10-2v12"/>
            <circle cx="6" cy="18" r="2.4"/>
            <circle cx="16" cy="16" r="2.4"/>
          </svg>
        }
      </span>
      <span class="ekb__txt">{{ label() }}</span>
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        vertical-align: middle;
      }
      .ekb {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 3px 9px 3px 6px;
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1.2;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      .ekb--sm {
        font-size: 11px;
        padding: 2px 7px 2px 5px;
        gap: 4px;
      }
      .ekb__ico {
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.55);
        flex: none;
      }
      .ekb--sm .ekb__ico {
        width: 15px;
        height: 15px;
      }
      .ekb__ico svg {
        width: 12px;
        height: 12px;
      }
      .ekb--sm .ekb__ico svg {
        width: 10px;
        height: 10px;
      }
      .ekb--showday {
        color: #6b0870;
        background: #f6e8fb;
        border-color: #e4c4ef;
      }
      .ekb--jogo {
        color: #0f5c38;
        background: #e6f6ee;
        border-color: #b7e0c8;
      }
      .ekb--both {
        color: #3d4a6b;
        background: #eef2f8;
        border-color: #c9d3e4;
      }
      .ekb--none {
        color: #7b7086;
        background: #f4f2f6;
        border-color: #e3dfe9;
      }
    `,
  ],
})
export class EventKindBadgeComponent {
  readonly kind = input<string | null | undefined>('');
  readonly compact = input(false);

  tone(): 'showday' | 'jogo' | 'both' | 'none' {
    const k = String(this.kind() || '').toUpperCase();
    if (k === 'JOGO') return 'jogo';
    if (k === 'SHOWDAY') return 'showday';
    if (k === 'BOTH') return 'both';
    return 'none';
  }

  label(): string {
    return kindLabel(this.kind());
  }
}
