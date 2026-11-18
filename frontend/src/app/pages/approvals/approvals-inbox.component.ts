import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { sameEntityId } from '../../core/public-id.adapter';
import { NavigationStateService } from '../../core/services/navigation-state.service';
import {
  ApprovalEntityCollaborator,
  ApprovalEntityVehicle,
  ApprovalItem,
  ApprovalService,
  ApprovalStatus,
  approvalEntityBadgeClass,
  approvalEntityLabel,
  approvalHistoryDotClass,
  approvalItemTitle,
  approvalStatusBadgeClass,
  approvalStatusLabel,
  liberacaoStatusBadgeClass,
  liberacaoStatusLabel,
  toPositiveId,
  toPositiveIdSet,
} from '../../services/approval.service';
import { CollaboratorService } from '../../services/collaborator.service';
import { EventAccreditationService } from '../../services/event-accreditation.service';
import { NotificationService } from '../../core/services/notification.service';
import { ModalComponent } from '../../shared/modal/modal.component';
import {
  BraceletChipComponent,
  BraceletSelectComponent,
} from '../../shared/bracelet-chip';
import { AuthService, AuthUser, hasPermission, isSuperAdmin } from '../../core/services/auth.service';

type InboxTab = 'pending' | 'mine' | 'team';
type TypeFilter = 'todos' | 'acesso' | 'evento' | 'credenciamento';
type StatusFilter = 'todos' | ApprovalStatus;

