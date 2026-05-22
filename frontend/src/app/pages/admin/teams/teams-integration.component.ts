import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamsService, TeamsIntegration } from '../../../services/teams.service';
import { SettingsReloadable } from '../settings-reloadable';
import { TenantService, AzureTenant } from '../../../services/tenant.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-teams-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionBtnComponent, ActionMenuComponent],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Integração Microsoft Teams</h2>
          <p class="page-section-subtitle">
            Envie notificações ao <strong>feed de atividades</strong> do usuário no Teams (sino) ou a um canal.
          </p>
          <p class="text-xs text-slate-500 mt-2 max-w-3xl">
            Para <strong>usuário</strong>: permissões de <strong>Aplicação</strong>
            <strong>TeamsActivity.Send</strong> + <strong>User.Read.All</strong> (admin consent).
            Publique o app em <code class="text-[11px]">teams-app/</code>, informe o <strong>Teams App ID</strong> e
            no admin do Teams use <strong>Install for everyone</strong> em Credenciamento (publicar ≠ instalar).
          </p>
        </div>
        <button type="button" (click)="novaIntegracao()" class="btn-primary shrink-0">+ Nova integração</button>
      </div>

      <div class="card-surface overflow-hidden">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Nome</th>
                <th class="px-4 py-3 text-left">Tipo</th>
                <th class="px-4 py-3 text-left">Tenant</th>
                <th class="px-4 py-3 text-left">Destino</th>
                <th class="px-4 py-3 text-left">Teams App ID</th>
                <th class="px-4 py-3 text-left">Ativo</th>
                <th class="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let i of integrations()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-800">{{ i.nome }}</td>
                <td class="px-4 py-3">
                  <span class="text-xs font-semibold uppercase text-slate-600">
                    {{ i.tipo === 'user' ? 'Usuário' : 'Canal' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">{{ i.azure_tenant_nome || '—' }}</td>
                <td class="px-4 py-3 text-slate-600 truncate max-w-[200px]" [title]="destinoLabel(i)">
                  {{ destinoLabel(i) }}
                </td>
                <td
                  class="px-4 py-3 font-mono text-xs text-slate-600 truncate max-w-[140px]"
                  [title]="i.teams_app_id || ''"
                >
                  {{ i.tipo === 'user' ? (i.teams_app_id || '—') : '—' }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="i.ativo"
                    [class.text-emerald-800]="i.ativo"
                    [class.bg-slate-100]="!i.ativo"
                    [class.text-slate-600]="!i.ativo"
                  >
                    {{ i.ativo ? 'Sim' : 'Não' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                    <app-action-btn
                      icon="send"
                      title="Testar notificação"
                      variant="primary"
                      [disabled]="testingId === i.id"
                      (action)="testar(i)"
                    />
                    <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(i)" />
                    <app-action-btn
                      *ngIf="i.ativo"
                      icon="delete"
                      title="Desativar"
                      variant="danger"
                      (action)="desativar(i)"
                    />
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="integrations().length === 0 && !loading()">
                <td colspan="7" class="px-4 py-8 text-center text-slate-500">
                  Nenhuma integração cadastrada.
                </td>
              </tr>
              </ng-container>
              <ng-template #loadingRow>
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-slate-500">Carregando integrações...</td>
                </tr>
              </ng-template>
            </tbody>
          </table>
      </div>
    </div>

    <div
      *ngIf="showForm"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" class="absolute inset-0 bg-slate-900/50" aria-label="Fechar" (click)="fecharForm()"></button>
      <div class="relative w-full max-w-2xl card-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-slate-800 mb-4">
          {{ editingId ? 'Editar integração' : 'Nova integração Teams' }}
        </h3>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
          <div class="md:col-span-2">
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="form.nome"
              name="nome"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div class="md:col-span-2">
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo de notificação</label>
            <select
              [(ngModel)]="form.tipo"
              name="tipo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="user">Usuário (feed de atividades / sino)</option>
              <option value="channel">Canal do Teams</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="text-xs font-bold text-slate-500 uppercase">Tenant Azure</label>
            <select
              [(ngModel)]="form.azure_tenant_ref_id"
              name="azure_tenant_ref_id"
              required
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option [ngValue]="0" disabled>Selecione um tenant</option>
              <option *ngFor="let t of tenantsAtivos" [ngValue]="t.id">{{ t.nome }}</option>
            </select>
          </div>

          <ng-container *ngIf="form.tipo === 'user'">
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">E-mail do destinatário (teste padrão)</label>
              <input
                type="email"
                [(ngModel)]="form.destinatario_email"
                name="destinatario_email"
                required
                placeholder="usuario@empresa.com"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <p class="text-xs text-slate-500 mt-1">
                Mesmo e-mail/Microsoft 365 do usuário no Azure AD.
              </p>
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">URL ao clicar na notificação (https)</label>
              <input
                type="url"
                [(ngModel)]="form.activity_web_url"
                name="activity_web_url"
                required
                placeholder="https://credenciamento.suaempresa.com"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <p class="text-xs text-slate-500 mt-1">
                URL do sistema (https). Ao clicar no sino, o Teams abre essa página via link interno do Teams.
              </p>
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-bold text-slate-500 uppercase">Teams App ID</label>
              <input
                [(ngModel)]="form.teams_app_id"
                name="teams_app_id"
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                placeholder="7ba5b35a-67b1-4877-b65f-f0e17c373c2f"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <p class="text-xs text-slate-500 mt-1">
                ID do catálogo Graph. Obrigatório instalar o app: admin.teams.microsoft.com → Credenciamento →
                <strong>Install for everyone</strong> (ou o destinatário adiciona em Teams → Apps).
              </p>
            </div>
          </ng-container>

          <ng-container *ngIf="form.tipo === 'channel'">
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Team ID</label>
              <input
                [(ngModel)]="form.team_id"
                name="team_id"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Channel ID</label>
              <input
                [(ngModel)]="form.channel_id"
                name="channel_id"
                required
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>
          </ng-container>

          <div class="md:col-span-2">
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" />
              Ativo
            </label>
          </div>
          <div class="md:col-span-2 flex gap-2 justify-end pt-2">
            <button
              type="button"
              (click)="fecharForm()"
              class="px-4 py-2 border border-[var(--app-border)] rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button type="submit" [disabled]="saving" class="btn-secondary disabled:opacity-50">
              {{ saving ? 'Salvando...' : 'Salvar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TeamsIntegrationComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);

  readonly integrations = signal<TeamsIntegration[]>([]);
  readonly loading = signal(true);
  tenantsAtivos: AzureTenant[] = [];
  showForm = false;
  editingId: number | null = null;
  saving = false;
  testingId: number | null = null;
  defaultTeamsAppId: string | null = null;

  form: TeamsIntegration = {
    nome: '',
    tipo: 'user',
    azure_tenant_ref_id: 0,
    team_id: '',
    channel_id: '',
    destinatario_email: '',
    activity_web_url: '',
    teams_app_id: '',
    ativo: true,
  };

  constructor(
    private teamsService: TeamsService,
    private tenantService: TenantService,
    private notification: NotificationService,
  ) {}

  reloadPage() {
    this.carregar();
    this.carregarConfig();
    if (this.tenantsAtivos.length === 0) {
      this.tenantService.list().subscribe({
        next: (res) => {
          this.tenantsAtivos = res.tenants.filter((t) => t.ativo && t.id);
          this.cdr.markForCheck();
        },
      });
    }
  }

  destinoLabel(i: TeamsIntegration): string {
    if (i.tipo === 'user') {
      const email = i.destinatario_email || '—';
      const url = i.activity_web_url ? ` → ${i.activity_web_url}` : '';
      return email + url;
    }
    return i.team_id ? `${i.team_id} / ${i.channel_id}` : '—';
  }

  carregarConfig() {
    this.teamsService.config().subscribe({
      next: (cfg) => {
        this.defaultTeamsAppId = cfg.defaultTeamsAppId;
        this.cdr.markForCheck();
      },
      error: () => {
        this.defaultTeamsAppId = null;
      },
    });
  }

  carregar() {
    this.loading.set(true);
    this.teamsService.list().subscribe({
      next: (res) => {
        this.integrations.set(res.integrations);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading.set(false);
        this.cdr.markForCheck();
        this.notification.error('Falha ao carregar integrações Teams.');
      },
    });
  }

  novaIntegracao() {
    this.editingId = null;
    this.form = {
      nome: '',
      tipo: 'user',
      azure_tenant_ref_id: this.tenantsAtivos[0]?.id || 0,
      team_id: '',
      channel_id: '',
      destinatario_email: '',
      activity_web_url: this.defaultActivityWebUrl(),
      teams_app_id: this.defaultTeamsAppId || '',
      ativo: true,
    };
    this.showForm = true;
  }

  editar(i: TeamsIntegration) {
    this.editingId = i.id!;
    this.form = {
      nome: i.nome,
      tipo: i.tipo || 'user',
      azure_tenant_ref_id: i.azure_tenant_ref_id,
      team_id: i.team_id || '',
      channel_id: i.channel_id || '',
      destinatario_email: i.destinatario_email || '',
      activity_web_url: i.activity_web_url || this.defaultActivityWebUrl(),
      teams_app_id: i.teams_app_id || '',
      ativo: i.ativo,
    };
    this.showForm = true;
  }

  fecharForm() {
    if (this.saving) return;
    this.showForm = false;
    this.editingId = null;
  }

  salvar() {
    if (!this.form.azure_tenant_ref_id) {
      this.notification.error('Selecione um tenant Azure.');
      return;
    }
    if (this.form.tipo === 'user' && !this.form.destinatario_email) {
      this.notification.error('Informe o e-mail do destinatário.');
      return;
    }
    if (this.form.tipo === 'user') {
      const url = (this.form.activity_web_url || '').trim();
      if (!url.startsWith('https://')) {
        this.notification.error('Informe a URL da notificação começando com https://');
        return;
      }
      this.form.activity_web_url = url;
      const appId = (this.form.teams_app_id || '').trim();
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!appId || !uuidRe.test(appId)) {
        this.notification.error('Informe o Teams App ID (GUID do catálogo Graph).');
        return;
      }
      this.form.teams_app_id = appId;
    }
    if (this.form.tipo === 'channel' && (!this.form.team_id || !this.form.channel_id)) {
      this.notification.error('Informe Team ID e Channel ID.');
      return;
    }

    this.saving = true;
    const payload: TeamsIntegration = { ...this.form };
    if (payload.tipo === 'user') {
      payload.team_id = null;
      payload.channel_id = null;
    } else {
      payload.destinatario_email = null;
      payload.activity_web_url = null;
      payload.teams_app_id = null;
    }

    const req = this.editingId
      ? this.teamsService.update(this.editingId, payload)
      : this.teamsService.create(payload);

    req.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.editingId = null;
        this.notification.success('Integração salva.');
        this.carregar();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar.'));
      },
    });
  }

  testar(i: TeamsIntegration) {
    if (!i.id) return;

    if (i.tipo === 'user') {
      Swal.fire({
        title: 'Testar notificação ao usuário',
        html: `
          <input id="swal-email" class="swal2-input" type="email" placeholder="E-mail do usuário" value="${i.destinatario_email || ''}">
          <textarea id="swal-msg" class="swal2-textarea" placeholder="Mensagem (opcional)"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: 'Enviar',
        preConfirm: () => {
          const email = (document.getElementById('swal-email') as HTMLInputElement)?.value?.trim();
          const mensagem = (document.getElementById('swal-msg') as HTMLTextAreaElement)?.value?.trim();
          if (!email) {
            Swal.showValidationMessage('Informe o e-mail do usuário');
            return false;
          }
          return { email, mensagem: mensagem || undefined };
        },
      }).then((r) => {
        if (r.isConfirmed && r.value) {
          this.executarTeste(i.id!, r.value);
        }
      });
      return;
    }

    this.executarTeste(i.id);
  }

  private executarTeste(id: number, payload?: { email?: string; mensagem?: string }) {
    this.testingId = id;
    this.teamsService.test(id, payload).subscribe({
      next: (res) => {
        this.testingId = null;
        this.notification.success(res.message);
      },
      error: (err) => {
        this.testingId = null;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha no teste.'));
      },
    });
  }

  /** Sugestão inicial: origem atual em https quando possível. */
  private defaultActivityWebUrl(): string {
    if (typeof window === 'undefined') return '';
    const { protocol, host } = window.location;
    if (protocol === 'https:') return `${protocol}//${host}`;
    return '';
  }

  desativar(i: TeamsIntegration) {
    Swal.fire({
      title: 'Desativar integração?',
      text: i.nome,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Desativar',
    }).then((r) => {
      if (r.isConfirmed && i.id) {
        this.teamsService.remove(i.id).subscribe({
          next: () => {
            this.notification.success('Integração desativada.');
            this.carregar();
          },
          error: () => this.notification.error('Falha ao desativar.'),
        });
      }
    });
  }
}
