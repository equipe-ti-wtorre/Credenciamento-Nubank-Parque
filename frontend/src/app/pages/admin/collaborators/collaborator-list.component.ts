import { ChangeDetectorRef, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  CollaboratorDocumentType,
  CollaboratorItem,
  CollaboratorRole,
  CollaboratorService,
  formatCpf,
  isCpfDocumentType,
  normalizeCpfInput,
} from '../../../services/collaborator.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActionBtnComponent } from '../../../shared/actions/action-btn.component';
import { ActionMenuComponent } from '../../../shared/actions/action-menu.component';
import { ActionDropdownComponent } from '../../../shared/actions/action-dropdown.component';
import { ActionDropdownItemDirective } from '../../../shared/actions/action-dropdown-item.directive';
import { ModalComponent } from '../../../shared/modal/modal.component';
import { FaceCropModalComponent } from '../../../shared/face-crop/face-crop-modal.component';
import { WebcamCaptureModalComponent } from '../../../shared/webcam-capture/webcam-capture-modal.component';
import { BulkImportWizardComponent } from '../../../shared/bulk-import/bulk-import-wizard.component';
import { BulkImportAdapters } from '../../../shared/bulk-import/bulk-import.types';

interface CollaboratorFormState {
  id_collaborator_document_type: number | null;
  id_collaborator_role: number | null;
  document: string;
  name: string;
  rg: string;
  phone: string;
  status: boolean;
  isBlacklisted: boolean;
}

