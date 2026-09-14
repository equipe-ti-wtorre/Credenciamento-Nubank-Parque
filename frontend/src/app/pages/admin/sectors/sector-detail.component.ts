import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SECTOR_PAPEL_LABELS,
  SectorContact,
  SectorFlow,
  SectorMember,
  SectorPapel,
  SectorService,
} from '../../../services/sector.service';
import { UserItem, UserService } from '../../../services/user.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent, ActionMenuComponent } from '../../../shared/actions';

const ENTITY_TYPES = ['EVENTO', 'ACESSO_SERVICO', 'CREDENCIAMENTO_EVENTO', 'CREDENCIAMENTO_EVENTO_INTERNO'] as const;
const PAPEL_OPTIONS: SectorPapel[] = ['SOLICITANTE', 'APROVADOR', 'GESTOR'];

const FLOW_META: Record<(typeof ENTITY_TYPES)[number], { title: string; desc: string }> = {
  EVENTO: { title: 'Evento', desc: 'Credenciais para eventos na arena' },
  ACESSO_SERVICO: { title: 'Acesso de serviço', desc: 'Prestadores e manutenção' },
  CREDENCIAMENTO_EVENTO: { title: 'Credenciamento', desc: 'Terceiros e visitantes' },
  CREDENCIAMENTO_EVENTO_INTERNO: { title: 'Credenciamento (internos)', desc: 'Colaboradores do grupo' },
};

