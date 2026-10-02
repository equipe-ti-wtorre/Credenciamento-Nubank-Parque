import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  CollaboratorItem,
  CollaboratorService,
  normalizeCpfInput,
} from '../../services/collaborator.service';
import {
  ExternalCompany,
  InvoiceProductSuggestion,
  MaterialCompanyOption,
  MaterialVehicleOption,
  MaterialsService,
  MovementNature,
  MovementType,
  OriginType,
  ProductItem,
  StorageLocationItem,
} from '../../services/materials.service';
import { AuthService, hasPermission } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { WebcamCaptureModalComponent } from '../../shared/webcam-capture/webcam-capture-modal.component';
import {
  digitsOnly,
  isValidCnpj,
  isValidCpf,
  isValidPlate,
  maskCpfOrCnpj,
  normalizePlateInput,
} from '../../utils/br-docs';

interface MovementItemRow {
  id_product: number | null;
  id_storage_location: number | null;
  quantity: number | null;
  raw_description?: string | null;
  suggestions?: InvoiceProductSuggestion[];
  creating?: boolean;
  createDescription?: string;
  createUnit?: string;
  createSaving?: boolean;
}

function documentValidator(control: AbstractControl): ValidationErrors | null {
  const digits = digitsOnly(control.value);
  if (!digits) return { required: true };
  if (digits.length === 11) return isValidCpf(digits) ? null : { document: true };
  if (digits.length === 14) return isValidCnpj(digits) ? null : { document: true };
  return { document: true };
}

function optionalDocumentValidator(control: AbstractControl): ValidationErrors | null {
  const digits = digitsOnly(control.value);
  if (!digits) return null;
  return documentValidator(control);
}

function plateValidator(control: AbstractControl): ValidationErrors | null {
  const v = String(control.value || "").trim();
  if (!v) return { required: true };
  return isValidPlate(v) ? null : { plate: true };
}

@Component({
  selector: 'app-gate-merchandise-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WebcamCaptureModalComponent],
  templateUrl: './gate-merchandise-form.component.html',
  styleUrl: './gate-merchandise-form.component.scss',
})
export class GateMerchandiseFormComponent implements OnInit, OnDestroy {
  @Input({ required: true }) movementType!: MovementType;
  @Output() natureChange = new EventEmitter<MovementNature>();

  private materials = inject(MaterialsService);
  private collaboratorService = inject(CollaboratorService);
  private notification = inject(NotificationService);
  private auth = inject(AuthService);
  private location = inject(Location);
  private fb = inject(FormBuilder);

  canCreateProduct = signal(false);
  showWebcamModal = signal(false);
  requestId = crypto.randomUUID();
  credentialLocked = signal(false);
  showNoInvoice = signal(false);
  ocrLowConfidence = signal(false);

  companies = signal<MaterialCompanyOption[]>([]);
  vehicles = signal<MaterialVehicleOption[]>([]);
  products = signal<ProductItem[]>([]);
  locations = signal<StorageLocationItem[]>([]);
  party = signal<CollaboratorItem[]>([]);
  partySuggestions = signal<CollaboratorItem[]>([]);
  partyError = signal('');
  partyDocument = '';
  partySearching = signal(false);
  senderSuggestions = signal<ExternalCompany[]>([]);
  submitting = signal(false);
  photoFiles: File[] = [];
  photoFile: File | null = null;
  photoPreview = signal<string | null>(null);
  photoDragOver = signal(false);
  ocrLoading = signal(false);
  ocrMessage = signal('');

  items: MovementItemRow[] = [{ id_product: null, id_storage_location: null, quantity: null }];

  private cpfTypeId: number | null = null;
  private readonly partySearchDebounceMs = 300;
  private partySearchDebounce: ReturnType<typeof setTimeout> | null = null;
  private senderSearchDebounce: ReturnType<typeof setTimeout> | null = null;
  private partySearchRequestId = 0;
  private ocrRequestId = 0;

