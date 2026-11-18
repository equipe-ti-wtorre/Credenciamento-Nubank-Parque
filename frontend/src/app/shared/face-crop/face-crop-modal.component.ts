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

type DragMode = 'move' | 'pan' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
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
      [title]="title"
      [subtitle]="subtitle"
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
              [style.width.px]="displayBox().w"
              [style.height.px]="displayBox().h"
              (pointerdown)="onBoxPointerDown($event, 'move')"
            >
              @if (!lockAspectRatio) {
                <span class="face-crop__handle face-crop__handle--n" (pointerdown)="onBoxPointerDown($event, 'n')"></span>
                <span class="face-crop__handle face-crop__handle--s" (pointerdown)="onBoxPointerDown($event, 's')"></span>
                <span class="face-crop__handle face-crop__handle--e" (pointerdown)="onBoxPointerDown($event, 'e')"></span>
                <span class="face-crop__handle face-crop__handle--w" (pointerdown)="onBoxPointerDown($event, 'w')"></span>
              }
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

        @if (showOutputPreview && ready()) {
          <div class="face-crop__result">
            <span class="face-crop__result-label">{{ previewLabel }}</span>
            <div class="face-crop__result-thumb" aria-hidden="true">
              <img
                [src]="imageUrl"
                alt=""
                draggable="false"
                [style.width.px]="previewLayout().imgW"
                [style.height.px]="previewLayout().imgH"
                [style.transform]="previewLayout().transform"
              />
            </div>
          </div>
        }

        <p class="face-crop__hint">{{ hint }}</p>
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
        max-height: min(72vh, 680px);
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
        max-height: min(72vh, 680px);
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
      .face-crop__handle--n,
      .face-crop__handle--s {
        width: 32px;
        height: 10px;
        border-radius: 6px;
        left: 50%;
        margin-left: -16px;
        cursor: ns-resize;
      }
      .face-crop__handle--n { top: -5px; }
      .face-crop__handle--s { bottom: -5px; }
      .face-crop__handle--e,
      .face-crop__handle--w {
        width: 10px;
        height: 32px;
        border-radius: 6px;
        top: 50%;
        margin-top: -16px;
        cursor: ew-resize;
      }
      .face-crop__handle--e { right: -5px; }
      .face-crop__handle--w { left: -5px; }
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
      .face-crop__result {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .face-crop__result-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
      }
      .face-crop__result-thumb {
        width: 4rem;
        height: 4rem;
        border-radius: 0.5rem;
        border: 1px solid #e2e8f0;
        background: #fff;
        overflow: hidden;
        flex: none;
      }
      .face-crop__result-thumb img {
        display: block;
        max-width: none;
        transform-origin: top left;
      }
    `,
  ],
})
export class FaceCropModalComponent implements OnChanges {
  @Input() open = false;
  @Input() imageUrl: string | null = null;
  @Input() fileName = 'foto-rosto.jpg';
  @Input() title = 'Enquadrar o rosto';
  @Input() subtitle = 'Arraste o quadro e ajuste largura e altura. Use o zoom para aproximações.';
  @Input() hint =
    'Puxe as bordas para mudar a altura ou a largura do recorte (ombros para cima). Com zoom, arraste o fundo para posicionar a foto; a roda do mouse também aproxima/afasta.';
  /** Altura inicial relativa à largura. 1 = quadrado; 1.28 = retrato (rosto). */
  @Input() initialAspectH = 1.28;
  /** Fração do lado menor para a largura inicial do quadro. */
  @Input() initialSizeRatio = 0.42;
  /** Se definido (ex.: 1), o quadro mantém a proporção e só os cantos redimensionam. */
  @Input() lockAspectRatio: number | null = null;
  /** Centraliza o quadro no eixo vertical (logos). Rosto usa o recuo padrão de 18%. */
  @Input() centerInitialCrop = false;
  @Input() outputSuffix = '-rosto';
  @Input() showOutputPreview = false;
  @Input() previewLabel = 'Como vai aparecer';
  /** Piso do zoom. Logos usam valor abaixo de 1 para afastar e caber o arquivo inteiro. */
  @Input() minZoom = 1;
  /** Permite o quadro ultrapassar a imagem (padding) para não cortar logos largos. */
  @Input() allowCropOutside = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() cropped = new EventEmitter<File>();

  @ViewChild('imgEl') imgEl?: ElementRef<HTMLImageElement>;
  @ViewChild('stage') stageEl?: ElementRef<HTMLElement>;

  ready = signal(false);
  exporting = signal(false);
  crop = signal<CropBox>({ x: 0, y: 0, w: 100, h: 100 });
  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);

  readonly maxZoom = 4;

  /** Fração do lado menor: piso ao redimensionar. */
  private readonly minSizeRatio = 0.12;
  private readonly zoomStep = 1.25;
  private readonly previewSize = 64;

  private naturalW = 0;
  private naturalH = 0;
  private dragMode: DragMode = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigin: CropBox = { x: 0, y: 0, w: 100, h: 100 };
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
    this.crop.set(this.clampCrop(this.initialCropBox()));
    this.ready.set(true);
  }

  displayBox(): { left: number; top: number; w: number; h: number } {
    const layout = this.getLayout();
    const c = this.crop();
    if (!layout) return { left: 0, top: 0, w: 0, h: 0 };
    return {
      left: layout.offsetX + c.x * layout.scale,
      top: layout.offsetY + c.y * layout.scale,
      w: c.w * layout.scale,
      h: c.h * layout.scale,
    };
  }

  previewLayout(): { imgW: number; imgH: number; transform: string } {
    const c = this.crop();
    const scale = this.previewSize / Math.max(c.w, 1);
    return {
      imgW: this.naturalW * scale,
      imgH: this.naturalH * scale,
      transform: `translate(${-c.x * scale}px, ${-c.y * scale}px)`,
    };
  }

  onStagePointerDown(event: PointerEvent): void {
    if (!this.ready() || this.dragMode) return;
    if ((event.target as HTMLElement)?.closest?.('.face-crop__box')) return;

    if (this.zoom() !== 1) {
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
    this.crop.set(
      this.clampCrop({
        x: local.x - c.w / 2,
        y: local.y - c.h / 2,
        w: c.w,
        h: c.h,
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

    if (this.dragMode === 'move') {
      this.crop.set(this.clampCrop({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }));
      return;
    }

    if (this.lockAspectRatio) {
      this.crop.set(this.resizeLocked(this.dragMode, o, dx));
      return;
    }

    const mode = this.dragMode;
    let x = o.x;
    let y = o.y;
    let w = o.w;
    let h = o.h;
    const minSize = this.minCropSize();
    const resizeN = mode === 'n' || mode === 'nw' || mode === 'ne';
    const resizeS = mode === 's' || mode === 'sw' || mode === 'se';
    const resizeW = mode === 'w' || mode === 'nw' || mode === 'sw';
    const resizeE = mode === 'e' || mode === 'ne' || mode === 'se';

    if (resizeE) {
      w = Math.max(minSize, Math.min(o.w + dx, this.naturalW - o.x));
    }
    if (resizeW) {
      const right = o.x + o.w;
      w = Math.max(minSize, Math.min(o.w - dx, right));
      x = right - w;
      if (x < 0) {
        x = 0;
        w = right;
      }
    }
    if (resizeS) {
      h = Math.max(minSize, Math.min(o.h + dy, this.naturalH - o.y));
    }
    if (resizeN) {
      const bottom = o.y + o.h;
      h = Math.max(minSize, Math.min(o.h - dy, bottom));
      y = bottom - h;
      if (y < 0) {
        y = 0;
        h = bottom;
      }
    }
    this.crop.set({ x, y, w, h });
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
      const srcW = Math.max(1, Math.round(c.w));
      const srcH = Math.max(1, Math.round(c.h));
      const maxOut = 1600;
      const scale = Math.min(1, maxOut / Math.max(srcW, srcH));
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      const downscaling = scale < 1;
      ctx.imageSmoothingEnabled = downscaling;
      if (downscaling) ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(
        img,
        0,
        0,
        this.naturalW,
        this.naturalH,
        -c.x * scale,
        -c.y * scale,
        this.naturalW * scale,
        this.naturalH * scale,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95),
      );
      if (!blob) throw new Error('Falha ao gerar recorte');
      const base = (this.fileName || 'foto').replace(/\.[^.]+$/, '') || 'foto';
      const suffix = this.outputSuffix || '';
      const file = new File([blob], `${base}${suffix}.jpg`, { type: 'image/jpeg' });
      this.cropped.emit(file);
    } catch {
      this.exporting.set(false);
    }
  }

  private setZoom(next: number): void {
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, next));
    this.zoom.set(Number(z.toFixed(3)));
    if (this.zoom() === 1) {
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
    const stage = this.stageEl?.nativeElement;
    const img = this.imgEl?.nativeElement;
    if (!stage || !img) {
      if (z === 1) {
        this.panX.set(0);
        this.panY.set(0);
      }
      return;
    }
    const baseW = img.offsetWidth || stage.clientWidth;
    const baseH = img.offsetHeight || stage.clientHeight;
    const maxX = Math.max(0, (baseW * Math.abs(z - 1)) / 2 + 40);
    const maxY = Math.max(0, (baseH * Math.abs(z - 1)) / 2 + 40);
    this.panX.set(Math.max(-maxX, Math.min(maxX, this.panX())));
    this.panY.set(Math.max(-maxY, Math.min(maxY, this.panY())));
  }

  private minCropSize(): number {
    return Math.min(this.naturalW, this.naturalH) * this.minSizeRatio;
  }

  private aspectH(): number {
    return this.lockAspectRatio ?? this.initialAspectH;
  }

  private initialCropBox(): CropBox {
    const aspect = this.aspectH();
    if (this.allowCropOutside) {
      let w = this.naturalW;
      let h = w * aspect;
      if (h < this.naturalH) {
        h = this.naturalH;
        w = h / aspect;
      }
      return {
        x: (this.naturalW - w) / 2,
        y: (this.naturalH - h) / 2,
        w,
        h,
      };
    }
    const minSide = Math.min(this.naturalW, this.naturalH);
    const minSize = this.minCropSize();
    const w = Math.max(minSize, Math.min(this.naturalW, minSide * this.initialSizeRatio));
    const h = Math.max(minSize, Math.min(this.naturalH, w * aspect));
    const yRatio = this.centerInitialCrop ? 0.5 : 0.18;
    return {
      x: (this.naturalW - w) / 2,
      y: Math.max(0, (this.naturalH - h) * yRatio),
      w,
      h,
    };
  }

  private resizeLocked(mode: DragMode, origin: CropBox, dx: number): CropBox {
    const ratio = this.aspectH();
    const minSize = this.minCropSize();
    const right = origin.x + origin.w;
    const bottom = origin.y + origin.h;
    const fromWest = mode === 'nw' || mode === 'sw' || mode === 'w';
    const fromNorth = mode === 'nw' || mode === 'ne' || mode === 'n';
    let w = fromWest ? origin.w - dx : origin.w + dx;
    w = Math.max(minSize, w);
    let h = w * ratio;
    if (h < minSize) {
      h = minSize;
      w = h / ratio;
    }

    let x = fromWest ? right - w : origin.x;
    let y = fromNorth ? bottom - h : origin.y;

    if (!this.allowCropOutside) {
      if (x < 0) {
        w += x;
        x = 0;
        h = w * ratio;
        if (fromNorth) y = bottom - h;
      }
      if (y < 0) {
        h += y;
        y = 0;
        w = h / ratio;
        if (fromWest) x = right - w;
      }
      if (x + w > this.naturalW) {
        w = this.naturalW - x;
        h = w * ratio;
        if (fromNorth) y = bottom - h;
      }
      if (y + h > this.naturalH) {
        h = this.naturalH - y;
        w = h / ratio;
        if (fromWest) x = right - w;
      }
    }

    return this.clampCrop({ x, y, w, h });
  }

  private clampCrop(box: CropBox): CropBox {
    const minSize = Math.min(this.minCropSize(), this.naturalW, this.naturalH);
    if (this.allowCropOutside) {
      const maxSide = Math.max(this.naturalW, this.naturalH) * 3;
      let w = Math.max(minSize, Math.min(box.w, maxSide));
      let h = this.lockAspectRatio ? w * this.aspectH() : Math.max(minSize, Math.min(box.h, maxSide));
      if (this.lockAspectRatio && h > maxSide) {
        h = maxSide;
        w = h / this.aspectH();
      }
      const x = Math.max(-w + minSize, Math.min(box.x, this.naturalW - minSize));
      const y = Math.max(-h + minSize, Math.min(box.y, this.naturalH - minSize));
      return { x, y, w, h };
    }
    let w = Math.max(minSize, Math.min(box.w, this.naturalW));
    let h = Math.max(minSize, Math.min(box.h, this.naturalH));
    if (this.lockAspectRatio) {
      const ratio = this.aspectH();
      h = w * ratio;
      if (h > this.naturalH) {
        h = this.naturalH;
        w = h / ratio;
      }
      if (w > this.naturalW) {
        w = this.naturalW;
        h = w * ratio;
      }
      w = Math.max(minSize, Math.min(w, this.naturalW));
      h = Math.max(minSize, Math.min(h, this.naturalH));
    }
    const x = Math.max(0, Math.min(box.x, this.naturalW - w));
    const y = Math.max(0, Math.min(box.y, this.naturalH - h));
    return { x, y, w, h };
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
