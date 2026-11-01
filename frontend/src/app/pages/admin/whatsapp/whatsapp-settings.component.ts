import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WhatsappLimits,
  WhatsappLogStatus,
  WhatsappSendLog,
  WhatsappService,
  WhatsappSessionStatus,
  WhatsappSettings,
  WhatsappSettingsPayload,
  WhatsappStatus,
} from '../../../services/whatsapp.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SettingsReloadable } from '../settings-reloadable';

type Tab = 'config' | 'teste' | 'limites' | 'historico';

interface LimitsForm {
  pacing_enabled: boolean;
  warmup_text: string;
  cold_cap_enabled: boolean;
  cold_text: string;
  breaker_threshold: number;
  breaker_cooldown_minutes: number;
  simulate_typing: boolean;
  simulate_typing_max_ms: number;
}

const LIMIT_PRESETS: Record<'padrao' | 'conservador', Omit<LimitsForm, 'simulate_typing' | 'simulate_typing_max_ms'>> = {
  padrao: {
    pacing_enabled: true,
    warmup_text: '20, 40, 80, 160, 320, 640, 1000',
    cold_cap_enabled: true,
    cold_text: '5, 10, 20, 40, 60, 80, 100',
    breaker_threshold: 5,
    breaker_cooldown_minutes: 15,
  },
  conservador: {
    pacing_enabled: true,
    warmup_text: '10, 20, 40, 80, 160, 300, 500',
    cold_cap_enabled: true,
    cold_text: '3, 5, 10, 20, 30, 40, 50',
    breaker_threshold: 3,
    breaker_cooldown_minutes: 30,
  },
};

interface TestResult {
  ok: boolean;
  at: Date;
  phone: string;
  chatId: string | null;
  messageId: string | null;
  message: string;
  error: string | null;
}

