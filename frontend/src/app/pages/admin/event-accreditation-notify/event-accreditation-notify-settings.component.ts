import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EventAccreditationNotifyUser,
  SystemSettingsService,
} from '../../../services/system-settings.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';

@Component({
  selector: 'app-event-accreditation-notify-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ean">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Notificações de credenciamento</h2>
          <p class="page-section-subtitle">
            Controle quem recebe o aviso automático quando um credenciamento interno é criado.
            Em desenvolvimento, mantenha o envio geral desligado e libere só alguns usuários.
          </p>
        </div>
        <button
          type="button"
          (click)="salvar()"
          [disabled]="saving"
          class="btn-primary disabled:opacity-50 shrink-0"
        >
          {{ saving ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>

      <label class="ean-switch">
        <input
          type="checkbox"
          [checked]="notifyAll"
          (change)="notifyAll = $any($event.target).checked"
        />
        <span class="ean-switch__ui" aria-hidden="true"></span>
        <span class="ean-switch__txt">
          <b>Notificar todos os usuários AD</b>
          Quando desligado, o aviso vai somente para os usuários da lista abaixo.
        </span>
      </label>

      @if (!notifyAll) {
        <div class="ean-dual">
          <section class="ean-box" aria-labelledby="eanDisp">
            <div class="ean-box-head">
              <div class="ean-box-title">
                <h2 id="eanDisp">Usuários AD</h2>
                <span class="ean-badge">{{ availableCountLabel() }}</span>
              </div>
              <div class="ean-search">
                <span class="ean-search__mag" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  [(ngModel)]="search"
                  name="adSearch"
                  placeholder="Buscar por nome ou e-mail"
                  aria-label="Buscar usuário AD"
                  autocomplete="off"
                  (ngModelChange)="onSearch()"
                />
                <button
                  type="button"
                  class="ean-search__clr"
                  [class.on]="!!search"
                  aria-label="Limpar busca"
                  (click)="clearSearch()"
                >
                  ✕
                </button>
              </div>
              <div class="ean-bulk">
                <span>{{ availableHint() }}</span>
                <button
                  type="button"
                  class="ean-link"
                  [disabled]="!availableUsers().length"
                  (click)="includeAllVisible()"
                >
                  {{ includeAllLabel() }}
                </button>
              </div>
            </div>
            @if (availableUsers().length) {
              <ul class="ean-list">
                @for (user of availableUsers(); track user.id) {
                  <li class="ean-row">
                    <span class="ean-info">
                      <span class="ean-nm">{{ user.nome_completo }}</span>
                      <span class="ean-sub">
                        {{ user.email }}
                        · {{ user.departamento || '—' }}
                      </span>
                    </span>
                    <button type="button" class="ean-act ean-act--add" (click)="includeUser(user)">
                      Incluir
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <div class="ean-empty">
                @if (search.trim()) {
                  <b>Nenhum usuário encontrado</b>
                  Nada corresponde a “{{ search.trim() }}”.
                  <div class="hint">Revise a busca.</div>
                } @else if (selectedUsers.length) {
                  <b>Todos já foram incluídos</b>
                  Os {{ selectedUsers.length }} usuários AD da lista estão na whitelist.
                } @else {
                  <b>Nenhum usuário AD</b>
                  Não há usuários internos AD ativos para notificar.
                }
              </div>
            }
            <div class="ean-foot">
              <span>Clique em <b>Incluir</b> para mover o usuário</span>
            </div>
          </section>

          <section class="ean-box ean-box--target" aria-labelledby="eanSel">
            <div class="ean-box-head">
              <div class="ean-box-title">
                <h2 id="eanSel">Incluídos na whitelist</h2>
                <span class="ean-badge ean-badge--on">{{ selectedCountLabel() }}</span>
              </div>
              <div class="ean-bulk">
                <span>{{ selectedHint() }}</span>
                <button
                  type="button"
                  class="ean-link"
                  [disabled]="!selectedUsers.length"
                  (click)="removeAll()"
                >
                  Remover todos
                </button>
              </div>
            </div>
            @if (selectedUsers.length) {
              <ul class="ean-list">
                @for (user of selectedUsers; track user.id) {
                  <li class="ean-row">
                    <span class="ean-info">
                      <span class="ean-nm">{{ user.nome_completo }}</span>
                      <span class="ean-sub">
                        {{ user.email }}
                        · {{ user.departamento || '—' }}
                      </span>
                    </span>
                    <button type="button" class="ean-act ean-act--rem" (click)="removeUser(user.id)">
                      Remover
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <div class="ean-empty">
                <b>Nenhum usuário aqui</b>
                Inclua os usuários que devem receber o aviso.
                <div class="hint">Use a coluna da esquerda.</div>
              </div>
            }
            <div class="ean-foot">
              <span>O aviso é enviado ao criar um credenciamento interno.</span>
            </div>
          </section>
        </div>
      }

      @if (atualizadoEm) {
        <p class="text-xs text-slate-400 mt-4">
          Última alteração: {{ atualizadoEm | date: 'dd/MM/yyyy HH:mm' }}
        </p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        --ink: #241030;
        --ink-2: #54485f;
        --ink-3: #7b7086;
        --line: #e3dfe9;
        --line-strong: #cfc8d8;
        --danger: #b3261e;
        --danger-bg: #fceeed;
        --purple-core: #8d0de3;
        --purple-900: #420465;
        display: block;
      }
      .ean-switch {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #f8fafc;
        cursor: pointer;
      }
      .ean-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .ean-switch__ui {
        flex: 0 0 auto;
        width: 40px;
        height: 22px;
        border-radius: 999px;
        background: #cbd5e1;
        position: relative;
        transition: background 0.15s ease;
      }
      .ean-switch__ui::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
        transition: transform 0.15s ease;
      }
      .ean-switch input:checked + .ean-switch__ui {
        background: var(--color-primary, #1d54e6);
      }
      .ean-switch input:checked + .ean-switch__ui::after {
        transform: translateX(18px);
      }
      .ean-switch__txt {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        font-size: 13px;
        color: var(--ink-2);
      }
      .ean-switch__txt b {
        color: var(--ink);
      }
      .ean-dual {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      .ean-box {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        display: flex;
        flex-direction: column;
        min-height: 420px;
      }
      .ean-box--target {
        border-color: var(--line-strong);
      }
      .ean-box-head {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
      }
      .ean-box-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .ean-box-title h2 {
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 12px;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--ink-2);
        margin: 0;
      }
      .ean-badge {
        font-size: 11.5px;
        color: var(--ink-3);
      }
      .ean-badge--on {
        color: var(--purple-900);
        font-weight: 500;
      }
      .ean-search {
        position: relative;
        margin-top: 10px;
      }
      .ean-search input {
        width: 100%;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        padding: 8px 32px;
        font-size: 13.5px;
        font: inherit;
      }
      .ean-search input:hover {
        border-color: var(--purple-core);
      }
      .ean-search__mag {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--ink-3);
        font-size: 13px;
      }
      .ean-search__clr {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: 0;
        color: var(--ink-3);
        cursor: pointer;
        padding: 4px;
        display: none;
      }
      .ean-search__clr.on {
        display: block;
      }
      .ean-bulk {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 9px;
        font-size: 12px;
        color: var(--ink-3);
      }
      .ean-link {
        background: none;
        border: 0;
        padding: 0;
        color: var(--purple-core);
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
      }
      .ean-link:disabled {
        color: var(--ink-3);
        text-decoration: none;
        cursor: default;
      }
      .ean-list {
        list-style: none;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        flex: 1;
        max-height: 360px;
      }
      .ean-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 8px;
      }
      .ean-row + .ean-row {
        border-top: 1px solid var(--line);
      }
      .ean-row:hover {
        background: #faf8fc;
      }
      .ean-info {
        flex: 1;
        min-width: 0;
      }
      .ean-nm {
        font-weight: 600;
        font-size: 13.5px;
        display: block;
        overflow-wrap: anywhere;
      }
      .ean-sub {
        font-size: 11.5px;
        color: var(--ink-2);
        display: block;
        overflow-wrap: anywhere;
      }
      .ean-act {
        flex: 0 0 auto;
        border: 1px solid var(--line-strong);
        background: #fff;
        border-radius: 999px;
        padding: 5px 12px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .ean-act--add:hover {
        border-color: var(--purple-core);
        color: var(--purple-900);
        background: #f9f2fe;
      }
      .ean-act--rem {
        border-color: transparent;
        color: var(--ink-3);
      }
      .ean-act--rem:hover {
        border-color: #e9b4b0;
        color: var(--danger);
        background: var(--danger-bg);
      }
      .ean-empty {
        margin: auto;
        padding: 26px 20px;
        text-align: center;
        color: var(--ink-2);
        font-size: 13px;
      }
      .ean-empty b {
        display: block;
        font-family: var(--font-display, Sora, system-ui, sans-serif);
        font-size: 13.5px;
        color: var(--ink);
        margin-bottom: 4px;
      }
      .ean-empty .hint {
        font-size: 12px;
        color: var(--ink-3);
        margin-top: 6px;
      }
      .ean-foot {
        border-top: 1px solid var(--line);
        padding: 10px 14px;
        font-size: 12px;
        color: var(--ink-3);
      }
      @media (max-width: 860px) {
        .ean-dual {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class EventAccreditationNotifySettingsComponent implements SettingsReloadable {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  notifyAll = false;
  search = '';
  catalog: EventAccreditationNotifyUser[] = [];
  selectedUsers: EventAccreditationNotifyUser[] = [];
  atualizadoEm: string | null = null;
  saving = false;

  constructor() {
    this.reloadPage();
  }

  reloadPage() {
    this.systemSettings.getEventAccreditationNotifySettings().subscribe({
      next: (res) => {
        this.notifyAll = !!res.settings.notify_all;
        this.selectedUsers = res.settings.users || [];
        this.atualizadoEm = res.settings.atualizado_em || null;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar a configuração de notificação.');
        this.cdr.markForCheck();
      },
    });
    this.loadUsers('');
  }

  availableUsers(): EventAccreditationNotifyUser[] {
    const selected = new Set(this.selectedUsers.map((u) => u.id));
    const term = this.search.trim().toLowerCase();
    return this.catalog.filter((user) => {
      if (selected.has(user.id)) return false;
      if (!term) return true;
      return (
        user.nome_completo.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.departamento || '').toLowerCase().includes(term)
      );
    });
  }

  availableCountLabel(): string {
    const total = this.catalog.length;
    const selectedIds = new Set(this.selectedUsers.map((u) => u.id));
    const left = this.catalog.filter((u) => !selectedIds.has(u.id)).length;
    return `${left} de ${total} disponíveis`;
  }

  availableHint(): string {
    const n = this.availableUsers().length;
    if (this.search.trim()) {
      return `${n} resultado${n === 1 ? '' : 's'}`;
    }
    return n === 1 ? '1 usuário na lista' : `${n} usuários na lista`;
  }

  includeAllLabel(): string {
    return this.search.trim() ? 'Incluir resultados' : 'Incluir todos';
  }

  selectedCountLabel(): string {
    const n = this.selectedUsers.length;
    return n === 1 ? '1 selecionado' : `${n} selecionados`;
  }

  selectedHint(): string {
    const n = this.selectedUsers.length;
    if (!n) return 'Nenhum usuário selecionado';
    return n === 1 ? '1 usuário na whitelist' : `${n} usuários na whitelist`;
  }

  onSearch(): void {
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.search = '';
    this.cdr.markForCheck();
  }

  includeUser(user: EventAccreditationNotifyUser): void {
    if (this.selectedUsers.some((u) => u.id === user.id)) return;
    this.selectedUsers = [...this.selectedUsers, user];
  }

  includeAllVisible(): void {
    const visible = this.availableUsers();
    if (!visible.length) return;
    const seen = new Set(this.selectedUsers.map((u) => u.id));
    const extra = visible.filter((u) => !seen.has(u.id));
    this.selectedUsers = [...this.selectedUsers, ...extra];
  }

  removeUser(id: number): void {
    this.selectedUsers = this.selectedUsers.filter((u) => u.id !== id);
  }

  removeAll(): void {
    this.selectedUsers = [];
  }

  salvar(): void {
    this.saving = true;
    this.systemSettings
      .updateEventAccreditationNotifySettings({
        notify_all: this.notifyAll,
        user_ids: this.selectedUsers.map((u) => u.id),
      })
      .subscribe({
        next: (res) => {
          this.saving = false;
          this.notifyAll = !!res.settings.notify_all;
          this.selectedUsers = res.settings.users || [];
          this.atualizadoEm = res.settings.atualizado_em || null;
          this.notification.success('Configuração de notificação salva.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saving = false;
          this.notification.notifyHttpError(err, 'Falha ao salvar a configuração.');
          this.cdr.markForCheck();
        },
      });
  }

  private loadUsers(search = ''): void {
    this.systemSettings.listAdInternalUsers(search).subscribe({
      next: (res) => {
        this.catalog = res.users || [];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar usuários AD.');
        this.cdr.markForCheck();
      },
    });
  }
}