  fg = this.fb.group({
    vehicle_plate: ['', plateValidator],
    origin_type: this.fb.nonNullable.control<OriginType>('CREDENCIADA', Validators.required),
    movement_nature: this.fb.nonNullable.control<MovementNature>('ESTOQUE', Validators.required),
    id_company: this.fb.control<number | null>(null),
    id_vehicle: this.fb.control<number | null>(null),
    invoice_number: [''],
    no_invoice_reason: this.fb.control<string | null>(null),
    sender_name: [''],
    sender_document: [''],
    driver_name: [''],
    driver_document: [''],
    carrier_name: [''],
    volumes: this.fb.control<number | null>(null),
    content_description: [''],
    recipient_area: [''],
  });

  ngOnInit() {
    void this.auth.getCurrentUser().then((user) => {
      this.canCreateProduct.set(
        hasPermission(user, 'merchandise_products', 'create') ||
          hasPermission(user, 'merchandise_entry', 'create') ||
          hasPermission(user, 'merchandise_exit', 'create'),
      );
    });
    this.loadCatalogs();
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => {
        const cpf = res.types.find((t) => t.description.toUpperCase() === 'CPF');
        if (cpf) this.cpfTypeId = cpf.id_collaborator_document_type;
      },
    });
    this.fg.controls.movement_nature.valueChanges.subscribe((n) => {
      this.natureChange.emit(n);
      this.syncValidators();
    });
    this.fg.controls.origin_type.valueChanges.subscribe(() => this.syncValidators());
    this.syncValidators();
    this.natureChange.emit(this.fg.controls.movement_nature.value);
  }

  ngOnDestroy() {
    this.clearPartySearchDebounce();
    if (this.senderSearchDebounce) clearTimeout(this.senderSearchDebounce);
  }

  get origin(): OriginType {
    return this.fg.controls.origin_type.value;
  }

  get nature(): MovementNature {
    return this.fg.controls.movement_nature.value;
  }

  setNature(n: MovementNature) {
    this.fg.controls.movement_nature.setValue(n);
    this.syncValidators();
  }

  onPlateInput(value: string) {
    const plate = normalizePlateInput(value);
    this.fg.controls.vehicle_plate.setValue(plate, { emitEvent: false });
  }

  onPlateBlur() {
    const plate = normalizePlateInput(this.fg.controls.vehicle_plate.value || '');
    this.fg.controls.vehicle_plate.setValue(plate, { emitEvent: false });
    if (!isValidPlate(plate)) {
      this.credentialLocked.set(false);
      return;
    }
    this.materials.lookupPlate(plate).subscribe({
      next: (res) => {
        if (res.found && res.origin_type === 'CREDENCIADA' && res.vehicle) {
          this.fg.controls.origin_type.setValue('CREDENCIADA');
          this.fg.controls.id_company.setValue(res.vehicle.id_company || null);
          this.credentialLocked.set(true);
          this.fg.controls.id_company.disable({ emitEvent: false });
          this.fg.controls.id_vehicle.disable({ emitEvent: false });
          if (res.vehicle.id_company) {
            this.materials.listVehiclesSelect(res.vehicle.id_company).subscribe({
              next: (v) => {
                this.vehicles.set(v.vehicles);
                const match = v.vehicles.find((x) => x.plate === res.vehicle?.plate);
                this.fg.controls.id_vehicle.setValue(match?.id_vehicle || res.vehicle?.id_vehicle || null);
              },
            });
          }
        } else if (res.found && res.origin_type === 'EVENTUAL') {
          this.fg.controls.origin_type.setValue('EVENTUAL');
          this.credentialLocked.set(false);
          this.fg.controls.id_company.enable({ emitEvent: false });
          this.fg.controls.id_vehicle.enable({ emitEvent: false });
          this.fg.patchValue({
            sender_name: res.suggestion?.sender_name || '',
            sender_document: res.suggestion?.sender_document || '',
            driver_name: res.suggestion?.driver_name || '',
            driver_document: res.suggestion?.driver_document || '',
            carrier_name: res.suggestion?.carrier_name || '',
          });
        } else {
          this.fg.controls.origin_type.setValue('EVENTUAL');
          this.credentialLocked.set(false);
          this.fg.controls.id_company.enable({ emitEvent: false });
          this.fg.controls.id_vehicle.enable({ emitEvent: false });
        }
        this.syncValidators();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao consultar placa.'),
    });
  }

  onSenderDocumentInput(value: string) {
    this.fg.controls.sender_document.setValue(maskCpfOrCnpj(value), { emitEvent: false });
  }

  onDriverDocumentInput(value: string) {
    this.fg.controls.driver_document.setValue(maskCpfOrCnpj(value), { emitEvent: false });
  }

  onSenderNameInput(value: string) {
    this.fg.controls.sender_name.setValue(value, { emitEvent: false });
    if (this.senderSearchDebounce) clearTimeout(this.senderSearchDebounce);
    const q = value.trim();
    if (q.length < 2) {
      this.senderSuggestions.set([]);
      return;
    }
    this.senderSearchDebounce = setTimeout(() => {
      this.materials.suggestExternalCompanies(q).subscribe({
        next: (res) => this.senderSuggestions.set(res.companies || []),
        error: () => this.senderSuggestions.set([]),
      });
    }, 300);
  }

  applySenderSuggestion(c: ExternalCompany) {
    this.fg.patchValue({
      sender_name: c.legal_name,
      sender_document: c.cnpj || c.cpf || '',
    });
    this.senderSuggestions.set([]);
  }

  toggleNoInvoice() {
    this.showNoInvoice.update((v) => !v);
    if (this.showNoInvoice()) {
      this.fg.controls.invoice_number.setValue('');
      this.fg.controls.invoice_number.disable({ emitEvent: false });
    } else {
      this.fg.controls.no_invoice_reason.setValue(null);
      this.fg.controls.invoice_number.enable({ emitEvent: false });
    }
    this.syncValidators();
  }

  private syncValidators() {
    const origin = this.origin;
    const nature = this.nature;
    const company = this.fg.controls.id_company;
    const vehicle = this.fg.controls.id_vehicle;
    const senderName = this.fg.controls.sender_name;
    const driverName = this.fg.controls.driver_name;
    const driverDoc = this.fg.controls.driver_document;
    const senderDoc = this.fg.controls.sender_document;
    const volumes = this.fg.controls.volumes;
    const content = this.fg.controls.content_description;
    const area = this.fg.controls.recipient_area;
    const invoice = this.fg.controls.invoice_number;
    const reason = this.fg.controls.no_invoice_reason;

    if (origin === 'CREDENCIADA') {
      company.setValidators([Validators.required]);
      vehicle.setValidators([Validators.required]);
      senderName.clearValidators();
      driverName.clearValidators();
      driverDoc.clearValidators();
      senderDoc.clearValidators();
    } else {
      company.clearValidators();
      vehicle.clearValidators();
      senderName.setValidators([Validators.required, Validators.minLength(2)]);
      driverName.setValidators([Validators.required, Validators.minLength(2)]);
      driverDoc.setValidators([documentValidator]);
      senderDoc.setValidators([optionalDocumentValidator]);
    }

    if (nature === 'ENTREGA') {
      volumes.setValidators([Validators.required, Validators.min(1), Validators.max(999)]);
      content.setValidators([Validators.required, Validators.maxLength(255)]);
      area.setValidators([Validators.required, Validators.maxLength(120)]);
      invoice.clearValidators();
      reason.clearValidators();
    } else {
      volumes.clearValidators();
      content.clearValidators();
      area.clearValidators();
      if (this.showNoInvoice() || reason.value) {
        invoice.clearValidators();
        reason.setValidators([Validators.required]);
      } else {
        invoice.setValidators([Validators.required, Validators.minLength(1)]);
        reason.clearValidators();
      }
    }

    [
      company, vehicle, senderName, driverName, driverDoc, senderDoc,
      volumes, content, area, invoice, reason,
    ].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
  }

  partyRoleLabel(index: number): string {
    return index === 0 ? 'Motorista' : 'Ajudante';
  }

  loadCatalogs() {
    this.materials.listCompaniesSelect().subscribe({
      next: (res) => this.companies.set(res.companies),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar empresas.'),
    });
    this.materials.listProductsSelect().subscribe({
      next: (res) => this.products.set(res.products),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar produtos.'),
    });
    this.materials.listLocationsSelect().subscribe({
      next: (res) => this.locations.set(res.locations),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar locais.'),
    });
  }

  onCompanyChange() {
    this.fg.controls.id_vehicle.setValue(null);
    this.vehicles.set([]);
    const id = this.fg.controls.id_company.value;
    if (!id) return;
    this.materials.listVehiclesSelect(id).subscribe({
      next: (res) => this.vehicles.set(res.vehicles),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar veículos.'),
    });
  }

  onPartyDocumentChange(value: string) {
    this.partyDocument = normalizeCpfInput(value);
    this.partyError.set('');
    this.clearPartySearchDebounce();
    const doc = this.partyDocument;
    if (!doc || doc.length < 3) {
      this.partySuggestions.set([]);
      this.partySearching.set(false);
      return;
    }
    this.partySearchDebounce = setTimeout(() => this.runPartyTypeahead(doc), this.partySearchDebounceMs);
  }

  addToParty(candidate: CollaboratorItem) {
    this.clearPartySearchDebounce();
    this.partySearchRequestId += 1;
    this.partySuggestions.set([]);
    this.partySearching.set(false);
    if (candidate.is_blocklisted) {
      this.partyError.set('Colaborador está na blocklist.');
      return;
    }
    if (this.party().some((p) => p.id_collaborator === candidate.id_collaborator)) {
      this.partyError.set('Esta pessoa já está na relação.');
      return;
    }
    this.party.update((list) => [...list, candidate]);
    this.partyDocument = '';
    this.partyError.set('');
  }

  removeFromParty(idCollaborator: number) {
    this.party.update((list) => list.filter((p) => p.id_collaborator !== idCollaborator));
  }

  buscarPessoa() {
    this.clearPartySearchDebounce();
    const doc = normalizeCpfInput(this.partyDocument);
    this.partyDocument = doc;
    if (!doc) {
      this.partySuggestions.set([]);
      this.partyError.set('Informe o CPF.');
      return;
    }
    if (doc.length < 11) {
      this.runPartyTypeahead(doc, true);
      return;
    }
    if (!this.cpfTypeId) {
      this.partyError.set('Tipo de documento CPF indisponível.');
      return;
    }
    const requestId = ++this.partySearchRequestId;
    this.partySearching.set(true);
    this.partyError.set('');
    this.partySuggestions.set([]);
    this.collaboratorService.searchByDocument(doc, this.cpfTypeId).subscribe({
      next: (res) => {
        if (requestId !== this.partySearchRequestId) return;
        this.partySearching.set(false);
        if (!res.found || !res.collaborator) {
          this.partyError.set('Colaborador não encontrado.');
          return;
        }
        this.addToParty(res.collaborator);
      },
      error: (err) => {
        if (requestId !== this.partySearchRequestId) return;
        this.partySearching.set(false);
        this.partyError.set(err.error?.message || 'Colaborador não encontrado.');
      },
    });
  }

  private runPartyTypeahead(doc: string, selectIfSingle = false) {
    const requestId = ++this.partySearchRequestId;
    this.partySearching.set(true);
    this.partyError.set('');
    this.collaboratorService.searchByTerm(doc).subscribe({
      next: (res) => {
        if (requestId !== this.partySearchRequestId) return;
        this.partySearching.set(false);
        const selectedIds = new Set(this.party().map((p) => p.id_collaborator));
        const results = (res.results || []).filter(
          (r) =>
            !selectedIds.has(r.id_collaborator) &&
            (!r.document_type?.description || r.document_type.description.toUpperCase() === 'CPF'),
        );
        this.partySuggestions.set(results);
        if (!results.length) {
          if (selectIfSingle || doc.length >= 11) this.partyError.set('Colaborador não encontrado.');
          return;
        }
        if ((selectIfSingle || doc.length === 11) && results.length === 1) this.addToParty(results[0]);
      },
      error: (err) => {
        if (requestId !== this.partySearchRequestId) return;
        this.partySearching.set(false);
        this.partySuggestions.set([]);
        this.partyError.set(err.error?.message || 'Falha ao buscar colaborador.');
      },
    });
  }

  private clearPartySearchDebounce() {
    if (this.partySearchDebounce !== null) {
      clearTimeout(this.partySearchDebounce);
      this.partySearchDebounce = null;
    }
  }

  adicionarItem() {
    this.items.push({
      id_product: null,
      id_storage_location: null,
      quantity: null,
      suggestions: [],
      creating: false,
      createDescription: '',
      createUnit: 'UN',
      createSaving: false,
    });
  }

  removerItem(index: number) {
    if (this.items.length <= 1) return;
    this.items.splice(index, 1);
  }

  applySuggestion(index: number, suggestion: InvoiceProductSuggestion) {
    const item = this.items[index];
    if (!item) return;
    item.id_product = suggestion.id_product;
    item.creating = false;
    this.notification.success(`Produto selecionado: ${suggestion.description}`);
  }

  toggleCreateProduct(index: number) {
    const item = this.items[index];
    if (!item) return;
    item.creating = !item.creating;
    if (item.creating) {
      item.createDescription = item.raw_description || item.createDescription || '';
      item.createUnit = item.createUnit || 'UN';
    }
  }

  createProductForItem(index: number) {
    const item = this.items[index];
    if (!item || item.createSaving) return;
    const description = (item.createDescription || '').trim();
    const unit = (item.createUnit || '').trim();
    if (!description) {
      this.notification.error('Informe a descrição do produto.');
      return;
    }
    if (!unit) {
      this.notification.error('Informe a unidade de medida.');
      return;
    }
    item.createSaving = true;
    this.materials.createProduct({ description, unit_measure: unit }).subscribe({
      next: (res) => {
        item.createSaving = false;
        const product = res.product;
        const list = this.products().slice();
        if (!list.some((p) => p.id_product === product.id_product)) {
          list.push(product);
          list.sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'));
          this.products.set(list);
        }
        item.id_product = product.id_product;
        item.creating = false;
        item.suggestions = [];
        this.notification.success(`Produto cadastrado: ${product.description}`);
      },
      error: (err) => {
        item.createSaving = false;
        this.notification.notifyHttpError(err, 'Falha ao cadastrar produto.');
      },
    });
  }

  showUnresolvedHelp(item: MovementItemRow): boolean {
    return !!(item.raw_description && !item.id_product);
  }

  cancel() {
    this.location.back();
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.applyPhotoFile(file);
  }

  openWebcamCapture() {
    if (this.ocrLoading() || this.submitting()) return;
    this.showWebcamModal.set(true);
  }

  closeWebcamCapture() {
    this.showWebcamModal.set(false);
  }

  onWebcamCaptured(file: File) {
    this.showWebcamModal.set(false);
    this.applyPhotoFile(file);
  }

  onPhotoDragOver(event: DragEvent) {
    event.preventDefault();
    if (this.ocrLoading()) return;
    this.photoDragOver.set(true);
  }

  onPhotoDragLeave(event: DragEvent) {
    event.preventDefault();
    this.photoDragOver.set(false);
  }

  onPhotoDrop(event: DragEvent) {
    event.preventDefault();
    this.photoDragOver.set(false);
    if (this.ocrLoading()) return;
    this.applyPhotoFile(event.dataTransfer?.files?.[0] ?? null);
  }

  private setPhotoPreview(file: File | null) {
    if (this.photoPreview()) URL.revokeObjectURL(this.photoPreview()!);
    this.photoPreview.set(file ? URL.createObjectURL(file) : null);
  }

  private applyPhotoFile(file: File | null) {
    this.ocrRequestId += 1;
    this.ocrLoading.set(false);
    if (!file) {
      this.photoFiles = [];
      this.photoFile = null;
      this.setPhotoPreview(null);
      this.ocrMessage.set('');
      return;
    }
    this.photoFiles = [...this.photoFiles, file];
    this.photoFile = file;
    this.setPhotoPreview(file);
    this.runInvoiceOcr(file, this.ocrRequestId);
  }

  private isBlankItemRow(item: MovementItemRow): boolean {
    return !item.id_product && !item.quantity && !item.raw_description && !(item.suggestions && item.suggestions.length);
  }

  private mergeInvoiceNumbers(current: string, incoming: string | null | undefined): string {
    const next = String(incoming || '').trim();
    if (!next) return current.trim();
    const existing = current.split(/[\/,;]+/).map((p) => p.trim()).filter(Boolean);
    if (existing.some((n) => n === next || n.replace(/^0+/, '') === next.replace(/^0+/, ''))) {
      return current.trim() || next;
    }
    const merged = existing.length ? `${existing.join(' / ')} / ${next}` : next;
    return merged.length <= 255 ? merged : (current.trim() || next).slice(0, 255);
  }

  private mapOcrItems(
    items: {
      id_product: number | null;
      quantity: number;
      raw_description?: string | null;
      suggestions?: MovementItemRow['suggestions'];
    }[],
    reuseLocation: number | null,
  ): MovementItemRow[] {
    return items.map((item) => ({
      id_product: item.id_product,
      id_storage_location: reuseLocation,
      quantity: item.quantity,
      raw_description: item.raw_description || null,
      suggestions: item.suggestions || [],
      creating: false,
      createDescription: item.raw_description || '',
      createUnit: 'UN',
      createSaving: false,
    }));
  }

  private runInvoiceOcr(file: File, requestId: number) {
    this.ocrLoading.set(true);
    this.ocrMessage.set('Lendo NF…');
    this.ocrLowConfidence.set(false);
    const fd = new FormData();
    fd.append('photo', file);
    this.materials.parseInvoice(fd).subscribe({
      next: (res) => {
        if (requestId !== this.ocrRequestId) return;
        this.ocrLoading.set(false);
        const reuseLocation = this.items.find((i) => i.id_storage_location)?.id_storage_location ?? null;
        this.fg.controls.invoice_number.setValue(
          this.mergeInvoiceNumbers(this.fg.controls.invoice_number.value || '', res.invoice_number),
        );
        if (res.items?.length) {
          const mapped = this.mapOcrItems(res.items, reuseLocation);
          const prior = this.items.filter((i) => !this.isBlankItemRow(i));
          this.items = prior.length ? [...prior, ...mapped] : mapped;
        }
        if (res.emitente?.cnpj) {
          this.fg.patchValue({
            sender_document: maskCpfOrCnpj(res.emitente.cnpj),
            sender_name: res.emitente.legal_name || this.fg.controls.sender_name.value,
          });
          if ((res.emitente.confidence ?? 1) < 0.7) {
            this.ocrLowConfidence.set(true);
          }
        }
        const unmatched = (res.items || []).filter((i) => !i.id_product).length;
        const matched = (res.items || []).filter((i) => i.id_product).length;
        if (matched > 0 || res.invoice_number || res.emitente?.cnpj) {
          const parts: string[] = [];
          if (res.invoice_number) parts.push(`NF ${res.invoice_number}`);
          if (res.emitente?.cnpj) parts.push(`emitente ${res.emitente.cnpj}`);
          if (matched > 0) parts.push(`${matched} item(ns)`);
          this.ocrMessage.set(parts.join(' · '));
          this.notification.success(
            unmatched > 0
              ? `NF lida: ${matched} produto(s). Revise ${unmatched} sem match.`
              : `NF lida: ${parts.join(' · ')}.`,
          );
        } else {
          this.ocrMessage.set('Nada reconhecido nesta NF — foto mantida.');
        }
      },
      error: (err) => {
        if (requestId !== this.ocrRequestId) return;
        this.ocrLoading.set(false);
        this.ocrMessage.set(
          this.photoFiles.length
            ? `Leitura da NF falhou — ${this.photoFiles.length} foto(s) serão salvas ao confirmar.`
            : 'Leitura da NF falhou.',
        );
        this.notification.notifyHttpError(err, 'Falha ao ler a NF. A imagem será salva ao confirmar.');
      },
    });
  }

  submit() {
    this.syncValidators();
    if (this.fg.invalid) {
      this.fg.markAllAsTouched();
      this.notification.error('Revise os campos obrigatórios.');
      return;
    }
    if (this.submitting()) return;

    const origin = this.origin;
    const nature = this.nature;
    const raw = this.fg.getRawValue();

    if (origin === 'CREDENCIADA' && !this.party().length) {
      this.notification.error('Adicione o motorista na relação (e ajudantes, se houver).');
      return;
    }

    const payload: {
      request_id: string;
      origin_type: OriginType;
      movement_nature: MovementNature;
      id_company?: number | null;
      id_vehicle?: number | null;
      id_collaborator?: number;
      id_collaborators?: number[];
      sender_name?: string;
      sender_document?: string | null;
      driver_name?: string;
      driver_document?: string;
      vehicle_plate?: string;
      carrier_name?: string | null;
      external_origem?: 'OCR' | 'MANUAL';
      items?: { id_product: number; id_storage_location: number; quantity: number }[];
      no_invoice_reason?: string | null;
      invoice_number?: string | null;
      volumes?: number;
      content_description?: string;
      recipient_area?: string;
    } = {
      request_id: this.requestId,
      origin_type: origin,
      movement_nature: nature,
    };

    if (origin === 'CREDENCIADA') {
      const idCollaborators = this.party().map((p) => p.id_collaborator);
      payload.id_company = raw.id_company;
      payload.id_vehicle = raw.id_vehicle;
      payload.id_collaborator = idCollaborators[0];
      payload.id_collaborators = idCollaborators;
    } else {
      payload.sender_name = raw.sender_name?.trim();
      payload.sender_document = digitsOnly(raw.sender_document) || null;
      payload.driver_name = raw.driver_name?.trim();
      payload.driver_document = digitsOnly(raw.driver_document);
      payload.vehicle_plate = normalizePlateInput(raw.vehicle_plate || '');
      payload.carrier_name = raw.carrier_name?.trim() || null;
      payload.external_origem = this.ocrLowConfidence() ? 'OCR' : 'MANUAL';
    }

    if (nature === 'ESTOQUE') {
      const items = this.items
        .filter((i) => i.id_product && i.id_storage_location && i.quantity && i.quantity > 0)
        .map((i) => ({
          id_product: i.id_product!,
          id_storage_location: i.id_storage_location!,
          quantity: Number(i.quantity),
        }));
      if (!items.length) {
        this.notification.error('Informe ao menos um item válido.');
        return;
      }
      payload.items = items;
      if (this.showNoInvoice() && raw.no_invoice_reason) {
        payload.no_invoice_reason = raw.no_invoice_reason;
        payload.invoice_number = null;
      } else {
        payload.invoice_number = String(raw.invoice_number || '').trim();
      }
    } else {
      payload.volumes = Number(raw.volumes);
      payload.content_description = String(raw.content_description || '').trim();
      payload.recipient_area = String(raw.recipient_area || '').trim();
      payload.items = [];
    }

    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    for (const photo of this.photoFiles) {
      fd.append('photos', photo, photo.name || 'nf.jpg');
    }
    if (this.photoFiles[0]) {
      fd.append('photo', this.photoFiles[0], this.photoFiles[0].name || 'nf.jpg');
    }

    this.submitting.set(true);
    const req = this.movementType === 'ENTRADA' ? this.materials.registerIn(fd) : this.materials.registerOut(fd);
    req.subscribe({
      next: () => {
        this.submitting.set(false);
        this.notification.success(this.movementType === 'ENTRADA' ? 'Entrada registrada.' : 'Saída registrada.');
        this.resetForm();
      },
      error: (err) => {
        this.submitting.set(false);
        this.notification.notifyHttpError(err, 'Falha ao registrar movimentação.');
      },
    });
  }

  private resetForm() {
    this.clearPartySearchDebounce();
    this.partySearchRequestId += 1;
    this.fg.reset({
      vehicle_plate: '',
      origin_type: 'CREDENCIADA',
      movement_nature: 'ESTOQUE',
      id_company: null,
      id_vehicle: null,
      invoice_number: '',
      no_invoice_reason: null,
      sender_name: '',
      sender_document: '',
      driver_name: '',
      driver_document: '',
      carrier_name: '',
      volumes: null,
      content_description: '',
      recipient_area: '',
    });
    this.items = [{ id_product: null, id_storage_location: null, quantity: null }];
    this.party.set([]);
    this.partySuggestions.set([]);
    this.partyDocument = '';
    this.partyError.set('');
    this.photoFiles = [];
    this.photoFile = null;
    this.setPhotoPreview(null);
    this.ocrRequestId += 1;
    this.ocrLoading.set(false);
    this.ocrMessage.set('');
    this.ocrLowConfidence.set(false);
    this.vehicles.set([]);
    this.credentialLocked.set(false);
    this.showNoInvoice.set(false);
    this.requestId = crypto.randomUUID();
    this.syncValidators();
    this.natureChange.emit('ESTOQUE');
  }
}
