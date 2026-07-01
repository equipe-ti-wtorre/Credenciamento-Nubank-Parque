import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmtpService, SmtpSettings, SmtpSendLog } from '../../../services/smtp.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-smtp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Envios SMTP</h2>
          <p class="page-section-subtitle">
            Configure o servidor de e-mail e consulte o histórico de envios do sistema.
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" (click)="abrirTeste()" class="btn-secondary">Testar envio</button>
          <button type="button" (click)="salvar()" [disabled]="saving" class="btn-primary disabled:opacity-50">
            {{ saving ? 'Salvando...' : 'Salvar configuração' }}
          </button>
        </div>
      </div>

      <div class="card-surface p-5 mb-5 shrink-0">
        <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Configuração do servidor</h3>
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
              Configuração ativa
            </label>
          </div>
        </form>
      </div>

      <div class="card-surface overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 class="text-xs font-bold text-slate-500 uppercase">Histórico de envios</h3>
          <button type="button" (click)="carregarLogs()" class="text-sm text-[var(--color-primary-dark)] hover:underline">
            Atualizar
          </button>
        </div>
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Destinatário</th>
                <th class="px-4 py-3 text-left">Assunto</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loadingLogs; else loadingLogsRow">
              <tr *ngFor="let log of logs" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap">{{ log.criado_em | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="px-4 py-3">{{ log.destinatario }}</td>
                <td class="px-4 py-3 truncate max-w-[200px]" [title]="log.assunto">{{ log.assunto }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="log.status === 'sent'"
                    [class.text-emerald-800]="log.status === 'sent'"
                    [class.bg-rose-100]="log.status === 'failed'"
                    [class.text-rose-800]="log.status === 'failed'"
                  >
                    {{ log.status === 'sent' ? 'Enviado' : 'Falhou' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-xs text-rose-600 truncate max-w-[180px]" [title]="log.erro_mensagem || ''">
                  {{ log.erro_mensagem || '—' }}
                </td>
              </tr>
              <tr *ngIf="logs.length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum envio registrado.</td>
              </tr>
              </ng-container>
              <ng-template #loadingLogsRow>
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-slate-500">Carregando histórico...</td>
                </tr>
              </ng-template>
            </tbody>
          </table>
        <div
          *ngIf="pagination.totalPages > 1"
          class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
        >
          <span class="text-xs text-slate-500">
            Página {{ pagination.page }} de {{ pagination.totalPages }} ({{ pagination.total }} registros)
          </span>
          <div class="flex gap-2">
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
    </div>
  `,
})
export class SmtpSettingsComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);

  form: SmtpSettings = {
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from_email: '',
    from_name: 'Credenciamento',
    ativo: true,
  };

  hasPassword = false;
  saving = false;
  loadingLogs = true;
  logs: SmtpSendLog[] = [];
  pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };

  constructor(
    private smtpService: SmtpService,
    private notification: NotificationService,
  ) {}

  reloadPage() {
    this.carregarSettings();
    this.carregarLogs();
  }

  carregarSettings() {
    this.smtpService.getSettings().subscribe({
      next: (res) => {
        if (res.settings) {
          this.form = {
            ...res.settings,
            password: '',
          };
          this.hasPassword = !!res.settings.hasPassword;
        }
        this.cdr.markForCheck();
      },
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar configuração SMTP.'),
    });
  }

  carregarLogs(page = 1) {
    this.loadingLogs = true;
    this.smtpService.listLogs(page, this.pagination.limit).subscribe({
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
    const payload = { ...this.form };
    if (!payload.password) delete payload.password;

    this.smtpService.updateSettings(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.form = { ...res.settings, password: '' };
        this.hasPassword = !!res.settings.hasPassword;
        this.notification.success('Configuração SMTP salva.');
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar.'));
      },
    });
  }

  abrirTeste() {
    Swal.fire({
      title: 'Testar envio SMTP',
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
            this.carregarLogs(1);
          },
          error: (err) =>
            this.notification.error(this.notification.extractErrorMessage(err, 'Falha no envio de teste.')),
        });
      }
    });
  }
}
