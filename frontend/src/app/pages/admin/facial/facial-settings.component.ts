import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FacialAccessLogItem,
  FacialDevice,
  FacialDeviceInput,
  FacialEnrollmentLogItem,
  FacialForceSyncResult,
  FacialGatewayService,
  FacialIntegrationStatus,
  FacialSyncTestResult,
} from '../../../services/facial-gateway.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';
import {
  ActionBtnComponent,
  ActionDropdownComponent,
  ActionDropdownItemDirective,
  ActionMenuComponent,
} from '../../../shared/actions';
import { ModalComponent } from '../../../shared/modal/modal.component';
import Swal from 'sweetalert2';

type FacialPageTab = 'config' | 'logs';
type FacialLogTab = 'enrollment' | 'access';

const STATUS_REFRESH_MS = 5000;
const LOGS_REFRESH_MS = 5000;

@Component({
  selector: 'app-facial-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionMenuComponent,
    ActionBtnComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ModalComponent,
  ],
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
            A face é gravada e lida direto nos terminais Dahua ativos, pelo IP da VPN.
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
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold text-slate-800">Terminais Dahua</h3>
                <p class="text-xs text-slate-500 mt-1">
                  Aparelho ativo recebe a face e a leitura das passagens.
                </p>
              </div>
              <button type="button" class="btn-action-primary shrink-0" (click)="abrirDevice()">
                Adicionar aparelho
              </button>
            </div>

            <div *ngIf="devices.length === 0" class="text-sm text-slate-400">
              Nenhum terminal cadastrado. Sem aparelho ativo, a face não é enviada.
            </div>

            <div *ngIf="devices.length > 0" class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase text-slate-500">
                    <th class="py-2 pr-3 font-medium">Aparelho</th>
                    <th class="py-2 pr-3 font-medium">Host</th>
                    <th class="py-2 pr-3 font-medium">Estado</th>
                    <th class="py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let device of devices" class="border-t border-[var(--app-border)]">
                    <td class="py-2 pr-3">
                      <div class="font-medium text-slate-800">{{ device.name }}</div>
                      <div class="font-mono text-xs text-slate-500">{{ device.device_key }}</div>
                    </td>
                    <td class="py-2 pr-3 font-mono text-xs text-slate-700">
                      {{ device.host }}:{{ device.port }}
                      <div class="text-slate-400">{{ device.username }}</div>
                    </td>
                    <td class="py-2 pr-3">
                      <span
                        class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                        [ngClass]="device.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'"
                      >
                        {{ device.enabled ? 'Ativo' : 'Inativo' }}
                      </span>
                    </td>
                    <td class="py-2 text-right">
                      <div class="inline-flex justify-end">
                        <app-action-menu>
                          <app-action-btn
                            icon="edit"
                            title="Editar"
                            variant="neutral"
                            (action)="editarDevice(device)"
                          />
                          <app-action-dropdown>
                            <button
                              appActionDropdownItem
                              type="button"
                              (click)="testarDevice(device)"
                              [disabled]="testingDeviceId === device.public_id"
                            >
                              <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <path d="M22 4 12 14.01l-3-3" />
                              </svg>
                              {{ testingDeviceId === device.public_id ? 'Testando...' : 'Testar conexão' }}
                            </button>
                            <hr class="action-dropdown__divider" />
                            <button
                              appActionDropdownItem
                              type="button"
                              [danger]="true"
                              (click)="excluirDevice(device)"
                            >
                              <svg class="action-dropdown__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                              Excluir
                            </button>
                          </app-action-dropdown>
                        </app-action-menu>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
                Cadastros nos terminais
              </button>
              <button
                type="button"
                (click)="setLogTab('access')"
                class="px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors"
                [ngClass]="activeLogTab === 'access' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              >
                Passagens
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
              Nenhum cadastro enviado aos terminais.
            </p>
            <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div
                *ngFor="let log of enrollmentLogs; trackBy: trackEnrollmentLog"
                class="rounded-lg border px-3 py-2.5 text-sm"
                [ngClass]="enrollmentCardClass(log)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium text-slate-700 truncate">{{ enrollmentLogTitle(log) }}</p>
                    <p class="text-xs text-slate-500 mt-0.5">{{ enrollmentSubtitle(log) }}</p>
                  </div>
                  <span
                    *ngIf="log.overallStatus"
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                    [ngClass]="enrollmentStatusClass(log.overallStatus)"
                  >
                    {{ enrollmentStatusLabel(log.overallStatus, log.action) }}
                  </span>
                </div>
                <p class="text-slate-500 mt-1 text-xs flex flex-wrap items-center gap-x-1">
                  <span>{{ log.criado_em | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
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
                <div *ngIf="!isSyncTestLog(log) && hasDeviceDetails(log)" class="mt-2 space-y-1.5">
                  <div
                    *ngFor="let device of log.devices"
                    class="rounded-md border px-2 py-1.5"
                    [ngClass]="device.error || isFailedStatus(device.status) ? 'border-rose-100 bg-white/80' : 'border-slate-100 bg-white/60'"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <span class="min-w-0 text-xs text-slate-700 break-words">
                        <span class="font-medium">{{ device.deviceName || device.deviceId }}</span>
                        <span *ngIf="device.deviceName" class="font-mono text-slate-400"> {{ device.deviceId }}</span>
                      </span>
                      <span
                        *ngIf="device.status"
                        class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                        [ngClass]="enrollmentStatusClass(device.status)"
                      >
                        {{ enrollmentStatusLabel(device.status, log.action) }}
                      </span>
                    </div>
                    <p *ngIf="device.error" class="text-xs text-rose-700 mt-0.5 break-words whitespace-pre-wrap">
                      {{ device.error }}
                    </p>
                  </div>
                </div>
                <p
                  *ngIf="!isSyncTestLog(log) && !hasDeviceDetails(log) && log.error"
                  class="text-rose-700 mt-2 text-xs font-medium break-words whitespace-pre-wrap"
                >
                  {{ log.error }}
                </p>
                <p *ngIf="log.stage === 'skipped'" class="text-slate-500 mt-2 text-xs">
                  Nenhum terminal ativo. A face não foi enviada.
                </p>
              </div>
            </div>
          </div>

          <div
            *ngIf="!loadingLogs && activeLogTab === 'access'"
            class="min-h-48 max-h-[min(40rem,calc(100vh-16rem))] overflow-y-auto"
          >
            <p *ngIf="accessLogs.length === 0" class="text-sm text-slate-400 py-10 text-center">
              Nenhuma passagem lida dos terminais.
            </p>
            <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div
                *ngFor="let log of accessLogs; trackBy: trackAccessLog"
                class="rounded-lg border px-3 py-2.5 text-sm"
                [ngClass]="log.blocked ? 'border-rose-200 bg-rose-50/50' : 'border-[var(--app-border)]'"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="font-medium text-slate-700 truncate">
                    {{ accessLogTitle(log) }}
                  </span>
                  <span
                    *ngIf="log.direction"
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                    [ngClass]="log.direction === 'entrada' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'"
                  >
                    {{ log.direction === 'entrada' ? 'Entrada' : 'Saída' }}
                  </span>
                </div>
                <p class="text-slate-500 mt-1 text-xs">
                  {{ (log.event_time || log.criado_em) | date: 'dd/MM/yyyy HH:mm:ss' }}
                </p>
                <p class="text-slate-500 mt-0.5 text-xs">
                  {{ log.device_name || log.device_id }}
                  <span *ngIf="accessReadLabel(log)"> · {{ accessReadLabel(log) }}</span>
                </p>
                <p *ngIf="accessGateLabel(log)" class="mt-1.5 text-xs font-medium break-words" [ngClass]="accessGateClass(log)">
                  {{ accessGateLabel(log) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="deviceModalOpen"
      [title]="deviceForm.public_id ? 'Editar aparelho' : 'Novo aparelho'"
      subtitle="Use o IP que a VPN deixa alcançável neste servidor. A senha fica cifrada e não volta na tela."
      size="md"
      (close)="fecharDeviceModal()"
    >
      <form id="facial-device-form" class="grid gap-3 md:grid-cols-2" (ngSubmit)="salvarDevice()">
        <div>
          <label class="form-label" for="device_key">Identificador</label>
          <input id="device_key" class="form-field font-mono" name="device_key" [(ngModel)]="deviceForm.device_key" placeholder="entrada-01" required />
        </div>
        <div>
          <label class="form-label" for="device_name">Nome</label>
          <input id="device_name" class="form-field" name="device_name" [(ngModel)]="deviceForm.name" placeholder="Entrada 01" required />
        </div>
        <div>
          <label class="form-label" for="device_host">IP da VPN</label>
          <input id="device_host" class="form-field font-mono" name="device_host" [(ngModel)]="deviceForm.host" placeholder="10.8.0.21" required />
        </div>
        <div>
          <label class="form-label" for="device_port">Porta</label>
          <input id="device_port" class="form-field" type="number" name="device_port" [(ngModel)]="deviceForm.port" min="1" max="65535" required />
        </div>
        <div>
          <label class="form-label" for="device_username">Usuário</label>
          <input id="device_username" class="form-field" name="device_username" [(ngModel)]="deviceForm.username" autocomplete="off" required />
        </div>
        <div>
          <label class="form-label" for="device_password">
            Senha
            <span *ngIf="deviceForm.public_id" class="form-label__optional">(opcional)</span>
          </label>
          <input
            id="device_password"
            class="form-field"
            type="password"
            name="device_password"
            [(ngModel)]="deviceForm.password"
            autocomplete="new-password"
            [placeholder]="deviceForm.public_id ? 'Vazio mantém a senha atual' : ''"
            [required]="!deviceForm.public_id"
          />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
          <input type="checkbox" name="device_enabled" [(ngModel)]="deviceForm.enabled" />
          Aparelho ativo
        </label>
      </form>
      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharDeviceModal()" [disabled]="savingDevice">
          Cancelar
        </button>
        <button type="submit" form="facial-device-form" class="btn-action-primary" [disabled]="savingDevice">
          {{ savingDevice ? 'Salvando...' : (deviceForm.public_id ? 'Salvar aparelho' : 'Adicionar aparelho') }}
        </button>
      </div>
    </app-modal>

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
              [ngClass]="hasDirectDevices ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'"
            >
              {{ hasDirectDevices ? 'Terminais ativos' : 'Sem terminal ativo' }}
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
              <p class="text-xs font-bold text-slate-500 uppercase mb-2">Cadastro facial</p>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="rounded-lg bg-emerald-50 px-2 py-2">
                  <p class="text-lg font-bold text-emerald-700">{{ status.enrollment.synced }}</p>
                  <p class="text-[10px] uppercase text-emerald-600">Gravados</p>
                </div>
                <div class="rounded-lg bg-amber-50 px-2 py-2">
                  <p class="text-lg font-bold text-amber-700">{{ status.enrollment.pending }}</p>
                  <p class="text-[10px] uppercase text-amber-600">Pendentes</p>
                </div>
                <div class="rounded-lg bg-rose-50 px-2 py-2">
                  <p class="text-lg font-bold text-rose-700">{{ status.enrollment.failed }}</p>
                  <p class="text-[10px] uppercase text-rose-600">Falhas</p>
                </div>
              </div>
              <p *ngIf="status.enrollment.lastActivityAt" class="text-xs text-slate-400 mt-2">
                Última atividade: {{ status.enrollment.lastActivityAt | date: 'dd/MM/yyyy HH:mm' }}
              </p>
            </div>

            <div [class.border-t]="activeTab === 'config'" [class.md:border-t-0]="activeTab === 'logs'" class="border-[var(--app-border)] pt-3 md:pt-0">
              <p class="text-xs font-bold text-slate-500 uppercase mb-2">Passagens (24h)</p>
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">Total</span>
                <span class="font-medium">{{ status.access.total24h }}</span>
              </div>
              <div class="flex justify-between text-sm mt-1">
                <span class="text-slate-600">Negados</span>
                <span class="font-medium text-rose-600">{{ status.access.blocked24h }}</span>
              </div>
              <p *ngIf="status.access.lastEventAt" class="text-xs text-slate-400 mt-2">
                Última passagem: {{ status.access.lastEventAt | date: 'dd/MM/yyyy HH:mm' }}
                <span *ngIf="status.access.lastDeviceName || status.access.lastDeviceId">
                  · {{ status.access.lastDeviceName || status.access.lastDeviceId }}
                </span>
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
  status: FacialIntegrationStatus | null = null;
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

  devices: FacialDevice[] = [];
  deviceModalOpen = false;
  savingDevice = false;
  testingDeviceId: string | null = null;
  deviceForm: FacialDeviceInput & { public_id: string | null } = this.emptyDeviceForm();

  get loadingLogs(): boolean {
    return this.logsLoading[this.activeLogTab];
  }

  get hasDirectDevices(): boolean {
    return this.devices.some((device) => device.enabled);
  }

  get transportLabel(): string {
    return this.hasDirectDevices ? 'Dahua direto' : 'Sem terminal';
  }

  get transportBadgeClass(): string {
    return this.hasDirectDevices ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600';
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
    this.loadStatus();
    this.loadDevices();
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
      'bg-rose-100 text-rose-800': s === 'failed' || s === 'error',
      'bg-slate-100 text-slate-600': s === 'revoked' || s === 'skipped',
    };
  }

  enrollmentStatusLabel(status: string | null | undefined, action?: string | null): string {
    const s = (status || '').toLowerCase();
    if (s === 'synced' || s === 'success' || s === 'completed') {
      return action === 'revoke' ? 'Removido' : 'Gravado';
    }
    const labels: Record<string, string> = {
      pending: 'Pendente',
      partial: 'Parcial',
      failed: 'Falhou',
      error: 'Falhou',
      revoked: 'Removido',
      skipped: 'Ignorado',
      ok: 'OK',
      warning: 'Atenção',
    };
    return labels[s] || status || '';
  }

  enrollmentLogTitle(log: FacialEnrollmentLogItem): string {
    if (this.isSyncTestLog(log)) return 'Teste de sync';
    if (log.collaborator_name) return log.collaborator_name;
    if (log.id_collaborator) return `Colaborador #${log.id_collaborator}`;
    return '—';
  }

  enrollmentSubtitle(log: FacialEnrollmentLogItem): string {
    if (this.isSyncTestLog(log)) return 'Teste de conexão com os terminais';
    const action = log.action === 'revoke' ? 'Remoção' : log.action === 'enroll' ? 'Cadastro' : '';
    const stageLabels: Record<string, string> = {
      queued: 'Na fila',
      result: 'Resultado dos terminais',
      skipped: 'Ignorado',
    };
    const stage = log.stage ? stageLabels[log.stage] || '' : '';
    return [action, stage].filter(Boolean).join(' · ');
  }

  accessLogTitle(log: FacialAccessLogItem): string {
    if (log.collaborator_name) return log.collaborator_name;
    if (log.id_collaborator) return `Colaborador #${log.id_collaborator}`;
    return `Usuário ${log.user_id}`;
  }

  accessReadLabel(log: FacialAccessLogItem): string {
    return [log.method_label, log.status_label].filter(Boolean).join(' · ');
  }

  accessGateLabel(log: FacialAccessLogItem): string | null {
    const gate = log.gate;
    if (!gate) return log.blocked ? 'Negado no terminal' : null;
    if (gate.applied) {
      if (gate.action_registered === 'CHECK_IN') return 'Portaria: entrada registrada';
      if (gate.action_registered === 'CHECK_OUT') return 'Portaria: saída registrada';
      return 'Portaria: registrada';
    }
    if (gate.skipped) {
      if (log.blocked) return 'Negado no terminal';
      if (!log.id_collaborator) return 'Portaria não aplicada: colaborador não encontrado';
      if (!log.direction) return 'Portaria não aplicada: terminal sem entrada ou saída no identificador';
      return 'Portaria não aplicada';
    }
    const reason = gate.reason || gate.error_code;
    return reason ? `Portaria não aplicada: ${reason}` : 'Portaria não aplicada';
  }

  accessGateClass(log: FacialAccessLogItem): string {
    if (log.gate?.applied) return 'text-emerald-700';
    if (log.blocked) return 'text-rose-700';
    return 'text-amber-700';
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
      html: '<p class="text-sm text-slate-600 text-left">Reenvia o enroll de todos os colaboradores ativos com foto (exceto blocklist). Com terminal Dahua ativo, a face vai direto ao aparelho. Jobs já na fila do mesmo colaborador serão substituídos.</p>',
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

  private emptyDeviceForm(): FacialDeviceInput & { public_id: string | null } {
    return {
      public_id: null,
      device_key: '',
      name: '',
      host: '',
      port: 80,
      username: '',
      password: '',
      enabled: true,
    };
  }

  private loadDevices() {
    this.facialGateway.listDevices().subscribe({
      next: (res) => {
        this.devices = res.devices || [];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar os terminais Dahua.');
        this.cdr.markForCheck();
      },
    });
  }

  abrirDevice() {
    this.deviceForm = this.emptyDeviceForm();
    this.deviceModalOpen = true;
    this.cdr.markForCheck();
  }

  editarDevice(device: FacialDevice) {
    this.deviceForm = {
      public_id: device.public_id,
      device_key: device.device_key,
      name: device.name,
      host: device.host,
      port: device.port,
      username: device.username,
      password: '',
      enabled: device.enabled,
    };
    this.deviceModalOpen = true;
    this.cdr.markForCheck();
  }

  fecharDeviceModal() {
    if (this.savingDevice) return;
    this.deviceModalOpen = false;
    this.deviceForm = this.emptyDeviceForm();
    this.cdr.markForCheck();
  }

  salvarDevice() {
    const payload: FacialDeviceInput = {
      device_key: this.deviceForm.device_key.trim(),
      name: this.deviceForm.name.trim(),
      host: this.deviceForm.host.trim(),
      port: Number(this.deviceForm.port) || 80,
      username: this.deviceForm.username.trim(),
      enabled: !!this.deviceForm.enabled,
    };
    const password = (this.deviceForm.password || '').trim();
    if (password) payload.password = password;
    if (!this.deviceForm.public_id && !password) {
      this.notification.warning('Informe a senha do terminal.');
      return;
    }

    this.savingDevice = true;
    const request = this.deviceForm.public_id
      ? this.facialGateway.updateDevice(this.deviceForm.public_id, payload)
      : this.facialGateway.createDevice(payload);
    request.subscribe({
      next: () => {
        this.savingDevice = false;
        this.deviceModalOpen = false;
        this.deviceForm = this.emptyDeviceForm();
        this.notification.success('Terminal Dahua salvo.');
        this.loadDevices();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.savingDevice = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar o terminal Dahua.');
        this.cdr.markForCheck();
      },
    });
  }

  testarDevice(device: FacialDevice) {
    if (!device.public_id) {
      this.notification.warning('Aparelho sem identificador. Atualize a página.');
      return;
    }
    this.testingDeviceId = device.public_id;
    this.cdr.markForCheck();
    this.facialGateway.testDevice(device.public_id).subscribe({
      next: (res) => {
        this.testingDeviceId = null;
        this.cdr.markForCheck();
        if (res.ok) {
          this.notification.success(
            'Conexão ok',
            res.deviceType ? `Terminal: ${res.deviceType}` : device.name,
          );
        } else {
          this.notification.warning('Terminal não respondeu', res.error || device.host);
        }
      },
      error: (err) => {
        this.testingDeviceId = null;
        this.notification.notifyHttpError(err, 'Falha ao testar o terminal.');
        this.cdr.markForCheck();
      },
    });
  }

  excluirDevice(device: FacialDevice) {
    if (!device.public_id) {
      this.notification.warning('Aparelho sem identificador. Atualize a página.');
      return;
    }
    void Swal.fire({
      title: 'Excluir terminal?',
      html: `<p class="text-sm text-slate-600 text-left">O aparelho <strong>${this.escapeHtml(device.name)}</strong> deixa de receber faces. A VPN em si não é alterada.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e11d48',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.facialGateway.deleteDevice(device.public_id).subscribe({
        next: () => {
          if (this.deviceForm.public_id === device.public_id) {
            this.deviceModalOpen = false;
            this.deviceForm = this.emptyDeviceForm();
          }
          this.notification.success('Terminal removido.');
          this.loadDevices();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.notification.notifyHttpError(err, 'Falha ao excluir o terminal.');
          this.cdr.markForCheck();
        },
      });
    });
  }
}
