import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SECTOR_PAPEL_LABELS,
  SectorFlow,
  SectorMember,
  SectorPapel,
  SectorService,
} from '../../../services/sector.service';
import { UserItem, UserService } from '../../../services/user.service';
import { NotificationService } from '../../../core/services/notification.service';

const ENTITY_TYPES = ['EVENTO', 'ACESSO_SERVICO'] as const;
const PAPEL_OPTIONS: SectorPapel[] = ['SOLICITANTE', 'APROVADOR', 'GESTOR'];

@Component({
  selector: 'app-sector-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="w-full space-y-6">
      <div class="flex items-center gap-3">
        <a routerLink="/admin/setores" class="text-sm text-[var(--color-primary-dark)] hover:underline">← Setores</a>
        <h2 class="page-section-title">{{ sectorNome() || 'Setor' }}</h2>
      </div>

      <div class="card-surface p-5">
        <h3 class="font-bold text-slate-800 mb-3">Membros</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div class="md:col-span-2 relative">
            <label class="text-xs font-bold text-slate-500 uppercase">Buscar usuário</label>
            <div *ngIf="selectedUser(); else userSearchField" class="mt-1 flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2">
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">{{ selectedUser()!.nome_completo }}</p>
                <p class="text-xs text-slate-500 truncate">{{ selectedUser()!.email }}</p>
              </div>
              <button type="button" class="btn-secondary text-xs py-1 px-2 shrink-0" (click)="limparSelecaoUsuario()">
                Trocar
              </button>
            </div>
            <ng-template #userSearchField>
              <input
                type="text"
                [(ngModel)]="userSearchQuery"
                (ngModelChange)="onUserSearchChange($event)"
                name="userSearch"
                autocomplete="off"
                placeholder="Nome, e-mail ou login (mín. 2 caracteres)"
                class="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white"
              />
              <p class="text-xs text-slate-500 mt-1">Digite para buscar entre todos os usuários ativos.</p>
              <div
                *ngIf="userSearchLoading()"
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Buscando usuários...
              </div>
              <ul
                *ngIf="!userSearchLoading() && userSearchResults().length > 0"
                class="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto card-surface border border-slate-200 rounded-xl shadow-lg z-20"
              >
                <li *ngFor="let u of userSearchResults()">
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    (click)="selecionarUsuario(u)"
                  >
                    <p class="text-sm font-medium text-slate-800">{{ u.nome_completo }}</p>
                    <p class="text-xs text-slate-500">{{ u.email }}</p>
                  </button>
                </li>
              </ul>
              <p
                *ngIf="userSearchQuery.trim().length >= 2 && !userSearchLoading() && userSearchResults().length === 0"
                class="absolute left-0 right-0 mt-1 card-surface border border-slate-200 px-3 py-2 text-sm text-slate-500 z-20"
              >
                Nenhum usuário encontrado.
              </p>
            </ng-template>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Papel no setor</label>
            <select [(ngModel)]="newMemberPapel" name="papel" class="w-full mt-1 border rounded-xl px-3 py-2 text-sm bg-white">
              <option *ngFor="let p of papelOptions" [ngValue]="p">{{ papelLabel(p) }}</option>
            </select>
            <p class="text-xs text-slate-500 mt-1">{{ papelDescricao(newMemberPapel) }}</p>
          </div>
        </div>
        <button type="button" class="btn-primary text-sm mb-4" (click)="adicionarMembro()">Vincular membro</button>

        <table class="w-full text-sm">
          <thead class="table-head bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Nome</th>
              <th class="px-3 py-2 text-left">Papel</th>
              <th class="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of members()" class="border-t border-slate-100">
              <td class="px-3 py-2">
                <p class="font-medium">{{ m.nome }}</p>
                <p class="text-xs text-slate-500">{{ m.email }}</p>
              </td>
              <td class="px-3 py-2">
                <select
                  [ngModel]="m.papel"
                  (ngModelChange)="alterarPapel(m, $event)"
                  class="border rounded-lg px-2 py-1 text-sm bg-white"
                >
                  <option *ngFor="let p of papelOptions" [ngValue]="p">{{ papelLabel(p) }}</option>
                </select>
              </td>
              <td class="px-3 py-2 text-right">
                <button type="button" class="btn-secondary text-xs py-1 px-2" (click)="removerMembro(m)">
                  Remover
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card-surface p-5">
        <h3 class="font-bold text-slate-800 mb-3">Fluxos de aprovação</h3>
        <p class="text-sm text-slate-500 mb-4">Cada solicitação passa por uma única aprovação de um Aprovador ou Gestor do setor.</p>
        <div class="space-y-4">
          <div *ngFor="let flow of flowForms" class="border border-slate-100 rounded-xl p-4">
            <div class="flex flex-wrap items-center gap-4">
              <p class="font-medium text-slate-800 min-w-[140px]">{{ flowLabel(flow.tipoEntidade) }}</p>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" [(ngModel)]="flow.ativo" [name]="'ativo_' + flow.tipoEntidade" />
                Ativo
              </label>
            </div>
          </div>
        </div>
        <button type="button" class="btn-primary text-sm mt-4" (click)="salvarFluxos()">Salvar fluxos</button>
      </div>
    </div>
  `,
})
export class SectorDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private userSearchTimer: ReturnType<typeof setTimeout> | null = null;

  sectorId = 0;
  sectorNome = signal('');
  members = signal<SectorMember[]>([]);
  userSearchQuery = '';
  userSearchResults = signal<UserItem[]>([]);
  userSearchLoading = signal(false);
  selectedUser = signal<UserItem | null>(null);

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
    this.carregarFluxos();
  }

  papelDescricao(papel: SectorPapel): string {
    switch (papel) {
      case 'SOLICITANTE':
        return 'Só abre solicitações.';
      case 'APROVADOR':
        return 'Abre e aprova solicitações.';
      case 'GESTOR':
        return 'Abre, aprova e gerencia o setor.';
    }
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

  flowLabel(tipo: string): string {
    return tipo === 'EVENTO' ? 'Evento' : 'Acesso de Serviço';
  }

  carregarMembros() {
    this.sectorService.listMembers(this.sectorId).subscribe({
      next: (res) => {
        this.members.set(res.members);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar membros.'),
    });
    this.sectorService.list(1, 100).subscribe({
      next: (res) => {
        const s = res.data.find((x) => x.id === this.sectorId);
        if (s) this.sectorNome.set(s.nome);
        this.cdr.markForCheck();
      },
    });
  }

  carregarFluxos() {
    this.sectorService.getFlows(this.sectorId).subscribe({
      next: (res) => {
        for (const tipo of ENTITY_TYPES) {
          const existing = res.flows.find((f) => f.tipoEntidade === tipo);
          const form = this.flowForms.find((f) => f.tipoEntidade === tipo)!;
          if (existing) {
            form.ativo = existing.ativo;
          }
        }
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar fluxos.'),
    });
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
    this.sectorService
      .updateFlows(
        this.sectorId,
        this.flowForms.map((f) => ({ tipoEntidade: f.tipoEntidade, ativo: f.ativo })),
      )
      .subscribe({
        next: () => this.notification.success('Fluxos salvos.'),
        error: (err) => this.notification.notifyHttpError(err, 'Falha ao salvar fluxos.'),
      });
  }
}