@Component({
  selector: 'app-sector-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, ActionBtnComponent, ActionMenuComponent],
  styleUrl: './sector-detail.component.scss',
  template: `
    <div class="setor-page">
      <header class="page-head">
        <div class="page-head__inner">
          <nav class="crumbs" aria-label="Você está em">
            <a routerLink="/admin/setores">Setores</a>
            <span aria-hidden="true">/</span>
            <span class="crumbs__current">{{ sectorNome() || 'Setor' }}</span>
          </nav>
          <div class="page-head__row">
            <div>
              <h1>{{ sectorNome() || 'Setor' }}</h1>
              <div class="page-head__meta">
                <span class="tag">{{ members().length }} {{ members().length === 1 ? 'membro' : 'membros' }}</span>
                <span class="tag">{{ contacts().length }} {{ contacts().length === 1 ? 'contato' : 'contatos' }}</span>
                <span class="tag" [class.tag--ok]="fluxosAtivos() === flowForms.length">
                  {{ fluxosAtivos() }} de {{ flowForms.length }} fluxos ativos
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div class="page-body">
        <main class="col-main">
          <section class="card" aria-labelledby="h-contatos">
            <div class="card__head">
              <div>
                <h2 id="h-contatos">Contatos</h2>
                <p class="card__hint">Quem responde por este setor nas solicitações de credenciamento.</p>
              </div>
              <button
                type="button"
                class="btn-action-primary"
                [attr.aria-expanded]="showContactForm()"
                aria-controls="form-contato"
                (click)="toggleContactForm()"
              >
                {{ showContactForm() ? 'Cancelar' : 'Adicionar contato' }}
              </button>
            </div>

            <form
              id="form-contato"
              class="card__form"
              [hidden]="!showContactForm()"
              (ngSubmit)="salvarContato()"
            >
              <div class="grid-2">
                <label class="field" for="sector-contact-nome">
                  <span class="field__label">Nome <em aria-hidden="true">*</em></span>
                  <input
                    id="sector-contact-nome"
                    class="form-field"
                    [(ngModel)]="formContatoNome"
                    name="contatoNome"
                    placeholder="Nome do contato"
                    required
                  />
                </label>
                <label class="field" for="sector-contact-email">
                  <span class="field__label">E-mail</span>
                  <input
                    id="sector-contact-email"
                    class="form-field"
                    type="email"
                    [(ngModel)]="formContatoEmail"
                    name="contatoEmail"
                    placeholder="nome@empresa.com"
                  />
                </label>
                <label class="field" for="sector-contact-telefone">
                  <span class="field__label">Telefone</span>
                  <input
                    id="sector-contact-telefone"
                    class="form-field"
                    inputmode="tel"
                    [(ngModel)]="formContatoTelefone"
                    name="contatoTelefone"
                    placeholder="(11) 99999-9999"
                  />
                </label>
                <label class="field" for="sector-contact-ramal">
                  <span class="field__label">Ramal</span>
                  <input
                    id="sector-contact-ramal"
                    class="form-field"
                    inputmode="numeric"
                    maxlength="20"
                    [(ngModel)]="formContatoRamal"
                    name="contatoRamal"
                    placeholder="6691"
                  />
                </label>
              </div>
              <div class="card__form-actions">
                <button type="button" class="btn-action-secondary" (click)="fecharFormContato()">Cancelar</button>
                <button type="submit" class="btn-action-primary">Salvar contato</button>
              </div>
            </form>

            <ul class="rows" role="list" *ngIf="contacts().length > 0; else emptyContacts">
              <li class="row" *ngFor="let c of contacts()">
                <span class="avatar" aria-hidden="true">{{ iniciais(c.nome) }}</span>
                <div class="row__main">
                  <p class="row__title">{{ c.nome }}</p>
                  <p class="row__sub">
                    <a *ngIf="c.email" [href]="'mailto:' + c.email">{{ c.email }}</a>
                    <span *ngIf="c.telefone">{{ c.telefone }}</span>
                    <span *ngIf="c.ramal">ramal {{ c.ramal }}</span>
                  </p>
                </div>
                <div class="row__actions">
                  <app-action-menu>
                    <app-action-btn icon="edit" title="Editar {{ c.nome }}" variant="neutral" (action)="editarContato(c)" />
                    <app-action-btn icon="delete" title="Remover {{ c.nome }}" variant="danger" (action)="removerContato(c)" />
                  </app-action-menu>
                </div>
              </li>
            </ul>
            <ng-template #emptyContacts>
              <p class="empty">Nenhum contato cadastrado.</p>
            </ng-template>
          </section>

          <section class="card" aria-labelledby="h-membros">
            <div class="card__head">
              <div>
                <h2 id="h-membros">Membros</h2>
                <p class="card__hint">O papel define o que a pessoa pode fazer nas solicitações do setor.</p>
              </div>
            </div>

            <div class="vincular">
              <div class="field field--grow">
                <label class="field__label" for="sector-user-search">Buscar usuário</label>
                <div *ngIf="selectedUser(); else userSearchField" class="selected-user">
                  <div class="min-w-0">
                    <p class="selected-user__name">{{ selectedUser()!.nome_completo }}</p>
                    <p class="selected-user__email">{{ selectedUser()!.email }}</p>
                  </div>
                  <button type="button" class="btn-action-secondary text-xs" (click)="limparSelecaoUsuario()">
                    Trocar
                  </button>
                </div>
                <ng-template #userSearchField>
                  <input
                    id="sector-user-search"
                    class="form-field"
                    type="text"
                    [(ngModel)]="userSearchQuery"
                    (ngModelChange)="onUserSearchChange($event)"
                    name="userSearch"
                    autocomplete="off"
                    placeholder="Nome, e-mail ou login"
                  />
                  <span class="field__hint">Mínimo de 2 caracteres. Busca entre todos os usuários ativos.</span>
                  <div *ngIf="userSearchLoading()" class="search-panel search-panel--hint">Buscando usuários...</div>
                  <ul
                    *ngIf="!userSearchLoading() && userSearchResults().length > 0"
                    class="search-panel"
                    role="listbox"
                  >
                    <li *ngFor="let u of userSearchResults()">
                      <button type="button" (click)="selecionarUsuario(u)">
                        <p class="search-panel__name">{{ u.nome_completo }}</p>
                        <p class="search-panel__email">{{ u.email }}</p>
                      </button>
                    </li>
                  </ul>
                  <p
                    *ngIf="userSearchQuery.trim().length >= 2 && !userSearchLoading() && userSearchResults().length === 0"
                    class="search-panel search-panel--hint"
                  >
                    Nenhum usuário encontrado.
                  </p>
                </ng-template>
              </div>
              <label class="field field--papel" for="sector-papel-novo">
                <span class="field__label">Papel no setor</span>
                <select id="sector-papel-novo" class="form-select" [(ngModel)]="newMemberPapel" name="papel">
                  <option *ngFor="let p of papelOptions" [ngValue]="p">{{ papelLabel(p) }}</option>
                </select>
                <span class="field__hint">{{ papelDescricao(newMemberPapel) }}</span>
              </label>
              <button type="button" class="btn-action-primary" (click)="adicionarMembro()">Vincular membro</button>
            </div>

            <ul class="rows" role="list" *ngIf="members().length > 0; else emptyMembers">
              <li class="row" *ngFor="let m of members()">
                <span class="avatar" aria-hidden="true">{{ iniciais(m.nome) }}</span>
                <div class="row__main">
                  <p class="row__title">{{ m.nome }}</p>
                  <p class="row__sub"><span>{{ m.email }}</span></p>
                </div>
                <label class="field field--inline">
                  <span class="sr-only">Papel de {{ m.nome }}</span>
                  <select
                    class="form-select"
                    [ngModel]="m.papel"
                    (ngModelChange)="alterarPapel(m, $event)"
                    [name]="'papel_' + m.linkId"
                  >
                    <option *ngFor="let p of papelOptions" [ngValue]="p">{{ papelLabel(p) }}</option>
                  </select>
                </label>
                <div class="row__actions">
                  <app-action-btn icon="delete" title="Remover {{ m.nome }} do setor" variant="danger" (action)="removerMembro(m)" />
                </div>
              </li>
            </ul>
            <ng-template #emptyMembers>
              <p class="empty">Nenhum membro vinculado.</p>
            </ng-template>
          </section>
        </main>

        <aside class="col-aside" aria-labelledby="h-fluxos">
          <section class="card card--sticky">
            <div class="card__head card__head--stack">
              <h2 id="h-fluxos">Fluxos de aprovação</h2>
              <p class="card__hint">Cada solicitação passa por uma única aprovação de um aprovador ou gestor do setor.</p>
            </div>

            <ul class="switches" role="list">
              <li class="switch-row" *ngFor="let flow of flowForms">
                <label class="switch">
                  <input
                    type="checkbox"
                    [(ngModel)]="flow.ativo"
                    [name]="'ativo_' + flow.tipoEntidade"
                    (ngModelChange)="marcarFluxosAlterados()"
                  />
                  <span class="switch__track" aria-hidden="true"></span>
                  <span class="switch__text">
                    <span class="switch__title">{{ flowMeta(flow.tipoEntidade).title }}</span>
                    <span class="switch__desc">{{ flowMeta(flow.tipoEntidade).desc }}</span>
                  </span>
                </label>
              </li>
            </ul>

            <div class="card__foot">
              <span class="card__foot-note" [hidden]="!flowsDirty()">Alterações não salvas</span>
              <button
                type="button"
                class="btn-action-primary"
                [disabled]="!flowsDirty() || savingFlows()"
                (click)="salvarFluxos()"
              >
                {{ savingFlows() ? 'Salvando...' : 'Salvar fluxos' }}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class SectorDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private userSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private savedFlowState: Record<string, boolean> = {};

  sectorId = 0;
  sectorNome = signal('');
  contacts = signal<SectorContact[]>([]);
  editingContact = signal<SectorContact | null>(null);
  showContactForm = signal(false);
  formContatoNome = '';
  formContatoTelefone = '';
  formContatoRamal = '';
  formContatoEmail = '';
  members = signal<SectorMember[]>([]);
  userSearchQuery = '';
  userSearchResults = signal<UserItem[]>([]);
  userSearchLoading = signal(false);
  selectedUser = signal<UserItem | null>(null);
  flowsDirty = signal(false);
  savingFlows = signal(false);

  newMemberUserId: number | null = null;
  newMemberPapel: SectorPapel = 'SOLICITANTE';
  readonly papelOptions = PAPEL_OPTIONS;
  readonly papelLabel = (p: SectorPapel) => SECTOR_PAPEL_LABELS[p];

  flowForms: SectorFlow[] = ENTITY_TYPES.map((tipo) => ({
    tipoEntidade: tipo,
    ativo: false,
  }));

  constructor(
    private sectorService: SectorService,
    private userService: UserService,
    private notification: NotificationService,
  ) {}

  ngOnInit() {
    this.sectorId = Number(this.route.snapshot.paramMap.get('id'));
    this.carregarMembros();
    this.carregarContatos();
    this.carregarFluxos();
  }

  fluxosAtivos(): number {
    return this.flowForms.filter((f) => f.ativo).length;
  }

  flowMeta(tipo: string) {
    return FLOW_META[tipo as (typeof ENTITY_TYPES)[number]] ?? { title: tipo, desc: '' };
  }

  iniciais(nome: string): string {
    const parts = (nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  papelDescricao(papel: SectorPapel): string {
    switch (papel) {
      case 'SOLICITANTE':
        return 'Só abre solicitações.';
      case 'APROVADOR':
        return 'Abre e aprova solicitações do setor.';
      case 'GESTOR':
        return 'Aprova e administra membros e fluxos.';
    }
  }

  toggleContactForm() {
    if (this.showContactForm()) {
      this.fecharFormContato();
      return;
    }
    this.limparFormContato();
    this.showContactForm.set(true);
    this.cdr.markForCheck();
  }

  fecharFormContato() {
    this.limparFormContato();
    this.showContactForm.set(false);
    this.cdr.markForCheck();
  }

  onUserSearchChange(query: string) {
    this.userSearchQuery = query;
    if (this.userSearchTimer) clearTimeout(this.userSearchTimer);

    const term = query.trim();
    if (term.length < 2) {
      this.userSearchResults.set([]);
      this.userSearchLoading.set(false);
      this.cdr.markForCheck();
      return;
    }

    this.userSearchLoading.set(true);
    this.userSearchTimer = setTimeout(() => this.buscarUsuarios(term), 300);
  }

  buscarUsuarios(term: string) {
    this.userService.list(1, 50, { search: term }).subscribe({
      next: (res) => {
        const memberIds = new Set(this.members().filter((m) => m.ativo).map((m) => m.idUsuario));
        this.userSearchResults.set(res.users.filter((u) => !memberIds.has(u.id)));
        this.userSearchLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.userSearchLoading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao buscar usuários.');
        this.cdr.markForCheck();
      },
    });
  }

  selecionarUsuario(user: UserItem) {
    this.selectedUser.set(user);
    this.newMemberUserId = user.id;
    this.userSearchQuery = '';
    this.userSearchResults.set([]);
    this.cdr.markForCheck();
  }

  limparSelecaoUsuario() {
    this.selectedUser.set(null);
    this.newMemberUserId = null;
    this.userSearchQuery = '';
    this.userSearchResults.set([]);
    this.cdr.markForCheck();
  }

  carregarMembros() {
    this.sectorService.listMembers(this.sectorId).subscribe({
      next: (res) => {
        this.members.set(res.members);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar membros.'),
    });
    this.sectorService.getById(this.sectorId).subscribe({
      next: (res) => {
        this.sectorNome.set(res.sector.nome);
        this.contacts.set(res.sector.contacts || []);
        this.cdr.markForCheck();
      },
    });
  }

  carregarContatos() {
    this.sectorService.listContacts(this.sectorId).subscribe({
      next: (res) => {
        this.contacts.set(res.contacts);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar contatos.'),
    });
  }

  limparFormContato() {
    this.editingContact.set(null);
    this.formContatoNome = '';
    this.formContatoTelefone = '';
    this.formContatoRamal = '';
    this.formContatoEmail = '';
  }

  editarContato(c: SectorContact) {
    this.editingContact.set(c);
    this.formContatoNome = c.nome;
    this.formContatoTelefone = c.telefone || '';
    this.formContatoRamal = c.ramal || '';
    this.formContatoEmail = c.email || '';
    this.showContactForm.set(true);
    this.cdr.markForCheck();
  }

  salvarContato() {
    if (!this.formContatoNome.trim()) {
      this.notification.error('Informe o nome do contato.');
      return;
    }
    const payload = {
      nome: this.formContatoNome.trim(),
      telefone: this.formContatoTelefone.trim() || null,
      ramal: this.formContatoRamal.trim() || null,
      email: this.formContatoEmail.trim() || null,
    };
    const editing = this.editingContact();
    const req =
      editing?.id != null
        ? this.sectorService.updateContact(this.sectorId, editing.id, payload)
        : this.sectorService.addContact(this.sectorId, payload);
    req.subscribe({
      next: (res) => {
        this.contacts.set(res.contacts);
        this.fecharFormContato();
        this.notification.success(editing ? 'Contato atualizado.' : 'Contato adicionado.');
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao salvar contato.'),
    });
  }

  removerContato(c: SectorContact) {
    if (c.id == null) return;
    this.sectorService.removeContact(this.sectorId, c.id).subscribe({
      next: (res) => {
        this.contacts.set(res.contacts);
        if (this.editingContact()?.id === c.id) this.fecharFormContato();
        this.notification.success('Contato removido.');
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover contato.'),
    });
  }

  carregarFluxos() {
    this.sectorService.getFlows(this.sectorId).subscribe({
      next: (res) => {
        for (const tipo of ENTITY_TYPES) {
          const existing = res.flows.find((f) => f.tipoEntidade === tipo);
          const form = this.flowForms.find((f) => f.tipoEntidade === tipo)!;
          form.ativo = existing ? existing.ativo : false;
        }
        this.capturarFluxosSalvos();
        this.flowsDirty.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar fluxos.'),
    });
  }

  marcarFluxosAlterados() {
    this.flowsDirty.set(this.flowForms.some((f) => !!f.ativo !== !!this.savedFlowState[f.tipoEntidade]));
    this.cdr.markForCheck();
  }

  private capturarFluxosSalvos() {
    this.savedFlowState = Object.fromEntries(this.flowForms.map((f) => [f.tipoEntidade, !!f.ativo]));
  }

  adicionarMembro() {
    if (!this.newMemberUserId) {
      this.notification.error('Selecione um usuário.');
      return;
    }
    this.sectorService
      .addMember(this.sectorId, {
        idUsuario: this.newMemberUserId,
        papel: this.newMemberPapel,
      })
      .subscribe({
        next: (res) => {
          this.members.set(res.members);
          this.limparSelecaoUsuario();
          this.notification.success('Membro vinculado.');
          this.cdr.markForCheck();
        },
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao vincular membro.'),
      });
  }

  alterarPapel(m: SectorMember, papel: SectorPapel) {
    this.sectorService.updateMember(this.sectorId, m.linkId, { papel }).subscribe({
      next: (res) => {
        this.members.set(res.members);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao atualizar papel.'),
    });
  }

  removerMembro(m: SectorMember) {
    this.sectorService.removeMember(this.sectorId, m.linkId).subscribe({
      next: (res) => {
        this.members.set(res.members);
        this.notification.success('Vínculo removido.');
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao remover membro.'),
    });
  }

  salvarFluxos() {
    this.savingFlows.set(true);
    this.sectorService
      .updateFlows(
        this.sectorId,
        this.flowForms.map((f) => ({ tipoEntidade: f.tipoEntidade, ativo: f.ativo })),
      )
      .subscribe({
        next: () => {
          this.capturarFluxosSalvos();
          this.flowsDirty.set(false);
          this.savingFlows.set(false);
          this.notification.success('Fluxos salvos.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.savingFlows.set(false);
          this.notification.notifyHttpError(err, 'Falha ao salvar fluxos.');
          this.cdr.markForCheck();
        },
      });
  }
}
