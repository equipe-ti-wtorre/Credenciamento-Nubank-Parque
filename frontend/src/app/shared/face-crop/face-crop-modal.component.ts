import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';

type DragMode = 'move' | 'pan' | 'nw' | 'ne' | 'sw' | 'se' | null;

interface CropBox {
  x: number;
  y: number;
  size: number;
}

/**
 * Modal para enquadrar o rosto antes da validação/envio.
 * Trabalha em coordenadas da imagem naturalmente (naturalWidth/naturalHeight).
 */
@Component({
  selector: 'app-face-crop-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal
      [open]="open"
      title="Enquadrar o rosto"
      subtitle="Arraste e redimensione o quadro sobre o rosto. Use o zoom para aproximações."
      size="lg"
      [closeOnBackdrop]="false"
      [focusFirstField]="false"
      (close)="onCancel()"
    >
      <div class="face-crop">
        <div
          #stage
          class="face-crop__stage"
          (pointerdown)="onStagePointerDown($event)"
          (wheel)="onWheel($event)"
        >
          <img
            #imgEl
            class="face-crop__img"
            [src]="imageUrl"
            alt="Foto para recorte"
            draggable="false"
            [style.transform]="imageTransform()"
            (load)="onImageLoad()"
          />
          @if (ready()) {
            <div
              class="face-crop__box"
              [style.left.px]="displayBox().left"
              [style.top.px]="displayBox().top"
              [style.width.px]="displayBox().size"
              [style.height.px]="displayBox().size"
              (pointerdown)="onBoxPointerDown($event, 'move')"
            >
              <span class="face-crop__handle face-crop__handle--nw" (pointerdown)="onBoxPointerDown($event, 'nw')"></span>
              <span class="face-crop__handle face-crop__handle--ne" (pointerdown)="onBoxPointerDown($event, 'ne')"></span>
              <span class="face-crop__handle face-crop__handle--sw" (pointerdown)="onBoxPointerDown($event, 'sw')"></span>
              <span class="face-crop__handle face-crop__handle--se" (pointerdown)="onBoxPointerDown($event, 'se')"></span>
            </div>
          }
        </div>

        <div class="face-crop__toolbar">
          <button
            type="button"
            class="face-crop__zoom-btn"
            (click)="zoomOut()"
            [disabled]="!ready() || zoom() <= minZoom"
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
              <path d="M8 11h6" />
            </svg>
          </button>
          <button
            type="button"
            class="face-crop__zoom-label"
            (click)="resetZoom()"
            [disabled]="!ready() || (zoom() === 1 && panX() === 0 && panY() === 0)"
            title="Restaurar zoom"
          >
            {{ zoomPercent() }}%
          </button>
          <button
            type="button"
            class="face-crop__zoom-btn"
            (click)="zoomIn()"
            [disabled]="!ready() || zoom() >= maxZoom"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
            </svg>
          </button>
        </div>

        <p class="face-crop__hint">
          Ajuste o quadro para incluir o rosto com margem (ombros para cima). Com zoom, arraste o fundo
          para posicionar a foto; a roda do mouse também aproxima/afasta.
        </p>
      </div>

      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="onCancel()" [disabled]="exporting()">
          Cancelar
        </button>
        <button
          type="button"
          class="btn-action-primary"
          (click)="onConfirm()"
          [disabled]="!ready() || exporting()"
        >
          {{ exporting() ? 'Preparando...' : 'Usar este enquadramento' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [
    `
      .face-crop {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .face-crop__stage {
        position: relative;
        width: 100%;
        max-height: min(62vh, 560px);
        min-height: 280px;
        background: #0f172a;
        border-radius: 0.75rem;
        overflow: hidden;
        user-select: none;
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .face-crop__img {
        max-width: 100%;
        max-height: min(62vh, 560px);
        width: auto;
        height: auto;
        display: block;
        pointer-events: none;
        transform-origin: center center;
        will-change: transform;
      }
      .face-crop__box {
        position: absolute;
        border: 2px solid #38bdf8;
        box-shadow:
          0 0 0 1px rgba(14, 165, 233, 0.35),
          0 0 0 9999px rgba(15, 23, 42, 0.55);
        cursor: move;
        box-sizing: border-box;
        z-index: 2;
      }
      .face-crop__handle {
        position: absolute;
        width: 14px;
        height: 14px;
        background: #fff;
        border: 2px solid #0ea5e9;
        border-radius: 2px;
        box-sizing: border-box;
      }
      .face-crop__handle--nw {
        top: -7px;
        left: -7px;
        cursor: nwse-resize;
      }
      .face-crop__handle--ne {
        top: -7px;
        right: -7px;
        cursor: nesw-resize;
      }
      .face-crop__handle--sw {
        bottom: -7px;
        left: -7px;
        cursor: nesw-resize;
      }
      .face-crop__handle--se {
        bottom: -7px;
        right: -7px;
        cursor: nwse-resize;
      }
      .face-crop__toolbar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }
      .face-crop__zoom-btn,
      .face-crop__zoom-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 2.25rem;
        border-radius: 0.75rem;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        cursor: pointer;
      }
      .face-crop__zoom-btn {
        width: 2.25rem;
        padding: 0;
      }
      .face-crop__zoom-btn svg {
        width: 1.1rem;
        height: 1.1rem;
      }
      .face-crop__zoom-btn:hover:not(:disabled),
      .face-crop__zoom-label:hover:not(:disabled) {
        background: #f8fafc;
        border-color: #94a3b8;
      }
      .face-crop__zoom-btn:disabled,
      .face-crop__zoom-label:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .face-crop__zoom-label {
        min-width: 4.25rem;
        padding: 0 0.75rem;
        font-size: 0.8125rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .face-crop__hint {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.35;
        color: #64748b;
      }
    `,
  ],
})
export class FaceCropModalComponent implements OnChanges {
  @Input() open = false;
  @Input() imageUrl: string | null = null;
  @Input() fileName = 'foto-rosto.jpg';

  @Output() cancel = new EventEmitter<void>();
  @Output() cropped = new EventEmitter<File>();

  @ViewChild('imgEl') imgEl?: ElementRef<HTMLImageElement>;
  @ViewChild('stage') stageEl?: ElementRef<HTMLElement>;

  ready = signal(false);
  exporting = signal(false);
  crop = signal<CropBox>({ x: 0, y: 0, size: 100 });
  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);

  readonly minZoom = 1;
  readonly maxZoom = 4;

  /** Fração do lado menor: piso ao redimensionar. */
  private readonly minSizeRatio = 0.12;
  /** Fração do lado menor: tamanho inicial do quadro (rosto + margem). */
  private readonly initialSizeRatio = 0.42;
  private readonly zoomStep = 1.25;

  private naturalW = 0;
  private naturalH = 0;
  private dragMode: DragMode = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigin: CropBox = { x: 0, y: 0, size: 100 };
  private panOriginX = 0;
  private panOriginY = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] || changes['imageUrl']) {
      this.ready.set(false);
      this.exporting.set(false);
      this.dragMode = null;
      this.resetView();
      if (this.open && this.imageUrl && this.imgEl?.nativeElement?.complete) {
        queueMicrotask(() => this.onImageLoad());
      }
    }
  }

  imageTransform(): string {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`;
  }

  zoomPercent(): number {
    return Math.round(this.zoom() * 100);
  }

  zoomIn(): void {
    this.setZoom(this.zoom() * this.zoomStep);
  }

  zoomOut(): void {
    this.setZoom(this.zoom() / this.zoomStep);
  }

  resetZoom(): void {
    this.resetView();
  }

  onWheel(event: WheelEvent): void {
    if (!this.ready()) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? this.zoomStep : 1 / this.zoomStep;
    this.setZoom(this.zoom() * factor);
  }

  onImageLoad(): void {
    const img = this.imgEl?.nativeElement;
    if (!img || !this.open) return;
    this.naturalW = img.naturalWidth || 0;
    this.naturalH = img.naturalHeight || 0;
    if (this.naturalW < 32 || this.naturalH < 32) {
      this.ready.set(false);
      return;
    }
    this.resetView();
    const side = this.initialCropSize();
    this.crop.set({
      x: (this.naturalW - side) / 2,
      y: Math.max(0, (this.naturalH - side) * 0.22),
      size: side,
    });
    this.ready.set(true);
  }

  displayBox(): { left: number; top: number; size: number } {
    const layout = this.getLayout();
    const c = this.crop();
    if (!layout) return { left: 0, top: 0, size: 0 };
    return {
      left: layout.offsetX + c.x * layout.scale,
      top: layout.offsetY + c.y * layout.scale,
      size: c.size * layout.scale,
    };
  }

  onStagePointerDown(event: PointerEvent): void {
    if (!this.ready() || this.dragMode) return;
    if ((event.target as HTMLElement)?.closest?.('.face-crop__box')) return;

    if (this.zoom() > 1) {
      event.preventDefault();
      this.dragMode = 'pan';
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.panOriginX = this.panX();
      this.panOriginY = this.panY();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }

    const layout = this.getLayout();
    if (!layout) return;
    const local = this.pointerToNatural(event, layout);
    const c = this.crop();
    const size = c.size;
    this.crop.set(
      this.clampCrop({
        x: local.x - size / 2,
        y: local.y - size / 2,
        size,
      }),
    );
  }

  onBoxPointerDown(event: PointerEvent, mode: DragMode): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.ready()) return;
    this.dragMode = mode;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOrigin = { ...this.crop() };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragMode) return;

    if (this.dragMode === 'pan') {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      this.panX.set(this.panOriginX + dx);
      this.panY.set(this.panOriginY + dy);
      this.clampPan();
      return;
    }

    const layout = this.getLayout();
    if (!layout || layout.scale <= 0) return;
    const dx = (event.clientX - this.dragStartX) / layout.scale;
    const dy = (event.clientY - this.dragStartY) / layout.scale;
    const o = this.dragOrigin;
    const minSize = this.minCropSize();

    if (this.dragMode === 'move') {
      this.crop.set(this.clampCrop({ x: o.x + dx, y: o.y + dy, size: o.size }));
      return;
    }

    let x = o.x;
    let y = o.y;
    let size = o.size;
    if (this.dragMode === 'se') {
      size = Math.max(minSize, o.size + (dx + dy) / 2);
    } else if (this.dragMode === 'nw') {
      const delta = (dx + dy) / 2;
      size = Math.max(minSize, o.size - delta);
      x = o.x + o.size - size;
      y = o.y + o.size - size;
    } else if (this.dragMode === 'ne') {
      const delta = (-dx + dy) / 2;
      size = Math.max(minSize, o.size - delta);
      y = o.y + o.size - size;
    } else if (this.dragMode === 'sw') {
      const delta = (dx - dy) / 2;
      size = Math.max(minSize, o.size - delta);
      x = o.x + o.size - size;
    }
    this.crop.set(this.clampCrop({ x, y, size }));
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onPointerUp(): void {
    this.dragMode = null;
  }

  onCancel(): void {
    if (this.exporting()) return;
    this.cancel.emit();
  }

  async onConfirm(): Promise<void> {
    const img = this.imgEl?.nativeElement;
    if (!img || !this.ready() || this.exporting()) return;
    this.exporting.set(true);
    try {
      const c = this.crop();
      // Nunca amplificar: upscale + suavização derruba a nitidez (Laplaciano).
      const srcSize = Math.max(1, Math.round(c.size));
      const maxOut = 1600;
      const outSize = Math.min(srcSize, maxOut);
      const canvas = document.createElement('canvas');
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      const downscaling = outSize < srcSize;
      ctx.imageSmoothingEnabled = downscaling;
      if (downscaling) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, c.x, c.y, c.size, c.size, 0, 0, outSize, outSize);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95),
      );
      if (!blob) throw new Error('Falha ao gerar recorte');
      const base = (this.fileName || 'foto').replace(/\.[^.]+$/, '') || 'foto';
      const file = new File([blob], `${base}-rosto.jpg`, { type: 'image/jpeg' });
      this.cropped.emit(file);
    } catch {
      this.exporting.set(false);
    }
  }

  private setZoom(next: number): void {
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, next));
    this.zoom.set(Number(z.toFixed(3)));
    if (this.zoom() <= 1) {
      this.panX.set(0);
      this.panY.set(0);
    } else {
      this.clampPan();
    }
  }

  private resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  private clampPan(): void {
    const z = this.zoom();
    if (z <= 1) {
      this.panX.set(0);
      this.panY.set(0);
      return;
    }
    const stage = this.stageEl?.nativeElement;
    const img = this.imgEl?.nativeElement;
    if (!stage || !img) return;
    // Limite aproximado: quanto a imagem ampliada “ultrapassa” o stage.
    const baseW = img.offsetWidth || stage.clientWidth;
    const baseH = img.offsetHeight || stage.clientHeight;
    const maxX = Math.max(0, (baseW * (z - 1)) / 2 + 40);
    const maxY = Math.max(0, (baseH * (z - 1)) / 2 + 40);
    this.panX.set(Math.max(-maxX, Math.min(maxX, this.panX())));
    this.panY.set(Math.max(-maxY, Math.min(maxY, this.panY())));
  }

  private minCropSize(): number {
    return Math.min(this.naturalW, this.naturalH) * this.minSizeRatio;
  }

  private initialCropSize(): number {
    const maxSide = Math.min(this.naturalW, this.naturalH);
    return Math.max(this.minCropSize(), maxSide * this.initialSizeRatio);
  }

  private clampCrop(box: CropBox): CropBox {
    let { x, y, size } = box;
    const maxSide = Math.min(this.naturalW, this.naturalH);
    const minSide = Math.min(this.minCropSize(), maxSide);
    size = Math.max(minSide, Math.min(size, maxSide));
    x = Math.max(0, Math.min(x, this.naturalW - size));
    y = Math.max(0, Math.min(y, this.naturalH - size));
    return { x, y, size };
  }

  private getLayout(): {
    scale: number;
    offsetX: number;
    offsetY: number;
    stageW: number;
    stageH: number;
  } | null {
    const img = this.imgEl?.nativeElement;
    const stage = this.stageEl?.nativeElement;
    if (!img || !stage || !this.naturalW) return null;
    const stageRect = stage.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    const scale = imgRect.width / this.naturalW;
    return {
      scale,
      offsetX: imgRect.left - stageRect.left,
      offsetY: imgRect.top - stageRect.top,
      stageW: stageRect.width,
      stageH: stageRect.height,
    };
  }

  private pointerToNatural(
    event: PointerEvent,
    layout: { scale: number; offsetX: number; offsetY: number },
  ): { x: number; y: number } {
    const stage = this.stageEl!.nativeElement.getBoundingClientRect();
    const px = event.clientX - stage.left - layout.offsetX;
    const py = event.clientY - stage.top - layout.offsetY;
    return { x: px / layout.scale, y: py / layout.scale };
  }
}
