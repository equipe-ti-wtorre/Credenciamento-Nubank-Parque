import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthService, HealthInfo } from '../../../services/health.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .about-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
      }

      .about-card {
        background: #fff;
        border: 1px solid var(--app-border);
        border-radius: 1rem;
        padding: 1.25rem 1.35rem;
      }

      .about-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }

      .about-facts {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.75rem;
        margin-top: 1.25rem;
      }

      .about-fact {
        border: 1px solid var(--app-border);
        border-radius: 0.85rem;
        padding: 0.85rem 1rem;
        min-width: 0;
      }

      .about-fact--wide {
        grid-column: span 2;
      }

      .about-fact__label {
        display: block;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .about-fact__value {
        display: block;
        margin-top: 0.35rem;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .about-section-title {
        margin: 0 0 0.85rem;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--text-primary);
        font-family: var(--font-display);
      }

      .about-health {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .about-health li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.8rem 0;
        border-top: 1px solid var(--app-border);
        font-size: 0.875rem;
      }

      .about-health li:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .about-health li:last-child {
        padding-bottom: 0;
      }

      .about-health__name {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .about-health__status {
        color: var(--text-muted);
        text-align: right;
      }

      .about-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: #f59e0b;
        flex-shrink: 0;
      }

      .about-dot--ok {
        background: #22c55e;
      }

      .about-note {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.6;
        color: var(--text-muted);
      }

      @media (max-width: 900px) {
        .about-facts {
          grid-template-columns: 1fr 1fr;
        }

        .about-fact--wide {
          grid-column: span 1;
        }
      }
    `,
  ],
  template: `
    <div class="about-page">
      <section class="about-card">
        <div class="about-head">
          <div>
            <h2 class="page-section-title">Credenciamento</h2>
            <p class="page-section-subtitle">Sistema de credenciamento e administração corporativa</p>
          </div>
          <button type="button" class="btn-action-secondary shrink-0" (click)="copiarSuporte()">
            Copiar informações para suporte
          </button>
        </div>

        <div class="about-facts">
          <div class="about-fact">
            <span class="about-fact__label">Versão</span>
            <span class="about-fact__value">{{ health?.version || '—' }}</span>
          </div>
          <div class="about-fact">
            <span class="about-fact__label">Frontend</span>
            <span class="about-fact__value">{{ frontendVersion }}</span>
          </div>
          <div class="about-fact">
            <span class="about-fact__label">Ambiente</span>
            <span class="about-fact__value">{{ environmentLabel }}</span>
          </div>
          <div class="about-fact">
            <span class="about-fact__label">Última verificação</span>
            <span class="about-fact__value">{{ checkedAt }}</span>
          </div>
          <div class="about-fact about-fact--wide">
            <span class="about-fact__label">Link público</span>
            <span class="about-fact__value">{{ publicHost }}</span>
          </div>
          <div class="about-fact about-fact--wide">
            <span class="about-fact__label">Painel</span>
            <span class="about-fact__value">{{ panelHost }}</span>
          </div>
        </div>
      </section>

      <section class="about-card">
        <h3 class="about-section-title">Saúde do sistema</h3>
        <ul class="about-health">
          <li>
            <span class="about-health__name">
              <span class="about-dot" [class.about-dot--ok]="apiOk" aria-hidden="true"></span>
              API
            </span>
            <span class="about-health__status">{{ apiLabel }}</span>
          </li>
          <li>
            <span class="about-health__name">
              <span class="about-dot" [class.about-dot--ok]="dbOk" aria-hidden="true"></span>
              Banco de dados
            </span>
            <span class="about-health__status">{{ dbLabel }}</span>
          </li>
        </ul>
      </section>

      <section class="about-card">
        <h3 class="about-section-title">Sobre o sistema</h3>
        <p class="about-note">
          Este sistema integra autenticação Microsoft Azure AD, envio de e-mails SMTP e notificações ao
          Microsoft Teams via Graph API. Configurações administrativas estão disponíveis no menu lateral desta
          área.
        </p>
      </section>
    </div>
  `,
})
export class AboutComponent implements SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly healthService = inject(HealthService);
  private readonly notification = inject(NotificationService);

  health: HealthInfo | null = null;
  readonly frontendVersion = '1.0.0';

  get environmentLabel(): string {
    const value = this.health?.environment;
    if (!value) return '—';
    if (value === 'production') return 'Produção';
    if (value === 'development') return 'Desenvolvimento';
    return value;
  }

  get checkedAt(): string {
    if (!this.health?.timestamp) return '—';
    const date = new Date(this.health.timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  get publicHost(): string {
    const raw = (this.health?.publicUrl || '').trim();
    if (!raw) return '—';
    try {
      return new URL(raw).host;
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/\/$/, '') || '—';
    }
  }

  get panelHost(): string {
    return typeof window !== 'undefined' ? window.location.host : '—';
  }

  get apiOk(): boolean {
    return this.health?.status === 'healthy';
  }

  get dbOk(): boolean {
    return this.health?.db === 'ok';
  }

  get apiLabel(): string {
    if (!this.health) return 'Carregando...';
    return this.apiOk ? 'Operando' : 'Indisponível';
  }

  get dbLabel(): string {
    if (!this.health) return 'Carregando...';
    return this.dbOk ? 'Conectado' : 'Indisponível';
  }

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

  async copiarSuporte() {
    const text = [
      'Credenciamento',
      `Versão: ${this.health?.version || '—'}`,
      `Frontend: ${this.frontendVersion}`,
      `Ambiente: ${this.environmentLabel}`,
      `Última verificação: ${this.checkedAt}`,
      `Link público: ${this.publicHost}`,
      `Painel: ${this.panelHost}`,
      `API: ${this.apiLabel}`,
      `Banco de dados: ${this.dbLabel}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      this.notification.success('Informações copiadas');
    } catch {
      this.notification.error('Não foi possível copiar as informações');
    }
  }
}
