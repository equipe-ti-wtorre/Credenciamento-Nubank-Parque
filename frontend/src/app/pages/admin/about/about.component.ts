import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthService, HealthInfo } from '../../../services/health.service';
import { SettingsReloadable } from '../settings-reloadable';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex items-start justify-center">
      <div class="w-full max-w-2xl card-surface p-8">
        <div class="text-center mb-8">
          <div
            class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white text-2xl font-bold mb-4"
          >
            W
          </div>
          <h2 class="page-section-title">WTORRE Credenciamento</h2>
          <p class="page-section-subtitle mt-1">Sistema de credenciamento e administração corporativa</p>
        </div>

        <dl class="space-y-4 text-sm">
          <div class="flex justify-between gap-4 py-3 border-b border-slate-100">
            <dt class="text-slate-500 font-medium">Versão do backend</dt>
            <dd class="text-slate-800 font-mono">{{ health?.version || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-3 border-b border-slate-100">
            <dt class="text-slate-500 font-medium">Status da API</dt>
            <dd>
              <span
                class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                [class.bg-emerald-100]="health?.status === 'healthy'"
                [class.text-emerald-800]="health?.status === 'healthy'"
                [class.bg-amber-100]="health?.status !== 'healthy'"
                [class.text-amber-800]="health?.status !== 'healthy'"
              >
                {{ health?.status || 'Carregando...' }}
              </span>
            </dd>
          </div>
          <div class="flex justify-between gap-4 py-3 border-b border-slate-100">
            <dt class="text-slate-500 font-medium">Banco de dados</dt>
            <dd class="text-slate-800">{{ health?.db || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-3 border-b border-slate-100">
            <dt class="text-slate-500 font-medium">Versão do frontend</dt>
            <dd class="text-slate-800 font-mono">{{ frontendVersion }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-3 border-b border-slate-100">
            <dt class="text-slate-500 font-medium">Última verificação</dt>
            <dd class="text-slate-800">{{ health?.timestamp | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
          </div>
        </dl>

        <div class="mt-8 p-4 rounded-xl bg-slate-50 text-xs text-slate-600 leading-relaxed">
          <p>
            Este sistema integra autenticação Microsoft Azure AD, envio de e-mails SMTP e notificações ao
            Microsoft Teams via Graph API. Configurações administrativas estão disponíveis no menu lateral desta
            área.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class AboutComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly healthService = inject(HealthService);

  health: HealthInfo | null = null;
  readonly frontendVersion = '1.0.0';

  reloadPage() {
    this.healthService.getHealth().subscribe({
      next: (h) => {
        this.health = h;
        this.cdr.markForCheck();
      },
      error: () => {
        this.health = {
          status: 'unavailable',
          db: 'unknown',
          version: '—',
          timestamp: new Date().toISOString(),
        };
        this.cdr.markForCheck();
      },
    });
  }
}
