import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavigationStateService } from '../../../core/services/navigation-state.service';
import { SectorContact, SectorItem, SectorService } from '../../../services/sector.service';
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
          <h2 class="page-section-title">Times</h2>
          <p class="page-section-subtitle">Gerencie times, membros e fluxos de aprovação.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-action-secondary" (click)="carregar()" [disabled]="loading()">Atualizar</button>
          <button *ngIf="isAdmin" type="button" class="btn-action-primary" (click)="abrirModal()">+ Novo setor</button>
        </div>
      </div>

      <div class="card-surface tabela-rolavel tabela-rolavel--acoes">
        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Descrição</th>
              <th class="px-4 py-3 text-left">Membros</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Contatos</th>
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
              <td class="px-4 py-3 hidden md:table-cell">{{ s.contatosCadastrados ?? 0 }}</td>
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
                    <button *ngIf="isAdmin" appActionDropdownItem type="button" (click)="abrirModal(s)">
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
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar cadastro
                    </button>
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
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhum setor cadastrado.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editing() ? 'Editar setor' : 'Novo setor'"
      size="lg"
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
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="form-label mb-0">Contatos</label>
            <button type="button" (click)="adicionarContato()" class="btn-action-tonal text-xs">+ Contato</button>
          </div>
          <div *ngIf="formContacts.length === 0" class="text-sm text-slate-500 py-2">Nenhum contato adicionado.</div>
          <div
            *ngFor="let contact of formContacts; let i = index"
            class="border border-[var(--app-border)] rounded-xl p-3 mb-2 grid grid-cols-1 md:grid-cols-2 gap-2"
          >
            <div class="md:col-span-2 flex justify-between items-center">
              <span class="text-xs font-semibold text-slate-600">Contato {{ i + 1 }}</span>
              <button type="button" (click)="removerContato(i)" class="text-xs text-rose-600 hover:underline">Remover</button>
            </div>
            <div>
              <label class="text-xs text-slate-500" [attr.for]="'sector-contact-nome-' + i">Nome</label>
              <input
                [id]="'sector-contact-nome-' + i"
                [(ngModel)]="contact.nome"
                [name]="'contact_nome_' + i"
                required
                class="form-field mt-0.5"
              />
            </div>
            <div>
              <label class="text-xs text-slate-500" [attr.for]="'sector-contact-email-' + i">E-mail <span class="form-label__optional">(opcional)</span></label>
              <input
                [id]="'sector-contact-email-' + i"
                type="email"
                [(ngModel)]="contact.email"
                [name]="'contact_email_' + i"
                class="form-field mt-0.5"
              />
            </div>
            <div>
              <label class="text-xs text-slate-500" [attr.for]="'sector-contact-telefone-' + i">Telefone <span class="form-label__optional">(opcional)</span></label>
              <input
                [id]="'sector-contact-telefone-' + i"
                [(ngModel)]="contact.telefone"
                [name]="'contact_telefone_' + i"
                class="form-field mt-0.5"
              />
            </div>
            <div>
              <label class="text-xs text-slate-500" [attr.for]="'sector-contact-ramal-' + i">Ramal <span class="form-label__optional">(opcional)</span></label>
              <input
                [id]="'sector-contact-ramal-' + i"
                [(ngModel)]="contact.ramal"
                [name]="'contact_ramal_' + i"
                maxlength="20"
                class="form-field mt-0.5"
              />
            </div>
          </div>
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
  private readonly nav = inject(NavigationStateService);

  sectors = signal<SectorItem[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editing = signal<SectorItem | null>(null);

  formNome = '';
  formDescricao = '';
  formContacts: SectorContact[] = [];
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
        this.sectors.set(res.sectors || []);
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
    this.formContacts = [];
    this.showModal.set(true);
    this.cdr.markForCheck();

    if (sector) {
      const sectorRef = this.sectorRef(sector);
      if (!sectorRef) {
        this.notification.error('Não foi possível identificar este setor.');
        return;
      }
      this.sectorService.getById(sectorRef).subscribe({
        next: (res) => {
          this.formContacts = (res.sector.contacts || []).map((ct) => ({
            id: ct.id,
            nome: ct.nome,
            telefone: ct.telefone || '',
            ramal: ct.ramal || '',
            email: ct.email || '',
          }));
          this.cdr.markForCheck();
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar contatos do setor.'),
      });
    }
  }

  fecharModal() {
    this.showModal.set(false);
    this.editing.set(null);
    this.formContacts = [];
  }

  adicionarContato() {
    this.formContacts.push({ nome: '', telefone: '', ramal: '', email: '' });
    this.cdr.markForCheck();
  }

  removerContato(index: number) {
    this.formContacts.splice(index, 1);
    this.cdr.markForCheck();
  }

  private contatosPayload() {
    return this.formContacts
      .filter((c) => c.nome?.trim())
      .map((c) => ({
        nome: c.nome.trim(),
        telefone: c.telefone?.trim() || null,
        ramal: c.ramal?.trim() || null,
        email: c.email?.trim() || null,
      }));
  }

  gerenciar(s: SectorItem) {
    const publicId = this.sectorRef(s);
    if (!publicId) {
      this.notification.error('Não foi possível identificar este setor.');
      return;
    }
    void this.nav.navegar('/admin/setores/detalhe', { public_id: publicId });
  }

  private sectorRef(s: SectorItem): string {
    return s.public_id || (s.id != null ? String(s.id) : '');
  }

  salvar() {
    if (!this.formNome.trim()) {
      this.notification.error('Informe o nome do setor.');
      return;
    }
    this.saving.set(true);
    const payload = {
      nome: this.formNome.trim(),
      descricao: this.formDescricao.trim() || undefined,
      contacts: this.contatosPayload(),
    };
    const editing = this.editing();
    const editingRef = editing ? this.sectorRef(editing) : '';
    if (editing && !editingRef) {
      this.saving.set(false);
      this.notification.error('Não foi possível identificar este setor.');
      return;
    }
    const req = editing
      ? this.sectorService.update(editingRef, payload)
      : this.sectorService.create(payload);
    req.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.fecharModal();
        this.notification.success('Setor salvo.');
        if (!editing) {
          const publicId = res.sector.public_id || (res.sector.id != null ? String(res.sector.id) : '');
          if (publicId) {
            void this.nav.navegar('/admin/setores/detalhe', { public_id: publicId });
          } else {
            this.carregar();
          }
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
    const sectorRef = this.sectorRef(s);
    if (!sectorRef) {
      this.notification.error('Não foi possível identificar este setor.');
      return;
    }
    this.sectorService.patchStatus(sectorRef, !s.ativo).subscribe({
      next: () => {
        this.notification.success(s.ativo ? 'Setor desativado.' : 'Setor ativado.');
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao alterar status.'),
    });
  }
}
