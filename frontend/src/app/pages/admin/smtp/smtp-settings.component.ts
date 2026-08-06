import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EmailLogStatus,
  EmailProvider,
  SmtpService,
  SmtpSettings,
  SmtpSendLog,
} from '../../../services/smtp.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-smtp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .smtp-tabs {
        display: flex;
        background: #eef2f7;
        border-radius: 11px;
        padding: 4px;
        gap: 4px;
        max-width: 420px;
      }
      .smtp-tabs button {
        flex: 1;
        height: 36px;
        border: none;
        background: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13.5px;
        color: #64748b;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, box-shadow 0.15s;
      }
      .smtp-tabs button.on {
        background: #fff;
        color: #0f172a;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
      }
    `,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Envios de e-mail</h2>
          <p class="page-section-subtitle">
            Configure o provedor de e-mail e acompanhe o histórico de envios.
          </p>
        </div>
        <div *ngIf="activeTab === 'config'" class="flex flex-wrap gap-2 shrink-0">
          <button
            *ngIf="form.provider === 'smtp'"
            type="button"
            (click)="verificar()"
            class="btn-secondary"
          >
            Verificar SMTP
          </button>
          <button type="button" (click)="abrirTeste()" class="btn-secondary">Testar envio</button>
          <button type="button" (click)="salvar()" [disabled]="saving" class="btn-primary disabled:opacity-50">
            {{ saving ? 'Salvando...' : 'Salvar configuração' }}
          </button>
        </div>
        <div *ngIf="activeTab === 'historico'" class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="abrirTeste()" class="btn-secondary">Testar envio</button>
          <button type="button" (click)="carregarLogs(pagination.page)" class="btn-secondary">
            Atualizar
          </button>
        </div>
      </div>

      <div class="smtp-tabs mb-5" role="tablist" aria-label="Seções de envios de e-mail">
        <button
          type="button"
          role="tab"
          (click)="setTab('config')"
          [class.on]="activeTab === 'config'"
          [attr.aria-selected]="activeTab === 'config'"
        >
          Configuração
        </button>
        <button
          type="button"
          role="tab"
          (click)="setTab('historico')"
          [class.on]="activeTab === 'historico'"
          [attr.aria-selected]="activeTab === 'historico'"
        >
          Histórico
        </button>
      </div>

      <div *ngIf="activeTab === 'config'" class="card-surface p-5 mb-5 shrink-0">
        <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Provedor</h3>
        <div class="flex flex-wrap gap-4 mb-5">
          <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="radio" name="provider" [(ngModel)]="form.provider" value="smtp" />
            SMTP
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="radio" name="provider" [(ngModel)]="form.provider" value="acs" />
            Azure ACS
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="radio" name="provider" [(ngModel)]="form.provider" value="sendgrid" />
            SendGrid
          </label>
        </div>

        <div class="flex flex-wrap gap-6 mb-5">
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" [(ngModel)]="form.email_ativo" name="email_ativo" />
            Envio de e-mail ativo
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" [(ngModel)]="form.ocultar_para" name="ocultar_para" />
            Ocultar e-mail do destinatário no campo Para (envia só em Cco)
          </label>
        </div>

        <ng-container *ngIf="form.provider === 'smtp'">
          <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Configuração SMTP</h3>
          <form class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" (ngSubmit)="salvar()">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Host SMTP</label>
              <input
                [(ngModel)]="form.host"
                name="host"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Porta</label>
              <input
                type="number"
                [(ngModel)]="form.port"
                name="port"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input type="checkbox" [(ngModel)]="form.secure" name="secure" />
                TLS/SSL (secure)
              </label>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Usuário</label>
              <input
                [(ngModel)]="form.user"
                name="user"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase"
                >Senha {{ hasPassword ? '(deixe vazio para manter)' : '' }}</label
              >
              <input
                type="password"
                [(ngModel)]="form.password"
                name="password"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">E-mail remetente</label>
              <input
                type="email"
                [(ngModel)]="form.from_email"
                name="from_email"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Nome remetente</label>
              <input
                [(ngModel)]="form.from_name"
                name="from_name"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" />
                Configuração SMTP ativa
              </label>
            </div>
          </form>
        </ng-container>

        <ng-container *ngIf="form.provider === 'acs'">
          <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Azure Communication Services</h3>
          <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">
                Connection string
                {{ hasAcsConnectionString ? '(deixe vazio para manter)' : '' }}
              </label>
              <input
                type="password"
                [(ngModel)]="acsConnectionInput"
                name="acs_connection_string"
                [placeholder]="
                  hasAcsConnectionString ? '•••••••• (já configurada)' : 'endpoint=https://...;accesskey=...'
                "
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
              />
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">Remetente (domínio verificado)</label>
              <input
                type="email"
                [(ngModel)]="form.acs_sender"
                name="acs_sender"
                required
                placeholder="no-reply@seudominio.com"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </form>
        </ng-container>

        <ng-container *ngIf="form.provider === 'sendgrid'">
          <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">SendGrid</h3>
          <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">
                API key
                {{ hasSendgridApiKey ? '(deixe vazio para manter)' : '' }}
              </label>
              <input
                type="password"
                [(ngModel)]="sendgridApiKeyInput"
                name="sendgrid_api_key"
                [placeholder]="hasSendgridApiKey ? '•••••••• (já configurada)' : 'SG....'"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">E-mail remetente (verificado)</label>
              <input
                type="email"
                [(ngModel)]="form.sendgrid_from_email"
                name="sendgrid_from_email"
                required
                placeholder="no-reply@seudominio.com"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Nome remetente</label>
              <input
                [(ngModel)]="form.sendgrid_from_name"
                name="sendgrid_from_name"
                placeholder="Credenciamento"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">
                Verification Key (Event Webhook)
                {{ hasSendgridWebhookVerificationKey ? '(deixe vazio para manter)' : '' }}
              </label>
              <textarea
                [(ngModel)]="sendgridWebhookKeyInput"
                name="sendgrid_webhook_verification_key"
                rows="3"
                [placeholder]="
                  hasSendgridWebhookVerificationKey
                    ? '•••••••• (já configurada)'
                    : '-----BEGIN PUBLIC KEY-----...'
                "
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
              ></textarea>
              <p class="mt-1 text-xs text-slate-500">
                SendGrid → Mail Settings → Event Webhook → Signed Event Webhook. URL do webhook:
                <code class="font-mono break-all">{{ sendgridWebhookUrl }}</code>
              </p>
            </div>
          </form>
        </ng-container>
      </div>

      <ng-container *ngIf="activeTab === 'historico'">
        <div class="card-surface p-4 mb-4 shrink-0">
          <div class="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
            <div class="flex-1 min-w-[200px]">
              <label class="text-xs font-bold text-slate-500 uppercase">Busca</label>
              <input
                type="search"
                [(ngModel)]="logFilters.q"
                (ngModelChange)="onLogFilterTextChange()"
                name="log_q"
                placeholder="Destinatário, assunto, message id ou erro"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div class="w-full sm:w-40 shrink-0">
              <label class="text-xs font-bold text-slate-500 uppercase">Status</label>
              <select
                [(ngModel)]="logFilters.status"
                (ngModelChange)="aplicarFiltrosLogs()"
                name="log_status"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-white"
              >
                <option value="">Todos</option>
                <option value="sent">Enviado</option>
                <option value="entregue">Entregue</option>
                <option value="failed">Falhou</option>
                <option value="bounce">Bounce</option>
              </select>
            </div>
            <div class="w-full sm:w-40 shrink-0">
              <label class="text-xs font-bold text-slate-500 uppercase">Provedor</label>
              <select
                [(ngModel)]="logFilters.provider"
                (ngModelChange)="aplicarFiltrosLogs()"
                name="log_provider"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-white"
              >
                <option value="">Todos</option>
                <option value="smtp">SMTP</option>
                <option value="acs">Azure ACS</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </div>
            <div class="flex items-center gap-2 shrink-0 pb-0.5">
              <button
                type="button"
                (click)="limparFiltrosLogs()"
                [disabled]="!hasLogFilters"
                class="btn-secondary text-xs py-2 px-3 disabled:opacity-50"
              >
                Limpar filtros
              </button>
              <span *ngIf="hasLogFilters" class="text-xs text-slate-500 whitespace-nowrap">
                {{ pagination.total }} resultado(s)
              </span>
            </div>
          </div>
        </div>

        <div class="card-surface overflow-hidden">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Destinatário</th>
                <th class="px-4 py-3 text-left">Assunto</th>
                <th class="px-4 py-3 text-left">Provedor</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Message ID</th>
                <th class="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loadingLogs; else loadingLogsRow">
                <tr *ngFor="let log of logs" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {{ log.criado_em | date: 'dd/MM/yy HH:mm' }}
                  </td>
                  <td class="px-4 py-3">{{ log.destinatario }}</td>
                  <td class="px-4 py-3 truncate max-w-[180px]" [title]="log.assunto">{{ log.assunto }}</td>
                  <td class="px-4 py-3 uppercase text-xs text-slate-500">{{ log.provider || '—' }}</td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                      [ngClass]="statusClass(log.status)"
                    >
                      {{ statusLabel(log.status) }}
                    </span>
                  </td>
                  <td
                    class="px-4 py-3 text-xs text-slate-500 truncate max-w-[120px] font-mono"
                    [title]="log.message_id || ''"
                  >
                    {{ log.message_id || '—' }}
                  </td>
                  <td class="px-4 py-3 text-xs text-rose-600 truncate max-w-[140px]" [title]="log.erro_mensagem || ''">
                    {{ log.erro_mensagem || '—' }}
                  </td>
                </tr>
                <tr *ngIf="logs.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-slate-500">
                    {{ hasLogFilters ? 'Nenhum envio encontrado com esses filtros.' : 'Nenhum envio registrado.' }}
                  </td>
                </tr>
              </ng-container>
              <ng-template #loadingLogsRow>
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-slate-500">Carregando histórico...</td>
                </tr>
              </ng-template>
            </tbody>
          </table>
          <div
            *ngIf="pagination.total > 0"
            class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
          >
            <span class="text-xs text-slate-500">
              Página {{ pagination.page }} de {{ pagination.totalPages }} ({{ pagination.total }} registros)
            </span>
            <div class="flex gap-2" *ngIf="pagination.totalPages > 1">
              <button
                type="button"
                (click)="irPagina(pagination.page - 1)"
                [disabled]="pagination.page <= 1"
                class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                (click)="irPagina(pagination.page + 1)"
                [disabled]="pagination.page >= pagination.totalPages"
                class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class SmtpSettingsComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: 'config' | 'historico' = 'config';

  form: SmtpSettings = {
    provider: 'smtp',
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from_email: '',
    from_name: 'Credenciamento',
    ativo: true,
    acs_sender: '',
    sendgrid_from_email: '',
    sendgrid_from_name: 'Credenciamento',
    ocultar_para: false,
    email_ativo: true,
  };

  acsConnectionInput = '';
  sendgridApiKeyInput = '';
  sendgridWebhookKeyInput = '';
  hasPassword = false;
  hasAcsConnectionString = false;
  hasSendgridApiKey = false;
  hasSendgridWebhookVerificationKey = false;
  sendgridWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/webhooks/sendgrid-email`
      : '/api/v1/webhooks/sendgrid-email';
  saving = false;
  loadingLogs = false;
  logs: SmtpSendLog[] = [];
  pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
  logFilters: { q: string; status: EmailLogStatus | ''; provider: EmailProvider | '' } = {
    q: '',
    status: '',
    provider: '',
  };
  private readonly filterDebounceMs = 400;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private smtpService: SmtpService,
    private notification: NotificationService,
  ) {}

  get hasLogFilters(): boolean {
    return !!(this.logFilters.q.trim() || this.logFilters.status || this.logFilters.provider);
  }

  reloadPage() {
    this.carregarSettings();
    if (this.activeTab === 'historico') {
      this.carregarLogs(this.pagination.page);
    }
  }

  setTab(tab: 'config' | 'historico') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'historico') {
      this.carregarLogs(1);
    }
    this.cdr.markForCheck();
  }

  onLogFilterTextChange() {
    if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltrosLogs(), this.filterDebounceMs);
  }

  aplicarFiltrosLogs() {
    if (this.filterDebounceTimer !== null) {
      clearTimeout(this.filterDebounceTimer);
      this.filterDebounceTimer = null;
    }
    this.carregarLogs(1);
  }

  limparFiltrosLogs() {
    this.logFilters = { q: '', status: '', provider: '' };
    this.aplicarFiltrosLogs();
  }

  statusLabel(status: EmailLogStatus): string {
    switch (status) {
      case 'sent':
        return 'Enviado';
      case 'failed':
        return 'Falhou';
      case 'entregue':
        return 'Entregue';
      case 'bounce':
        return 'Bounce';
      default:
        return status;
    }
  }

  statusClass(status: EmailLogStatus): Record<string, boolean> {
    return {
      'bg-emerald-100 text-emerald-800': status === 'sent' || status === 'entregue',
      'bg-rose-100 text-rose-800': status === 'failed' || status === 'bounce',
    };
  }

  carregarSettings() {
    this.smtpService.getSettings().subscribe({
      next: (res) => {
        if (res.settings) {
          this.form = {
            provider: (res.settings.provider as EmailProvider) || 'smtp',
            host: res.settings.host || '',
            port: res.settings.port || 587,
            secure: !!res.settings.secure,
            user: res.settings.user || '',
            password: '',
            from_email: res.settings.from_email || '',
            from_name: res.settings.from_name || 'Credenciamento',
            ativo: res.settings.ativo !== false,
            acs_sender: res.settings.acs_sender || '',
            sendgrid_from_email: res.settings.sendgrid_from_email || '',
            sendgrid_from_name: res.settings.sendgrid_from_name || 'Credenciamento',
            ocultar_para: !!res.settings.ocultar_para,
            email_ativo: res.settings.email_ativo !== false,
            id: res.settings.id,
          };
          this.hasPassword = !!res.settings.hasPassword;
          this.hasAcsConnectionString = !!res.settings.has_acs_connection_string;
          this.hasSendgridApiKey = !!res.settings.has_sendgrid_api_key;
          this.hasSendgridWebhookVerificationKey =
            !!res.settings.has_sendgrid_webhook_verification_key;
          this.acsConnectionInput = '';
          this.sendgridApiKeyInput = '';
          this.sendgridWebhookKeyInput = '';
        }
        this.cdr.markForCheck();
      },
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar configuração de e-mail.'),
    });
  }

  carregarLogs(page = 1) {
    this.loadingLogs = true;
    this.smtpService
      .listLogs({
        page,
        limit: this.pagination.limit,
        q: this.logFilters.q,
        status: this.logFilters.status,
        provider: this.logFilters.provider,
      })
      .subscribe({
        next: (res) => {
          this.logs = res.logs;
          this.pagination = res.pagination;
          this.loadingLogs = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loadingLogs = false;
          this.cdr.markForCheck();
          this.notification.notifyHttpError(err, 'Falha ao carregar histórico de envios.');
        },
      });
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination.totalPages) return;
    this.carregarLogs(page);
  }

  salvar() {
    this.saving = true;
    const payload: Partial<SmtpSettings> = {
      provider: this.form.provider,
      ocultar_para: !!this.form.ocultar_para,
      email_ativo: this.form.email_ativo !== false,
    };

    if (this.form.provider === 'smtp') {
      payload.host = this.form.host;
      payload.port = this.form.port;
      payload.secure = this.form.secure;
      payload.user = this.form.user;
      payload.from_email = this.form.from_email;
      payload.from_name = this.form.from_name;
      payload.ativo = this.form.ativo;
      if (this.form.password) payload.password = this.form.password;
    } else if (this.form.provider === 'acs') {
      payload.acs_sender = this.form.acs_sender || '';
      if (this.acsConnectionInput.trim()) {
        payload.acs_connection_string = this.acsConnectionInput.trim();
      }
    } else if (this.form.provider === 'sendgrid') {
      payload.sendgrid_from_email = this.form.sendgrid_from_email || '';
      payload.sendgrid_from_name = this.form.sendgrid_from_name || null;
      if (this.sendgridApiKeyInput.trim()) {
        payload.sendgrid_api_key = this.sendgridApiKeyInput.trim();
      }
      if (this.sendgridWebhookKeyInput.trim()) {
        payload.sendgrid_webhook_verification_key = this.sendgridWebhookKeyInput.trim();
      }
    }

    this.smtpService.updateSettings(payload).subscribe({
      next: (res) => {
        this.saving = false;
        const s = res.settings;
        this.form = {
          ...this.form,
          ...s,
          password: '',
          provider: (s.provider as EmailProvider) || this.form.provider,
          email_ativo: s.email_ativo !== false,
        };
        this.hasPassword = !!s.hasPassword;
        this.hasAcsConnectionString = !!s.has_acs_connection_string;
        this.hasSendgridApiKey = !!s.has_sendgrid_api_key;
        this.hasSendgridWebhookVerificationKey =
          !!s.has_sendgrid_webhook_verification_key;
        this.acsConnectionInput = '';
        this.sendgridApiKeyInput = '';
        this.sendgridWebhookKeyInput = '';
        this.notification.success('Configuração de e-mail salva.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar.'));
        this.cdr.markForCheck();
      },
    });
  }

  verificar() {
    this.smtpService.verifyConnection().subscribe({
      next: (res) => this.notification.success(res.message || 'Conexão SMTP OK.'),
      error: (err) =>
        this.notification.error(
          this.notification.extractErrorMessage(err, 'Falha ao verificar SMTP.'),
        ),
    });
  }

  abrirTeste() {
    Swal.fire({
      title: 'Testar envio de e-mail',
      html: `
        <input id="swal-email" class="swal2-input" placeholder="E-mail destino" type="email">
      `,
      showCancelButton: true,
      confirmButtonText: 'Enviar teste',
      preConfirm: () => {
        const email = (document.getElementById('swal-email') as HTMLInputElement)?.value;
        if (!email) {
          Swal.showValidationMessage('Informe um e-mail válido');
          return false;
        }
        return email;
      },
    }).then((r) => {
      if (r.isConfirmed && typeof r.value === 'string') {
        this.smtpService.testSend(r.value).subscribe({
          next: () => {
            this.notification.success('E-mail de teste enviado.');
            this.activeTab = 'historico';
            this.carregarLogs(1);
            this.cdr.markForCheck();
          },
          error: (err) =>
            this.notification.error(
              this.notification.extractErrorMessage(err, 'Falha no envio de teste.'),
            ),
        });
      }
    });
  }
}
