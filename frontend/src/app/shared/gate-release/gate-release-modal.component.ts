import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../modal/modal.component';
import { WebcamCaptureModalComponent } from '../webcam-capture/webcam-capture-modal.component';
import { FaceCropModalComponent } from '../face-crop/face-crop-modal.component';
import { CollaboratorService } from '../../services/collaborator.service';
import { NotificationService } from '../../core/services/notification.service';
import { GateCollaboratorInfo } from '../../services/gate.service';

export interface GateReleaseTarget {
  access_id: string;
  collaborator: GateCollaboratorInfo;
  company_name: string;
}

export interface GateReleaseResult {
  access_id: string;
  without_photo: boolean;
}

type GateReleaseStep = 'docs' | 'photo' | 'confirm';

/**
 * Wizard de liberação de acesso na portaria (3 etapas):
 * conferência de documentos → validação da foto → confirmação da entrada.
 */
@Component({
  selector: 'app-gate-release-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    WebcamCaptureModalComponent,
    FaceCropModalComponent,
  ],
  templateUrl: './gate-release-modal.component.html',
  styleUrl: './gate-release-modal.component.scss',
})
export class GateReleaseModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() target: GateReleaseTarget | null = null;
  @Input() operatorName = '';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<GateReleaseResult>();
  /** Emitido quando uma foto é capturada e gravada no colaborador (filename novo). */
  @Output() pictureUpdated = new EventEmitter<{ access_id: string; picture: string }>();

  private collaboratorService = inject(CollaboratorService);
  private notify = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  step = signal<GateReleaseStep>('docs');
  docConfirmed = signal(false);
  photoConfirmed = signal(false);
  withoutPhoto = signal(false);

  photoUrl = signal<string | null>(null);
  photoLoading = signal(false);
  /** Foto capturada agora na portaria (já validada e gravada). */
  capturedNow = signal(false);
  photoBusy = signal(false);

  showWebcam = signal(false);
  showFaceCrop = signal(false);
  faceCropSourceUrl = signal<string | null>(null);
  faceCropSourceName = signal('foto.jpg');

  hasPhoto = computed(() => !!this.photoUrl());
  canAdvancePhoto = computed(
    () => (this.hasPhoto() && this.photoConfirmed()) || this.withoutPhoto(),
  );

  stepIndex = computed(() => {
    const s = this.step();
    return s === 'docs' ? 1 : s === 'photo' ? 2 : 3;
  });

  subtitle = computed(() => {
    switch (this.step()) {
      case 'docs':
        return 'Etapa 1 de 3 · Conferência de documentos';
      case 'photo':
        return 'Etapa 2 de 3 · Validação da foto';
      default:
        return 'Etapa 3 de 3 · Confirmar liberação';
    }
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] || changes['target']) {
      if (this.open && this.target) {
        this.resetState();
        this.loadPhoto(this.target.collaborator.picture);
      } else if (!this.open) {
        this.cleanupUrls();
      }
    }
  }

  ngOnDestroy(): void {
    this.cleanupUrls();
  }

  private resetState(): void {
    this.cleanupUrls();
    this.step.set('docs');
    this.docConfirmed.set(false);
    this.photoConfirmed.set(false);
    this.withoutPhoto.set(false);
    this.capturedNow.set(false);
    this.photoBusy.set(false);
    this.showWebcam.set(false);
    this.showFaceCrop.set(false);
  }

  private cleanupUrls(): void {
    const photo = this.photoUrl();
    if (photo) URL.revokeObjectURL(photo);
    this.photoUrl.set(null);
    this.revokeFaceCropSource();
  }

  private revokeFaceCropSource(): void {
    const url = this.faceCropSourceUrl();
    if (url) URL.revokeObjectURL(url);
    this.faceCropSourceUrl.set(null);
  }

  private loadPhoto(picture: string | null | undefined): void {
    if (!picture) return;
    this.photoLoading.set(true);
    this.collaboratorService.getPictureBlob(picture).subscribe({
      next: (blob) => {
        this.photoLoading.set(false);
        if (!this.open) return;
        this.photoUrl.set(URL.createObjectURL(blob));
        this.cdr.markForCheck();
      },
      error: () => {
        this.photoLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  initials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  documentLabel(): string {
    const type = this.target?.collaborator.document_type;
    return type ? `${type} (documento com foto)` : 'Documento de identificação';
  }

  /** Número completo para conferência; fallback no mascarado se API antiga. */
  documentDisplay(): string {
    const c = this.target?.collaborator;
    if (!c) return '—';
    return (c.document || c.document_masked || '—').trim() || '—';
  }

  onClose(): void {
    this.close.emit();
  }

  goBack(): void {
    if (this.step() === 'photo') this.step.set('docs');
    else if (this.step() === 'confirm') this.step.set('photo');
  }

  advanceFromDocs(): void {
    if (!this.docConfirmed()) return;
    this.step.set('photo');
  }

  advanceFromPhoto(): void {
    if (!this.canAdvancePhoto()) return;
    this.step.set('confirm');
  }

  releaseWithoutPhoto(): void {
    this.withoutPhoto.set(true);
    this.step.set('confirm');
  }

  onConfirm(): void {
    if (!this.target) return;
    this.confirm.emit({
      access_id: this.target.access_id,
      without_photo: this.withoutPhoto() || !this.hasPhoto(),
    });
  }

  // --- Captura de foto (webcam → crop → validação facial → upload) ---

  get canCapture(): boolean {
    return !!this.target?.collaborator.id_collaborator;
  }

  openWebcam(): void {
    if (!this.canCapture || this.photoBusy()) return;
    this.showFaceCrop.set(false);
    this.showWebcam.set(true);
  }

  cancelWebcam(): void {
    this.showWebcam.set(false);
  }

  onWebcamCaptured(file: File): void {
    this.showWebcam.set(false);
    this.revokeFaceCropSource();
    this.faceCropSourceName.set(file.name || 'foto.jpg');
    this.faceCropSourceUrl.set(URL.createObjectURL(file));
    this.showFaceCrop.set(true);
  }

  cancelFaceCrop(): void {
    this.showFaceCrop.set(false);
    this.revokeFaceCropSource();
  }

  onFaceCropped(file: File): void {
    this.showFaceCrop.set(false);
    this.revokeFaceCropSource();
    this.validateAndUpload(file);
  }

  private validateAndUpload(file: File): void {
    const id = this.target?.collaborator.id_collaborator;
    if (!id) return;
    this.photoBusy.set(true);
    this.collaboratorService.validateFacePicture(file).subscribe({
      next: (report) => {
        const apto = !!report.apto?.controlid && !!report.apto?.dahua;
        if (!apto) {
          this.photoBusy.set(false);
          const falha = (report.checagens || []).find((c) => c.status === 'falha');
          this.notify.error(
            falha?.mensagem
              ? `Foto não apta para facial: ${falha.mensagem}`
              : 'Foto não apta para facial. Tente novamente com melhor enquadramento e iluminação.',
          );
          this.cdr.markForCheck();
          return;
        }
        this.uploadPicture(id, file);
      },
      error: () => {
        this.photoBusy.set(false);
        this.notify.error('Falha ao validar a foto facial. Tente novamente.');
        this.cdr.markForCheck();
      },
    });
  }

  private uploadPicture(id: number, file: File): void {
    this.collaboratorService.uploadPicture(id, file).subscribe({
      next: (res) => {
        this.photoBusy.set(false);
        const previous = this.photoUrl();
        if (previous) URL.revokeObjectURL(previous);
        this.photoUrl.set(URL.createObjectURL(file));
        this.capturedNow.set(true);
        this.withoutPhoto.set(false);
        this.photoConfirmed.set(false);
        if (this.target) {
          this.pictureUpdated.emit({ access_id: this.target.access_id, picture: res.picture });
        }
        this.notify.success('Foto cadastrada e validada para Control iD e Dahua.');
        this.cdr.markForCheck();
      },
      error: (err: { error?: { message?: string } }) => {
        this.photoBusy.set(false);
        this.notify.error(err?.error?.message || 'Falha ao gravar a foto do colaborador.');
        this.cdr.markForCheck();
      },
    });
  }
}
