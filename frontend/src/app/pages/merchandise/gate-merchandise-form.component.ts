import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollaboratorItem, CollaboratorService } from '../../services/collaborator.service';
import {
  MaterialCompanyOption,
  MaterialVehicleOption,
  MaterialsService,
  MovementType,
  ProductItem,
  StorageLocationItem,
} from '../../services/materials.service';
import { NotificationService } from '../../core/services/notification.service';

interface MovementItemRow {
  id_product: number | null;
  id_storage_location: number | null;
  quantity: number | null;
}

@Component({
  selector: 'app-gate-merchandise-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card-surface p-4 mb-6">
      <form class="space-y-4" (ngSubmit)="submit()">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Agente (empresa)</label>
            <select
              [(ngModel)]="form.id_company"
              name="id_company"
              required
              (ngModelChange)="onCompanyChange()"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Selecione...</option>
              <option *ngFor="let c of companies()" [ngValue]="c.id_company">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Número da NF</label>
            <input
              [(ngModel)]="form.invoice_number"
              name="invoice_number"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Motorista (CPF)</label>
            <div class="flex gap-2 mt-1">
              <input
                [(ngModel)]="driverDocument"
                name="driverDocument"
                class="flex-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
                placeholder="CPF do motorista"
              />
              <button
                type="button"
                class="btn-secondary shrink-0"
                (click)="buscarMotorista()"
                [disabled]="driverSearching()"
              >
                Buscar
              </button>
            </div>
            <p *ngIf="driver()" class="text-sm text-emerald-700 mt-1 font-medium">{{ driver()!.name }}</p>
            <p *ngIf="driverError()" class="text-sm text-red-600 mt-1">{{ driverError() }}</p>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Veículo</label>
            <select
              [(ngModel)]="form.id_vehicle"
              name="id_vehicle"
              required
              [disabled]="!form.id_company"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white disabled:opacity-50"
            >
              <option [ngValue]="null">Selecione...</option>
              <option *ngFor="let v of vehicles()" [ngValue]="v.id_vehicle">
                {{ v.plate }}{{ v.description ? ' — ' + v.description : '' }}
              </option>
            </select>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-bold text-slate-500 uppercase">Itens da NF</label>
            <button type="button" class="btn-secondary text-xs py-1 px-3" (click)="adicionarItem()">
              + Adicionar item
            </button>
          </div>
          <div
            *ngFor="let item of form.items; let i = index"
            class="grid grid-cols-1 md:grid-cols-12 gap-2 mb-2 p-3 bg-slate-50 rounded-xl border border-slate-100"
          >
            <div class="md:col-span-5">
              <select
                [(ngModel)]="item.id_product"
                [name]="'product_' + i"
                required
                class="w-full border border-[var(--app-border)] rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option [ngValue]="null">Produto...</option>
                <option *ngFor="let p of products()" [ngValue]="p.id_product">{{ p.description }}</option>
              </select>
            </div>
            <div class="md:col-span-4">
              <select
                [(ngModel)]="item.id_storage_location"
                [name]="'loc_' + i"
                required
                class="w-full border border-[var(--app-border)] rounded-lg px-2 py-2 text-sm bg-white"
              >
                <option [ngValue]="null">Local...</option>
                <option *ngFor="let l of locations()" [ngValue]="l.id_storage_location">{{ l.name }}</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <input
                type="number"
                min="0.001"
                step="0.001"
                [(ngModel)]="item.quantity"
                [name]="'qty_' + i"
                required
                placeholder="Qtd"
                class="w-full border border-[var(--app-border)] rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <div class="md:col-span-1 flex items-center justify-end">
              <button
                type="button"
                class="text-red-600 text-xs font-semibold"
                (click)="removerItem(i)"
                [disabled]="form.items.length <= 1"
              >
                Remover
              </button>
            </div>
          </div>
        </div>

        <div>
          <label class="text-xs font-bold text-slate-500 uppercase">Foto NF / Produto</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="w-full mt-1 text-sm"
            (change)="onPhotoSelected($event)"
          />
          <img *ngIf="photoPreview()" [src]="photoPreview()!" alt="Preview" class="mt-2 max-h-40 rounded-lg border" />
        </div>

        <div class="flex justify-end">
          <button type="submit" class="btn-primary" [disabled]="submitting()">
            {{ submitting() ? 'Registrando...' : movementType === 'ENTRADA' ? 'Confirmar entrada' : 'Confirmar saída' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class GateMerchandiseFormComponent implements OnInit {
  @Input({ required: true }) movementType!: MovementType;

  private materials = inject(MaterialsService);
  private collaboratorService = inject(CollaboratorService);
  private notification = inject(NotificationService);
  companies = signal<MaterialCompanyOption[]>([]);
  vehicles = signal<MaterialVehicleOption[]>([]);
  products = signal<ProductItem[]>([]);
  locations = signal<StorageLocationItem[]>([]);
  driver = signal<CollaboratorItem | null>(null);
  driverError = signal('');
  driverDocument = '';
  driverSearching = signal(false);
  submitting = signal(false);
  photoFile: File | null = null;
  photoPreview = signal<string | null>(null);

  private cpfTypeId: number | null = null;

  form = {
    id_company: null as number | null,
    invoice_number: '',
    id_vehicle: null as number | null,
    items: [{ id_product: null, id_storage_location: null, quantity: null }] as MovementItemRow[],
  };

  ngOnInit() {
    this.loadCatalogs();
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => {
        const cpf = res.types.find((t) => t.description.toUpperCase() === 'CPF');
        if (cpf) this.cpfTypeId = cpf.id_collaborator_document_type;
      },
    });
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

  buscarMotorista() {
    const doc = this.driverDocument.replace(/\D/g, '');
    if (!doc || !this.cpfTypeId) {
      this.driverError.set('Informe o CPF.');
      return;
    }
    this.driverSearching.set(true);
    this.driverError.set('');
    this.collaboratorService.searchByDocument(doc, this.cpfTypeId).subscribe({
      next: (res) => {
        this.driverSearching.set(false);
        if (!res.found || !res.collaborator) {
          this.driver.set(null);
          this.driverError.set('Motorista não encontrado.');
          return;
        }
        if (res.collaborator.is_blacklisted) {
          this.driver.set(null);
          this.driverError.set('Motorista está na lista negra.');
          return;
        }
        this.driver.set(res.collaborator);
      },
      error: (err) => {
        this.driverSearching.set(false);
        this.driver.set(null);
        this.driverError.set(err.error?.message || 'Motorista não encontrado.');
      },
    });
  }

  adicionarItem() {
    this.form.items.push({ id_product: null, id_storage_location: null, quantity: null });
  }

  removerItem(index: number) {
    if (this.form.items.length <= 1) return;
    this.form.items.splice(index, 1);
  }

  onPhotoSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      this.photoFile = null;
      this.photoPreview.set(null);
      return;
    }
    this.photoFile = file;
    this.photoPreview.set(URL.createObjectURL(file));
  }

  submit() {
    const driver = this.driver();
    if (!driver) {
      this.notification.error('Busque e valide o motorista pelo CPF.');
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

    const fd = new FormData();
    fd.append(
      'payload',
      JSON.stringify({
        id_company: this.form.id_company,
        invoice_number: this.form.invoice_number.trim(),
        id_collaborator: driver.id_collaborator,
        id_vehicle: this.form.id_vehicle,
        items,
      }),
    );
    if (this.photoFile) fd.append('photo', this.photoFile);

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
    this.form = {
      id_company: null,
      invoice_number: '',
      id_vehicle: null,
      items: [{ id_product: null, id_storage_location: null, quantity: null }],
    };
    this.driver.set(null);
    this.driverDocument = '';
    this.photoFile = null;
    this.photoPreview.set(null);
    this.vehicles.set([]);
  }
}