@Component({
  selector: 'app-approvals-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ModalComponent,
    BraceletChipComponent,
    BraceletSelectComponent,
  ],
  styleUrls: ['./approvals-inbox.component.scss'],
  template: `
    <div class="ap-inbox" *ngIf="canViewApprovals()">
      <section class="ap-scopes" role="tablist" aria-label="Escopo das aprovações">
        <button
          type="button"
          class="ap-scope"
          [class.on]="tab() === 'pending'"
          role="tab"
          [attr.aria-selected]="tab() === 'pending'"
          (click)="setTab('pending')"
        >
          <span class="ap-scope__ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3 8-8" />
              <path d="M20 12v7H4V5h11" />
            </svg>
          </span>
          <span class="ap-scope__body">
            <span class="ap-scope__head">
              <span class="ap-scope__t">Para eu decidir</span>
              <span class="ap-scope__n">{{ summaryPendingCount() }}</span>
            </span>
            <span class="ap-scope__d">Pendentes em que você ainda pode aprovar ou reprovar.</span>
            <span class="ap-urg" *ngIf="latePendingCount() > 0">{{ latePendingCount() }} há mais de 24 h</span>
          </span>
        </button>

        <button
          type="button"
          class="ap-scope"
          [class.on]="tab() === 'mine'"
          role="tab"
          [attr.aria-selected]="tab() === 'mine'"
          (click)="setTab('mine')"
        >
          <span class="ap-scope__ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </span>
          <span class="ap-scope__body">
            <span class="ap-scope__head">
              <span class="ap-scope__t">Minhas solicitações</span>
              <span class="ap-scope__n">{{ summaryMineCount() }}</span>
            </span>
            <span class="ap-scope__d">Tudo que você abriu, em qualquer status.</span>
            <span class="ap-pend" *ngIf="minePendingCount() > 0">
              {{ minePendingCount() }} pendente{{ minePendingCount() > 1 ? 's' : '' }}
            </span>
          </span>
        </button>

        <button
          type="button"
          class="ap-scope"
          [class.on]="tab() === 'team'"
          role="tab"
          [attr.aria-selected]="tab() === 'team'"
          (click)="setTab('team')"
        >
          <span class="ap-scope__ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M15 15c3 0 6 1.5 6 5" />
            </svg>
          </span>
          <span class="ap-scope__body">
            <span class="ap-scope__head">
              <span class="ap-scope__t">Da equipe</span>
              <span class="ap-scope__n">{{ summaryTeamCount() }}</span>
            </span>
            <span class="ap-scope__d">Visão do grupo, em qualquer status. Inclui as suas.</span>
            <span class="ap-pend" *ngIf="teamPendingCount() > 0">
              {{ teamPendingCount() }} pendente{{ teamPendingCount() > 1 ? 's' : '' }}
            </span>
          </span>
        </button>
      </section>

      <div class="ap-rule" *ngIf="tab() === 'pending'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <p *ngIf="viewerIsSuper()">
          <b>Superadministrador:</b> você vê todas as pendentes, sem recorte por time ou fluxo.
        </p>
        <p *ngIf="!viewerIsSuper()">
          Entram pendentes do seu <b>time aprovador</b> (papel Aprovador ou Gestor, vínculo ativo).
          Eventos entram sempre; acesso de serviço e credenciamento só se o tipo estiver ativo no seu vínculo.
          Se você já decidiu um nível, a solicitação sai daqui.
        </p>
      </div>

      <div class="ap-rule" *ngIf="tab() === 'mine'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <p>
          Critério: <b>você é o solicitante</b>. Reenvios mostram só o ciclo mais recente.
          Pendentes podem ser canceladas; aprovar não é possível aqui.
        </p>
      </div>

      <div class="ap-rule" *ngIf="tab() === 'team'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <p *ngIf="viewerIsSuper()"><b>Superadministrador:</b> todas as solicitações. Só leitura: use “Ver detalhes”.</p>
        <p *ngIf="!viewerIsSuper() && viewerIsCompany()">
          Solicitações de quem é da <b>sua empresa</b>. Só leitura: use “Ver detalhes”.
        </p>
        <p *ngIf="!viewerIsSuper() && !viewerIsCompany()">
          As suas e as de quem compartilha um <b>time ativo</b> com você
          <ng-container *ngIf="teamNamesLabel()"> ({{ teamNamesLabel() }})</ng-container>.
          Só leitura: use “Ver detalhes”.
        </p>
      </div>

      <div class="ap-tools">
        <label class="ap-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" />
          </svg>
          <input
            type="search"
            [ngModel]="searchText"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Buscar título, empresa, solicitante, ID…"
            aria-label="Buscar solicitações"
          />
        </label>
        <span class="ap-tools__sp"></span>
        <span class="ap-sort">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {{ sortLabel() }}
        </span>
      </div>

      <div class="ap-bar">
        <div class="ap-chips" role="group" aria-label="Tipo">
          <button type="button" class="ap-chip" [class.on]="typeFilter() === 'todos'" (click)="setTypeFilter('todos')">
            Todos os tipos <span class="ap-chip__k">{{ typeCount('todos') }}</span>
          </button>
          <button type="button" class="ap-chip" [class.on]="typeFilter() === 'acesso'" (click)="setTypeFilter('acesso')">
            Acessos <span class="ap-chip__k">{{ typeCount('acesso') }}</span>
          </button>
          <button type="button" class="ap-chip" [class.on]="typeFilter() === 'evento'" (click)="setTypeFilter('evento')">
            Eventos <span class="ap-chip__k">{{ typeCount('evento') }}</span>
          </button>
          <button type="button" class="ap-chip" [class.on]="typeFilter() === 'credenciamento'" (click)="setTypeFilter('credenciamento')">
            Credenciamento <span class="ap-chip__k">{{ typeCount('credenciamento') }}</span>
          </button>
        </div>
        <span class="ap-sep" *ngIf="tab() !== 'pending'"></span>
        <div class="ap-chips" *ngIf="tab() !== 'pending'" role="group" aria-label="Status">
          <button
            type="button"
            class="ap-chip"
            *ngFor="let status of statusFilters"
            [class.on]="statusFilter() === status"
            (click)="setStatusFilter(status)"
          >
            {{ statusChipLabel(status) }}
            <span class="ap-chip__k">{{ statusCount(status) }}</span>
          </button>
        </div>
      </div>

      <p *ngIf="loading()" class="text-center text-slate-500 py-8">Carregando...</p>

      <section class="ap-list" *ngIf="!loading()" aria-label="Solicitações">
        <div class="ap-empty" *ngIf="!visibleItems().length && showClearEmpty()">
          <div class="ap-empty__ic" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </div>
          <b>Tudo em dia</b>
          Nenhuma solicitação aguardando sua decisão.
        </div>
        <div class="ap-empty" *ngIf="!visibleItems().length && !showClearEmpty()">
          <b>Nada por aqui</b>
          Nenhuma solicitação com esses filtros.
        </div>

        <ng-container *ngIf="visibleItems().length">
          <div class="ap-lh" aria-hidden="true">
            <span></span>
            <span>Solicitação</span>
            <span>Período</span>
            <span>Time aprovador</span>
            <span>Solicitante</span>
            <span>Itens</span>
            <span>Status</span>
            <span style="text-align: right">Ações</span>
          </div>
          <div
            class="ap-row"
            *ngFor="let item of visibleItems(); trackBy: trackItem"
            [class.sel]="isRowSelected(item)"
            (click)="abrirDetalhe(item)"
          >
            <span class="ap-rail" [ngClass]="typeKey(item)"></span>
            <div class="ap-ttl">
              <div class="ap-meta">
                <span class="ap-tag" [ngClass]="typeKey(item)">{{ entityLabel(item.tipoEntidade) }}</span>
                <span class="ap-id">{{ shortId(item) }}</span>
                <span class="ap-tag ghost" *ngIf="(item.ciclo || 1) > 1">Reenvio · ciclo {{ item.ciclo }}</span>
                <span class="ap-tag mine" *ngIf="tab() === 'team' && isOwnRequest(item)">Sua</span>
              </div>
              <h3 [title]="itemTitle(item)">{{ itemTitle(item) }}</h3>
            </div>
            <div class="ap-cell ap-c-per">
              {{ periodLabel(item) }}
              <span class="ap-tag ghost" *ngIf="periodDays(item) as days">{{ days }} {{ days === 1 ? 'dia' : 'dias' }}</span>
            </div>
            <div class="ap-cell ap-c-team ap-ellip">{{ item.setor.nome }}</div>
            <div class="ap-cell ap-c-sol">
              <div class="ap-person">
                <span class="ap-mini">{{ initials(item.solicitante.nome || '') }}</span>
                <span class="ap-ellip">{{ isOwnRequest(item) ? 'Você' : (item.solicitante.nome || '—') }}</span>
              </div>
              <small *ngIf="item.solicitante.empresa">{{ item.solicitante.empresa }}</small>
            </div>
            <div class="ap-cell ap-c-cnt ap-counts">
              <span title="Colaboradores">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
                </svg>
                {{ collabTotal(item) }}
              </span>
              <span title="Veículos">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 13l2-6h14l2 6v5H3z" />
                  <circle cx="7" cy="18" r="1.5" />
                  <circle cx="17" cy="18" r="1.5" />
                </svg>
                {{ vehicleTotal(item) }}
              </span>
            </div>
            <div class="ap-mob">
              <span>{{ periodLabel(item) }}</span>
              <span>{{ item.setor.nome }}</span>
              <span>{{ isOwnRequest(item) ? 'Você' : (item.solicitante.nome || '—') }}</span>
              <span>{{ collabTotal(item) }} colab. · {{ vehicleTotal(item) }} veíc.</span>
            </div>
            <div class="ap-cell ap-stc">
              <span class="ap-st" [ngClass]="statusClass(item)">{{ statusPillLabel(item) }}</span>
              <div class="ap-prog">
                <span class="ap-age" [class.old]="isStale(item)">{{ ageLabel(item.criadoEm) }}</span>
                <ng-container *ngIf="levelLabel(item)"> · {{ levelLabel(item) }}</ng-container>
              </div>
            </div>
            <div class="ap-acts" (click)="$event.stopPropagation()">
              <ng-container *ngIf="tab() === 'pending' && item.status === 'PENDENTE'">
                <button type="button" class="ap-btn ap-btn--dng" (click)="abrirAcao(item, 'reject')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  Reprovar
                </button>
                <button type="button" class="ap-btn ap-btn--pri" (click)="abrirAcao(item, 'approve')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                  Aprovar
                </button>
              </ng-container>
              <button
                *ngIf="tab() === 'mine' && item.status === 'PENDENTE'"
                type="button"
                class="ap-btn ap-btn--dng"
                (click)="cancelar(item)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M6 6l12 12" />
                </svg>
                Cancelar
              </button>
              <button
                type="button"
                class="ap-btn ap-btn--icon"
                title="Ver detalhes"
                aria-label="Ver detalhes"
                (click)="abrirDetalhe(item)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </ng-container>
      </section>
    </div>

    <app-modal
      [open]="!!actionItem()"
      [title]="actionMode() === 'approve' ? 'Aprovar solicitação' : 'Reprovar solicitação'"
      [subtitle]="approveModalSubtitle()"
      [size]="actionMode() === 'approve' && hasSelectiveApproval() ? 'md' : 'sm'"
      (close)="fecharAcao()"
    >
      <div *ngIf="actionLoading()" class="text-sm text-slate-500 py-6 text-center">Carregando...</div>

      <form *ngIf="!actionLoading()" id="approval-action-form" (ngSubmit)="confirmarAcao()" class="space-y-5">
        <div>
          <label class="block text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2" for="approval-comment">
            Comentário
          </label>
          <textarea
            id="approval-comment"
            [(ngModel)]="actionComment"
            name="actionComment"
            rows="3"
            class="form-field rounded-xl min-h-[74px]"
            [placeholder]="
              actionMode() === 'reject'
                ? 'Informe o motivo da reprovação'
                : 'Adicione uma observação (opcional)'
            "
          ></textarea>
        </div>

        <ng-container *ngIf="actionMode() === 'approve' && hasSelectiveApproval()">
          <section>
            <div class="flex items-center justify-between gap-3 mb-2.5">
              <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Colaboradores
                <span
                  *ngIf="approveCollaborators().length"
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                  [ngClass]="
                    selectedCollaboratorCount() > 0
                      ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                      : 'bg-red-50 text-red-600'
                  "
                >
                  {{ selectedCollaboratorCount() }} de {{ approveCollaborators().length }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-[12.5px] font-semibold" *ngIf="approveCollaborators().length">
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllCollaborators(true)"
                >
                  Liberar todos
                </button>
                <span class="text-slate-300">·</span>
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllCollaborators(false)"
                >
                  Bloquear todos
                </button>
              </div>
            </div>

            <p *ngIf="!approveCollaborators().length" class="text-sm text-slate-500">
              Nenhum colaborador nesta solicitação.
            </p>

            <div class="flex flex-col gap-2" *ngIf="approveCollaborators().length">
              <div
                *ngFor="let c of approveCollaborators()"
                class="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-colors"
                [ngClass]="
                  isCollaboratorSelected(c.id)
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50/80 border-dashed border-slate-200'
                "
              >
                <button
                  type="button"
                  class="flex items-center gap-3 min-w-0 flex-1 text-left"
                  (click)="toggleCollaborator(c.id)"
                >
                  <span
                    class="shrink-0 w-5 h-5 rounded-md border-[1.5px] grid place-items-center transition-colors"
                    [ngClass]="
                      isCollaboratorSelected(c.id)
                        ? 'bg-[var(--wtorre)] border-[var(--wtorre)] text-white'
                        : 'bg-white border-slate-300 text-transparent'
                    "
                  >
                    <svg
                      class="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <img
                    *ngIf="pictureUrl(c) as url"
                    [src]="url"
                    [alt]="'Foto de ' + c.nome"
                    class="shrink-0 w-[34px] h-[34px] rounded-full object-cover border border-slate-200"
                  />
                  <span
                    *ngIf="!pictureUrl(c)"
                    class="shrink-0 w-[34px] h-[34px] rounded-full grid place-items-center text-[13px] font-semibold"
                    [ngClass]="
                      isCollaboratorSelected(c.id)
                        ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                        : 'bg-slate-100 text-slate-400'
                    "
                  >
                    {{ initials(c.nome) }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block text-sm font-medium truncate"
                      [ngClass]="isCollaboratorSelected(c.id) ? 'text-slate-900' : 'text-slate-400'"
                    >
                      {{ c.nome }}
                    </span>
                    <span
                      class="block text-[12.5px] truncate"
                      [ngClass]="isCollaboratorSelected(c.id) ? 'text-slate-500' : 'text-slate-400'"
                    >
                      {{ c.documento }} · {{ c.funcao }}
                      <ng-container *ngIf="c.empresa"> · {{ c.empresa }}</ng-container>
                      <ng-container *ngIf="c.fase"> · {{ c.fase }}</ng-container>
                    </span>
                  </span>
                </button>
                <app-bracelet-select
                  *ngIf="canEditBracelet(c, actionDetail())"
                  class="shrink-0"
                  [options]="braceletOptions(actionDetail())"
                  [value]="c.idBraceletType ?? null"
                  [disabled]="acting()"
                  [ariaLabel]="'Pulseira de ' + c.nome"
                  (valueChange)="onPickBracelet(c, $event, actionDetail())"
                />
                <app-bracelet-chip
                  *ngIf="!canEditBracelet(c, actionDetail()) && (c.pulseira || c.idBraceletType)"
                  class="shrink-0"
                  [name]="c.pulseira || ''"
                  [icon]="c.braceletIcon"
                  [color]="c.braceletColor"
                />
                <span
                  *ngIf="!isCollaboratorSelected(c.id)"
                  class="shrink-0 text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"
                >
                  Bloqueado
                </span>
              </div>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between gap-3 mb-2.5">
              <div class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
                Veículos
                <span
                  *ngIf="approveVehicles().length"
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal"
                  [ngClass]="
                    selectedVehicleCount() > 0
                      ? 'bg-[var(--wtorre-tonal-bg)] text-[var(--wtorre)]'
                      : 'bg-red-50 text-red-600'
                  "
                >
                  {{ selectedVehicleCount() }} de {{ approveVehicles().length }}
                </span>
              </div>
              <div class="flex items-center gap-1 text-[12.5px] font-semibold" *ngIf="approveVehicles().length">
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllVehicles(true)"
                >
                  Liberar todos
                </button>
                <span class="text-slate-300">·</span>
                <button
                  type="button"
                  class="text-[var(--wtorre)] hover:underline px-1"
                  (click)="markAllVehicles(false)"
                >
                  Bloquear todos
                </button>
              </div>
            </div>

            <p *ngIf="!approveVehicles().length" class="text-sm text-slate-500">Nenhum veículo nesta solicitação.</p>

            <div class="flex flex-col gap-2" *ngIf="approveVehicles().length">
              <button
                type="button"
                *ngFor="let v of approveVehicles()"
                class="flex items-center gap-3 w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors"
                [ngClass]="
                  isVehicleSelected(v.id)
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/80 border-dashed border-slate-200'
                "
                (click)="toggleVehicle(v.id)"
              >
                <span
                  class="shrink-0 w-5 h-5 rounded-md border-[1.5px] grid place-items-center transition-colors"
                  [ngClass]="
                    isVehicleSelected(v.id)
                      ? 'bg-[var(--wtorre)] border-[var(--wtorre)] text-white'
                      : 'bg-white border-slate-300 text-transparent'
                  "
                >
                  <svg
                    class="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span
                  class="shrink-0 w-[34px] h-[34px] rounded-[9px] grid place-items-center"
                  [ngClass]="isVehicleSelected(v.id) ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-400'"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-sm font-medium truncate"
                    [ngClass]="isVehicleSelected(v.id) ? 'text-slate-900' : 'text-slate-400'"
                  >
                    {{ v.placa }}
                  </span>
                  <span
                    class="block text-[12.5px] truncate"
                    *ngIf="v.marca || v.modelo || v.empresa || v.fase"
                    [ngClass]="isVehicleSelected(v.id) ? 'text-slate-500' : 'text-slate-400'"
                  >
                    <ng-container *ngIf="v.marca || v.modelo">{{ v.marca }} {{ v.modelo }}</ng-container>
                    <ng-container *ngIf="(v.marca || v.modelo) && (v.empresa || v.fase)"> · </ng-container>
                    <ng-container *ngIf="v.empresa">{{ v.empresa }}</ng-container>
                    <ng-container *ngIf="v.empresa && v.fase"> · </ng-container>
                    <ng-container *ngIf="v.fase">{{ v.fase }}</ng-container>
                  </span>
                </span>
                <span
                  *ngIf="!isVehicleSelected(v.id)"
                  class="shrink-0 text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full"
                >
                  Bloqueado
                </span>
              </button>
            </div>
          </section>

          <div class="flex gap-2.5 items-start text-[12.5px] text-slate-500 bg-slate-50 rounded-[10px] px-3.5 py-3">
            <svg
              class="w-4 h-4 shrink-0 mt-0.5 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>
              Itens desmarcados são aprovados na solicitação, mas
              <span class="font-semibold text-slate-700">não recebem credencial</span>
              na portaria.
            </span>
          </div>
        </ng-container>
      </form>

      <div
        modal-footer
        class="modal-footer !justify-between !items-center gap-3 flex-wrap sm:flex-nowrap"
      >
        <span
          *ngIf="actionMode() === 'approve' && hasSelectiveApproval() && !actionLoading()"
          class="text-[12.5px] text-slate-500 order-last sm:order-first w-full sm:w-auto"
        >
          <ng-container *ngIf="liberatedItemsCount() === 0">Nenhum item liberado</ng-container>
          <ng-container *ngIf="liberatedItemsCount() === 1">
            <span class="font-semibold text-slate-900">1</span> item liberado
          </ng-container>
          <ng-container *ngIf="liberatedItemsCount() > 1">
            <span class="font-semibold text-slate-900">{{ liberatedItemsCount() }}</span> itens liberados
          </ng-container>
        </span>
        <div class="flex gap-2.5 ml-auto">
          <button type="button" class="btn-action-secondary rounded-full" (click)="fecharAcao()">
            Cancelar
          </button>
          <button
            type="submit"
            form="approval-action-form"
            class="btn-action-primary rounded-full"
            [disabled]="acting() || actionLoading()"
          >
            <svg
              *ngIf="!acting() && actionMode() === 'approve'"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {{
              acting()
                ? 'Registrando...'
                : (actionMode() === 'approve' ? 'Confirmar aprovação' : 'Confirmar reprovação')
            }}
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class ApprovalsInboxComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationStateService);
  private readonly collaboratorService = inject(CollaboratorService);
  private readonly authService = inject(AuthService);

  tab = signal<InboxTab>('pending');
  currentUser = signal<AuthUser | null>(null);
  canViewApprovals = signal(false);
  items = signal<ApprovalItem[]>([]);
  pendingSummary = signal<ApprovalItem[]>([]);
  mineSummary = signal<ApprovalItem[]>([]);
  teamSummary = signal<ApprovalItem[]>([]);
  searchText = '';
  searchQuery = signal('');
  typeFilter = signal<TypeFilter>('todos');
  statusFilter = signal<StatusFilter>('todos');
  readonly statusFilters: StatusFilter[] = [
    'todos',
    'PENDENTE',
    'APROVADO',
    'REPROVADO',
    'CANCELADO',
    'EXPIRADO',
  ];
  pendingTotal = signal(0);
  mineTotal = signal(0);
  teamTotal = signal(0);
  loading = signal(false);
  detailOpen = signal(false);
  detailLoading = signal(false);
  detail = signal<ApprovalItem | null>(null);
  historyDetailOpen = signal<Set<number>>(new Set());

  actionItem = signal<ApprovalItem | null>(null);
  actionMode = signal<'approve' | 'reject'>('approve');
  actionComment = '';
  acting = signal(false);
  actionLoading = signal(false);
  actionDetail = signal<ApprovalItem | null>(null);
  selectedCollaboratorIds = signal<Set<number>>(new Set());
  selectedVehicleIds = signal<Set<number>>(new Set());
  thumbnailUrls = signal<Record<number, string>>({});
  private thumbnailLoadId = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly filterDebounceMs = 500;
  private static readonly LIST_PAGE_SIZE = 100;

  readonly entityLabel = approvalEntityLabel;
  readonly entityBadgeClass = approvalEntityBadgeClass;
  readonly badgeClass = approvalStatusBadgeClass;
  readonly itemTitle = approvalItemTitle;
  readonly historyDotClass = approvalHistoryDotClass;
  readonly liberacaoLabel = liberacaoStatusLabel;
  readonly liberacaoBadgeClass = liberacaoStatusBadgeClass;

  private deepLinkHandled = false;

  constructor(
    private approvalService: ApprovalService,
    private eventAccreditation: EventAccreditationService,
    private notification: NotificationService,
  ) {}

  async ngOnInit() {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam === 'mine' || tabParam === 'team') this.tab.set(tabParam);
    const user = await this.authService.getCurrentUser();
    this.currentUser.set(user);
    this.canViewApprovals.set(hasPermission(user, 'approvals', 'view'));
    this.carregar();
  }

  ngOnDestroy() {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.revokeThumbnails();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.actionItem()) return;
    if (this.detailOpen()) this.fecharDetalhe();
  }

  private openDeepLinkIfNeeded() {
    if (this.deepLinkHandled) return;
    const idParam = this.route.snapshot.queryParamMap.get('id');
    const actionParam = this.route.snapshot.queryParamMap.get('action');
    if (!idParam) return;
    this.deepLinkHandled = true;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idParam);
    if (!uuid) {
      void this.router.navigate(['/aprovacoes'], { replaceUrl: true });
      return;
    }
    void this.router.navigate(['/aprovacoes/abrir', idParam], {
      queryParams: actionParam ? { action: actionParam } : {},
      replaceUrl: true,
    });
  }

  summaryPendingCount(): number {
    return this.pendingTotal();
  }

  summaryMineCount(): number {
    return this.mineTotal();
  }

  summaryTeamCount(): number {
    return this.teamTotal();
  }

  latePendingCount(): number {
    return this.pendingSummary().filter((item) => this.isStale(item)).length;
  }

  minePendingCount(): number {
    return this.mineSummary().filter((item) => item.status === 'PENDENTE').length;
  }

  teamPendingCount(): number {
    return this.teamSummary().filter((item) => item.status === 'PENDENTE').length;
  }

  viewerIsSuper(): boolean {
    return isSuperAdmin(this.currentUser());
  }

  viewerIsCompany(): boolean {
    const user = this.currentUser();
    return !!(user?.requires_company || user?.profile?.requires_company);
  }

  teamNamesLabel(): string {
    const names = (this.currentUser()?.sectorMemberships ?? [])
      .map((membership) => membership.sectorNome)
      .filter((name): name is string => !!name);
    return [...new Set(names)].join(', ');
  }

  sortLabel(): string {
    return this.tab() === 'pending' ? 'Mais antigas primeiro' : 'Mais recentes primeiro';
  }

  onSearchChange(value: string) {
    this.searchText = value;
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchQuery.set(value);
      this.searchTimer = null;
      this.cdr.markForCheck();
    }, this.filterDebounceMs);
  }

  setTypeFilter(kind: TypeFilter) {
    this.typeFilter.set(kind);
  }

  setStatusFilter(status: StatusFilter) {
    this.statusFilter.set(status);
  }

  statusChipLabel(status: StatusFilter): string {
    if (status === 'todos') return 'Qualquer status';
    if (status === 'EXPIRADO') return 'Expirado';
    return approvalStatusLabel(status);
  }

  typeCount(kind: TypeFilter): number {
    const rows = this.searchedItems();
    if (kind === 'todos') return rows.length;
    return rows.filter((item) => this.typeKey(item) === kind).length;
  }

  statusCount(status: StatusFilter): number {
    const rows = this.typedItems();
    if (status === 'todos') return rows.length;
    return rows.filter((item) => item.status === status).length;
  }

  visibleItems(): ApprovalItem[] {
    if (this.tab() === 'pending' || this.statusFilter() === 'todos') return this.typedItems();
    const status = this.statusFilter();
    return this.typedItems().filter((item) => item.status === status);
  }

  showClearEmpty(): boolean {
    return (
      this.tab() === 'pending' &&
      !this.searchQuery().trim() &&
      this.typeFilter() === 'todos'
    );
  }

  trackItem(_index: number, item: ApprovalItem): ApprovalItem['id'] {
    return item.id;
  }

  typeKey(item: ApprovalItem): 'acesso' | 'evento' | 'credenciamento' {
    if (item.tipoEntidade === 'EVENTO') return 'evento';
    if (item.tipoEntidade === 'ACESSO_SERVICO') return 'acesso';
    return 'credenciamento';
  }

  shortId(item: ApprovalItem): string {
    const raw = String(item.id || '').replace(/-/g, '');
    return raw ? `#${raw.slice(0, 8)}` : '';
  }

  isOwnRequest(item: ApprovalItem): boolean {
    const user = this.currentUser();
    if (!user || item.solicitante?.id == null) return false;
    return sameEntityId(item.solicitante.id, user.id) || sameEntityId(item.solicitante.id, user.public_id);
  }

  isRowSelected(item: ApprovalItem): boolean {
    const open = this.detail();
    return !!open && sameEntityId(open.id, item.id);
  }

  collabTotal(item: ApprovalItem): number {
    return Number(item.liberacaoResumo?.colaboradores?.total || 0);
  }

  vehicleTotal(item: ApprovalItem): number {
    return Number(item.liberacaoResumo?.veiculos?.total || 0);
  }

  isStale(item: ApprovalItem): boolean {
    if (item.status !== 'PENDENTE' || !item.criadoEm) return false;
    const created = new Date(item.criadoEm).getTime();
    if (!Number.isFinite(created)) return false;
    return Date.now() - created > 24 * 60 * 60 * 1000;
  }

  ageLabel(value: string | null | undefined): string {
    if (!value) return '';
    const created = new Date(value).getTime();
    if (!Number.isFinite(created)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - created) / 60000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.round(hours / 24);
    return `há ${days} d`;
  }

  levelLabel(item: ApprovalItem): string {
    if (item.status !== 'PENDENTE') return '';
    const nivel = Number(item.nivelAtual) || 1;
    const total = Number(item.niveisExigidos) || 1;
    return `Nível ${nivel} de ${total}`;
  }

  statusClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'reprovado';
    if (this.hasBlocks(item)) return 'parcial';
    if (item.status === 'APROVADO') return 'aprovado';
    if (item.status === 'PENDENTE') return 'pendente';
    if (item.status === 'EXPIRADO') return 'expirado';
    return 'cancelado';
  }

  private searchedItems(): ApprovalItem[] {
    const query = this.searchQuery().trim().toLowerCase();
    const rows = this.items();
    if (!query) return rows;
    return rows.filter((item) => {
      const haystack = [
        this.itemTitle(item),
        String(item.id || ''),
        item.solicitante?.nome,
        item.solicitante?.empresa,
        item.setor?.nome,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  private typedItems(): ApprovalItem[] {
    const kind = this.typeFilter();
    const rows = this.searchedItems();
    if (kind === 'todos') return rows;
    return rows.filter((item) => this.typeKey(item) === kind);
  }

  hasSelectiveApproval(): boolean {
    const tipo = this.actionItem()?.tipoEntidade;
    return (
      tipo === 'ACESSO_SERVICO' ||
      tipo === 'EVENTO' ||
      tipo === 'CREDENCIAMENTO_EVENTO' ||
      tipo === 'CREDENCIAMENTO_EVENTO_INTERNO'
    );
  }

  approveCollaborators(): ApprovalEntityCollaborator[] {
    return this.actionDetail()?.entidade?.collaborators ?? [];
  }

  isAccreditationItem(item: ApprovalItem | null | undefined): boolean {
    const tipo = item?.tipoEntidade;
    return tipo === 'CREDENCIAMENTO_EVENTO' || tipo === 'CREDENCIAMENTO_EVENTO_INTERNO';
  }

  braceletOptions(item: ApprovalItem | null | undefined) {
    return item?.entidade?.braceletTypes ?? [];
  }

  braceletTarget(item: ApprovalItem | null | undefined): 'company' | 'internal' {
    return item?.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO' ? 'internal' : 'company';
  }

  canEditBracelet(
    c: ApprovalEntityCollaborator,
    item: ApprovalItem | null | undefined,
  ): boolean {
    if (!item || item.status !== 'PENDENTE' || !this.isAccreditationItem(item)) return false;
    if (c.statusLiberacao && c.statusLiberacao !== 'PENDENTE') return false;
    return (this.braceletOptions(item).length || 0) > 0;
  }

  onPickBracelet(
    c: ApprovalEntityCollaborator,
    idBracelet: number | string | null,
    item: ApprovalItem | null | undefined,
  ): void {
    const accreditationId = toPositiveId(item?.entidade?.idAccreditation);
    const braceletId = toPositiveId(idBracelet);
    if (!item || !c || accreditationId == null || braceletId == null) return;
    if (c.idBraceletType === braceletId) return;
    this.acting.set(true);
    this.eventAccreditation
      .changeBracelet(accreditationId, {
        target: this.braceletTarget(item),
        ids: [c.id],
        id_bracelet_type: braceletId,
      })
      .subscribe({
        next: () => {
          const option = this.braceletOptions(item).find((b) => b.id_bracelet_type === braceletId);
          this.applyLocalBracelet(item, c.id, braceletId, option?.name, option?.icon, option?.color);
          this.acting.set(false);
          this.notification.success('Pulseira atualizada.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.acting.set(false);
          this.notification.notifyHttpError(err, 'Falha ao trocar a pulseira.');
          this.cdr.markForCheck();
        },
      });
  }

  private applyLocalBracelet(
    item: ApprovalItem,
    collaboratorId: number,
    idBraceletType: number,
    name?: string | null,
    icon?: string | null,
    color?: string | null,
  ): void {
    const patch = (current: ApprovalItem | null): ApprovalItem | null => {
      if (!current?.entidade || current.id !== item.id) return current;
      return {
        ...current,
        entidade: {
          ...current.entidade,
          collaborators: current.entidade.collaborators.map((row) =>
            row.id === collaboratorId
              ? {
                  ...row,
                  idBraceletType,
                  pulseira: name ?? row.pulseira,
                  braceletIcon: icon ?? row.braceletIcon,
                  braceletColor: color ?? row.braceletColor,
                }
              : row,
          ),
        },
      };
    };
    this.actionDetail.set(patch(this.actionDetail()));
    this.detail.set(patch(this.detail()));
  }

  approveVehicles(): ApprovalEntityVehicle[] {
    return this.actionDetail()?.entidade?.vehicles ?? [];
  }

  approveModalSubtitle(): string {
    if (this.actionMode() === 'reject') {
      return 'Informe o motivo da reprovação.';
    }
    if (this.hasSelectiveApproval()) {
      return 'Marque quem recebe acesso. Desmarque para bloquear na portaria.';
    }
    return 'Comentário opcional para o solicitante.';
  }

  carregar() {
    this.loading.set(true);
    this.refreshSummaries();
    const pageSize = ApprovalsInboxComponent.LIST_PAGE_SIZE;

    if (this.tab() === 'pending') {
      this.approvalService.listPending(1, pageSize).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.items.set(data);
          this.pendingSummary.set(data);
          this.pendingTotal.set(Number(res.pagination?.total) || data.length);
          this.loading.set(false);
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.items.set([]);
          this.pendingSummary.set([]);
          this.pendingTotal.set(0);
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
      });
      return;
    }

    if (this.tab() === 'team') {
      this.approvalService.listTeam(1, pageSize).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.items.set(data);
          this.teamSummary.set(data);
          this.teamTotal.set(Number(res.pagination?.total) || data.length);
          this.loading.set(false);
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.items.set([]);
          this.teamSummary.set([]);
          this.teamTotal.set(0);
          this.loading.set(false);
          this.notification.notifyHttpError(err, 'Falha ao carregar total de solicitações.');
          this.openDeepLinkIfNeeded();
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.approvalService.listMine(1, pageSize).subscribe({
      next: (res) => {
        const data = res.data ?? [];
        this.items.set(data);
        this.mineSummary.set(data);
        this.mineTotal.set(Number(res.pagination?.total) || data.length);
        this.loading.set(false);
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.items.set([]);
        this.mineSummary.set([]);
        this.mineTotal.set(0);
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar aprovações.');
        this.openDeepLinkIfNeeded();
        this.cdr.markForCheck();
      },
    });
  }

  /** Mantém cards/badges de totais atualizados em qualquer aba. */
  private refreshSummaries() {
    const pageSize = ApprovalsInboxComponent.LIST_PAGE_SIZE;
    if (this.tab() !== 'pending') {
      this.approvalService.listPending(1, pageSize).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.pendingSummary.set(data);
          this.pendingTotal.set(Number(res.pagination?.total) || data.length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
    if (this.tab() !== 'mine') {
      this.approvalService.listMine(1, pageSize).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.mineSummary.set(data);
          this.mineTotal.set(Number(res.pagination?.total) || data.length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
    if (this.tab() !== 'team') {
      this.approvalService.listTeam(1, pageSize).subscribe({
        next: (res) => {
          const data = res.data ?? [];
          this.teamSummary.set(data);
          this.teamTotal.set(Number(res.pagination?.total) || data.length);
          this.cdr.markForCheck();
        },
        error: () => {
          /* resumo opcional */
        },
      });
    }
  }

  abrirDetalhe(item: ApprovalItem) {
    const id = String(item.id || '').trim();
    if (!id) return;
    void this.nav.navegar(
      '/aprovacoes/solicitacao',
      { public_id: id },
      { queryParams: this.tab() === 'pending' ? {} : { tab: this.tab() } },
    );
  }

  fecharDetalhe() {
    this.detailOpen.set(false);
    this.detailLoading.set(false);
    this.detail.set(null);
    this.historyDetailOpen.set(new Set());
    this.cdr.markForCheck();
  }

  detailModalTitle(): string {
    const d = this.detail();
    if (!d) return 'Detalhes da solicitação';
    return this.itemTitle(d);
  }

  detailModalSubtitle(): string {
    const d = this.detail();
    if (!d) return 'Carregando informações...';
    return `${this.entityLabel(d.tipoEntidade)} #${d.idEntidade} · ${d.setor.nome}`;
  }

  abrirAcaoDoDetalhe(mode: 'approve' | 'reject') {
    const d = this.detail();
    if (!d) return;
    this.fecharDetalhe();
    this.abrirAcao(d, mode);
  }

  isHistoryDetailOpen(index: number): boolean {
    return this.historyDetailOpen().has(index);
  }

  toggleHistoryDetail(index: number) {
    const next = new Set(this.historyDetailOpen());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.historyDetailOpen.set(next);
    this.cdr.markForCheck();
  }

  setTab(t: InboxTab) {
    this.tab.set(t);
    this.statusFilter.set('todos');
    this.fecharDetalhe();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: t === 'pending' ? null : t },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.carregar();
  }

  abrirAcao(item: ApprovalItem, mode: 'approve' | 'reject') {
    this.actionItem.set(item);
    this.actionMode.set(mode);
    this.actionComment = '';
    this.actionDetail.set(null);
    this.selectedCollaboratorIds.set(new Set());
    this.selectedVehicleIds.set(new Set());
    this.actionLoading.set(true);
    this.cdr.markForCheck();

    // Sempre revalida status ao entrar na ação (evita decisão duplicada com lista stale)
    this.approvalService.get(item.id).subscribe({
      next: (res) => {
        const fresh = res.approval;
        this.syncItemStatus(fresh);
        this.actionLoading.set(false);

        if (fresh.status !== 'PENDENTE') {
          this.fecharAcao();
          this.notification.warning(
            `Solicitação já ${this.statusPastLabel(fresh.status)}.`,
            'Outro membro da equipe já registrou a decisão.',
          );
          this.carregar();
          this.cdr.markForCheck();
          return;
        }

        this.actionItem.set(fresh);
        if (
          mode === 'approve' &&
          (fresh.tipoEntidade === 'ACESSO_SERVICO' ||
            fresh.tipoEntidade === 'EVENTO' ||
            fresh.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
            fresh.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO')
        ) {
          this.initApproveSelection(fresh);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading.set(false);
        this.fecharAcao();
        this.notification.notifyHttpError(err, 'Falha ao carregar dados para aprovação.');
        this.cdr.markForCheck();
      },
    });
  }

  private statusPastLabel(status: string): string {
    if (status === 'APROVADO') return 'aprovada';
    if (status === 'REPROVADO') return 'reprovada';
    if (status === 'CANCELADO') return 'cancelada';
    if (status === 'EXPIRADO') return 'finalizada (tempo de autorização expirada)';
    return 'finalizada';
  }

  /** Atualiza o card da lista com o status fresco (ao abrir solicitação). */
  private syncItemStatus(fresh: ApprovalItem) {
    this.items.update((list) =>
      list.map((it) => (it.id === fresh.id ? { ...it, status: fresh.status } : it)),
    );
    this.pendingSummary.update((list) =>
      list
        .map((it) => (it.id === fresh.id ? { ...it, status: fresh.status } : it))
        .filter((it) => it.status === 'PENDENTE'),
    );
    this.pendingTotal.set(this.pendingSummary().length);
    // Se estava em "Aguardando" e já não está pendente, some da aba pendentes
    if (this.tab() === 'pending' && fresh.status !== 'PENDENTE') {
      this.items.update((list) => list.filter((it) => it.id !== fresh.id));
    }
    const d = this.detail();
    if (d?.id === fresh.id) {
      this.detail.set({ ...d, ...fresh });
    }
  }

  private initApproveSelection(approval: ApprovalItem) {
    this.actionDetail.set(approval);
    this.selectedCollaboratorIds.set(
      toPositiveIdSet((approval.entidade?.collaborators ?? []).map((c) => c.id)),
    );
    this.selectedVehicleIds.set(
      toPositiveIdSet((approval.entidade?.vehicles ?? []).map((v) => v.id)),
    );
    this.loadThumbnails(approval.entidade?.collaborators ?? []);
    this.cdr.markForCheck();
  }

  pictureUrl(c: ApprovalEntityCollaborator): string | null {
    return this.thumbnailUrls()[c.idCollaborator] ?? null;
  }

  initials(nome: string): string {
    const parts = (nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  blockedTotal(item: ApprovalItem): number {
    const resumo = item.liberacaoResumo;
    if (!resumo) return 0;
    return Number(resumo.colaboradores?.bloqueados || 0) + Number(resumo.veiculos?.bloqueados || 0);
  }

  hasBlocks(item: ApprovalItem): boolean {
    return item.status === 'APROVADO' && this.blockedTotal(item) > 0;
  }

  showLiberacaoCounts(item: ApprovalItem): boolean {
    return item.status === 'APROVADO';
  }

  cardBarClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-500';
    if (this.hasBlocks(item)) return 'bg-orange-500';
    if (item.status === 'APROVADO') return 'bg-emerald-500';
    if (item.status === 'PENDENTE') return 'bg-amber-400';
    return 'bg-slate-300';
  }

  statusPillClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-50 text-rose-700 ring-rose-600/20';
    if (this.hasBlocks(item)) return 'bg-orange-50 text-orange-700 ring-orange-600/20';
    if (item.status === 'APROVADO') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    if (item.status === 'PENDENTE') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    return 'bg-slate-100 text-slate-600 ring-slate-400/20';
  }

  statusPillDotClass(item: ApprovalItem): string {
    if (item.status === 'REPROVADO') return 'bg-rose-500';
    if (this.hasBlocks(item)) return 'bg-orange-500';
    if (item.status === 'APROVADO') return 'bg-emerald-500';
    if (item.status === 'PENDENTE') return 'bg-amber-500';
    return 'bg-slate-400';
  }

  statusPillLabel(item: ApprovalItem): string {
    if (this.hasBlocks(item)) return 'Liberado parcialmente';
    if (item.status === 'PENDENTE') return 'Aguardando aprovação';
    return approvalStatusLabel(item.status);
  }

  axisHasBlocks(item: ApprovalItem, axis: 'colaboradores' | 'veiculos'): boolean {
    if (item.status !== 'APROVADO') return false;
    return Number(item.liberacaoResumo?.[axis]?.bloqueados || 0) > 0;
  }

  axisCardClass(item: ApprovalItem, axis: 'colaboradores' | 'veiculos'): string {
    return this.axisHasBlocks(item, axis)
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-slate-200 bg-slate-50/60';
  }

  axisShare(part: number, total: number): number {
    const t = Number(total) || 0;
    if (t <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(part) / t) * 100));
  }

  countLabel(count: number, singular: string, plural: string): string {
    return Number(count) === 1 ? singular : plural;
  }

  periodDays(item: ApprovalItem): number | null {
    const start = item.entidadeResumo?.startDate;
    const end = item.entidadeResumo?.endDate;
    if (!start || !end) return null;
    const parse = (value: string) => {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
      if (!y || !m || !d) return NaN;
      return Date.UTC(y, m - 1, d);
    };
    const from = parse(start);
    const to = parse(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.max(1, Math.round((to - from) / 86400000) + 1);
  }

  periodLabel(item: ApprovalItem): string {
    const start = item.entidadeResumo?.startDate;
    const end = item.entidadeResumo?.endDate;
    if (!start && !end) return '—';
    const fmt = (value: string, opts: Intl.DateTimeFormatOptions) => {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1)
        .toLocaleDateString('pt-BR', opts)
        .replace(/\./g, '');
    };
    if (start && end) {
      const sameMonth =
        String(start).slice(0, 7) === String(end).slice(0, 7);
      const startPart = fmt(start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
      const endPart = fmt(end, { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startPart} – ${endPart}`;
    }
    return fmt((start || end) as string, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private loadThumbnails(list: ApprovalEntityCollaborator[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.picture) continue;
      this.collaboratorService.getPictureBlob(c.picture).subscribe({
        next: (url) => {
          if (loadId !== this.thumbnailLoadId) return;
          this.thumbnailUrls.update((map) => ({ ...map, [c.idCollaborator]: url }));
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    this.thumbnailUrls.set({});
  }

  isCollaboratorSelected(id: number): boolean {
    const n = toPositiveId(id);
    return n != null && this.selectedCollaboratorIds().has(n);
  }

  isVehicleSelected(id: number): boolean {
    const n = toPositiveId(id);
    return n != null && this.selectedVehicleIds().has(n);
  }

  selectedCollaboratorCount(): number {
    return this.selectedCollaboratorIds().size;
  }

  selectedVehicleCount(): number {
    return this.selectedVehicleIds().size;
  }

  liberatedItemsCount(): number {
    return this.selectedCollaboratorCount() + this.selectedVehicleCount();
  }

  toggleCollaborator(id: number) {
    const n = toPositiveId(id);
    if (n == null) return;
    const next = new Set(this.selectedCollaboratorIds());
    if (next.has(n)) next.delete(n);
    else next.add(n);
    this.selectedCollaboratorIds.set(next);
    this.cdr.markForCheck();
  }

  toggleVehicle(id: number) {
    const n = toPositiveId(id);
    if (n == null) return;
    const next = new Set(this.selectedVehicleIds());
    if (next.has(n)) next.delete(n);
    else next.add(n);
    this.selectedVehicleIds.set(next);
    this.cdr.markForCheck();
  }

  markAllCollaborators(selected: boolean) {
    this.selectedCollaboratorIds.set(
      selected ? toPositiveIdSet(this.approveCollaborators().map((c) => c.id)) : new Set(),
    );
    this.cdr.markForCheck();
  }

  markAllVehicles(selected: boolean) {
    this.selectedVehicleIds.set(
      selected ? toPositiveIdSet(this.approveVehicles().map((v) => v.id)) : new Set(),
    );
    this.cdr.markForCheck();
  }

  fecharAcao() {
    this.actionItem.set(null);
    this.actionComment = '';
    this.actionDetail.set(null);
    this.actionLoading.set(false);
    this.selectedCollaboratorIds.set(new Set());
    this.selectedVehicleIds.set(new Set());
    this.revokeThumbnails();
  }

  confirmarAcao() {
    const item = this.actionItem();
    if (!item) return;
    if (this.actionMode() === 'reject' && !this.actionComment.trim()) {
      this.notification.error('Comentário é obrigatório ao reprovar.');
      return;
    }
    this.acting.set(true);

    if (this.actionMode() === 'approve') {
      const payload: {
        comentario?: string;
        approvedCollaboratorIds?: number[];
        approvedVehicleIds?: number[];
      } = {
        comentario: this.actionComment.trim() || undefined,
      };
      if (
        item.tipoEntidade === 'ACESSO_SERVICO' ||
        item.tipoEntidade === 'EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO' ||
        item.tipoEntidade === 'CREDENCIAMENTO_EVENTO_INTERNO'
      ) {
        payload.approvedCollaboratorIds = [...this.selectedCollaboratorIds()];
        payload.approvedVehicleIds = [...this.selectedVehicleIds()];
      }
      this.approvalService.approve(item.id, payload).subscribe({
        next: () => this.onActionSuccess(),
        error: (err) => this.onActionError(err),
      });
      return;
    }

    this.approvalService.reject(item.id, this.actionComment.trim()).subscribe({
      next: () => this.onActionSuccess(),
      error: (err) => this.onActionError(err),
    });
  }

  private onActionSuccess() {
    this.acting.set(false);
    this.fecharAcao();
    this.notification.success('Decisão registrada.');
    this.carregar();
  }

  private onActionError(err: unknown) {
    this.acting.set(false);
    this.notification.notifyHttpError(err, 'Falha ao registrar decisão.');
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status === 409) {
      this.fecharAcao();
      this.fecharDetalhe();
      this.carregar();
    }
    this.cdr.markForCheck();
  }

  cancelarDetalhe() {
    const item = this.detail();
    if (item) this.cancelar(item);
  }

  cancelar(item: ApprovalItem) {
    this.approvalService.cancel(item.id).subscribe({
      next: () => {
        this.notification.success('Solicitação cancelada.');
        this.fecharDetalhe();
        this.carregar();
      },
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao cancelar.'),
    });
  }
}
