import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AccessScheduleSettings,
  SystemSettingsService,
} from '../../../services/system-settings.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';

@Component({
  selector: 'app-access-schedule-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Horários de acesso</h2>
          <p class="page-section-subtitle">
            Defina os intervalos usados nas opções Comercial e Noturno dos acessos de serviço.
            Acessos já cadastrados mantêm o horário gravado na época.
          </p>
        </div>
        <button
          type="button"
          (click)="salvar()"
          [disabled]="saving"
          class="btn-action-primary disabled:opacity-50 shrink-0"
        >
          {{ saving ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>

      <div class="grid gap-4 max-w-3xl md:grid-cols-2">
        <div class="card-surface p-5">
          <h3 class="text-sm font-semibold text-slate-800 mb-1">Comercial</h3>
          <p class="text-xs text-slate-500 mb-4">Padrão: 08:00 às 18:00, no mesmo dia.</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="comercial-start">Início</label>
              <input
                id="comercial-start"
                type="time"
                [(ngModel)]="comercialStart"
                name="comercialStart"
                required
                class="form-field"
              />
            </div>
            <div>
              <label class="form-label" for="comercial-end">Fim</label>
              <input
                id="comercial-end"
                type="time"
                [(ngModel)]="comercialEnd"
                name="comercialEnd"
                required
                class="form-field"
              />
            </div>
          </div>
        </div>

        <div class="card-surface p-5">
          <h3 class="text-sm font-semibold text-slate-800 mb-1">Noturno</h3>
          <p class="text-xs text-slate-500 mb-4">
            Padrão: 18:00 às 08:00 do dia seguinte. Se o fim for menor que o início, a janela
            atravessa a meia-noite.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="noturno-start">Início</label>
              <input
                id="noturno-start"
                type="time"
                [(ngModel)]="noturnoStart"
                name="noturnoStart"
                required
                class="form-field"
              />
            </div>
            <div>
              <label class="form-label" for="noturno-end">Fim (dia seguinte)</label>
              <input
                id="noturno-end"
                type="time"
                [(ngModel)]="noturnoEnd"
                name="noturnoEnd"
                required
                class="form-field"
              />
            </div>
          </div>
        </div>
      </div>

      <p *ngIf="loadedSettings?.atualizado_em" class="text-xs text-slate-400 mt-4">
        Última alteração: {{ loadedSettings?.atualizado_em | date: 'dd/MM/yyyy HH:mm' }}
      </p>
    </div>
  `,
})
export class AccessScheduleSettingsComponent implements SettingsReloadable {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  comercialStart = '08:00';
  comercialEnd = '18:00';
  noturnoStart = '18:00';
  noturnoEnd = '08:00';
  loadedSettings: AccessScheduleSettings | null = null;
  saving = false;

  constructor() {
    this.reloadPage();
  }

  reloadPage() {
    this.systemSettings.getAccessScheduleSettings().subscribe({
      next: (res) => {
        this.applySettings(res.settings);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar horários de acesso.');
        this.cdr.markForCheck();
      },
    });
  }

  salvar() {
    const payload = {
      comercial_start: this.normalizeTime(this.comercialStart),
      comercial_end: this.normalizeTime(this.comercialEnd),
      noturno_start: this.normalizeTime(this.noturnoStart),
      noturno_end: this.normalizeTime(this.noturnoEnd),
    };
    if (
      !payload.comercial_start ||
      !payload.comercial_end ||
      !payload.noturno_start ||
      !payload.noturno_end
    ) {
      this.notification.warning('Valor inválido', 'Informe todos os horários no formato HH:mm.');
      return;
    }
    if (payload.comercial_start === payload.comercial_end) {
      this.notification.warning('Valor inválido', 'O horário comercial precisa ter início e fim diferentes.');
      return;
    }
    if (payload.noturno_start === payload.noturno_end) {
      this.notification.warning('Valor inválido', 'O horário noturno precisa ter início e fim diferentes.');
      return;
    }

    this.saving = true;
    this.systemSettings.updateAccessScheduleSettings(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.applySettings(res.settings);
        this.notification.success('Horários de acesso salvos.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar horários de acesso.');
        this.cdr.markForCheck();
      },
    });
  }

  private applySettings(settings: AccessScheduleSettings) {
    this.loadedSettings = settings;
    this.comercialStart = this.normalizeTime(settings.comercial_start) || '08:00';
    this.comercialEnd = this.normalizeTime(settings.comercial_end) || '18:00';
    this.noturnoStart = this.normalizeTime(settings.noturno_start) || '18:00';
    this.noturnoEnd = this.normalizeTime(settings.noturno_end) || '08:00';
  }

  private normalizeTime(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d/.test(raw)) return '';
    return raw.slice(0, 5);
  }
}
