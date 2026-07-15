import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SectorItem, SectorService } from '../../../services/sector.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalComponent } from '../../../shared/modal/modal.component';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../../shared/actions';

@Component({
  selector: 'app-sector-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ActionMenuComponent,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div>
          <h2 class="page-section-title">Setores</h2>
          <p class="page-section-subtitle">Gerencie setores, membros e fluxos de aprovação.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-action-secondary" (click)="carregar()" [disabled]="loading()">Atualizar</button>
          <button *ngIf="isAdmin" type="button" class="btn-action-primary" (click)="abrirModal()">+ Novo setor</button>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Descrição</th>
              <th class="px-4 py-3 text-left">Membros</th>
              <th class="px-4 py-3 text-left">Fluxos</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sectors()" class="border-t border-slate-100 hover:bg-slate-50">
              <td class="px-4 py-3 font-medium">{{ s.nome }}</td>
              <td class="px-4 py-3 text-slate-600 hidden md:table-cell">{{ s.descricao || '—' }}</td>
              <td class="px-4 py-3">{{ s.membrosAtivos }}</td>
              <td class="px-4 py-3">{{ s.fluxosConfigurados }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                  [class.bg-emerald-100]="s.ativo"
                  [class.text-emerald-700]="s.ativo"
                  [class.bg-slate-100]="!s.ativo"
                  [class.text-slate-600]="!s.ativo"
                >
                  {{ s.ativo ? 'Ativo' : 'Inativo' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <app-action-menu>
                  <app-action-btn icon="grid" title="Gerenciar setor" variant="neutral" (action)="gerenciar(s)" />
                  <app-action-dropdown>
                    <button appActionDropdownItem type="button" (click)="toggleStatus(s)">
                      <svg
                        class="action-dropdown__item-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                        <path d="M12 2v10" />
                      </svg>
                      {{ s.ativo ? 'Desativar' : 'Ativar' }}
                    </button>
                  </app-action-dropdown>
                </app-action-menu>
              </td>
            </tr>
            <tr *ngIf="!loading() && sectors().length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">Nenhum setor cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editing() ? 'Editar setor' : 'Novo setor'"
      size="sm"
      (close)="fecharModal()"
    >
      <form id="sector-form" class="space-y-3" (ngSubmit)="salvar()">
        <div>
          <label class="form-label" for="sector-nome">Nome</label>
          <input id="sector-nome" [(ngModel)]="formNome" name="nome" required class="form-field" />
        </div>
        <div>
          <label class="form-label" for="sector-descricao">Descrição <span class="form-label__optional">(opcional)</span></label>
          <input id="sector-descricao" [(ngModel)]="formDescricao" name="descricao" class="form-field" />
        </div>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharModal()">Cancelar</button>
        <button type="submit" form="sector-form" class="btn-action-primary" [disabled]="saving()">
          {{ saving() ? 'Salvando...' : (editing() ? 'Salvar setor' : 'Criar setor') }}
        </button>
      </div>
    </app-modal>
  `,
})
export class SectorListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  sectors = signal<SectorItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editing = signal<SectorItem | null>(null);

  formNome = '';
  formDescricao = '';
  isAdmin = false;

  constructor(
    private sectorService: SectorService,
    private notification: NotificationService,
    private authService: AuthService,
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    this.isAdmin = String(user?.role || user?.perfil || '').toUpperCase() === 'ADMIN';
    this.cdr.markForCheck();
    this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.sectorService.list().subscribe({
      next: (res) => {
        this.sectors.set(res.data);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar setores.');
        this.cdr.markForCheck();
      },
    });
  }

  abrirModal(sector?: SectorItem) {
    this.editing.set(sector || null);
    this.formNome = sector?.nome || '';
    this.formDescricao = sector?.descricao || '';
    this.showModal.set(true);
  }

  fecharModal() {
    this.showModal.set(false);
    this.editing.set(null);
  }

  gerenciar(s: SectorItem) {
    this.router.navigate(['/admin/setores', s.id]);
  }

  salvar() {
    if (!this.formNome.trim()) {
      this.notification.error('Informe o nome do setor.');
      return;
    }
    this.saving.set(true);
    const payload = { nome: this.formNome.trim(), descricao: this.formDescricao.trim() || undefined };
    const req = this.editing()
      ? this.sectorService.update(this.editing()!.id, payload)
      : this.sectorService.create(payload);
    req.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.fecharModal();
        this.notification.success('Setor salvo.');
        if (!this.editing()) {
          this.router.navigate(['/admin/setores', res.sector.id]);
        } else {
          this.carregar();
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.notifyHttpError(err, 'Falha ao salvar setor.');
      },
    });
  }

  toggleStatus(s: SectorItem) {
    this.sectorService.patchStatus(s.id, !s.ativo).subscribe({
      next: () => {
        this.notification.success(s.ativo ? 'Setor desativado.' : 'Setor ativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }
}
