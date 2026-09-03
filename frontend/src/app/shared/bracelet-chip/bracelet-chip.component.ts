import { Component, Input } from '@angular/core';
import {
  DEFAULT_BRACELET_COLOR,
  braceletKindLabel,
  braceletSerial,
  normalizeBraceletColor,
} from './bracelet-visual';

@Component({
  selector: 'app-bracelet-chip',
  standalone: true,
  host: {
    class: 'bc-host',
    '[class.bc-host--on]': 'selected',
    '[class.bc-host--preview]': 'preview',
    '[style.--bc-color]': 'resolvedColor',
    '[attr.title]': 'name',
  },
  template: `
    <span class="bc__clasp" aria-hidden="true">
      <svg class="bc__waves" viewBox="0 0 40 24" preserveAspectRatio="none">
        <path d="M0 5c3 0 3 3 6 3s3-3 6-3 3 3 6 3 3-3 6-3 3 3 6 3 3-3 6-3 3 3 4 3" />
        <path d="M0 12c3 0 3 3 6 3s3-3 6-3 3 3 6 3 3-3 6-3 3 3 6 3 3-3 6-3 3 3 4 3" />
        <path d="M0 19c3 0 3 3 6 3s3-3 6-3 3 3 6 3 3-3 6-3 3 3 6 3 3-3 6-3 3 3 4 3" />
      </svg>
      @if (preview) {
        <span class="bc__serial">{{ serial }}</span>
      }
    </span>
    <span class="bc__face">
      <span class="bc__name">{{ name || 'Pulseira' }}</span>
      @if (preview && kindText) {
        <span class="bc__kind">{{ kindText }}</span>
      }
    </span>
    @if (preview) {
      <span class="bc__clasp bc__clasp--end" aria-hidden="true">
        <svg class="bc__bars" viewBox="0 0 36 24" preserveAspectRatio="none">
          <rect x="2" y="2" width="2" height="20" />
          <rect x="6" y="2" width="1" height="20" />
          <rect x="9" y="2" width="3" height="20" />
          <rect x="14" y="2" width="1" height="20" />
          <rect x="17" y="2" width="2" height="20" />
          <rect x="21" y="2" width="1" height="20" />
          <rect x="24" y="2" width="3" height="20" />
          <rect x="29" y="2" width="1" height="20" />
          <rect x="32" y="2" width="2" height="20" />
        </svg>
      </span>
    }
  `,
  styles: [
    `
      :host {
        --bc-color: ${DEFAULT_BRACELET_COLOR};
        display: inline-flex;
        align-items: stretch;
        max-width: 100%;
        height: 26px;
        border-radius: 5px;
        border: 1px solid #e6e0ee;
        background: #fff;
        overflow: hidden;
        vertical-align: middle;
        line-height: 0;
        box-shadow: 0 1px 0 rgba(30, 0, 47, 0.04);
      }
      :host.bc-host--on {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--bc-color) 55%, #fff);
      }
      :host.bc-host--preview {
        width: 100%;
        height: 76px;
        border-radius: 8px;
        border-color: #ddd6e8;
      }
      .bc__clasp {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        flex: 0 0 22px;
        background: #faf8fc;
      }
      :host.bc-host--preview .bc__clasp {
        width: 86px;
        flex-basis: 86px;
        gap: 8px;
        padding: 0 8px;
      }
      .bc__waves {
        width: 16px;
        height: 14px;
        stroke: #c8bdd4;
        stroke-width: 1.4;
        fill: none;
        stroke-linecap: round;
      }
      :host.bc-host--preview .bc__waves {
        width: 36px;
        height: 28px;
        stroke-width: 1.2;
      }
      .bc__serial {
        font-family: Sora, 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.12em;
        color: #8a7b99;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        line-height: 1;
      }
      .bc__face {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 9px;
        background: var(--bc-color);
        color: #fff;
      }
      :host.bc-host--preview .bc__face {
        flex: 1 1 auto;
        padding: 0 18px;
      }
      .bc__name {
        font-family: Sora, 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        line-height: 24px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      :host.bc-host--preview .bc__name {
        font-size: 18px;
        letter-spacing: 0.06em;
        line-height: 1.1;
      }
      .bc__kind {
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.85;
        white-space: nowrap;
      }
      .bc__clasp--end {
        width: 72px;
        flex-basis: 72px;
      }
      .bc__bars {
        width: 34px;
        height: 36px;
        fill: #2a2034;
      }
    `,
  ],
})
export class BraceletChipComponent {
  @Input() name = '';
  @Input() icon: string | null | undefined;
  @Input() color: string | null | undefined = DEFAULT_BRACELET_COLOR;
  @Input() kind: string | null | undefined;
  @Input() selected = false;
  @Input() preview = false;

  get resolvedColor(): string {
    return normalizeBraceletColor(this.color);
  }

  get kindText(): string {
    return braceletKindLabel(this.kind);
  }

  get serial(): string {
    return braceletSerial(this.name);
  }
}
