import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BraceletChipComponent } from './bracelet-chip.component';
import { BRACELET_COLORS, DEFAULT_BRACELET_COLOR } from './bracelet-visual';

@Component({
  selector: 'app-bracelet-visual-picker',
  standalone: true,
  imports: [BraceletChipComponent],
  template: `
    <div class="bvp">
      <span class="bvp__lbl">Prévia da pulseira</span>
      <app-bracelet-chip
        [preview]="true"
        [name]="previewName"
        [color]="color"
        [kind]="kind"
      />
      <span class="bvp__lbl">Cor impressa</span>
      <div class="bvp__colors" role="radiogroup" aria-label="Cor impressa na pulseira">
        @for (hex of colors; track hex) {
          <button
            type="button"
            class="bvp__swatch"
            role="radio"
            [attr.aria-checked]="color.toUpperCase() === hex"
            [class.on]="color.toUpperCase() === hex"
            [style.background]="hex"
            [attr.aria-label]="hex"
            (click)="colorChange.emit(hex)"
          ></button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .bvp {
        display: grid;
        gap: 0.55rem;
      }
      .bvp__lbl {
        display: block;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #6b5f78;
      }
      .bvp__colors {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .bvp__swatch {
        width: 1.45rem;
        height: 1.45rem;
        border-radius: 999px;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px #d9d0e4;
        cursor: pointer;
        padding: 0;
      }
      .bvp__swatch.on {
        box-shadow: 0 0 0 2px #1e002f;
      }
    `,
  ],
})
export class BraceletVisualPickerComponent {
  readonly colors = BRACELET_COLORS;

  @Input() name = '';
  @Input() kind: string | null | undefined;
  @Input() color: string = DEFAULT_BRACELET_COLOR;
  @Output() colorChange = new EventEmitter<string>();

  get previewName(): string {
    return this.name.trim() || 'Pulseira';
  }
}