@Component({
  selector: 'app-collaborator-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionBtnComponent,
    ActionMenuComponent,
    ActionDropdownComponent,
    ActionDropdownItemDirective,
    ModalComponent,
    FaceCropModalComponent,
    WebcamCaptureModalComponent,
    BulkImportWizardComponent,
  ],
  styleUrl: './collaborator-list.component.scss',
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-title">Colaboradores</h2>
          <p class="page-subtitle">
            Cadastro global de pessoas físicas (equipe, prestadores e operação de eventos).
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button type="button" (click)="carregar()" [disabled]="loading()" class="btn-outline">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" (click)="abrirBulkModal()" class="btn-outline">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="m7 9 5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            Upload em lote
          </button>
          <button type="button" (click)="abrirRolesModal()" class="btn-outline">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Gerenciar funções
          </button>
          <button type="button" (click)="novoColaborador()" class="btn-action-primary">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo colaborador
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div class="stat-card">
          <div class="stat-card__icon">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Total (página)</p>
            <p class="stat-card__value text-slate-800">{{ stats().total }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--success">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="m16 11 2 2 4-4" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Ativos</p>
            <p class="stat-card__value text-emerald-700">{{ stats().ativos }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="m17 8-5 5" />
              <path d="m17 13-5-5" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Inativos</p>
            <p class="stat-card__value text-slate-800">{{ stats().inativos }}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon stat-card__icon--danger">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 9 6 6" />
              <path d="m15 9-6 6" />
            </svg>
          </div>
          <div>
            <p class="stat-card__label">Na blacklist</p>
            <p class="stat-card__value text-rose-700">{{ stats().blacklist }}</p>
          </div>
        </div>
      </div>

      <div class="card-surface p-4 mb-4 shrink-0">
        <div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Documento</label>
            <input
              [(ngModel)]="filterDocument"
              (ngModelChange)="onTextFilterChange()"
              name="filterDocument"
              placeholder="CPF, RG ou passaporte"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Nome</label>
            <input
              [(ngModel)]="filterName"
              (ngModelChange)="onTextFilterChange()"
              name="filterName"
              placeholder="Nome completo"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Tipo doc.</label>
            <select
              [(ngModel)]="filterDocTypeId"
              (ngModelChange)="aplicarFiltros()"
              name="filterDocTypeId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todos</option>
              <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                {{ t.description }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Função</label>
            <select
              [(ngModel)]="filterRoleId"
              (ngModelChange)="aplicarFiltros()"
              name="filterRoleId"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option [ngValue]="null">Todas</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Status</label>
            <select
              [(ngModel)]="filterStatus"
              (ngModelChange)="aplicarFiltros()"
              name="filterStatus"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <div>
            <button type="button" (click)="limparFiltros()" class="btn-outline-primary w-full justify-center">
              Limpar
            </button>
          </div>
        </div>
      </div>

      <div class="card-surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="table-head sticky top-0 bg-slate-50 z-10">
            <tr>
              <th class="px-4 py-3 text-left w-14">Foto</th>
              <th class="px-4 py-3 text-left">Nome</th>
              <th class="px-4 py-3 text-left">Documento</th>
              <th class="px-4 py-3 text-left">Tipo</th>
              <th class="px-4 py-3 text-left">Função</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left">Blacklist</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngIf="!loading(); else loadingRow">
              <tr *ngFor="let c of collaborators()" class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3">
                  <img
                    *ngIf="pictureUrl(c) as url"
                    [src]="url"
                    [alt]="'Foto de ' + c.name"
                    class="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                  <div
                    *ngIf="!pictureUrl(c)"
                    class="w-10 h-10 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0 border border-slate-200"
                    aria-hidden="true"
                  >
                    {{ initials(c.name) }}
                  </div>
                </td>
                <td class="px-4 py-3 font-medium text-slate-800">{{ c.name }}</td>
                <td class="px-4 py-3 font-mono text-slate-600">{{ formatDocument(c) }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.document_type?.description || '—' }}</td>
                <td class="px-4 py-3 text-slate-600">{{ c.role?.description || '—' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class.bg-emerald-100]="c.status"
                    [class.text-emerald-800]="c.status"
                    [class.bg-slate-100]="!c.status"
                    [class.text-slate-600]="!c.status"
                  >
                    {{ c.status ? 'Ativo' : 'Inativo' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span
                    *ngIf="c.is_blacklisted"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800"
                  >
                    Blacklist
                  </span>
                  <span *ngIf="!c.is_blacklisted" class="text-slate-400 text-xs">—</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end">
                    <app-action-menu>
                      <app-action-btn icon="edit" title="Editar" variant="neutral" (action)="editar(c)" />
                      <app-action-dropdown>
                        <button
                          appActionDropdownItem
                          type="button"
                          (click)="alterarStatus(c, !c.status)"
                        >
                          <svg
                            class="action-dropdown__item-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.75"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                            <path d="M12 2v10" />
                          </svg>
                          {{ c.status ? 'Desativar' : 'Ativar' }}
                        </button>
                        <button
                          appActionDropdownItem
                          type="button"
                          (click)="c.is_blacklisted ? removerBlacklist(c) : incluirBlacklist(c)"
                        >
                          <svg
                            class="action-dropdown__item-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.75"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            @if (c.is_blacklisted) {
                              <path d="M9 12l2 2 4-4" />
                            } @else {
                              <path d="m9 9 6 6" />
                              <path d="m15 9-6 6" />
                            }
                          </svg>
                          {{ c.is_blacklisted ? 'Remover da blacklist' : 'Adicionar à blacklist' }}
                        </button>
                        @if (c.can_delete) {
                          <hr class="action-dropdown__divider" />
                          <button
                            appActionDropdownItem
                            type="button"
                            [danger]="true"
                            (click)="excluirColaborador(c)"
                          >
                            <svg
                              class="action-dropdown__item-icon"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.75"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            Excluir
                          </button>
                        }
                      </app-action-dropdown>
                    </app-action-menu>
                  </div>
                </td>
              </tr>
              <tr *ngIf="collaborators().length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-slate-500">Nenhum colaborador encontrado.</td>
              </tr>
            </ng-container>
            <ng-template #loadingRow>
              <tr>
                <td colspan="8" class="px-4 py-8 text-center text-slate-500">Carregando colaboradores...</td>
              </tr>
            </ng-template>
          </tbody>
        </table>

        <div
          *ngIf="pagination().totalPages > 1"
          class="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0 bg-white"
        >
          <span class="text-xs text-slate-500">
            Página {{ pagination().page }} de {{ pagination().totalPages }} ({{ pagination().total }} registros)
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="irPagina(pagination().page - 1)"
              [disabled]="pagination().page <= 1"
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              (click)="irPagina(pagination().page + 1)"
              [disabled]="pagination().page >= pagination().totalPages"
              class="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-modal
      [open]="showModal()"
      [title]="editingId() ? 'Editar colaborador' : 'Novo colaborador'"
      [subtitle]="editingId() ? 'Atualize os dados do colaborador.' : 'Preencha os dados para cadastrar um novo colaborador.'"
      size="lg"
      (close)="fecharModal()"
    >
      <form id="collaborator-form" class="collab-form" (ngSubmit)="salvar()">
        <div class="collab-grid">
          <div class="collab-field">
            <label class="form-label" for="collab-doc-type">Tipo de documento</label>
            <select
              id="collab-doc-type"
              [(ngModel)]="form.id_collaborator_document_type"
              name="id_collaborator_document_type"
              required
              (ngModelChange)="onDocTypeChange()"
              class="form-select"
            >
              <option [ngValue]="null" disabled>Selecione</option>
              <option *ngFor="let t of documentTypes()" [ngValue]="t.id_collaborator_document_type">
                {{ t.description }}
              </option>
            </select>
          </div>
          <div class="collab-field">
            <label class="form-label" for="collab-document">Documento</label>
            <input
              id="collab-document"
              [(ngModel)]="form.document"
              name="document"
              required
              [placeholder]="documentPlaceholder()"
              class="form-field font-mono"
            />
          </div>
          <div class="collab-field">
            <label class="form-label" for="collab-name">Nome completo</label>
            <input
              id="collab-name"
              [(ngModel)]="form.name"
              name="name"
              required
              class="form-field"
            />
          </div>
          <div class="collab-field">
            <label class="form-label" for="collab-role">Função / cargo</label>
            <select
              id="collab-role"
              [(ngModel)]="form.id_collaborator_role"
              name="id_collaborator_role"
              required
              class="form-select"
            >
              <option [ngValue]="null" disabled>Selecione</option>
              <option *ngFor="let r of roles()" [ngValue]="r.id_collaborator_role">{{ r.description }}</option>
            </select>
          </div>
          <div class="collab-field">
            <label class="form-label" for="collab-rg">
              RG <span class="form-label__optional">(opcional)</span>
            </label>
            <input id="collab-rg" [(ngModel)]="form.rg" name="rg" class="form-field" />
          </div>
          <div class="collab-field">
            <label class="form-label" for="collab-phone">
              Telefone <span class="form-label__optional">(opcional)</span>
            </label>
            <input id="collab-phone" [(ngModel)]="form.phone" name="phone" class="form-field" />
          </div>

          <div class="collab-field collab-field--full">
            <label class="form-label">Foto</label>
            <div class="collab-photo">
              <div class="collab-photo__preview" aria-hidden="true">
                <img *ngIf="picturePreviewUrl()" [src]="picturePreviewUrl()" alt="" />
                <ng-container *ngIf="!picturePreviewUrl()">{{ initials(form.name) }}</ng-container>
                <span *ngIf="photoFaceOk()" class="collab-photo__badge" title="Rosto validado">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </div>
              <div class="collab-photo__main">
                <div
                  class="collab-dropzone"
                  [class.collab-dropzone--dragover]="pictureDragOver()"
                  tabindex="0"
                  role="button"
                  (click)="pictureInput.click()"
                  (keydown.enter)="pictureInput.click()"
                  (keydown.space)="$event.preventDefault(); pictureInput.click()"
                  (dragover)="onPictureDragOver($event)"
                  (dragleave)="onPictureDragLeave($event)"
                  (drop)="onPictureDrop($event)"
                >
                  <input
                    #pictureInput
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    class="hidden"
                    (change)="onPictureSelected($event)"
                  />
                  <span class="collab-dropzone__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 16V4" />
                      <path d="M6 10l6-6 6 6" />
                      <path d="M4 20h16" />
                    </svg>
                  </span>
                  <span class="collab-dropzone__title">Escolher arquivo ou arraste aqui</span>
                  <span class="collab-dropzone__hint">
                    JPEG, PNG ou WebP · até 12 MB · enquadre o rosto (envio até 2 MB)
                  </span>
                </div>
                <div class="collab-photo__actions">
                  <button
                    type="button"
                    class="btn-outline collab-photo__webcam"
                    (click)="abrirWebcamCapture()"
                    [disabled]="pictureValidating()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Capturar com webcam
                  </button>
                  <span *ngIf="pictureValidating()" class="collab-photo__hint">Validando foto facial...</span>
                  <span *ngIf="!pictureValidating() && photoFaceOk()" class="collab-photo__valid">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Rosto enquadrado
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="collab-section-label">Situação</p>
        <div class="collab-status">
          <div class="collab-status__row" [class.is-locked]="form.isBlacklisted">
            <span class="collab-status__icon collab-status__icon--ok" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4 12 14.01l-3-3" />
              </svg>
            </span>
            <span class="collab-status__text">
              <span class="collab-status__title">Colaborador ativo</span>
              <span class="collab-status__desc">Disponível para credenciamento e acessos.</span>
            </span>
            <button
              type="button"
              class="collab-switch"
              [class.is-on]="form.status"
              role="switch"
              [attr.aria-checked]="form.status"
              aria-label="Colaborador ativo"
              (click)="toggleAtivo()"
            ></button>
          </div>

          <div class="collab-status__divider"></div>

          <div class="collab-status__row">
            <span class="collab-status__icon collab-status__icon--danger" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" />
              </svg>
            </span>
            <span class="collab-status__text">
              <span class="collab-status__title">Blacklist</span>
              <span class="collab-status__desc">Bloqueia o colaborador em credenciamento e portaria.</span>
              <span *ngIf="form.isBlacklisted && blacklistReason()" class="collab-status__reason">
                Motivo: {{ blacklistReason() }}
              </span>
            </span>
            <button
              type="button"
              class="collab-switch collab-switch--danger"
              [class.is-on]="form.isBlacklisted"
              role="switch"
              [attr.aria-checked]="form.isBlacklisted"
              [attr.aria-label]="form.isBlacklisted ? 'Remover da blacklist' : 'Adicionar à blacklist'"
              (click)="onBlacklistToggleClick()"
            ></button>
          </div>
        </div>
      </form>

      <div modal-footer class="modal-footer collab-modal-footer">
        <button type="button" (click)="fecharModal()" class="btn-action-secondary collab-btn-pill">Cancelar</button>
        <button
          type="submit"
          form="collaborator-form"
          [disabled]="saving() || pictureValidating()"
          class="btn-action-primary collab-btn-pill"
        >
          {{ saving() ? 'Salvando...' : (editingId() ? 'Salvar alterações' : 'Salvar colaborador') }}
        </button>
      </div>
    </app-modal>

    <app-bulk-import-wizard
      [open]="showBulkModal()"
      title="Upload em lote — Colaboradores"
      subtitle="Envie a planilha, revise novos cadastros e divergências, e confirme a importação."
      [adapters]="bulkAdapters"
      (closed)="fecharBulkModal()"
      (completed)="onBulkCompleted()"
    />

    <app-modal
      [open]="showRolesModal()"
      title="Gerenciar funções"
      subtitle="Cadastre, renomeie ou exclua funções/cargos de colaboradores."
      size="md"
      [interceptEscape]="inlineEditingRoleId() !== null"
      (close)="fecharRolesModal()"
      (escapePress)="cancelarEdicaoInlineRole()"
    >
      <form class="flex gap-2 mb-4" (ngSubmit)="adicionarRole()">
        <input
          [(ngModel)]="roleFormDescription"
          name="roleFormDescription"
          maxlength="100"
          placeholder="Nome da função"
          class="form-field flex-1"
          (keydown.escape)="$event.stopPropagation()"
        />
        <button
          type="submit"
          class="btn-action-primary shrink-0"
          [disabled]="!roleFormDescription.trim() || rolesSaving()"
        >
          {{ rolesSaving() ? 'Adicionando...' : 'Adicionar' }}
        </button>
      </form>

      <div class="rounded-xl border border-[var(--app-border)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-[var(--app-border)]">
          <span class="text-xs font-bold uppercase text-slate-500">Funções cadastradas</span>
          <span class="text-xs text-slate-400">{{ roles().length }} {{ roles().length === 1 ? 'função' : 'funções' }}</span>
        </div>

        @if (roles().length === 0) {
          <p class="px-4 py-8 text-center text-sm text-slate-500">Nenhuma função cadastrada.</p>
        } @else {
          <ul class="divide-y divide-[var(--app-border)]">
            @for (r of roles(); track r.id_collaborator_role) {
              <li class="flex items-center gap-2 px-4 py-2.5 min-h-[3rem]">
                @if (inlineEditingRoleId() === r.id_collaborator_role) {
                  <input
                    #inlineRoleInput
                    [(ngModel)]="inlineEditingRoleName"
                    name="inlineEditingRoleName"
                    maxlength="100"
                    class="form-field flex-1"
                    (keydown.enter)="salvarEdicaoInlineRole()"
                    (keydown.escape)="cancelarEdicaoInlineRole(); $event.stopPropagation()"
                  />
                  <button
                    type="button"
                    class="btn-action-icon text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    aria-label="Confirmar"
                    [disabled]="rolesSaving()"
                    (click)="salvarEdicaoInlineRole()"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="btn-action-icon"
                    aria-label="Cancelar edição"
                    (click)="cancelarEdicaoInlineRole()"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                } @else {
                  <span class="flex-1 text-sm font-medium text-slate-800 truncate">{{ r.description }}</span>
                  <button
                    type="button"
                    class="btn-action-icon"
                    aria-label="Editar função"
                    (click)="iniciarEdicaoInlineRole(r)"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="btn-action-danger-soft"
                    aria-label="Excluir função"
                    (click)="excluirRole(r)"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                }
              </li>
            }
          </ul>
        }
      </div>

      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="fecharRolesModal()">Fechar</button>
      </div>
    </app-modal>

    <app-face-crop-modal
      [open]="showFaceCropModal()"
      [imageUrl]="faceCropSourceUrl()"
      [fileName]="faceCropSourceName()"
      (cancel)="cancelFaceCrop()"
      (cropped)="onFaceCropped($event)"
    />

    <app-webcam-capture-modal
      [open]="showWebcamModal()"
      (cancel)="fecharWebcamCapture()"
      (captured)="onWebcamCaptured($event)"
    />
  `,
})
export class CollaboratorListComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  collaborators = signal<CollaboratorItem[]>([]);
  documentTypes = signal<CollaboratorDocumentType[]>([]);
  roles = signal<CollaboratorRole[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  showBulkModal = signal(false);
  showRolesModal = signal(false);
  showFaceCropModal = signal(false);
  showWebcamModal = signal(false);
  faceCropSourceUrl = signal<string | null>(null);
  faceCropSourceName = signal('foto.jpg');
  picturePreviewUrl = signal<string | null>(null);
  pictureDragOver = signal(false);
  pendingPictureFile = signal<File | null>(null);
  pictureValidating = signal(false);
  pictureValidationOk = signal(false);
  thumbnailUrls = signal<Record<number, string>>({});
  editingId = signal<number | null>(null);
  blacklistReason = signal<string | null>(null);
  inlineEditingRoleId = signal<number | null>(null);
  inlineEditingRoleName = '';
  rolesSaving = signal(false);
  roleFormDescription = '';

  pagination = signal({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  filterDocument = '';
  filterName = '';
  filterDocTypeId: number | null = null;
  filterRoleId: number | null = null;
  filterStatus = '';

  appliedDocument = '';
  appliedName = '';
  appliedDocTypeId: number | null = null;
  appliedRoleId: number | null = null;
  appliedStatus: boolean | undefined = undefined;

  form: CollaboratorFormState = this.emptyForm();

  private readonly pictureAcceptMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly pictureAcceptExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  private readonly pictureMaxBytes = 2 * 1024 * 1024;
  /** Foto original pode ser maior: o limite de 2 MB vale para o recorte enviado. */
  private readonly pictureSourceMaxBytes = 12 * 1024 * 1024;
  private readonly filterDebounceMs = 350;
  private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbnailLoadId = 0;

  readonly bulkAdapters: BulkImportAdapters = {
    downloadTemplate: () => this.collaboratorService.downloadBulkTemplate(),
    preview: (file) => this.collaboratorService.bulkPreview(file),
    commit: (previewId, decisions) => this.collaboratorService.bulkCommit(previewId, decisions),
    templateFilename: 'template-colaboradores.xlsx',
  };

  stats = computed(() => {
    const list = this.collaborators();
    return {
      total: list.length,
      ativos: list.filter((c) => c.status).length,
      inativos: list.filter((c) => !c.status).length,
      blacklist: list.filter((c) => c.is_blacklisted).length,
    };
  });

  constructor(
    private collaboratorService: CollaboratorService,
    private notification: NotificationService,
  ) {
    this.carregarDominios();
    this.carregar();
  }

  ngOnDestroy() {
    this.clearFilterDebounce();
    this.revokeThumbnails();
    this.revokePicturePreview();
    this.revokeFaceCropSource();
  }

  private emptyForm(): CollaboratorFormState {
    return {
      id_collaborator_document_type: null,
      id_collaborator_role: null,
      document: '',
      name: '',
      rg: '',
      phone: '',
      status: true,
      isBlacklisted: false,
    };
  }

  carregarDominios() {
    this.collaboratorService.listDocumentTypes().subscribe({
      next: (res) => this.documentTypes.set(res.types),
      error: (err) =>
        this.notification.notifyHttpError(err, 'Falha ao carregar tipos de documento.'),
    });
    this.collaboratorService.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar funções.'),
    });
  }

  carregarRoles() {
    this.collaboratorService.listRoles().subscribe({
      next: (res) => this.roles.set(res.roles),
      error: (err) => this.notification.notifyHttpError(err, 'Falha ao carregar funções.'),
    });
  }

  abrirRolesModal() {
    this.inlineEditingRoleId.set(null);
    this.inlineEditingRoleName = '';
    this.roleFormDescription = '';
    this.carregarRoles();
    this.showRolesModal.set(true);
  }

  fecharRolesModal() {
    this.showRolesModal.set(false);
    this.inlineEditingRoleId.set(null);
    this.inlineEditingRoleName = '';
    this.roleFormDescription = '';
  }

  iniciarEdicaoInlineRole(role: CollaboratorRole) {
    this.inlineEditingRoleId.set(role.id_collaborator_role);
    this.inlineEditingRoleName = role.description;
    queueMicrotask(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="inlineEditingRoleName"]');
      input?.focus();
      input?.select();
    });
  }

  cancelarEdicaoInlineRole() {
    this.inlineEditingRoleId.set(null);
    this.inlineEditingRoleName = '';
  }

  adicionarRole() {
    const description = this.roleFormDescription.trim();
    if (description.length < 2) {
      this.notification.error('Informe um nome com ao menos 2 caracteres.');
      return;
    }

    this.rolesSaving.set(true);
    this.collaboratorService.createRole(description).subscribe({
      next: () => {
        this.rolesSaving.set(false);
        this.notification.success('Função cadastrada.');
        this.roleFormDescription = '';
        this.carregarRoles();
      },
      error: (err) => {
        this.rolesSaving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar função.');
      },
    });
  }

  salvarEdicaoInlineRole() {
    const id = this.inlineEditingRoleId();
    if (!id) return;

    const description = this.inlineEditingRoleName.trim();
    if (description.length < 2) {
      this.notification.error('Informe um nome com ao menos 2 caracteres.');
      return;
    }

    this.rolesSaving.set(true);
    this.collaboratorService.updateRole(id, description).subscribe({
      next: () => {
        this.rolesSaving.set(false);
        this.notification.success('Função atualizada.');
        this.cancelarEdicaoInlineRole();
        this.carregarRoles();
      },
      error: (err) => {
        this.rolesSaving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar função.');
      },
    });
  }

  excluirRole(role: CollaboratorRole) {
    Swal.fire({
      title: 'Excluir função?',
      text: `"${role.description}" será removida permanentemente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#e11d48',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.collaboratorService.deleteRole(role.id_collaborator_role).subscribe({
        next: () => {
          this.notification.success('Função excluída.');
          if (this.inlineEditingRoleId() === role.id_collaborator_role) {
            this.cancelarEdicaoInlineRole();
          }
          if (this.filterRoleId === role.id_collaborator_role) {
            this.filterRoleId = null;
          }
          if (this.appliedRoleId === role.id_collaborator_role) {
            this.appliedRoleId = null;
          }
          this.carregarRoles();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao excluir função.');
        },
      });
    });
  }

  carregar(page = this.pagination().page) {
    this.loading.set(true);
    this.collaboratorService
      .list(page, this.pagination().limit, {
        document: this.appliedDocument || undefined,
        name: this.appliedName || undefined,
        id_collaborator_document_type: this.appliedDocTypeId ?? undefined,
        id_collaborator_role: this.appliedRoleId ?? undefined,
        status: this.appliedStatus,
      })
      .subscribe({
        next: (res) => {
          this.collaborators.set(res.collaborators);
          this.pagination.set(res.pagination);
          this.loading.set(false);
          this.loadThumbnails(res.collaborators);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading.set(false);
          this.cdr.markForCheck();
          this.notification.error(this.extractError(err) || 'Falha ao carregar colaboradores.');
        },
      });
  }

  pictureUrl(c: CollaboratorItem): string | null {
    return this.thumbnailUrls()[c.id_collaborator] ?? null;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Foto existente ou recém-validada conta como rosto enquadrado. */
  photoFaceOk(): boolean {
    if (this.pictureValidating()) return false;
    if (this.pictureValidationOk()) return true;
    return !!this.picturePreviewUrl() && !this.pendingPictureFile();
  }

  toggleAtivo() {
    if (this.form.isBlacklisted) return;
    this.form.status = !this.form.status;
  }

  private loadThumbnails(list: CollaboratorItem[]) {
    this.revokeThumbnails();
    const loadId = ++this.thumbnailLoadId;
    for (const c of list) {
      if (!c.picture) continue;
      this.collaboratorService.getPictureBlob(c.picture).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          if (loadId !== this.thumbnailLoadId) {
            URL.revokeObjectURL(url);
            return;
          }
          this.thumbnailUrls.update((map) => ({ ...map, [c.id_collaborator]: url }));
          this.cdr.markForCheck();
        },
        error: () => {},
      });
    }
  }

  private revokeThumbnails() {
    for (const url of Object.values(this.thumbnailUrls())) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.set({});
  }

  onTextFilterChange() {
    this.clearFilterDebounce();
    this.filterDebounceTimer = setTimeout(() => this.aplicarFiltros(), this.filterDebounceMs);
  }

  aplicarFiltros() {
    this.clearFilterDebounce();
    this.appliedDocument = this.filterDocument.trim();
    this.appliedName = this.filterName.trim();
    this.appliedDocTypeId = this.filterDocTypeId;
    this.appliedRoleId = this.filterRoleId;
    if (this.filterStatus === 'true') this.appliedStatus = true;
    else if (this.filterStatus === 'false') this.appliedStatus = false;
    else this.appliedStatus = undefined;
    this.carregar(1);
  }

  limparFiltros() {
    this.clearFilterDebounce();
    this.filterDocument = '';
    this.filterName = '';
    this.filterDocTypeId = null;
    this.filterRoleId = null;
    this.filterStatus = '';
    this.appliedDocument = '';
    this.appliedName = '';
    this.appliedDocTypeId = null;
    this.appliedRoleId = null;
    this.appliedStatus = undefined;
    this.carregar(1);
  }

  private clearFilterDebounce() {
    if (this.filterDebounceTimer !== null) {
      clearTimeout(this.filterDebounceTimer);
      this.filterDebounceTimer = null;
    }
  }

  irPagina(page: number) {
    if (page < 1 || page > this.pagination().totalPages) return;
    this.carregar(page);
  }

  formatDocument(c: CollaboratorItem): string {
    if (isCpfDocumentType(c.document_type?.description)) {
      return formatCpf(c.document);
    }
    return c.document;
  }

  documentPlaceholder(): string {
    const type = this.documentTypes().find(
      (t) => t.id_collaborator_document_type === this.form.id_collaborator_document_type,
    );
    if (isCpfDocumentType(type?.description)) return '000.000.000-00';
    return 'Documento alfanumérico';
  }

  onDocTypeChange() {
    this.form.document = '';
  }

  novoColaborador() {
    this.editingId.set(null);
    this.blacklistReason.set(null);
    this.form = this.emptyForm();
    this.revokePicturePreview();
    this.pendingPictureFile.set(null);
    this.pictureValidating.set(false);
    this.pictureValidationOk.set(false);
    this.pictureDragOver.set(false);
    if (this.documentTypes().length > 0) {
      this.form.id_collaborator_document_type = this.documentTypes()[0].id_collaborator_document_type;
    }
    if (this.roles().length > 0) {
      this.form.id_collaborator_role = this.roles()[0].id_collaborator_role;
    }
    this.showModal.set(true);
  }

  editar(c: CollaboratorItem) {
    this.editingId.set(c.id_collaborator);
    this.loading.set(true);
    this.collaboratorService.get(c.id_collaborator).subscribe({
      next: (res) => {
        const col = res.collaborator;
        this.form = {
          id_collaborator_document_type: col.id_collaborator_document_type,
          id_collaborator_role: col.id_collaborator_role,
          document: isCpfDocumentType(col.document_type?.description)
            ? formatCpf(col.document)
            : col.document,
          name: col.name,
          rg: col.rg || '',
          phone: col.phone || '',
          status: col.is_blacklisted ? false : col.status,
          isBlacklisted: col.is_blacklisted,
        };
        this.blacklistReason.set(null);
        this.loading.set(false);
        this.revokePicturePreview();
        this.pendingPictureFile.set(null);
        this.pictureValidating.set(false);
        this.pictureValidationOk.set(false);
        if (col.picture) {
          this.collaboratorService.getPictureBlob(col.picture).subscribe({
            next: (blob) => this.picturePreviewUrl.set(URL.createObjectURL(blob)),
            error: () => this.picturePreviewUrl.set(null),
          });
        }
        this.showModal.set(true);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao carregar colaborador.');
      },
    });
  }

  fecharModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.blacklistReason.set(null);
    this.pictureDragOver.set(false);
    this.pictureValidating.set(false);
    this.pictureValidationOk.set(false);
    this.form = this.emptyForm();
    this.revokePicturePreview();
    this.pendingPictureFile.set(null);
    this.cancelFaceCrop();
    this.fecharWebcamCapture();
  }

  abrirBulkModal() {
    this.showBulkModal.set(true);
  }

  fecharBulkModal() {
    this.showBulkModal.set(false);
  }

  onBulkCompleted() {
    this.carregar(1);
  }

  onPictureSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.applyPictureFile(input.files?.[0]);
    input.value = '';
  }

  onPictureDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.pictureDragOver.set(true);
  }

  onPictureDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.pictureDragOver.set(false);
  }

  onPictureDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.pictureDragOver.set(false);
    this.applyPictureFile(event.dataTransfer?.files?.[0]);
  }

  abrirWebcamCapture() {
    this.showFaceCropModal.set(false);
    this.showWebcamModal.set(true);
  }

  fecharWebcamCapture() {
    this.showWebcamModal.set(false);
  }

  onWebcamCaptured(file: File) {
    this.showWebcamModal.set(false);
    this.applyPictureFile(file);
  }

  private applyPictureFile(file: File | undefined | null) {
    if (!file) return;

    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
    const validType = this.pictureAcceptMime.has(file.type) || this.pictureAcceptExt.has(ext);
    if (!validType) {
      this.notification.error('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > this.pictureSourceMaxBytes) {
      this.notification.error('Imagem excede o limite de 12 MB.');
      return;
    }

    this.revokePicturePreview();
    this.pendingPictureFile.set(null);
    this.pictureValidationOk.set(false);
    this.pictureValidating.set(false);

    this.revokeFaceCropSource();
    this.faceCropSourceName.set(file.name || 'foto.jpg');
    this.faceCropSourceUrl.set(URL.createObjectURL(file));
    this.showFaceCropModal.set(true);
  }

  cancelFaceCrop() {
    this.showFaceCropModal.set(false);
    this.revokeFaceCropSource();
  }

  onFaceCropped(file: File) {
    this.showFaceCropModal.set(false);
    this.revokeFaceCropSource();
    if (file.size > this.pictureMaxBytes) {
      this.notification.error('O recorte excede 2 MB. Tente um enquadramento menor ou outra foto.');
      return;
    }
    this.validateCroppedPicture(file);
  }

  private validateCroppedPicture(file: File) {
    this.revokePicturePreview();
    this.pendingPictureFile.set(null);
    this.pictureValidationOk.set(false);
    this.pictureValidating.set(true);
    this.picturePreviewUrl.set(URL.createObjectURL(file));

    this.collaboratorService.validateFacePicture(file).subscribe({
      next: (report) => {
        this.pictureValidating.set(false);
        const apto = !!report.apto?.controlid && !!report.apto?.dahua;
        if (!apto) {
          this.revokePicturePreview();
          this.pendingPictureFile.set(null);
          this.pictureValidationOk.set(false);
          const falhas = (report.checagens || [])
            .filter((c) => c.status === 'falha')
            .map((c) => c.mensagem || c.id);
          const avisos = (report.checagens || [])
            .filter((c) => c.status === 'aviso')
            .map((c) => c.mensagem || c.id);
          const htmlParts = [
            `<p class="text-sm text-slate-600 mb-2">Control iD: <strong>${report.apto?.controlid ? 'apto' : 'inapto'}</strong> · Dahua: <strong>${report.apto?.dahua ? 'apto' : 'inapto'}</strong></p>`,
          ];
          if (falhas.length) {
            htmlParts.push(
              `<p class="text-xs font-semibold text-rose-700 mb-1">Problemas</p><ul class="text-left text-sm text-slate-700 list-disc pl-5">${falhas
                .slice(0, 8)
                .map((m) => `<li>${m}</li>`)
                .join('')}</ul>`,
            );
          }
          if (avisos.length) {
            htmlParts.push(
              `<p class="text-xs font-semibold text-amber-700 mt-2 mb-1">Avisos</p><ul class="text-left text-sm text-slate-600 list-disc pl-5">${avisos
                .slice(0, 5)
                .map((m) => `<li>${m}</li>`)
                .join('')}</ul>`,
            );
          }
          Swal.fire({
            icon: 'warning',
            title: 'Foto não apta para facial',
            html: htmlParts.join(''),
            confirmButtonText: 'Escolher outra foto',
          });
          return;
        }
        this.pendingPictureFile.set(file);
        this.pictureValidationOk.set(true);
        this.notification.success('Foto validada para Control iD e Dahua.');
      },
      error: (err) => {
        this.pictureValidating.set(false);
        this.revokePicturePreview();
        this.pendingPictureFile.set(null);
        this.pictureValidationOk.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao validar a foto facial.');
      },
    });
  }

  private revokePicturePreview() {
    const url = this.picturePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.picturePreviewUrl.set(null);
  }

  private revokeFaceCropSource() {
    const url = this.faceCropSourceUrl();
    if (url) URL.revokeObjectURL(url);
    this.faceCropSourceUrl.set(null);
  }

  private uploadPictureIfNeeded(id: number, onDone: () => void) {
    const file = this.pendingPictureFile();
    if (!file) {
      onDone();
      return;
    }
    this.collaboratorService.uploadPicture(id, file).subscribe({
      next: () => {
        this.pendingPictureFile.set(null);
        this.pictureValidationOk.set(false);
        onDone();
      },
      error: (err) => {
        const details = (err as { error?: { details?: { faceValidation?: { checagens?: { status: string; mensagem?: string; id: string }[] } } } })
          ?.error?.details?.faceValidation;
        const falhas = (details?.checagens || [])
          .filter((c) => c.status === 'falha')
          .map((c) => c.mensagem || c.id)
          .slice(0, 5);
        const msg =
          this.extractError(err) ||
          (falhas.length
            ? `Foto rejeitada: ${falhas.join(' ')}`
            : 'Colaborador salvo, mas a foto foi rejeitada pela validação facial.');
        this.notification.error(msg);
        onDone();
      },
    });
  }

  salvar() {
    if (!this.form.id_collaborator_document_type) {
      this.notification.error('Selecione o tipo de documento.');
      return;
    }
    if (!this.form.id_collaborator_role) {
      this.notification.error('Selecione a função.');
      return;
    }
    if (!this.form.name.trim()) {
      this.notification.error('Nome é obrigatório.');
      return;
    }

    const type = this.documentTypes().find(
      (t) => t.id_collaborator_document_type === this.form.id_collaborator_document_type,
    );
    let document = this.form.document.trim();
    if (isCpfDocumentType(type?.description)) {
      document = normalizeCpfInput(document);
      if (document.length !== 11) {
        this.notification.error('CPF deve conter 11 dígitos.');
        return;
      }
    } else {
      document = document.replace(/\s+/g, '').toUpperCase();
      if (document.length < 5) {
        this.notification.error('Documento deve ter ao menos 5 caracteres.');
        return;
      }
    }

    const id = this.editingId();
    const applyBlacklistOnCreate = !id && this.form.isBlacklisted;
    const blacklistReasonPending = this.blacklistReason()?.trim() || '';

    if (applyBlacklistOnCreate && blacklistReasonPending.length < 10) {
      this.notification.error('Informe um motivo de blacklist com pelo menos 10 caracteres.');
      return;
    }

    const payload = {
      id_collaborator_document_type: this.form.id_collaborator_document_type,
      id_collaborator_role: this.form.id_collaborator_role,
      document,
      name: this.form.name.trim(),
      rg: this.form.rg.trim() || null,
      phone: this.form.phone.trim() || null,
      status: this.form.isBlacklisted ? false : this.form.status,
    };

    this.saving.set(true);
    const req = id
      ? this.collaboratorService.update(id, payload)
      : this.collaboratorService.create(payload);

    req.subscribe({
      next: (res) => {
        const savedId = id ?? res.collaborator.id_collaborator;
        const finish = () => {
          this.saving.set(false);
          this.notification.success(id ? 'Colaborador atualizado.' : 'Colaborador criado.');
          this.fecharModal();
          this.carregar(id ? this.pagination().page : 1);
        };

        const afterPicture = () => {
          if (!applyBlacklistOnCreate) {
            finish();
            return;
          }
          this.collaboratorService.addBlacklist(savedId, blacklistReasonPending).subscribe({
            next: () => finish(),
            error: (err) => {
              this.saving.set(false);
              this.notification.error(
                this.extractError(err) ||
                  'Colaborador criado, mas falhou ao aplicar a blacklist.',
              );
              this.fecharModal();
              this.carregar(1);
            },
          });
        };

        this.uploadPictureIfNeeded(savedId, afterPicture);
      },
      error: (err) => {
        this.saving.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao salvar colaborador.');
      },
    });
  }

  alterarStatus(c: CollaboratorItem, ativar: boolean) {
    const titulo = ativar ? 'Ativar colaborador?' : 'Desativar colaborador?';
    const texto = ativar
      ? `"${c.name}" voltará a ficar ativo no sistema.`
      : `"${c.name}" será inativado (sem exclusão física).`;

    Swal.fire({
      title: titulo,
      text: texto,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: ativar ? 'Ativar' : 'Desativar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: ativar ? '#059669' : '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.collaboratorService.patchStatus(c.id_collaborator, ativar).subscribe({
        next: () => {
          this.notification.success(ativar ? 'Colaborador ativado.' : 'Colaborador desativado.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao alterar status.');
        },
      });
    });
  }

  onBlacklistToggleClick() {
    this.onBlacklistToggle(!this.form.isBlacklisted);
  }

  onBlacklistToggle(checked: boolean) {
    const id = this.editingId();

    if (checked) {
      Swal.fire({
        title: 'Adicionar à blacklist?',
        html: `<p class="text-sm text-slate-600 mb-3">O colaborador <strong>${this.form.name || 'novo'}</strong> será bloqueado em credenciamento e portaria.</p>`,
        input: 'textarea',
        inputLabel: 'Motivo (mín. 10 caracteres)',
        inputPlaceholder: 'Descreva o motivo da restrição...',
        inputAttributes: { maxlength: '500' },
        showCancelButton: true,
        confirmButtonText: 'Adicionar à blacklist',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
        inputValidator: (value) => {
          if (!value || value.trim().length < 10) {
            return 'Informe um motivo com pelo menos 10 caracteres.';
          }
          return null;
        },
      }).then((result) => {
        if (!result.isConfirmed || !result.value) {
          this.form.isBlacklisted = false;
          return;
        }
        const reason = result.value.trim();

        // No cadastro, a blacklist só é persistida após salvar.
        if (!id) {
          this.form.isBlacklisted = true;
          this.form.status = false;
          this.blacklistReason.set(reason);
          return;
        }

        this.collaboratorService.addBlacklist(id, reason).subscribe({
          next: () => {
            this.form.isBlacklisted = true;
            this.form.status = false;
            this.blacklistReason.set(reason);
            this.notification.success('Colaborador adicionado à blacklist.');
            this.carregar();
          },
          error: (err) => {
            this.form.isBlacklisted = false;
            this.notification.error(this.extractError(err) || 'Falha ao adicionar à blacklist.');
          },
        });
      });
      return;
    }

    // Remover blacklist ainda não persistida (novo cadastro).
    if (!id) {
      this.form.isBlacklisted = false;
      this.blacklistReason.set(null);
      return;
    }

    Swal.fire({
      title: 'Remover da blacklist?',
      text: `"${this.form.name}" voltará a poder ser credenciado.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover da blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) {
        this.form.isBlacklisted = true;
        return;
      }
      this.collaboratorService.removeBlacklist(id).subscribe({
        next: () => {
          this.form.isBlacklisted = false;
          this.blacklistReason.set(null);
          this.notification.success('Colaborador removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.form.isBlacklisted = true;
          this.notification.error(this.extractError(err) || 'Falha ao remover da blacklist.');
        },
      });
    });
  }

  incluirBlacklist(c: CollaboratorItem) {
    Swal.fire({
      title: 'Adicionar à blacklist?',
      html: `<p class="text-sm text-slate-600 mb-3">O colaborador <strong>${c.name}</strong> será bloqueado em credenciamento e portaria.</p>`,
      input: 'textarea',
      inputLabel: 'Motivo (mín. 10 caracteres)',
      inputPlaceholder: 'Descreva o motivo da restrição...',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: 'Adicionar à blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => {
        if (!value || value.trim().length < 10) {
          return 'Informe um motivo com pelo menos 10 caracteres.';
        }
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      this.collaboratorService.addBlacklist(c.id_collaborator, result.value.trim()).subscribe({
        next: () => {
          this.notification.success('Colaborador adicionado à blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao adicionar à blacklist.');
        },
      });
    });
  }

  removerBlacklist(c: CollaboratorItem) {
    Swal.fire({
      title: 'Remover da blacklist?',
      text: `"${c.name}" voltará a poder ser credenciado.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remover da blacklist',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.collaboratorService.removeBlacklist(c.id_collaborator).subscribe({
        next: () => {
          this.notification.success('Colaborador removido da blacklist.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao remover da blacklist.');
        },
      });
    });
  }

  excluirColaborador(c: CollaboratorItem) {
    Swal.fire({
      title: 'Excluir colaborador?',
      text: `"${c.name}" será removido permanentemente do cadastro.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.collaboratorService.delete(c.id_collaborator).subscribe({
        next: () => {
          this.notification.success('Colaborador excluído.');
          this.carregar();
        },
        error: (err) => {
          this.notification.error(this.extractError(err) || 'Falha ao excluir colaborador.');
        },
      });
    });
  }

  private extractError(err: unknown): string | null {
    const e = err as { error?: { error?: string; message?: string } };
    return e?.error?.error || e?.error?.message || null;
  }
}
