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
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { NotificationService } from '../../core/services/notification.service';
import { CollaboratorService, FaceValidationReport } from '../../services/collaborator.service';
import { FaceCropModalComponent } from '../face-crop/face-crop-modal.component';

export type CollaboratorPhotoMode = 'immediate' | 'deferred';
export type CollaboratorPhotoSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-collaborator-photo',
  standalone: true,
  imports: [CommonModule, FaceCropModalComponent],
  template: `
    <button
      type="button"
      class="cph"
      [class.cph--sm]="size === 'sm'"
      [class.cph--md]="size === 'md'"
      [class.cph--lg]="size === 'lg'"
      [class.cph--editable]="editable"
      [class.cph--busy]="busy()"
      [disabled]="!editable || busy()"
      [attr.aria-label]="ariaLabel()"
      (click)="onPick()"
    >
      @if (displayUrl()) {
        <img class="cph__img" [src]="displayUrl()!" [alt]="name || 'Foto do colaborador'" />
      } @else {
        <span class="cph__initials" aria-hidden="true">{{ initials() }}</span>
      }
      @if (editable) {
        <span class="cph__overlay" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      }
    </button>
    <input
      #fileInput
      type="file"
      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      hidden
      (change)="onFileSelected($event)"
    />
    <app-face-crop-modal
      [open]="showCrop()"
      [imageUrl]="cropSourceUrl()"
      [fileName]="cropSourceName()"
      (cancel)="cancelCrop()"
      (cropped)="onCropped($event)"
    />
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }
      .cph {
        position: relative;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 50%;
        overflow: hidden;
        background: var(--brand-tonal-bg, var(--wtorre-tonal-bg, #e8eefd));
        color: var(--brand, var(--wtorre, #1d54e6));
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-weight: 700;
        line-height: 1;
        cursor: default;
      }
      .cph--sm {
        width: 32px;
        height: 32px;
        font-size: 12px;
      }
      .cph--md {
        width: 56px;
        height: 56px;
        font-size: 18px;
      }
      .cph--lg {
        width: 84px;
        height: 84px;
        font-size: 24px;
      }
      .cph--editable {
        cursor: pointer;
      }
      .cph--editable:focus-visible {
        outline: 2px solid var(--brand, var(--wtorre, #1d54e6));
        outline-offset: 2px;
      }
      .cph--busy {
        opacity: 0.7;
        cursor: wait;
      }
      .cph:disabled {
        cursor: default;
      }
      .cph__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cph__overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgba(15, 23, 42, 0.45);
        color: #fff;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .cph--editable:hover .cph__overlay,
      .cph--editable:focus-visible .cph__overlay {
        opacity: 1;
      }
      .cph__overlay svg {
        width: 46%;
        height: 46%;
      }
    `,
  ],
})
export class CollaboratorPhotoComponent implements OnChanges, OnDestroy {
  private readonly collaboratorService = inject(CollaboratorService);
  private readonly notification = inject(NotificationService);

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  @Input() name = '';
  @Input() picture: string | null | undefined = null;
  @Input() previewUrl: string | null | undefined = null;
  @Input() collaboratorId: number | null = null;
  @Input() mode: CollaboratorPhotoMode = 'deferred';
  @Input() editable = true;
  @Input() size: CollaboratorPhotoSize = 'md';

  @Output() pictureChange = new EventEmitter<string>();
  @Output() fileReady = new EventEmitter<File>();
  @Output() validatingChange = new EventEmitter<boolean>();

  readonly displayUrl = signal<string | null>(null);
  readonly busy = signal(false);
  readonly showCrop = signal(false);
  readonly cropSourceUrl = signal<string | null>(null);
  readonly cropSourceName = signal('foto.jpg');

  private loadedFilename: string | null = null;
  private localPreview: string | null = null;

