import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CollaboratorItem,
  CollaboratorService,
  normalizeCpfInput,
} from '../../services/collaborator.service';
import {
  InvoiceProductSuggestion,
  MaterialCompanyOption,
  MaterialVehicleOption,
  MaterialsService,
  MovementType,
  ProductItem,
  StorageLocationItem,
} from '../../services/materials.service';
import { AuthService, hasPermission } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { WebcamCaptureModalComponent } from '../../shared/webcam-capture/webcam-capture-modal.component';

interface MovementItemRow {
  id_product: number | null;
  id_storage_location: number | null;
  quantity: number | null;
  /** Texto lido na NF quando o produto não foi casado no catálogo. */
  raw_description?: string | null;
  suggestions?: InvoiceProductSuggestion[];
  creating?: boolean;
  createDescription?: string;
  createUnit?: string;
  createSaving?: boolean;
}

@Component({
  selector: 'app-gate-merchandise-form',
  standalone: true,
  imports: [CommonModule, FormsModule, WebcamCaptureModalComponent],
  templateUrl: './gate-merchandise-form.component.html',
  styleUrl: './gate-merchandise-form.component.scss',
})
export class GateMerchandiseFormComponent implements OnInit, OnDestroy {
  @Input({ required: true }) movementType!: MovementType;

  private materials = inject(MaterialsService);
  private collaboratorService = inject(CollaboratorService);
  private notification = inject(NotificationService);
  private auth = inject(AuthService);
  private location = inject(Location);

  canCreateProduct = signal(false);
  showWebcamModal = signal(false);

  companies = signal<MaterialCompanyOption[]>([]);
  vehicles = signal<MaterialVehicleOption[]>([]);
  products = signal<ProductItem[]>([]);
  locations = signal<StorageLocationItem[]>([]);
  /** Relação: 1º = motorista, demais = ajudantes. */
  party = signal<CollaboratorItem[]>([]);
  partySuggestions = signal<CollaboratorItem[]>([]);
  partyError = signal('');
  partyDocument = '';
  partySearching = signal(false);
  submitting = signal(false);
  /** Todas as fotos anexadas (serão gravadas no banco ao confirmar). */
  photoFiles: File[] = [];
  /** Atalho para a última foto (preview / compat). */
  photoFile: File | null = null;
  photoPreview = signal<string | null>(null);
  photoDragOver = signal(false);
  ocrLoading = signal(false);
  ocrMessage = signal('');

  private cpfTypeId: number | null = null;
  private readonly partySearchDebounceMs = 300;
  private readonly partyTypeaheadMinDigits = 3;
  private partySearchDebounce: ReturnType<typeof setTimeout> | null = null;
  private partySearchRequestId = 0;
  private ocrRequestId = 0;

