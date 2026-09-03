import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FacialAccessLogItem,
  FacialEnrollmentLogItem,
  FacialForceSyncResult,
  FacialGatewayService,
  FacialGatewaySettings,
  FacialIntegrationStatus,
  FacialSyncTestResult,
} from '../../../services/facial-gateway.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';
import Swal from 'sweetalert2';

type FacialPageTab = 'config' | 'logs';
type FacialLogTab = 'enrollment' | 'access';

const STATUS_REFRESH_MS = 5000;
const LOGS_REFRESH_MS = 5000;

@Component({
  selector: 'app-facial-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .facial-tabs {
        display: flex;
        background: #eef2f7;
        border-radius: 11px;
        padding: 4px;
        gap: 4px;
        max-width: 420px;
      }
      .facial-tabs button {
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
      .facial-tabs button.on {
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
          <h2 class="page-section-title">Integração facial</h2>
          <p class="page-section-subtitle">
            HTTP poll (recomendado): o Gateway busca jobs neste servidor. Azure Service Bus é opcional.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            (click)="testarSync()"
            [disabled]="testingSync || forcingSync"
            class="btn-secondary disabled:opacity-50"
          >
            {{ testingSync ? 'Testando...' : 'Testar sync' }}
          </button>
          <button
            type="button"
            (click)="forcarSync()"
            [disabled]="testingSync || forcingSync"
            class="btn-secondary disabled:opacity-50"
          >
            {{ forcingSync ? 'Sincronizando...' : 'Forçar sync' }}
          </button>
          <button
            *ngIf="activeTab === 'config'"
            type="button"
            (click)="salvar()"
            [disabled]="saving || testingSync || forcingSync"
            class="btn-primary disabled:opacity-50"
          >
            {{ saving ? 'Salvando...' : 'Salvar configuração' }}
          </button>
          <button
            *ngIf="activeTab === 'logs'"
            type="button"
            (click)="refreshPanel()"
            [disabled]="loadingStatus || loadingLogs || testingSync || forcingSync"
            class="btn-secondary disabled:opacity-50"
          >
            {{ loadingStatus || loadingLogs ? 'Atualizando...' : 'Atualizar' }}
          </button>
        </div>
      </div>

      <div class="facial-tabs mb-5" role="tablist" aria-label="Seções da integração facial">
        <button
          type="button"
          role="tab"
          (click)="setPageTab('config')"
          [class.on]="activeTab === 'config'"
          [attr.aria-selected]="activeTab === 'config'"
        >
          Configuração
        </button>
        <button
          type="button"
          role="tab"
          (click)="setPageTab('logs')"
          [class.on]="activeTab === 'logs'"
          [attr.aria-selected]="activeTab === 'logs'"
        >
          Logs
        </button>
      </div>

      <div *ngIf="activeTab === 'config'" class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 lg:gap-5 items-start">
        <div class="min-w-0 space-y-5">
          <div class="card-surface p-5 space-y-4">
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" [(ngModel)]="form.enabled" name="enabled" />
              Integração facial ativa
            </label>

            <p class="text-sm text-slate-600">
              Transporte:
              <span class="font-medium text-slate-800">{{ transportHint }}</span>
            </p>

            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">URL do Credenciamento</label>
              <input
                type="text"
                readonly
                [value]="facialEventsUrlHint"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm"
              />
              <p class="text-xs text-slate-400 mt-1">
                Informe esta URL no Gateway. Aceita o host, <code>/api/facial</code> ou <code>/events</code>.
              </p>
            </div>

            <div>
              <label class="text-xs font-bold text-slate-500 uppercase">Secret compartilhado (Bearer)</label>
              <input
                type="password"
                readonly
                [placeholder]="
                  loaded?.has_events_secret
                    ? '•••••••• (deixe vazio para manter)'
                    : 'Defina FACIAL_GATEWAY_EVENTS_SECRET no .env'
                "
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
              />
              <p class="text-xs text-slate-400 mt-1">
                Mesmo valor do Gateway. Neste servidor o secret fica no <code>.env</code> (não na UI).
              </p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="text-xs font-bold text-slate-500 uppercase">IP de origem (Gateway)</label>
                <input
                  type="text"
                  [(ngModel)]="form.peer_origin_ip"
                  name="peer_origin_ip"
                  placeholder="IP público de saída / NAT"
                  class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label class="text-xs font-bold text-slate-500 uppercase">IP de destino (Credenciamento)</label>
                <input
                  type="text"
                  [(ngModel)]="form.peer_destination_ip"
                  name="peer_destination_ip"
                  placeholder="IP público do Credenciamento"
                  class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <p class="text-xs text-slate-400">
              A comunicação HTTP poll fica restrita a estes dois IPs. Origem é o que o Nginx vê;
              destino é o IP público deste host. Os valores devem ser idênticos aos do Gateway
              (e ao <code>.env</code> em produção).
            </p>

            <details class="rounded-xl border border-[var(--app-border)] px-3 py-2">
              <summary class="cursor-pointer text-sm font-medium text-slate-700">
                Service Bus (opcional / Azure)
              </summary>
              <div class="grid gap-3 mt-3 pb-1">
                <p class="text-xs text-slate-400">
                  Preencha as duas connection strings para sair do HTTP poll. Deixe vazio para manter o valor atual.
                </p>
                <div>
                  <label class="text-xs font-bold text-slate-500 uppercase">Connection string de comandos</label>
                  <input
                    type="password"
                    [(ngModel)]="form.commands_connection_string"
                    name="commands_connection_string"
                    autocomplete="new-password"
                    [placeholder]="
                      loaded?.has_commands_connection_string
                        ? '•••••••• (mantém o atual se vazio)'
                        : 'Opcional'
                    "
                    class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-500 uppercase">Fila de comandos</label>
                  <input
                    type="text"
                    [(ngModel)]="form.commands_queue"
                    name="commands_queue"
                    class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-500 uppercase">Connection string de status</label>
                  <input
                    type="password"
                    [(ngModel)]="form.status_connection_string"
                    name="status_connection_string"
                    autocomplete="new-password"
                    [placeholder]="
                      loaded?.has_status_connection_string
                        ? '•••••••• (mantém o atual se vazio)'
                        : 'Opcional'
                    "
                    class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-500 uppercase">Fila de status</label>
                  <input
                    type="text"
                    [(ngModel)]="form.status_queue"
                    name="status_queue"
                    class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2"
                  />
                </div>
                <label class="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" [(ngModel)]="form.clear_azure" name="clear_azure" />
                  Limpar connection strings Azure (voltar ao HTTP poll)
                </label>
              </div>
            </details>

            <p *ngIf="loaded?.atualizado_em" class="text-xs text-slate-400">
              Última alteração: {{ loaded?.atualizado_em | date: 'yyyy-MM-dd HH:mm:ss' }}
            </p>
          </div>
        </div>

        <aside class="min-w-0 lg:sticky lg:top-4">
          <ng-container *ngTemplateOutlet="statusPanel"></ng-container>
        </aside>
      </div>

      <div *ngIf="activeTab === 'logs'" class="space-y-5">
        <ng-container *ngTemplateOutlet="statusPanel"></ng-container>

        <div class="card-surface p-4">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div class="flex gap-1 border-b border-[var(--app-border)]">
              <button
                type="button"
                (click)="setLogTab('enrollment')"
                class="px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors"
                [ngClass]="activeLogTab === 'enrollment' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              >
                Enrollment
              </button>
              <button
                type="button"
                (click)="setLogTab('access')"
                class="px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors"
                [ngClass]="activeLogTab === 'access' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              >
                Acesso
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                (click)="toggleLogsAutoRefresh()"
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                [ngClass]="
                  logsAutoRefresh
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                "
                [attr.aria-pressed]="logsAutoRefresh"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  [ngClass]="logsAutoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'"
                  aria-hidden="true"
                ></span>
                {{ logsAutoRefresh ? 'Refresh ativo' : 'Ativar refresh' }}
              </button>
              <span class="text-xs text-slate-400">
                Últimos {{ logLimit }} registros
                <span *ngIf="logsUpdatedAt"> · {{ logsUpdatedAt | date: 'HH:mm:ss' }}</span>
              </span>
            </div>
          </div>

          <div *ngIf="loadingLogs" class="text-sm text-slate-400 py-10 text-center">
            Carregando logs...
          </div>

          <div
            *ngIf="!loadingLogs && activeLogTab === 'enrollment'"
            class="min-h-48 max-h-[min(40rem,calc(100vh-16rem))] overflow-y-auto"
          >
            <p *ngIf="enrollmentLogs.length === 0" class="text-sm text-slate-400 py-10 text-center">
              Nenhum log de enrollment.
            </p>
            <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div
                *ngFor="let log of enrollmentLogs; trackBy: trackEnrollmentLog"
                class="rounded-lg border px-3 py-2.5 text-sm"
                [ngClass]="enrollmentCardClass(log)"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="font-medium text-slate-700 truncate">
                    {{ enrollmentLogTitle(log) }}
                  </span>
                  <span
                    *ngIf="log.overallStatus"
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                    [ngClass]="enrollmentStatusClass(log.overallStatus)"
                  >
                    {{ log.overallStatus }}
                  </span>
                </div>
                <p class="text-slate-500 mt-1 text-xs">
                  {{ log.criado_em | date: 'dd/MM/yyyy HH:mm:ss' }}
                </p>
                <p class="text-slate-500 mt-0.5 text-xs flex flex-wrap items-center gap-x-1">
                  <span *ngIf="log.command">{{ log.command }}</span>
                  <span *ngIf="log.command && log.direction">·</span>
                  <span *ngIf="log.direction">{{ log.direction }}</span>
                  <span *ngIf="log.correlation_id" class="inline-flex items-center gap-1 min-w-0">
                    <span>·</span>
                    <button
                      type="button"
                      class="font-mono text-[11px] text-slate-500 hover:text-slate-800 truncate max-w-[11rem]"
                      [title]="'Copiar ' + log.correlation_id"
                      (click)="copyCorrelationId(log.correlation_id)"
                    >
                      {{ log.correlation_id }}
                    </button>
                    <span
                      *ngIf="copiedCorrelationId === log.correlation_id"
                      class="text-[10px] text-emerald-600"
                    >
                      copiado
                    </span>
                  </span>
                </p>
                <div *ngIf="isSyncTestLog(log) && log.checks?.length" class="mt-2 space-y-1">
                  <p
                    *ngFor="let check of log.checks"
                    class="text-xs break-words"
                    [ngClass]="
                      !check.ok
                        ? 'text-rose-700'
                        : check.warning
                          ? 'text-amber-700'
                          : 'text-slate-600'
                    "
                  >
                    {{ !check.ok ? '✕' : check.warning ? '!' : '✓' }}
                    {{ check.label }}
                  </p>
                </div>
                <ng-container *ngIf="!isSyncTestLog(log) && isProblemLog(log)">
                  <div *ngIf="hasDeviceDetails(log); else enrollmentPlainError" class="mt-2 space-y-1.5">
                    <div
                      *ngFor="let device of log.devices"
                      class="rounded-md border px-2 py-1.5"
                      [ngClass]="device.error || isFailedStatus(device.status) ? 'border-rose-100 bg-white/80' : 'border-slate-100 bg-white/60'"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <span class="text-xs font-medium text-slate-700 break-words">{{ device.deviceId }}</span>
                        <span
                          *ngIf="device.status"
                          class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          [ngClass]="enrollmentStatusClass(device.status)"
                        >
                          {{ device.status }}
                        </span>
                      </div>
                      <p *ngIf="device.error" class="text-xs text-rose-700 mt-0.5 break-words whitespace-pre-wrap">
                        {{ device.error }}
                      </p>
                    </div>
                  </div>
                  <ng-template #enrollmentPlainError>
                    <p class="text-rose-700 mt-2 text-xs font-medium break-words whitespace-pre-wrap">
                      {{ log.error || 'Falha no enrollment sem detalhe do Gateway.' }}
                    </p>
                  </ng-template>
                </ng-container>
              </div>
            </div>
          </div>

          <div
            *ngIf="!loadingLogs && activeLogTab === 'access'"
            class="min-h-48 max-h-[min(40rem,calc(100vh-16rem))] overflow-y-auto"
          >
            <p *ngIf="accessLogs.length === 0" class="text-sm text-slate-400 py-10 text-center">
              Nenhum log de acesso.
            </p>
            <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div
                *ngFor="let log of accessLogs; trackBy: trackAccessLog"
                class="rounded-lg border border-[var(--app-border)] px-3 py-2.5 text-sm"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="font-medium text-slate-700 truncate">
                    {{ log.user_id }}
                  </span>
                  <span
                    *ngIf="log.blocked"
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-800"
                  >
                    Bloqueado
                  </span>
                </div>
                <p class="text-slate-500 mt-1 text-xs">
                  {{ log.criado_em | date: 'dd/MM/yyyy HH:mm:ss' }}
                </p>
                <p class="text-slate-500 mt-0.5 text-xs">
                  <span *ngIf="log.device_id">Device: {{ log.device_id }}</span>
                  <span *ngIf="log.method"> · {{ log.method }}</span>
                  <span *ngIf="log.status"> · {{ log.status }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #statusPanel>
      <div class="card-surface p-4 space-y-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-bold text-slate-500 uppercase">Status operacional</h3>
          <span class="inline-flex items-center gap-1.5 text-[10px] text-slate-400 tabular-nums">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
            {{ statusUpdatedAt ? (statusUpdatedAt | date: 'HH:mm:ss') : 'atualiza a cada 5s' }}
          </span>
        </div>

        <div *ngIf="loadingStatus && !status" class="text-sm text-slate-400 py-4 text-center">
          Carregando status...
        </div>

        <ng-container *ngIf="status">
          <div class="flex flex-wrap gap-2">
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              [ngClass]="status.integration.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'"
            >
              {{ status.integration.enabled ? 'Integração ativa' : 'Integração inativa' }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              [ngClass]="status.integration.configComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
            >
              {{ status.integration.configComplete ? 'Configuração completa' : 'Configuração incompleta' }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              [ngClass]="transportBadgeClass"
            >
              {{ transportLabel }}
            </span>
          </div>

          <div
            class="grid gap-4"
            [ngClass]="activeTab === 'logs' ? 'md:grid-cols-2' : ''"
          >
            <div>
              <p class="text-xs font-bold text-slate-500 uppercase mb-2">Enrollment</p>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-lg bg-emerald-50 px-2 py-2">
                  <p class="text-lg font-bold text-emerald-700">{{ status.enrollment.synced }}</p>
                  <p class="text-[10px] uppercase text-emerald-600">Synced</p>
                </div>
                <div class="rounded-lg bg-amber-50 px-2 py-2">
                  <p class="text-lg font-bold text-amber-700">{{ status.enrollment.pending }}</p>
                  <p class="text-[10px] uppercase text-amber-600">Pending</p>
                </div>
                <div class="rounded-lg bg-rose-50 px-2 py-2">
                  <p class="text-lg font-bold text-rose-700">{{ status.enrollment.failed }}</p>
                  <p class="text-[10px] uppercase text-rose-600">Failed</p>
                </div>
              </div>
              <p *ngIf="status.enrollment.lastActivityAt" class="text-xs text-slate-400 mt-2">
                Última atividade: {{ status.enrollment.lastActivityAt | date: 'dd/MM/yyyy HH:mm' }}
              </p>
            </div>

            <div [class.border-t]="activeTab === 'config'" [class.md:border-t-0]="activeTab === 'logs'" class="border-[var(--app-border)] pt-3 md:pt-0">
              <p class="text-xs font-bold text-slate-500 uppercase mb-2">Acesso (24h)</p>
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">Total</span>
                <span class="font-medium">{{ status.access.total24h }}</span>
              </div>
              <div class="flex justify-between text-sm mt-1">
                <span class="text-slate-600">Bloqueados</span>
                <span class="font-medium text-rose-600">{{ status.access.blocked24h }}</span>
              </div>
              <p *ngIf="status.access.lastEventAt" class="text-xs text-slate-400 mt-2">
                Último evento: {{ status.access.lastEventAt | date: 'dd/MM/yyyy HH:mm' }}
                <span *ngIf="status.access.lastDeviceId"> · {{ status.access.lastDeviceId }}</span>
              </p>
            </div>
          </div>
        </ng-container>
      </div>
    </ng-template>
  `,
})
export class FacialSettingsComponent implements SettingsReloadable, OnDestroy {
  private readonly facialGateway = inject(FacialGatewayService);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: FacialPageTab = 'config';
  loaded: FacialGatewaySettings | null = null;
  status: FacialIntegrationStatus | null = null;
  saving = false;
  testingSync = false;
  forcingSync = false;
  loadingStatus = false;
  statusUpdatedAt: Date | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private statusInFlight = false;
  private logsLoading: Record<FacialLogTab, boolean> = { enrollment: false, access: false };
  private logsInFlight: Record<FacialLogTab, boolean> = { enrollment: false, access: false };
  activeLogTab: FacialLogTab = 'enrollment';
  enrollmentLogs: FacialEnrollmentLogItem[] = [];
  accessLogs: FacialAccessLogItem[] = [];
  logsAutoRefresh = false;
  logsUpdatedAt: Date | null = null;
  private logsTimer: ReturnType<typeof setInterval> | null = null;
  copiedCorrelationId: string | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  readonly logLimit = 24;

  get loadingLogs(): boolean {
    return this.logsLoading[this.activeLogTab];
  }

  form = {
    enabled: false,
    peer_origin_ip: '',
    peer_destination_ip: '',
    commands_connection_string: '',
    commands_queue: 'facial-commands',
    status_connection_string: '',
    status_queue: 'facial-enrollment-status',
    clear_azure: false,
  };

  get facialBaseUrlHint(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/facial`;
  }

  get facialEventsUrlHint(): string {
    return `${this.facialBaseUrlHint}/events`;
  }

  get transportHint(): string {
    const t = this.status?.integration?.transport || this.loaded?.transport || 'http_poll';
    return t === 'service_bus'
      ? 'Azure Service Bus'
      : 'HTTP poll (Gateway busca jobs)';
  }

  get transportLabel(): string {
    const t = this.status?.integration?.transport || this.loaded?.transport || 'http_poll';
    return t === 'service_bus' ? 'Service Bus' : 'HTTP poll';
  }

  get transportBadgeClass(): string {
    const t = this.status?.integration?.transport || this.loaded?.transport || 'http_poll';
    return t === 'service_bus' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800';
  }

  constructor() {
    this.reloadPage();
    this.startStatusRefresh();
  }

  ngOnDestroy(): void {
    this.stopStatusRefresh();
    this.stopLogsRefresh();
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  reloadPage() {
    this.facialGateway.getSettings().subscribe({
      next: (res) => {
        this.loaded = res.settings;
        this.form.enabled = res.settings.enabled;
        this.form.peer_origin_ip = res.settings.peer_origin_ip || '';
        this.form.peer_destination_ip = res.settings.peer_destination_ip || '';
        this.form.commands_queue = res.settings.commands_queue || 'facial-commands';
        this.form.status_queue = res.settings.status_queue || 'facial-enrollment-status';
        this.form.commands_connection_string = '';
        this.form.status_connection_string = '';
        this.form.clear_azure = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar integração facial.');
        this.cdr.markForCheck();
      },
    });
    this.loadStatus();
    if (this.activeTab === 'logs') {
      this.loadLogs('enrollment');
      this.loadLogs('access');
    }
  }

  setPageTab(tab: FacialPageTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'logs') {
      this.loadLogs('enrollment');
      this.loadLogs('access');
      if (this.logsAutoRefresh) this.startLogsRefresh();
    } else {
      this.stopLogsRefresh();
    }
    this.cdr.markForCheck();
  }

  toggleLogsAutoRefresh() {
    this.logsAutoRefresh = !this.logsAutoRefresh;
    if (this.logsAutoRefresh) {
      this.startLogsRefresh();
      this.loadLogs('enrollment', true);
      this.loadLogs('access', true);
    } else {
      this.stopLogsRefresh();
    }
    this.cdr.markForCheck();
  }

  trackEnrollmentLog(_index: number, log: FacialEnrollmentLogItem): number {
    return log.id;
  }

  trackAccessLog(_index: number, log: FacialAccessLogItem): number {
    return log.id;
  }

  refreshPanel() {
    this.loadStatus();
    this.loadLogs('enrollment');
    this.loadLogs('access');
  }

  setLogTab(tab: FacialLogTab) {
    if (this.activeLogTab === tab) return;
    this.activeLogTab = tab;
    if (tab === 'enrollment' && this.enrollmentLogs.length === 0) {
      this.loadLogs('enrollment');
    } else if (tab === 'access' && this.accessLogs.length === 0) {
      this.loadLogs('access');
    }
    this.cdr.markForCheck();
  }

  enrollmentStatusClass(status: string): Record<string, boolean> {
    const s = (status || '').toLowerCase();
    return {
      'bg-emerald-100 text-emerald-800':
        s === 'synced' || s === 'success' || s === 'completed' || s === 'ok',
      'bg-amber-100 text-amber-800': s === 'pending' || s === 'partial' || s === 'warning',
      'bg-rose-100 text-rose-800': s === 'failed' || s === 'error' || s === 'revoked',
    };
  }

  enrollmentLogTitle(log: FacialEnrollmentLogItem): string {
    if (this.isSyncTestLog(log)) return 'Teste de sync';
    if (log.collaborator_name) return log.collaborator_name;
    if (log.id_collaborator) return `Colaborador #${log.id_collaborator}`;
    return '—';
  }

  isSyncTestLog(log: FacialEnrollmentLogItem): boolean {
    const t = (log.type || log.command || '').toLowerCase();
    return t === 'sync_test' || t === 'sync-test';
  }

  enrollmentCardClass(log: FacialEnrollmentLogItem): Record<string, boolean> {
    return {
      'border-[var(--app-border)]': !this.isProblemLog(log),
      'border-rose-200 bg-rose-50/50': this.isProblemLog(log),
    };
  }

  isFailedStatus(status?: string | null): boolean {
    const s = (status || '').toLowerCase();
    return s === 'failed' || s === 'error';
  }

  isProblemLog(log: FacialEnrollmentLogItem): boolean {
    if (this.isSyncTestLog(log)) {
      const status = (log.overallStatus || '').toLowerCase();
      return status === 'failed' || status === 'error' || status === 'warning' || status === 'partial';
    }
    const status = (log.overallStatus || '').toLowerCase();
    return (
      status === 'failed' ||
      status === 'error' ||
      status === 'partial' ||
      !!log.error ||
      (log.devices || []).some((device) => !!device.error || this.isFailedStatus(device.status))
    );
  }

  hasDeviceDetails(log: FacialEnrollmentLogItem): boolean {
    return (log.devices || []).length > 0;
  }

  async copyCorrelationId(id?: string | null): Promise<void> {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.copiedCorrelationId = id;
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copiedCorrelationId = null;
        this.cdr.markForCheck();
      }, 1600);
      this.cdr.markForCheck();
    } catch {
      this.notification.warning('Não foi possível copiar o ID de correlação.');
    }
  }

  private startStatusRefresh(): void {
    this.stopStatusRefresh();
    this.statusTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.loadStatus(true);
    }, STATUS_REFRESH_MS);
  }

  private stopStatusRefresh(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  private startLogsRefresh(): void {
    this.stopLogsRefresh();
    this.logsTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (this.activeTab !== 'logs') return;
      this.loadLogs('enrollment', true);
      this.loadLogs('access', true);
    }, LOGS_REFRESH_MS);
  }

  private stopLogsRefresh(): void {
    if (this.logsTimer) {
      clearInterval(this.logsTimer);
      this.logsTimer = null;
    }
  }

  private loadStatus(silent = false) {
    if (this.statusInFlight) return;
    this.statusInFlight = true;
    if (!silent || !this.status) {
      this.loadingStatus = true;
    }
    this.facialGateway.getStatus().subscribe({
      next: (res) => {
        this.status = res.status;
        this.statusUpdatedAt = new Date();
        this.loadingStatus = false;
        this.statusInFlight = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingStatus = false;
        this.statusInFlight = false;
        if (!silent) {
          this.notification.notifyHttpError(err, 'Falha ao carregar status da integração facial.');
        }
        this.cdr.markForCheck();
      },
    });
  }

  private loadLogs(type: FacialLogTab, silent = false) {
    if (this.logsInFlight[type]) return;
    this.logsInFlight[type] = true;
    const hasItems = type === 'enrollment' ? this.enrollmentLogs.length > 0 : this.accessLogs.length > 0;
    if (!silent || !hasItems) {
      this.logsLoading[type] = true;
    }
    this.facialGateway.getLogs({ type, page: 1, limit: this.logLimit }).subscribe({
      next: (res) => {
        if (type === 'enrollment') {
          this.enrollmentLogs = res.logs as FacialEnrollmentLogItem[];
        } else {
          this.accessLogs = res.logs as FacialAccessLogItem[];
        }
        this.logsUpdatedAt = new Date();
        this.logsLoading[type] = false;
        this.logsInFlight[type] = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logsLoading[type] = false;
        this.logsInFlight[type] = false;
        if (!silent) {
          this.notification.notifyHttpError(err, 'Falha ao carregar logs da integração facial.');
        }
        this.cdr.markForCheck();
      },
    });
  }

  salvar() {
    if (this.form.enabled && !this.loaded?.has_events_secret) {
      this.notification.warning(
        'Secret ausente',
        'Defina FACIAL_GATEWAY_EVENTS_SECRET no .env do backend (mínimo 32 caracteres) e reinicie o processo.',
      );
      return;
    }

    this.saving = true;
    const payload: Partial<FacialGatewaySettings> = {
      enabled: this.form.enabled,
      commands_queue: this.form.commands_queue.trim() || 'facial-commands',
      status_queue: this.form.status_queue.trim() || 'facial-enrollment-status',
      peer_origin_ip: this.form.peer_origin_ip.trim(),
      peer_destination_ip: this.form.peer_destination_ip.trim(),
    };
    if (this.form.clear_azure) {
      payload.commands_connection_string = '';
      payload.status_connection_string = '';
    } else {
      if (this.form.commands_connection_string.trim()) {
        payload.commands_connection_string = this.form.commands_connection_string.trim();
      }
      if (this.form.status_connection_string.trim()) {
        payload.status_connection_string = this.form.status_connection_string.trim();
      }
    }

    this.facialGateway.updateSettings(payload).subscribe({
      next: (res) => {
        this.loaded = res.settings;
        this.form.commands_connection_string = '';
        this.form.status_connection_string = '';
        this.form.clear_azure = false;
        this.form.peer_origin_ip = res.settings.peer_origin_ip || '';
        this.form.peer_destination_ip = res.settings.peer_destination_ip || '';
        this.form.commands_queue = res.settings.commands_queue || 'facial-commands';
        this.form.status_queue = res.settings.status_queue || 'facial-enrollment-status';
        this.saving = false;
        this.notification.success('Configuração facial salva.');
        this.loadStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar integração facial.');
        this.cdr.markForCheck();
      },
    });
  }

  testarSync() {
    this.testingSync = true;
    this.facialGateway.testSync().subscribe({
      next: (res) => {
        this.testingSync = false;
        this.loadLogs('enrollment', true);
        this.cdr.markForCheck();
        void this.showTestSyncResult(res);
      },
      error: (err) => {
        this.testingSync = false;
        this.notification.notifyHttpError(err, 'Falha ao testar o sync facial.');
        this.cdr.markForCheck();
      },
    });
  }

  forcarSync() {
    void Swal.fire({
      title: 'Forçar sincronização facial?',
      html: '<p class="text-sm text-slate-600 text-left">Reenvia o enroll de todos os colaboradores ativos com foto (exceto blocklist) para o Gateway. Jobs já na fila do mesmo colaborador serão substituídos.</p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Forçar sync',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1d54e6',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.forcingSync = true;
      this.cdr.markForCheck();
      this.facialGateway.forceSync().subscribe({
        next: (res) => {
          this.forcingSync = false;
          this.loadStatus();
          this.cdr.markForCheck();
          void this.showForceSyncResult(res);
        },
        error: (err) => {
          this.forcingSync = false;
          const already = err?.status === 409 || err?.error?.alreadyRunning;
          if (already) {
            this.notification.warning('Sincronização já em andamento. Aguarde a conclusão.');
          } else {
            this.notification.notifyHttpError(err, 'Falha ao forçar o sync facial.');
          }
          this.cdr.markForCheck();
        },
      });
    });
  }

  private showTestSyncResult(res: FacialSyncTestResult) {
    const rows = (res.checks || [])
      .map((check) => {
        const color = !check.ok ? '#e11d48' : check.warning ? '#d97706' : '#059669';
        const mark = !check.ok ? '✕' : check.warning ? '!' : '✓';
        return `<li style="display:flex;gap:8px;align-items:flex-start;margin:0 0 8px;font-size:14px;line-height:1.4;color:#334155;text-align:left">
          <span style="color:${color};font-weight:700;min-width:1rem">${mark}</span>
          <span>${this.escapeHtml(check.label)}</span>
        </li>`;
      })
      .join('');

    const icon = !res.ok ? 'error' : res.warningCount > 0 ? 'warning' : 'success';
    const title = !res.ok
      ? 'Sync com problemas'
      : res.warningCount > 0
        ? 'Sync com avisos'
        : 'Sync ok';

    return Swal.fire({
      icon,
      title,
      html: `<ul style="margin:0;padding:0;list-style:none;text-align:left">${rows}</ul>`,
      confirmButtonText: 'Fechar',
      confirmButtonColor: '#1d54e6',
    });
  }

  private showForceSyncResult(res: FacialForceSyncResult) {
    const errorLines = (res.errors || [])
      .slice(0, 8)
      .map(
        (item) =>
          `<li style="margin:0 0 4px;font-size:13px;color:#be123c;text-align:left">${this.escapeHtml(
            item.name || `#${item.id_collaborator}`,
          )}: ${this.escapeHtml(item.error)}</li>`,
      )
      .join('');

    const html = `
      <p style="margin:0 0 10px;font-size:14px;color:#475569;text-align:left">
        ${res.eligible} colaborador(es) elegível(eis) ·
        ${res.queued} na fila ·
        ${res.sent} enviado(s) ·
        ${res.skipped} ignorado(s) ·
        ${res.failed} falha(s)
      </p>
      ${errorLines ? `<ul style="margin:0;padding-left:18px;max-height:180px;overflow:auto">${errorLines}</ul>` : ''}
    `;

    return Swal.fire({
      icon: res.ok ? 'success' : 'warning',
      title: res.ok ? 'Sync forçado' : 'Sync forçado com falhas',
      html,
      confirmButtonText: 'Fechar',
      confirmButtonColor: '#1d54e6',
    });
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