@Component({
  selector: 'app-whatsapp-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .wa-tabs {
        display: flex;
        background: #eef2f7;
        border-radius: 11px;
        padding: 4px;
        gap: 4px;
        max-width: 420px;
      }
      .wa-tabs button {
        flex: 1;
        height: 36px;
        border: none;
        background: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13.5px;
        color: var(--text-muted);
        cursor: pointer;
        transition:
          background 0.15s,
          color 0.15s,
          box-shadow 0.15s;
      }
      .wa-tabs button.on {
        background: #fff;
        color: var(--text-primary);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
      }
      .wa-qr {
        width: 264px;
        height: 264px;
        border-radius: var(--form-radius);
        border: 1px solid var(--app-border);
        background: #fff;
        padding: 8px;
      }
      .wa-warning {
        border: 1px solid var(--warning-border, #fcd9a8);
        background: var(--warning-soft-bg, #fef3e2);
        color: var(--warning, #b45309);
        border-radius: var(--form-radius);
        padding: 12px 14px;
        font-size: 13px;
        line-height: 1.5;
      }
      .wa-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .wa-pill__dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }
    `,
  ],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">WhatsApp (OpenWA)</h2>
          <p class="page-section-subtitle">
            Gateway WhatsApp self-hosted para notificações. Configure a conexão, pareie o número e
            acompanhe o histórico de envios.
          </p>
        </div>
        <div *ngIf="activeTab === 'config'" class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="setTab('teste')" class="btn-action-secondary" [disabled]="!status?.configured">
            Enviar teste
          </button>
          <button type="button" (click)="salvar()" [disabled]="saving" class="btn-action-primary">
            {{ saving ? 'Salvando...' : 'Salvar configuração' }}
          </button>
        </div>
        <div *ngIf="activeTab === 'teste'" class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregarStatus()" class="btn-action-secondary" [disabled]="loadingStatus">
            {{ loadingStatus ? 'Atualizando...' : 'Atualizar status' }}
          </button>
        </div>
        <div *ngIf="activeTab === 'limites'" class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregarLimites()" class="btn-action-secondary" [disabled]="loadingLimits || savingLimits">
            Descartar alterações
          </button>
          <button type="button" (click)="salvarLimites()" class="btn-action-primary" [disabled]="!limitsForm || savingLimits">
            {{ savingLimits ? 'Aplicando...' : 'Salvar e aplicar limites' }}
          </button>
        </div>
        <div *ngIf="activeTab === 'historico'" class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="setTab('teste')" class="btn-action-secondary" [disabled]="!status?.configured">
            Enviar teste
          </button>
          <button type="button" (click)="carregarLogs(pagination.page)" class="btn-action-secondary">
            Atualizar
          </button>
        </div>
      </div>

      <div class="wa-tabs mb-5" role="tablist" aria-label="Seções de WhatsApp">
        <button type="button" role="tab" (click)="setTab('config')" [class.on]="activeTab === 'config'" [attr.aria-selected]="activeTab === 'config'">
          Configuração
        </button>
        <button type="button" role="tab" (click)="setTab('teste')" [class.on]="activeTab === 'teste'" [attr.aria-selected]="activeTab === 'teste'">
          Envio de teste
        </button>
        <button type="button" role="tab" (click)="setTab('limites')" [class.on]="activeTab === 'limites'" [attr.aria-selected]="activeTab === 'limites'">
          Limites
        </button>
        <button type="button" role="tab" (click)="setTab('historico')" [class.on]="activeTab === 'historico'" [attr.aria-selected]="activeTab === 'historico'">
          Histórico
        </button>
      </div>

      <!-- ===================== LIMITES ===================== -->
      <ng-container *ngIf="activeTab === 'limites'">
        <div *ngIf="!limitsForm" class="card-surface p-5 text-sm text-slate-500">
          {{ loadingLimits ? 'Carregando limites...' : limitsError || 'Não foi possível carregar os limites.' }}
        </div>

        <ng-container *ngIf="limitsForm as lf">
          <div class="wa-warning mb-5">
            Estes limites são aplicados pelo próprio OpenWA para reduzir o risco de bloqueio do número.
            Salvar <strong>reinicia o gateway</strong> (cerca de 30 s); a sessão reconecta sozinha, sem novo QR.
            A contagem diária zera às <strong>21h (horário de Brasília)</strong>, que é meia-noite UTC.
            Envios recusados por limite aparecem no Histórico como falha com o código 429.
          </div>

          <!-- Resumo de hoje -->
          <div class="card-surface p-5 mb-5">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 class="text-sm font-bold text-slate-500 uppercase mb-1">Hoje</h3>
                <p class="text-sm text-slate-600" *ngIf="sessionAgeDay !== null; else semIdade">
                  Sessão no <strong>{{ sessionAgeDay }}º dia</strong> de aquecimento
                  <span class="text-slate-500">(criada em {{ status?.session?.createdAt | date: 'dd/MM/yyyy' }})</span>.
                </p>
                <ng-template #semIdade>
                  <p class="text-sm text-slate-500">Inicie a sessão para calcular o dia de aquecimento.</p>
                </ng-template>
              </div>
              <div class="flex flex-wrap gap-3">
                <div class="rounded-xl border border-[var(--app-border)] px-4 py-2 min-w-[150px]">
                  <div class="text-xs text-slate-500 uppercase font-bold">Envios/dia</div>
                  <div class="text-xl font-bold">{{ lf.pacing_enabled ? (todayLimit(lf.warmup_text) ?? '—') : 'Sem limite' }}</div>
                </div>
                <div class="rounded-xl border border-[var(--app-border)] px-4 py-2 min-w-[150px]">
                  <div class="text-xs text-slate-500 uppercase font-bold">Novos contatos/dia</div>
                  <div class="text-xl font-bold">
                    {{ lf.pacing_enabled && lf.cold_cap_enabled ? (todayLimit(lf.cold_text) ?? '—') : 'Sem limite' }}
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
              <span class="text-xs text-slate-500 mr-1">Predefinições:</span>
              <button type="button" class="btn-action-secondary text-xs py-1 px-3" (click)="aplicarPreset('conservador')">Conservador</button>
              <button type="button" class="btn-action-secondary text-xs py-1 px-3" (click)="aplicarPreset('padrao')">Padrão OpenWA</button>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <!-- Limite diário total -->
            <div class="card-surface p-5">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 class="text-sm font-bold text-slate-500 uppercase">Limite diário de envios</h3>
                  <p class="text-xs text-slate-500 mt-1">
                    Máximo de mensagens por dia conforme a idade da sessão. O 1º valor vale no 1º dia, o 2º no
                    2º dia, e o último vale para todos os dias seguintes.
                  </p>
                </div>
                <label class="flex items-center gap-2 text-sm text-slate-700 shrink-0">
                  <input type="checkbox" [(ngModel)]="lf.pacing_enabled" name="lim_pacing" />
                  Ativo
                </label>
              </div>
              <label class="form-label" for="lim-warmup">Envios por dia (separados por vírgula)</label>
              <input id="lim-warmup" class="form-field font-mono text-sm" [(ngModel)]="lf.warmup_text" name="lim_warmup" [disabled]="!lf.pacing_enabled" />
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span *ngFor="let n of parseListText(lf.warmup_text); let i = index; let last = last" class="wa-pill bg-slate-100 text-slate-700" [class.ring-2]="isCurrentDay(i, last)">
                  {{ last ? 'Dia ' + (i + 1) + '+' : 'Dia ' + (i + 1) }}: {{ n }}
                </span>
              </div>
              <p *ngIf="listError(lf.warmup_text)" class="text-xs text-rose-600 mt-1">{{ listError(lf.warmup_text) }}</p>
            </div>

            <!-- Novos contatos -->
            <div class="card-surface p-5">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 class="text-sm font-bold text-slate-500 uppercase">Novos contatos por dia</h3>
                  <p class="text-xs text-slate-500 mt-1">
                    Primeira mensagem para quem nunca conversou com este número. É o que o WhatsApp mais pune.
                    Responder a quem escreveu primeiro não conta.
                  </p>
                </div>
                <label class="flex items-center gap-2 text-sm text-slate-700 shrink-0">
                  <input type="checkbox" [(ngModel)]="lf.cold_cap_enabled" name="lim_cold_on" [disabled]="!lf.pacing_enabled" />
                  Ativo
                </label>
              </div>
              <label class="form-label" for="lim-cold">Novos contatos por dia (separados por vírgula)</label>
              <input id="lim-cold" class="form-field font-mono text-sm" [(ngModel)]="lf.cold_text" name="lim_cold" [disabled]="!lf.pacing_enabled || !lf.cold_cap_enabled" />
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span *ngFor="let n of parseListText(lf.cold_text); let i = index; let last = last" class="wa-pill bg-slate-100 text-slate-700" [class.ring-2]="isCurrentDay(i, last)">
                  {{ last ? 'Dia ' + (i + 1) + '+' : 'Dia ' + (i + 1) }}: {{ n }}
                </span>
              </div>
              <p *ngIf="lf.cold_cap_enabled && listError(lf.cold_text)" class="text-xs text-rose-600 mt-1">{{ listError(lf.cold_text) }}</p>
              <p class="text-xs text-slate-500 mt-2">
                No Credenciamento quase todo destinatário é um contato novo; este costuma ser o limite que é atingido primeiro.
              </p>
            </div>

            <!-- Breaker -->
            <div class="card-surface p-5">
              <h3 class="text-sm font-bold text-slate-500 uppercase mb-1">Pausa por falhas seguidas</h3>
              <p class="text-xs text-slate-500 mb-3">
                Se várias mensagens falharem em sequência, o envio é pausado por um período. Só atua com o limite diário ativo.
              </p>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label" for="lim-breaker">Falhas seguidas</label>
                  <input id="lim-breaker" type="number" min="1" max="100" class="form-field" [(ngModel)]="lf.breaker_threshold" name="lim_breaker" [disabled]="!lf.pacing_enabled" />
                </div>
                <div>
                  <label class="form-label" for="lim-cooldown">Pausa (minutos)</label>
                  <input id="lim-cooldown" type="number" min="1" max="1440" class="form-field" [(ngModel)]="lf.breaker_cooldown_minutes" name="lim_cooldown" [disabled]="!lf.pacing_enabled" />
                </div>
              </div>
            </div>

            <!-- Digitação -->
            <div class="card-surface p-5">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 class="text-sm font-bold text-slate-500 uppercase">Simular digitação</h3>
                  <p class="text-xs text-slate-500 mt-1">
                    Mostra "digitando…" e aguarda um tempo proporcional ao tamanho do texto antes de cada envio,
                    para não parecer automático.
                  </p>
                </div>
                <label class="flex items-center gap-2 text-sm text-slate-700 shrink-0">
                  <input type="checkbox" [(ngModel)]="lf.simulate_typing" name="lim_typing" />
                  Ativo
                </label>
              </div>
              <label class="form-label" for="lim-typing-ms">Pausa máxima (milissegundos)</label>
              <input id="lim-typing-ms" type="number" min="0" max="30000" step="500" class="form-field" [(ngModel)]="lf.simulate_typing_max_ms" name="lim_typing_ms" [disabled]="!lf.simulate_typing" />
            </div>
          </div>

          <p *ngIf="limitsEnvPath" class="text-xs text-slate-500">
            Gravado em <code class="font-mono">{{ limitsEnvPath }}</code> (backup em <code class="font-mono">.env.bak</code>).
          </p>
        </ng-container>
      </ng-container>

      <!-- ===================== ENVIO DE TESTE ===================== -->
      <ng-container *ngIf="activeTab === 'teste'">
        <div class="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">
          <div class="card-surface p-5 xl:col-span-3">
            <h3 class="text-sm font-bold text-slate-500 uppercase mb-1">Enviar mensagem de teste</h3>
            <p class="text-xs text-slate-500 mb-4">
              Envia um texto pelo número pareado para validar a conexão. O envio fica registrado no
              histórico. Use um número que já conheça o remetente: a primeira mensagem para um contato
              desconhecido pode ser descartada pelo WhatsApp.
            </p>

            <div *ngIf="!canSendTest" class="wa-warning mb-4">
              <ng-container *ngIf="!status?.configured">
                Configure URL, API key e nome da sessão na aba <strong>Configuração</strong> antes de testar.
              </ng-container>
              <ng-container *ngIf="status?.configured && !status?.ativo">
                O envio por WhatsApp está <strong>desativado</strong>. Ative-o na aba Configuração.
              </ng-container>
              <ng-container *ngIf="status?.configured && status?.ativo && status?.session?.status !== 'ready'">
                A sessão não está conectada (status: <strong>{{ sessionLabel(status?.session?.status) }}</strong>).
                Inicie a sessão e escaneie o QR na aba Configuração.
              </ng-container>
            </div>

            <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="enviarTeste()" #testForm="ngForm">
              <div>
                <label class="form-label" for="wa-test-phone">Telefone de destino</label>
                <input
                  id="wa-test-phone"
                  type="tel"
                  class="form-field"
                  [(ngModel)]="test.phone"
                  name="test_phone"
                  placeholder="11 98888-0001"
                  autocomplete="off"
                  required
                />
                <p class="mt-1 text-xs text-slate-500">
                  Com DDD. Sem DDI, usa o padrão {{ form.default_country_code || '55' }}.
                  <ng-container *ngIf="testChatIdPreview"> Será enviado para <code class="font-mono">{{ testChatIdPreview }}</code>.</ng-container>
                </p>
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-slate-700 pb-2">
                  <input type="checkbox" [(ngModel)]="test.includeTimestamp" name="test_ts" />
                  Incluir data/hora na mensagem
                </label>
              </div>
              <div class="md:col-span-2">
                <label class="form-label" for="wa-test-msg">Mensagem</label>
                <textarea
                  id="wa-test-msg"
                  class="form-field"
                  rows="5"
                  [(ngModel)]="test.message"
                  name="test_message"
                  [maxlength]="maxTextLength"
                  placeholder="Texto da mensagem de teste"
                ></textarea>
                <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Suporta *negrito*, _itálico_ e quebras de linha.</span>
                  <span [class.text-rose-600]="test.message.length > maxTextLength - 100">
                    {{ test.message.length }} / {{ maxTextLength }}
                  </span>
                </div>
              </div>
              <div class="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
                <button type="button" class="btn-action-secondary" (click)="resetTeste()" [disabled]="sendingTest">
                  Limpar
                </button>
                <button
                  type="submit"
                  class="btn-action-primary"
                  [disabled]="sendingTest || !test.phone.trim() || !test.message.trim() || !status?.configured"
                >
                  {{ sendingTest ? 'Enviando...' : 'Enviar mensagem de teste' }}
                </button>
              </div>
            </form>
          </div>

          <div class="card-surface p-5 xl:col-span-2">
            <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Resultado</h3>

            <div *ngIf="!testResults.length" class="text-sm text-slate-500">
              Nenhum teste enviado nesta sessão. O resultado de cada envio aparece aqui; o registro completo
              fica na aba <button type="button" class="underline" (click)="setTab('historico')">Histórico</button>.
            </div>

            <ul *ngIf="testResults.length" class="flex flex-col gap-3">
              <li
                *ngFor="let r of testResults"
                class="rounded-xl border p-3 text-sm"
                [ngClass]="r.ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'"
              >
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="wa-pill" [ngClass]="r.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'">
                    <span class="wa-pill__dot"></span>
                    {{ r.ok ? 'Enviado' : 'Falhou' }}
                  </span>
                  <span class="text-xs text-slate-500">{{ r.at | date: 'dd/MM HH:mm:ss' }}</span>
                </div>
                <div class="text-slate-700">Para: <span class="font-mono text-xs">{{ r.chatId || r.phone }}</span></div>
                <div *ngIf="r.ok && r.messageId" class="text-xs text-slate-500 truncate" [title]="r.messageId">
                  Message ID: <span class="font-mono">{{ r.messageId }}</span>
                </div>
                <div *ngIf="!r.ok" class="text-xs text-rose-700 mt-1">{{ r.error }}</div>
                <div class="text-xs text-slate-500 mt-1 truncate" [title]="r.message">“{{ r.message }}”</div>
              </li>
            </ul>

            <p *ngIf="testResults.length" class="text-xs text-slate-500 mt-3">
              "Enviado" significa que o gateway aceitou a mensagem; a entrega depende do WhatsApp e do
              destinatário estar com o app ativo.
            </p>
          </div>
        </div>
      </ng-container>

      <ng-container *ngIf="activeTab === 'config'">
        <div class="wa-warning mb-5">
          <strong>Use um número dedicado.</strong> O OpenWA utiliza clientes não oficiais do WhatsApp;
          há risco de restrição ou banimento do número pareado. Nunca conecte o número principal da
          empresa e mantenha o e-mail como canal principal.
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">
          <!-- Conexão -->
          <div class="card-surface p-5 xl:col-span-3">
            <h3 class="text-sm font-bold text-slate-500 uppercase mb-4">Conexão com o gateway</h3>
            <form class="grid grid-cols-1 md:grid-cols-2 gap-4" (ngSubmit)="salvar()">
              <div class="md:col-span-2">
                <label class="form-label" for="wa-base-url">URL do OpenWA</label>
                <input
                  id="wa-base-url"
                  class="form-field font-mono text-sm"
                  [(ngModel)]="form.base_url"
                  name="base_url"
                  placeholder="http://127.0.0.1:2785"
                  required
                />
              </div>
              <div class="md:col-span-2">
                <label class="form-label" for="wa-api-key">
                  API key {{ hasApiKey ? '(deixe vazio para manter)' : '' }}
                </label>
                <input
                  id="wa-api-key"
                  type="password"
                  class="form-field font-mono text-sm"
                  [(ngModel)]="apiKeyInput"
                  name="api_key"
                  autocomplete="off"
                  [placeholder]="hasApiKey ? '•••••••• (já configurada)' : 'Conteúdo de data/.api-key'"
                />
              </div>
              <div>
                <label class="form-label" for="wa-session">Nome da sessão</label>
                <input
                  id="wa-session"
                  class="form-field"
                  [(ngModel)]="form.session_id"
                  name="session_id"
                  placeholder="credenciamento"
                  pattern="[a-zA-Z0-9-]{3,50}"
                  required
                />
                <p class="mt-1 text-xs text-slate-500">3 a 50 caracteres: letras, números e hífen.</p>
              </div>
              <div>
                <label class="form-label" for="wa-ddi">DDI padrão</label>
                <input
                  id="wa-ddi"
                  class="form-field"
                  [(ngModel)]="form.default_country_code"
                  name="default_country_code"
                  placeholder="55"
                  maxlength="4"
                />
                <p class="mt-1 text-xs text-slate-500">Aplicado a telefones informados só com DDD + número.</p>
              </div>
              <div class="md:col-span-2 flex items-center">
                <label class="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" />
                  Envio por WhatsApp ativo
                </label>
              </div>
            </form>
          </div>

          <!-- Status / QR -->
          <div class="card-surface p-5 xl:col-span-2">
            <div class="flex items-start justify-between gap-3 mb-4">
              <h3 class="text-sm font-bold text-slate-500 uppercase">Sessão</h3>
              <button type="button" class="btn-action-secondary text-xs py-1 px-3" (click)="carregarStatus()" [disabled]="loadingStatus">
                {{ loadingStatus ? 'Atualizando...' : 'Atualizar' }}
              </button>
            </div>

            <ng-container *ngIf="status; else statusLoading">
              <div class="flex flex-col gap-2 text-sm mb-4">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-slate-500">Gateway</span>
                  <span class="wa-pill" [ngClass]="status.gateway.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'">
                    <span class="wa-pill__dot"></span>
                    {{ status.gateway.ok ? 'Online' + (status.gateway.version ? ' · v' + status.gateway.version : '') : 'Indisponível' }}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-slate-500">Sessão</span>
                  <span class="wa-pill" [ngClass]="sessionClass(status.session?.status)">
                    <span class="wa-pill__dot"></span>
                    {{ sessionLabel(status.session?.status) }}
                  </span>
                </div>
                <div *ngIf="status.session?.phone" class="flex items-center justify-between gap-3">
                  <span class="text-slate-500">Número</span>
                  <span class="font-mono text-xs">+{{ status.session?.phone }} <span *ngIf="status.session?.pushName" class="text-slate-500">({{ status.session?.pushName }})</span></span>
                </div>
                <p *ngIf="status.gateway.message" class="text-xs text-slate-500 mt-1">{{ status.gateway.message }}</p>
                <p *ngIf="status.session?.lastError" class="text-xs text-rose-600 mt-1">{{ status.session?.lastError }}</p>
              </div>

              <div *ngIf="qrCode" class="flex flex-col items-center gap-2 mb-4">
                <img class="wa-qr" [src]="qrCode" alt="QR code para parear o WhatsApp" />
                <p class="text-xs text-slate-500 text-center">
                  WhatsApp → Aparelhos conectados → Conectar aparelho. O código renova sozinho.
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-action-tonal"
                  (click)="iniciarSessao()"
                  [disabled]="!status.configured || !status.gateway.ok || starting || status.session?.status === 'ready'"
                >
                  {{ starting ? 'Iniciando...' : status.session?.status === 'ready' ? 'Sessão conectada' : 'Iniciar sessão' }}
                </button>
                <button
                  type="button"
                  class="btn-action-secondary"
                  (click)="pararSessao()"
                  [disabled]="!status.session || stopping || !isRunning(status.session.status)"
                >
                  {{ stopping ? 'Parando...' : 'Parar sessão' }}
                </button>
              </div>
              <p *ngIf="!status.configured" class="text-xs text-slate-500 mt-3">
                Salve URL, API key e nome da sessão para habilitar as ações.
              </p>
            </ng-container>
            <ng-template #statusLoading>
              <p class="text-sm text-slate-500">Consultando gateway...</p>
            </ng-template>
          </div>
        </div>
      </ng-container>

      <ng-container *ngIf="activeTab === 'historico'">
        <div class="card-surface p-4 mb-4 shrink-0">
          <div class="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
            <div class="flex-1 min-w-[200px]">
              <label class="form-label" for="wa-log-q">Busca</label>
              <input
                id="wa-log-q"
                type="search"
                class="form-field text-sm"
                [(ngModel)]="logFilters.q"
                (ngModelChange)="onLogFilterTextChange()"
                name="log_q"
                placeholder="Telefone, mensagem, message id ou erro"
              />
            </div>
            <div class="w-full sm:w-40 shrink-0">
              <label class="form-label" for="wa-log-status">Status</label>
              <select id="wa-log-status" class="form-select text-sm" [(ngModel)]="logFilters.status" (ngModelChange)="aplicarFiltrosLogs()" name="log_status">
                <option value="">Todos</option>
                <option value="sent">Enviado</option>
                <option value="failed">Falhou</option>
              </select>
            </div>
            <div class="flex items-center gap-2 shrink-0 pb-0.5">
              <button type="button" (click)="limparFiltrosLogs()" [disabled]="!hasLogFilters" class="btn-action-secondary text-xs py-2 px-3">
                Limpar filtros
              </button>
              <span *ngIf="hasLogFilters" class="text-xs text-slate-500 whitespace-nowrap">{{ pagination.total }} resultado(s)</span>
            </div>
          </div>
        </div>

        <div class="card-surface overflow-hidden">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-slate-50 z-10">
              <tr>
                <th class="px-4 py-3 text-left">Data</th>
                <th class="px-4 py-3 text-left">Destinatário</th>
                <th class="px-4 py-3 text-left">Mensagem</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Message ID</th>
                <th class="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngIf="!loadingLogs; else loadingLogsRow">
                <tr *ngFor="let log of logs" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">{{ log.criado_em | date: 'dd/MM/yy HH:mm' }}</td>
                  <td class="px-4 py-3">
                    <div>{{ log.destinatario }}</div>
                    <div *ngIf="log.chat_id" class="text-xs text-slate-500 font-mono">{{ log.chat_id }}</div>
                  </td>
                  <td class="px-4 py-3 truncate max-w-[260px]" [title]="log.corpo_resumo || ''">{{ log.corpo_resumo || '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" [ngClass]="statusClass(log.status)">
                      {{ statusLabel(log.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-slate-500 truncate max-w-[140px] font-mono" [title]="log.message_id || ''">{{ log.message_id || '—' }}</td>
                  <td class="px-4 py-3 text-xs text-rose-600 truncate max-w-[200px]" [title]="log.erro_mensagem || ''">{{ log.erro_mensagem || '—' }}</td>
                </tr>
                <tr *ngIf="logs.length === 0">
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                    {{ hasLogFilters ? 'Nenhum envio encontrado com esses filtros.' : 'Nenhum envio registrado.' }}
                  </td>
                </tr>
              </ng-container>
              <ng-template #loadingLogsRow>
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">Carregando histórico...</td>
                </tr>
              </ng-template>
            </tbody>
          </table>
          <div *ngIf="pagination.total > 0" class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <span class="text-xs text-slate-500">
              Página {{ pagination.page }} de {{ pagination.totalPages }} ({{ pagination.total }} registros)
            </span>
            <div class="flex gap-2" *ngIf="pagination.totalPages > 1">
              <button type="button" (click)="irPagina(pagination.page - 1)" [disabled]="pagination.page <= 1" class="btn-action-secondary text-xs py-1 px-3">Anterior</button>
              <button type="button" (click)="irPagina(pagination.page + 1)" [disabled]="pagination.page >= pagination.totalPages" class="btn-action-secondary text-xs py-1 px-3">Próxima</button>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class WhatsappSettingsComponent implements OnInit, OnDestroy, SettingsReloadable {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly whatsapp = inject(WhatsappService);
  private readonly notification = inject(NotificationService);

  activeTab: Tab = 'config';

  form: { base_url: string; session_id: string; default_country_code: string; ativo: boolean } = {
    base_url: 'http://127.0.0.1:2785',
    session_id: 'credenciamento',
    default_country_code: '55',
    ativo: false,
  };
  apiKeyInput = '';
  hasApiKey = false;
  saving = false;

  status: WhatsappStatus | null = null;
  loadingStatus = false;
  starting = false;
  stopping = false;
  qrCode: string | null = null;

  limitsForm: LimitsForm | null = null;
  limitsEnvPath: string | null = null;
  limitsError: string | null = null;
  loadingLimits = false;
  savingLimits = false;

  readonly maxTextLength = 4096;
  test: { phone: string; message: string; includeTimestamp: boolean } = {
    phone: '',
    message: this.defaultTestMessage(),
    includeTimestamp: true,
  };
  sendingTest = false;
  testResults: TestResult[] = [];

  loadingLogs = false;
  logs: WhatsappSendLog[] = [];
  pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };
  logFilters: { q: string; status: WhatsappLogStatus | '' } = { q: '', status: '' };

  private readonly filterDebounceMs = 500;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs = 5000;

  ngOnInit() {
    this.carregarSettings();
    this.carregarStatus();
  }

  ngOnDestroy() {
    this.stopPolling();
    if (this.filterDebounceTimer !== null) clearTimeout(this.filterDebounceTimer);
  }

  get hasLogFilters(): boolean {
    return !!(this.logFilters.q.trim() || this.logFilters.status);
  }

  reloadPage() {
    this.carregarSettings();
    this.carregarStatus();
    if (this.activeTab === 'historico') this.carregarLogs(this.pagination.page);
  }

  setTab(tab: Tab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'historico') this.carregarLogs(1);
    if (tab === 'teste') this.carregarStatus();
    if (tab === 'limites') {
      this.carregarLimites();
      if (!this.status) this.carregarStatus();
    }
    this.cdr.markForCheck();
  }

  // ---------- limites ----------

  carregarLimites() {
    this.loadingLimits = true;
    this.limitsError = null;
    this.whatsapp.getLimits().subscribe({
      next: (res) => {
        this.applyLimits(res.limits);
        this.loadingLimits = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingLimits = false;
        this.limitsError = this.notification.extractErrorMessage(err, 'Falha ao carregar limites.');
        this.cdr.markForCheck();
      },
    });
  }

  private applyLimits(l: WhatsappLimits) {
    const fmt = (list: number[]) => list.join(', ');
    this.limitsForm = {
      pacing_enabled: l.pacing_enabled,
      warmup_text: fmt(l.warmup_schedule),
      cold_cap_enabled: l.cold_cap_enabled,
      cold_text: fmt(l.cold_cap_enabled ? l.cold_daily_cap : l.defaults?.cold_daily_cap || []),
      breaker_threshold: l.breaker_threshold,
      breaker_cooldown_minutes: l.breaker_cooldown_minutes,
      simulate_typing: l.simulate_typing,
      simulate_typing_max_ms: l.simulate_typing_max_ms,
    };
    this.limitsEnvPath = l.env_path || null;
  }

  aplicarPreset(key: 'padrao' | 'conservador') {
    if (!this.limitsForm) return;
    this.limitsForm = { ...this.limitsForm, ...LIMIT_PRESETS[key] };
    this.cdr.markForCheck();
  }

  parseListText(text: string): number[] {
    return String(text || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  listError(text: string): string | null {
    const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return 'Informe ao menos um valor.';
    if (parts.length > 30) return 'Máximo de 30 valores.';
    if (parts.some((p) => !/^\d+$/.test(p) || Number(p) < 1 || Number(p) > 100000)) {
      return 'Use apenas inteiros entre 1 e 100000, separados por vírgula.';
    }
    return null;
  }

  /** Dia de aquecimento (1-based) pela data de criação da sessão, em dias UTC. */
  get sessionAgeDay(): number | null {
    const created = this.status?.session?.createdAt;
    if (!created) return null;
    const c = new Date(created);
    if (Number.isNaN(c.getTime())) return null;
    const dayUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.max(1, Math.floor((dayUtc(new Date()) - dayUtc(c)) / 86400000) + 1);
  }

  todayLimit(text: string): number | null {
    const list = this.parseListText(text);
    if (!list.length) return null;
    const day = this.sessionAgeDay ?? 1;
    return list[Math.min(day, list.length) - 1];
  }

  isCurrentDay(index: number, last: boolean): boolean {
    const day = this.sessionAgeDay;
    if (day === null) return false;
    return last ? day >= index + 1 : day === index + 1;
  }

  async salvarLimites() {
    const lf = this.limitsForm;
    if (!lf) return;
    const warmErr = lf.pacing_enabled ? this.listError(lf.warmup_text) : null;
    const coldErr = lf.pacing_enabled && lf.cold_cap_enabled ? this.listError(lf.cold_text) : null;
    if (warmErr || coldErr) {
      this.notification.error(warmErr ? `Limite diário: ${warmErr}` : `Novos contatos: ${coldErr}`);
      return;
    }

    const r = await this.notification.confirm({
      title: 'Aplicar limites?',
      text: 'O OpenWA será reiniciado (cerca de 30 s). Envios nesse intervalo falham e ficam registrados no histórico.',
      confirmButtonText: 'Salvar e reiniciar',
    });
    if (!r.isConfirmed) return;

    const warmup = this.parseListText(lf.warmup_text);
    const cold = this.parseListText(lf.cold_text);
    this.savingLimits = true;
    this.cdr.markForCheck();

    this.whatsapp
      .updateLimits({
        pacing_enabled: lf.pacing_enabled,
        warmup_schedule: warmup.length ? warmup : [1000],
        cold_cap_enabled: lf.cold_cap_enabled,
        cold_daily_cap: lf.cold_cap_enabled ? cold : [],
        breaker_threshold: Number(lf.breaker_threshold) || 5,
        breaker_cooldown_minutes: Number(lf.breaker_cooldown_minutes) || 15,
        simulate_typing: lf.simulate_typing,
        simulate_typing_max_ms: Number(lf.simulate_typing_max_ms) || 0,
        restart: true,
      })
      .subscribe({
        next: (res) => {
          this.savingLimits = false;
          this.applyLimits(res.limits);
          if (res.restart.ok) {
            this.notification.success(res.message);
            setTimeout(() => this.carregarStatus(), 15000);
          } else {
            this.notification.warning('Limites salvos', res.message);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.savingLimits = false;
          this.cdr.markForCheck();
          this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar limites.'));
        },
      });
  }

  // ---------- settings ----------

  private applySettings(s: WhatsappSettings) {
    this.form = {
      base_url: s.base_url || this.form.base_url,
      session_id: s.session_id || this.form.session_id,
      default_country_code: s.default_country_code || '55',
      ativo: !!s.ativo,
    };
    this.hasApiKey = !!s.has_api_key;
    this.apiKeyInput = '';
  }

  carregarSettings() {
    this.whatsapp.getSettings().subscribe({
      next: (res) => {
        if (res.settings) this.applySettings(res.settings);
        this.cdr.markForCheck();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar configuração de WhatsApp.'),
    });
  }

  salvar() {
    this.saving = true;
    const payload: WhatsappSettingsPayload = {
      base_url: this.form.base_url.trim(),
      session_id: this.form.session_id.trim(),
      default_country_code: this.form.default_country_code.trim() || '55',
      ativo: !!this.form.ativo,
    };
    if (this.apiKeyInput.trim()) payload.api_key = this.apiKeyInput.trim();

    this.whatsapp.updateSettings(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.applySettings(res.settings);
        this.notification.success('Configuração de WhatsApp salva.');
        this.carregarStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao salvar.'));
        this.cdr.markForCheck();
      },
    });
  }

  // ---------- sessão ----------

  carregarStatus() {
    this.loadingStatus = true;
    this.whatsapp.getStatus().subscribe({
      next: (st) => {
        this.status = st;
        this.loadingStatus = false;
        this.syncPolling(st.session?.status);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingStatus = false;
        this.cdr.markForCheck();
        this.notification.notifyHttpError(err, 'Falha ao consultar status do WhatsApp.');
      },
    });
  }

  iniciarSessao() {
    this.starting = true;
    this.whatsapp.startSession().subscribe({
      next: (res) => {
        this.starting = false;
        this.notification.success(res.message || 'Sessão iniciada.');
        this.carregarStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.starting = false;
        this.cdr.markForCheck();
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao iniciar sessão.'));
      },
    });
  }

  pararSessao() {
    this.stopping = true;
    this.whatsapp.stopSession().subscribe({
      next: (res) => {
        this.stopping = false;
        this.qrCode = null;
        this.notification.success(res.message || 'Sessão parada.');
        this.carregarStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.stopping = false;
        this.cdr.markForCheck();
        this.notification.error(this.notification.extractErrorMessage(err, 'Falha ao parar sessão.'));
      },
    });
  }

  isRunning(status?: WhatsappSessionStatus | null): boolean {
    return !!status && ['initializing', 'qr_ready', 'authenticating', 'ready'].includes(status);
  }

  /** Enquanto a sessão estiver pareando, busca QR/estado a cada 5s. */
  private syncPolling(status?: WhatsappSessionStatus | null) {
    const needsPoll = status === 'initializing' || status === 'qr_ready' || status === 'authenticating';
    if (!needsPoll) {
      this.stopPolling();
      this.qrCode = null;
      return;
    }
    if (status === 'qr_ready' || status === 'initializing') this.carregarQr();
    if (this.pollTimer === null) {
      this.pollTimer = setInterval(() => this.pollTick(), this.pollIntervalMs);
    }
  }

  private pollTick() {
    this.whatsapp.getStatus().subscribe({
      next: (st) => {
        const before = this.status?.session?.status;
        this.status = st;
        const now = st.session?.status;
        if (now === 'qr_ready' || now === 'initializing') {
          this.carregarQr();
        } else {
          this.qrCode = null;
          this.stopPolling();
          if (now === 'ready' && before !== 'ready') {
            this.notification.success('WhatsApp conectado.');
          }
        }
        this.cdr.markForCheck();
      },
      error: () => this.stopPolling(),
    });
  }

  private carregarQr() {
    this.whatsapp.getQr().subscribe({
      next: (res) => {
        this.qrCode = res.qrCode || null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.qrCode = null;
        this.cdr.markForCheck();
      },
    });
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  sessionLabel(status?: WhatsappSessionStatus | null): string {
    switch (status) {
      case 'ready':
        return 'Conectada';
      case 'qr_ready':
        return 'Aguardando QR';
      case 'authenticating':
        return 'Autenticando';
      case 'initializing':
        return 'Inicializando';
      case 'created':
        return 'Criada (parada)';
      case 'disconnected':
        return 'Desconectada';
      case 'action_required':
        return 'Ação necessária';
      case 'failed':
        return 'Falhou';
      default:
        return 'Não criada';
    }
  }

  sessionClass(status?: WhatsappSessionStatus | null): string {
    if (status === 'ready') return 'bg-emerald-100 text-emerald-800';
    if (status === 'qr_ready' || status === 'authenticating' || status === 'initializing') {
      return 'bg-amber-100 text-amber-800';
    }
    if (status === 'failed' || status === 'action_required' || status === 'disconnected') {
      return 'bg-rose-100 text-rose-800';
    }
    return 'bg-slate-100 text-slate-700';
  }

  // ---------- teste ----------

  private defaultTestMessage(): string {
    return 'Olá! Esta é uma mensagem de teste do sistema de Credenciamento. Se você a recebeu, a integração com o WhatsApp está funcionando.';
  }

  /** Pode enviar: configurado, ativo e sessão conectada. */
  get canSendTest(): boolean {
    return !!(this.status?.configured && this.status?.ativo && this.status?.session?.status === 'ready');
  }

  /** Prévia do chatId que o backend vai usar (mesma regra de phone.js). */
  get testChatIdPreview(): string | null {
    const raw = this.test.phone.trim();
    if (!raw) return null;
    if (/@(c\.us|g\.us|s\.whatsapp\.net|lid)$/i.test(raw)) return raw;
    let digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    const cc = (this.form.default_country_code || '55').replace(/\D/g, '') || '55';
    if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0') && !digits.startsWith(cc)) {
      digits = digits.replace(/^0+/, '');
    }
    if (digits.length === 10 || digits.length === 11) digits = `${cc}${digits}`;
    if (digits.length < 12 || digits.length > 15) return null;
    return `${digits}@c.us`;
  }

  resetTeste() {
    this.test = { phone: '', message: this.defaultTestMessage(), includeTimestamp: true };
    this.cdr.markForCheck();
  }

  enviarTeste() {
    const phone = this.test.phone.trim();
    let message = this.test.message.trim();
    if (!phone || !message) return;

    if (!this.testChatIdPreview) {
      this.notification.error('Telefone inválido. Informe DDD + número (ex.: 11 98888-0001).');
      return;
    }

    if (this.test.includeTimestamp) {
      const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      message = `${message}\n\n_Enviado em ${stamp}_`;
    }
    if (message.length > this.maxTextLength) {
      this.notification.error(`A mensagem excede ${this.maxTextLength} caracteres.`);
      return;
    }

    this.sendingTest = true;
    this.cdr.markForCheck();

    this.whatsapp.testSend(phone, message).subscribe({
      next: (res) => {
        this.sendingTest = false;
        this.pushTestResult({
          ok: true,
          at: new Date(),
          phone,
          chatId: res.chatId || this.testChatIdPreview,
          messageId: res.messageId || null,
          message,
          error: null,
        });
        this.notification.success('Mensagem de teste enviada.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sendingTest = false;
        const msg = this.notification.extractErrorMessage(err, 'Falha no envio de teste.');
        this.pushTestResult({
          ok: false,
          at: new Date(),
          phone,
          chatId: this.testChatIdPreview,
          messageId: null,
          message,
          error: msg,
        });
        this.notification.error(msg);
        this.cdr.markForCheck();
      },
    });
  }

  private pushTestResult(r: TestResult) {
    this.testResults = [r, ...this.testResults].slice(0, 10);
  }

  // ---------- logs ----------

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
    this.logFilters = { q: '', status: '' };
    this.aplicarFiltrosLogs();
  }

  carregarLogs(page = 1) {
    this.loadingLogs = true;
    this.whatsapp
      .listLogs({ page, limit: this.pagination.limit, q: this.logFilters.q, status: this.logFilters.status })
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

  statusLabel(status: WhatsappLogStatus): string {
    return status === 'sent' ? 'Enviado' : status === 'failed' ? 'Falhou' : status;
  }

  statusClass(status: WhatsappLogStatus): Record<string, boolean> {
    return {
      'bg-emerald-100 text-emerald-800': status === 'sent',
      'bg-rose-100 text-rose-800': status === 'failed',
    };
  }
}
