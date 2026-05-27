import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SystemSettingsService,
  SessionSettings,
} from '../../../services/system-settings.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionIdleService } from '../../../core/services/session-idle.service';
import { SettingsReloadable } from '../settings-reloadable';

const MIN_IDLE = 5;
const MAX_IDLE = 480;

@Component({
  selector: 'app-session-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Sessão</h2>
          <p class="page-section-subtitle">
            Defina após quanto tempo sem interação o usuário deve fazer login novamente.
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

      <div class="card-surface p-5 max-w-xl">
        <label class="text-xs font-bold text-slate-500 uppercase">
          Encerrar sessão após (minutos sem atividade)
        </label>
        <input
          type="number"
          [(ngModel)]="sessionIdleMinutes"
          name="sessionIdleMinutes"
          [min]="minIdle"
          [max]="maxIdle"
          required
          class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <p class="text-xs text-slate-500 mt-2">
          Valor entre {{ minIdle }} e {{ maxIdle }} minutos. Padrão: 30 minutos.
        </p>
        <p *ngIf="loadedSettings?.atualizado_em" class="text-xs text-slate-400 mt-3">
          Última alteração: {{ loadedSettings?.atualizado_em | date: 'dd/MM/yyyy HH:mm' }}
        </p>
      </div>
    </div>
  `,
})
export class SessionSettingsComponent implements SettingsReloadable {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly notification = inject(NotificationService);
  private readonly sessionIdle = inject(SessionIdleService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly minIdle = MIN_IDLE;
  readonly maxIdle = MAX_IDLE;

  sessionIdleMinutes = 30;
  loadedSettings: SessionSettings | null = null;
  saving = false;

  constructor() {
    this.reloadPage();
  }

  reloadPage() {
    this.systemSettings.getSessionSettings().subscribe({
      next: (res) => {
        this.loadedSettings = res.settings;
        this.sessionIdleMinutes = res.settings.session_idle_minutes;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar configurações de sessão.');
        this.cdr.markForCheck();
      },
    });
  }

  salvar() {
    const minutes = Number(this.sessionIdleMinutes);
    if (!Number.isFinite(minutes) || minutes < MIN_IDLE || minutes > MAX_IDLE) {
      this.notification.warning(
        'Valor inválido',
        `Informe um número entre ${MIN_IDLE} e ${MAX_IDLE}.`,
      );
      return;
    }

    this.saving = true;
    this.systemSettings.updateSessionSettings(minutes).subscribe({
      next: (res) => {
        this.saving = false;
        this.loadedSettings = res.settings;
        this.sessionIdleMinutes = res.settings.session_idle_minutes;
        void this.sessionIdle.applyIdleMinutes(res.settings.session_idle_minutes);
        this.notification.success('Configuração de sessão salva.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar configurações de sessão.');
        this.cdr.markForCheck();
      },
    });
  }
}
