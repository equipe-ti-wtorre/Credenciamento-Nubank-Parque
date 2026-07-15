import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';

/**
 * Captura uma foto via webcam (getUserMedia) e emite um File JPEG
 * para seguir o fluxo de enquadramento / validação facial.
 */
@Component({
  selector: 'app-webcam-capture-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal
      [open]="open"
      title="Capturar foto"
      subtitle="Posicione o rosto de frente, bem iluminado, e capture."
      size="lg"
      [closeOnBackdrop]="false"
      [focusFirstField]="false"
      (close)="onCancel()"
    >
      <div class="webcam-capture">
        @if (error()) {
          <div class="webcam-capture__error" role="alert">
            {{ error() }}
          </div>
        }

        <div class="webcam-capture__stage">
          <video
            #videoEl
            class="webcam-capture__video"
            [class.webcam-capture__video--hidden]="!!snapshotUrl()"
            playsinline
            muted
            autoplay
          ></video>
          @if (snapshotUrl()) {
            <img class="webcam-capture__shot" [src]="snapshotUrl()" alt="Pré-visualização da captura" />
          }
          @if (starting() && !snapshotUrl()) {
            <p class="webcam-capture__loading">Abrindo câmera...</p>
          }
        </div>

        <p class="webcam-capture__hint">
          A imagem espelhada é só para referência; a foto enviada mantém a orientação correta.
        </p>
      </div>

      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="onCancel()" [disabled]="capturing()">
          Cancelar
        </button>
        @if (snapshotUrl()) {
          <button type="button" class="btn-outline" (click)="retake()" [disabled]="capturing()">
            Tirar outra
          </button>
          <button type="button" class="btn-action-primary" (click)="confirmShot()" [disabled]="capturing()">
            {{ capturing() ? 'Preparando...' : 'Usar esta foto' }}
          </button>
        } @else {
          <button
            type="button"
            class="btn-action-primary"
            (click)="takeSnapshot()"
            [disabled]="starting() || !!error() || !ready()"
          >
            Capturar
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: [
    `
      .webcam-capture {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .webcam-capture__stage {
        position: relative;
        width: 100%;
        min-height: 280px;
        max-height: min(62vh, 560px);
        background: #0f172a;
        border-radius: 0.75rem;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .webcam-capture__video,
      .webcam-capture__shot {
        max-width: 100%;
        max-height: min(62vh, 560px);
        width: auto;
        height: auto;
        display: block;
      }
      .webcam-capture__video {
        transform: scaleX(-1);
      }
      .webcam-capture__video--hidden {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        width: 1px;
        height: 1px;
      }
      .webcam-capture__loading {
        position: absolute;
        margin: 0;
        color: #cbd5e1;
        font-size: 0.875rem;
      }
      .webcam-capture__hint {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.35;
        color: #64748b;
      }
      .webcam-capture__error {
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        background: #fff1f2;
        border: 1px solid #fecdd3;
        color: #9f1239;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class WebcamCaptureModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() captured = new EventEmitter<File>();

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;

  starting = signal(false);
  ready = signal(false);
  capturing = signal(false);
  error = signal<string | null>(null);
  snapshotUrl = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private snapshotBlob: Blob | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        // Modal renders com @if — espera o <video> existir antes do getUserMedia.
        setTimeout(() => void this.startCamera(), 0);
      } else {
        this.teardown();
      }
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  onCancel(): void {
    if (this.capturing()) return;
    this.teardown();
    this.cancel.emit();
  }

  retake(): void {
    this.revokeSnapshot();
    this.snapshotBlob = null;
    void this.startCamera();
  }

  takeSnapshot(): void {
    const video = this.videoEl?.nativeElement;
    if (!video || !this.ready() || video.videoWidth < 16) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Sem espelho: orientação real da câmera (melhor para facial).
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('Não foi possível capturar a imagem.');
          return;
        }
        this.snapshotBlob = blob;
        this.revokeSnapshot();
        this.snapshotUrl.set(URL.createObjectURL(blob));
        this.stopStreamOnly();
      },
      'image/jpeg',
      0.95,
    );
  }

  confirmShot(): void {
    if (!this.snapshotBlob || this.capturing()) return;
    this.capturing.set(true);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File([this.snapshotBlob], `webcam-${stamp}.jpg`, { type: 'image/jpeg' });
    this.teardown();
    this.captured.emit(file);
    this.capturing.set(false);
  }

  private async startCamera(attempt = 0): Promise<void> {
    if (!this.open) return;

    this.error.set(null);
    this.ready.set(false);
    this.starting.set(true);
    this.revokeSnapshot();
    this.snapshotBlob = null;
    this.stopStreamOnly();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.starting.set(false);
      this.error.set('Este navegador não permite acesso à webcam.');
      return;
    }

    const video = this.videoEl?.nativeElement;
    if (!video) {
      if (attempt < 20) {
        setTimeout(() => void this.startCamera(attempt + 1), 50);
        return;
      }
      this.starting.set(false);
      this.error.set('Elemento de vídeo indisponível.');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!this.open) {
        this.stopStreamOnly();
        return;
      }
      video.srcObject = this.stream;
      await video.play();
      this.ready.set(true);
      this.starting.set(false);
    } catch (err) {
      this.starting.set(false);
      this.ready.set(false);
      this.stopStreamOnly();
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        this.error.set('Permissão da câmera negada. Libere o acesso no navegador e tente de novo.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        this.error.set('Nenhuma webcam foi encontrada neste computador.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        this.error.set('A webcam está em uso por outro aplicativo.');
      } else {
        this.error.set('Não foi possível abrir a webcam.');
      }
    }
  }

  private stopStreamOnly(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    const video = this.videoEl?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
    this.ready.set(false);
  }

  private revokeSnapshot(): void {
    const url = this.snapshotUrl();
    if (url) URL.revokeObjectURL(url);
    this.snapshotUrl.set(null);
  }

  private teardown(): void {
    this.stopStreamOnly();
    this.revokeSnapshot();
    this.snapshotBlob = null;
    this.starting.set(false);
    this.capturing.set(false);
    this.error.set(null);
  }
}