  form = {
    id_company: null as number | null,
    invoice_number: '',
    id_vehicle: null as number | null,
    items: [{ id_product: null, id_storage_location: null, quantity: null }] as MovementItemRow[],
  };

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
  }

  ngOnDestroy() {
    this.clearPartySearchDebounce();
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
    this.form.id_vehicle = null;
    this.vehicles.set([]);
    if (!this.form.id_company) return;
    this.materials.listVehiclesSelect(this.form.id_company).subscribe({
      next: (res) => this.vehicles.set(res.vehicles),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar veículos.'),
    });
  }

  onPartyDocumentChange(value: string) {
    this.partyDocument = normalizeCpfInput(value);
    this.partyError.set('');
    this.clearPartySearchDebounce();

    const doc = this.partyDocument;
    if (!doc || doc.length < this.partyTypeaheadMinDigits) {
      this.partySuggestions.set([]);
      this.partySearching.set(false);
      return;
    }

    this.partySearchDebounce = setTimeout(
      () => this.runPartyTypeahead(doc),
      this.partySearchDebounceMs,
    );
  }

  addToParty(candidate: CollaboratorItem) {
    this.clearPartySearchDebounce();
    this.partySearchRequestId += 1;
    this.partySuggestions.set([]);
    this.partySearching.set(false);

    if (candidate.is_blacklisted) {
      this.partyError.set('Colaborador está na lista negra.');
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
            (!r.document_type?.description ||
              r.document_type.description.toUpperCase() === 'CPF'),
        );

        this.partySuggestions.set(results);

        if (!results.length) {
          if (selectIfSingle || doc.length >= 11) {
            this.partyError.set('Colaborador não encontrado.');
          }
          return;
        }

        if ((selectIfSingle || doc.length === 11) && results.length === 1) {
          this.addToParty(results[0]);
        }
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
    this.form.items.push({
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
    if (this.form.items.length <= 1) return;
    this.form.items.splice(index, 1);
  }

  applySuggestion(index: number, suggestion: InvoiceProductSuggestion) {
    const item = this.form.items[index];
    if (!item) return;
    item.id_product = suggestion.id_product;
    item.creating = false;
    this.notification.success(`Produto selecionado: ${suggestion.description}`);
  }

  toggleCreateProduct(index: number) {
    const item = this.form.items[index];
    if (!item) return;
    item.creating = !item.creating;
    if (item.creating) {
      item.createDescription = item.raw_description || item.createDescription || '';
      item.createUnit = item.createUnit || 'UN';
    }
  }

  createProductForItem(index: number) {
    const item = this.form.items[index];
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
    if (this.photoPreview()) {
      URL.revokeObjectURL(this.photoPreview()!);
    }
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
    // Sempre acumula a imagem para gravar no banco ao confirmar (mesmo se o OCR falhar).
    this.photoFiles = [...this.photoFiles, file];
    this.photoFile = file;
    this.setPhotoPreview(file);
    this.runInvoiceOcr(file, this.ocrRequestId);
  }

  private isBlankItemRow(item: MovementItemRow): boolean {
    return (
      !item.id_product &&
      !item.quantity &&
      !item.raw_description &&
      !(item.suggestions && item.suggestions.length)
    );
  }

  /** Acumula números de NF sem duplicar; respeita o limite do campo. */
  private mergeInvoiceNumbers(current: string, incoming: string | null | undefined): string {
    const next = String(incoming || '').trim();
    if (!next) return current.trim();
    const existing = current
      .split(/[\/,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
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
    const fd = new FormData();
    fd.append('photo', file);
    this.materials.parseInvoice(fd).subscribe({
      next: (res) => {
        if (requestId !== this.ocrRequestId) return;
        this.ocrLoading.set(false);

        const reuseLocation =
          this.form.items.find((i) => i.id_storage_location)?.id_storage_location ?? null;
        const hadPriorData =
          this.photoFiles.length > 1 ||
          !!this.form.invoice_number.trim() ||
          this.form.items.some((i) => !this.isBlankItemRow(i));

        this.form.invoice_number = this.mergeInvoiceNumbers(
          this.form.invoice_number,
          res.invoice_number,
        );

        if (res.items?.length) {
          const mapped = this.mapOcrItems(res.items, reuseLocation);
          const prior = this.form.items.filter((i) => !this.isBlankItemRow(i));
          this.form.items = prior.length ? [...prior, ...mapped] : mapped;
        }

        const unmatched = (res.items || []).filter((i) => !i.id_product).length;
        const matched = (res.items || []).filter((i) => i.id_product).length;
        const totalItems = this.form.items.filter((i) => !this.isBlankItemRow(i)).length;
        const photoCount = this.photoFiles.length;

        if (matched > 0 || res.invoice_number || (res.items?.length ?? 0) > 0) {
          const parts: string[] = [];
          if (res.invoice_number) parts.push(`NF ${res.invoice_number}`);
          if (matched > 0) parts.push(`${matched} item(ns) desta NF`);
          if (hadPriorData) parts.push(`${totalItems} no total`);
          if (photoCount > 1) parts.push(`${photoCount} fotos`);
          this.ocrMessage.set(parts.join(' · '));
          this.notification.success(
            unmatched > 0
              ? `NF adicionada: ${matched} produto(s). Revise ${unmatched} sem match. Dados anteriores mantidos.`
              : hadPriorData
                ? `NF adicionada (${parts.join(' · ')}). Dados anteriores mantidos.`
                : `NF lida: ${parts.join(' · ')}. Revise e confirme.`,
          );
        } else {
          this.ocrMessage.set(
            hadPriorData
              ? `Nada reconhecido nesta NF — foto mantida (${photoCount}).`
              : `Nenhum dado reconhecido — foto mantida para gravar no lançamento.`,
          );
          this.notification.error(
            res.warnings?.[0] || 'Não foi possível identificar produtos na NF. A foto será salva ao confirmar.',
          );
        }
      },
      error: (err) => {
        if (requestId !== this.ocrRequestId) return;
        this.ocrLoading.set(false);
        // Foto já foi acumulada em photoFiles e será salva no submit.
        this.ocrMessage.set(
          this.photoFiles.length
            ? `Leitura da NF falhou — ${this.photoFiles.length} foto(s) serão salvas ao confirmar.`
            : 'Leitura da NF falhou.',
        );
        this.notification.notifyHttpError(
          err,
          'Falha ao ler a NF. A imagem anexada será salva ao confirmar o lançamento.',
        );
      },
    });
  }

  submit() {
    const party = this.party();
    if (!party.length) {
      this.notification.error('Adicione o motorista na relação (e ajudantes, se houver).');
      return;
    }
    if (!this.form.id_company || !this.form.id_vehicle) {
      this.notification.error('Selecione agente e veículo.');
      return;
    }
    const items = this.form.items
      .filter((i) => i.id_product && i.id_storage_location && i.quantity && i.quantity > 0)
      .map((i) => ({
        id_product: i.id_product!,
        id_storage_location: i.id_storage_location!,
        quantity: Number(i.quantity),
      }));
    if (items.length === 0) {
      this.notification.error('Informe ao menos um item válido.');
      return;
    }

    const idCollaborators = party.map((p) => p.id_collaborator);
    const fd = new FormData();
    fd.append(
      'payload',
      JSON.stringify({
        id_company: this.form.id_company,
        invoice_number: this.form.invoice_number.trim(),
        id_collaborator: idCollaborators[0],
        id_collaborators: idCollaborators,
        id_vehicle: this.form.id_vehicle,
        items,
      }),
    );
    for (const photo of this.photoFiles) {
      fd.append('photos', photo, photo.name || 'nf.jpg');
    }
    // Compat: também envia a primeira como `photo`.
    if (this.photoFiles[0]) {
      fd.append('photo', this.photoFiles[0], this.photoFiles[0].name || 'nf.jpg');
    }

    this.submitting.set(true);
    const req =
      this.movementType === 'ENTRADA'
        ? this.materials.registerIn(fd)
        : this.materials.registerOut(fd);

    req.subscribe({
      next: () => {
        this.submitting.set(false);
        this.notification.success(
          this.movementType === 'ENTRADA' ? 'Entrada registrada.' : 'Saída registrada.',
        );
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
    this.form = {
      id_company: null,
      invoice_number: '',
      id_vehicle: null,
      items: [{ id_product: null, id_storage_location: null, quantity: null }],
    };
    this.party.set([]);
    this.partySuggestions.set([]);
    this.partyDocument = '';
    this.partyError.set('');
    this.partySearching.set(false);
    this.photoFiles = [];
    this.photoFile = null;
    this.setPhotoPreview(null);
    this.ocrRequestId += 1;
    this.ocrLoading.set(false);
    this.ocrMessage.set('');
    this.vehicles.set([]);
  }
}