  private readonly acceptMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly acceptExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  private readonly sourceMaxBytes = 12 * 1024 * 1024;
  private readonly cropMaxBytes = 2 * 1024 * 1024;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['previewUrl'] || changes['picture'] || changes['name']) {
      this.syncDisplay();
    }
  }

  ngOnDestroy(): void {
    this.revokeLocalPreview();
    this.revokeCropSource();
  }

  initials(): string {
    const parts = String(this.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  ariaLabel(): string {
    const who = this.name?.trim() || 'colaborador';
    if (!this.editable) return `Foto de ${who}`;
    return this.displayUrl() ? `Trocar foto de ${who}` : `Enviar foto de ${who}`;
  }

  onPick(): void {
    if (!this.editable || this.busy()) return;
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    input.value = '';
    if (!file) return;
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
    if (!this.acceptMime.has(file.type) && !this.acceptExt.has(ext)) {
      this.notification.error('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > this.sourceMaxBytes) {
      this.notification.error('Imagem excede o limite de 12 MB.');
      return;
    }
    this.revokeCropSource();
    this.cropSourceName.set(file.name || 'foto.jpg');
    this.cropSourceUrl.set(URL.createObjectURL(file));
    this.showCrop.set(true);
  }

  cancelCrop(): void {
    this.showCrop.set(false);
    this.revokeCropSource();
  }

  onCropped(file: File): void {
    this.showCrop.set(false);
    this.revokeCropSource();
    if (file.size > this.cropMaxBytes) {
      this.notification.error('O recorte excede 2 MB. Tente um enquadramento menor ou outra foto.');
      return;
    }
    this.validateCropped(file);
  }

  private validateCropped(file: File): void {
    this.setBusy(true);
    this.collaboratorService.validateFacePicture(file).subscribe({
      next: (report) => {
        const apto = !!report.apto?.controlid && !!report.apto?.dahua;
        if (!apto) {
          this.setBusy(false);
          this.showFaceFail(report);
          return;
        }
        this.setLocalPreview(file);
        if (this.mode === 'immediate' && this.collaboratorId) {
          this.upload(this.collaboratorId, file);
          return;
        }
        this.setBusy(false);
        this.fileReady.emit(file);
        this.notification.success('Foto validada para Control iD e Dahua.');
      },
      error: (err) => {
        this.setBusy(false);
        this.notification.notifyHttpError(err, 'Falha ao validar a foto facial.');
      },
    });
  }

  private upload(id: number, file: File): void {
    this.collaboratorService.uploadPicture(id, file).subscribe({
      next: (res) => {
        this.setBusy(false);
        const filename = res.picture || res.collaborator?.picture || '';
        if (filename) this.pictureChange.emit(filename);
        this.fileReady.emit(file);
        this.notification.success('Foto enviada.');
      },
      error: (err) => {
        this.setBusy(false);
        this.notification.notifyHttpError(err, 'Falha ao enviar a foto.');
      },
    });
  }

  private showFaceFail(report: FaceValidationReport): void {
    const falhas = (report.checagens || [])
      .filter((c) => c.status === 'falha')
      .map((c) => c.mensagem || c.id);
    const avisos = (report.checagens || [])
      .filter((c) => c.status === 'aviso')
      .map((c) => c.mensagem || c.id);
    const htmlParts = [
      `<p class="text-sm text-slate-600 mb-2">Control iD: <strong>${report.apto?.controlid ? 'apto' : 'inapto'}</strong> · Dahua: <strong>${report.apto?.dahua ? 'apto' : 'inapto'}</strong></p>`,
    ];
    if (falhas.length) {
      htmlParts.push(
        `<p class="text-xs font-semibold text-rose-700 mb-1">Problemas</p><ul class="text-left text-sm text-slate-700 list-disc pl-5">${falhas
          .slice(0, 8)
          .map((m) => `<li>${m}</li>`)
          .join('')}</ul>`,
      );
    }
    if (avisos.length) {
      htmlParts.push(
        `<p class="text-xs font-semibold text-amber-700 mt-2 mb-1">Avisos</p><ul class="text-left text-sm text-slate-600 list-disc pl-5">${avisos
          .slice(0, 5)
          .map((m) => `<li>${m}</li>`)
          .join('')}</ul>`,
      );
    }
    Swal.fire({
      icon: 'warning',
      title: 'Foto não apta para facial',
      html: htmlParts.join(''),
      confirmButtonText: 'Escolher outra foto',
    });
  }

  private syncDisplay(): void {
    if (this.previewUrl) {
      this.displayUrl.set(this.previewUrl);
      return;
    }
    if (this.localPreview) {
      this.displayUrl.set(this.localPreview);
      return;
    }
    const filename = String(this.picture || '').trim();
    if (!filename) {
      this.loadedFilename = null;
      this.displayUrl.set(null);
      return;
    }
    if (filename === this.loadedFilename && this.displayUrl()) return;
    this.loadedFilename = filename;
    this.collaboratorService.getPictureBlob(filename).subscribe({
      next: (url) => this.displayUrl.set(url),
      error: () => {
        if (this.loadedFilename === filename) {
          this.loadedFilename = null;
          this.displayUrl.set(null);
        }
      },
    });
  }

  private setLocalPreview(file: File): void {
    this.revokeLocalPreview();
    this.localPreview = URL.createObjectURL(file);
    this.displayUrl.set(this.localPreview);
  }

  private setBusy(value: boolean): void {
    this.busy.set(value);
    this.validatingChange.emit(value);
  }

  private revokeLocalPreview(): void {
    if (this.localPreview) URL.revokeObjectURL(this.localPreview);
    this.localPreview = null;
  }

  private revokeCropSource(): void {
    const url = this.cropSourceUrl();
    if (url) URL.revokeObjectURL(url);
    this.cropSourceUrl.set(null);
  }
}
