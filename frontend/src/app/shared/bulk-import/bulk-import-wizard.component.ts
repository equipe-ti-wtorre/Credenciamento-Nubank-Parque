import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../modal/modal.component';
import { NotificationService } from '../../core/services/notification.service';
import {
  BulkCommitResult,
  BulkDecision,
  BulkDecisionAction,
  BulkImportAdapters,
  BulkPreviewResult,
  BulkPreviewRow,
  BulkRowStatus,
} from './bulk-import.types';

type WizardStep = 'upload' | 'review' | 'result';
type ReviewFilter = 'all' | 'create' | 'update' | 'link' | 'error';

interface RowDecisionState {
  include: boolean;
  fields: Record<string, boolean>;
}

@Component({
  selector: 'app-bulk-import-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <app-modal
      [open]="open"
      [title]="title"
      [subtitle]="subtitle"
      size="xl"
      [closeOnBackdrop]="false"
      [focusFirstField]="false"
      (close)="onClose()"
    >
      <div class="bulk-wiz">
        <ol class="bulk-wiz__steps">
          <li [class.is-active]="step() === 'upload'" [class.is-done]="step() !== 'upload'">1. Upload</li>
          <li [class.is-active]="step() === 'review'" [class.is-done]="step() === 'result'">2. Revisar</li>
          <li [class.is-active]="step() === 'result'">3. Resultado</li>
        </ol>

        @if (step() === 'upload') {
          <div class="space-y-3">
            <input
              #fileInput
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              class="hidden"
              (change)="onFileSelected($event)"
            />
            <div
              class="upload-dropzone upload-dropzone--banner"
              [class.upload-dropzone--dragover]="dragOver()"
              [class.upload-dropzone--selected]="!!file()"
              tabindex="0"
              role="button"
              (click)="fileInput.click()"
              (keydown.enter)="fileInput.click()"
              (keydown.space)="$event.preventDefault(); fileInput.click()"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
            >
              <div class="upload-dropzone__main">
                <span class="upload-dropzone__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 16V4M6 10l6-6 6 6" />
                    <path d="M4 20h16" />
                  </svg>
                </span>
                <span class="upload-dropzone__text">
                  <span class="upload-dropzone__title">
                    Arraste a planilha aqui ou
                    <span class="upload-dropzone__link">clique para procurar</span>
                  </span>
                  <span class="upload-dropzone__hint">
                    @if (file(); as f) {
                      {{ f.name }} · {{ formatBytes(f.size) }}
                    } @else {
                      XLSX, XLS ou CSV · até 5 MB · linhas existentes entram em revisão
                    }
                  </span>
                </span>
              </div>
              <button
                type="button"
                class="upload-dropzone__action"
                [disabled]="templateDownloading()"
                (click)="$event.stopPropagation(); downloadTemplate()"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v12M8 11l4 4 4-4" />
                  <path d="M5 21h14" />
                </svg>
                {{ templateDownloading() ? 'Baixando...' : 'Baixar modelo' }}
              </button>
            </div>
          </div>
        }

        @if (step() === 'review' && preview(); as prev) {
          <div class="space-y-3">
            <div class="bulk-wiz__summary">
              <span>Total {{ prev.summary.total }}</span>
              <span class="text-emerald-700">Novos {{ prev.summary.create }}</span>
              <span class="text-sky-700">Atualizar {{ prev.summary.update }}</span>
              <span class="text-slate-600">Vincular/igual {{ prev.summary.link }}</span>
              <span class="text-rose-700">Erros {{ prev.summary.error }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              @for (f of filterOptions; track f.id) {
                <button
                  type="button"
                  class="btn-outline text-xs !py-1"
                  [class.!border-sky-400]="filter() === f.id"
                  (click)="filter.set(f.id)"
                >
                  {{ f.label }}
                </button>
              }
              <button type="button" class="btn-outline text-xs !py-1 ml-auto" (click)="selectAllActionable(true)">
                Marcar todos
              </button>
              <button type="button" class="btn-outline text-xs !py-1" (click)="selectAllActionable(false)">
                Desmarcar
              </button>
            </div>
            <div class="bulk-wiz__table-wrap">
              <table class="bulk-wiz__table">
                <thead>
                  <tr>
                    <th>Incluir</th>
                    <th>Linha</th>
                    <th>Status</th>
                    <th>Chave</th>
                    <th>Dados / divergências</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of filteredRows(); track row.line) {
                    <tr [class.bulk-wiz__row--error]="row.status === 'error'">
                      <td>
                        @if (row.status !== 'error') {
                          <input
                            type="checkbox"
                            [checked]="decisions()[row.line]?.include"
                            (change)="toggleInclude(row.line, $event)"
                          />
                        }
                      </td>
                      <td>{{ row.line }}</td>
                      <td>
                        <span class="bulk-wiz__badge" [attr.data-status]="row.status">
                          {{ statusLabel(row.status) }}
                        </span>
                      </td>
                      <td class="text-xs font-mono">{{ formatKey(row) }}</td>
                      <td>
                        @if (row.status === 'error') {
                          <p class="text-sm text-rose-700 m-0">{{ row.message }}</p>
                        } @else if (row.status === 'update' && row.diffs?.length) {
                          <ul class="bulk-wiz__diffs">
                            @for (d of row.diffs; track d.field) {
                              <li>
                                <label class="inline-flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    [checked]="decisions()[row.line]?.fields?.[d.field]"
                                    [disabled]="!decisions()[row.line]?.include"
                                    (change)="toggleField(row.line, d.field, $event)"
                                  />
                                  <span>
                                    <strong>{{ d.field }}</strong>:
                                    <span class="text-slate-500">{{ displayVal(d.current) }}</span>
                                    →
                                    <span class="text-sky-800">{{ displayVal(d.incoming) }}</span>
                                  </span>
                                </label>
                              </li>
                            }
                          </ul>
                          @if (row.message) {
                            <p class="text-xs text-slate-500 mt-1 mb-0">{{ row.message }}</p>
                          }
                        } @else {
                          <p class="text-xs text-slate-600 m-0">{{ formatIncoming(row) }}</p>
                          @if (row.message) {
                            <p class="text-xs text-slate-500 mt-1 mb-0">{{ row.message }}</p>
                          }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        @if (step() === 'result' && commitResult(); as res) {
          <div class="space-y-3">
            <div class="bulk-wiz__summary">
              <span class="text-emerald-700">Criados {{ res.created }}</span>
              <span class="text-sky-700">Atualizados {{ res.updated }}</span>
              <span class="text-slate-700">Vinculados {{ res.linked }}</span>
              <span>Ignorados {{ res.skipped }}</span>
              <span class="text-rose-700">Falhas {{ res.errors.length }}</span>
            </div>
            @if (res.errors.length) {
              <div class="max-h-48 overflow-y-auto text-sm">
                <ul class="list-disc pl-5 space-y-1">
                  @for (e of res.errors; track e.line + e.reason) {
                    <li>Linha {{ e.line }}: {{ e.reason }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </div>

      <div modal-footer class="modal-footer">
        <button type="button" class="btn-action-secondary" (click)="onClose()" [disabled]="busy()">
          {{ step() === 'result' ? 'Fechar' : 'Cancelar' }}
        </button>
        @if (step() === 'upload') {
          <button
            type="button"
            class="btn-action-primary"
            [disabled]="!file() || busy()"
            (click)="runPreview()"
          >
            {{ busy() ? 'Analisando...' : 'Analisar planilha' }}
          </button>
        }
        @if (step() === 'review') {
          <button type="button" class="btn-outline" [disabled]="busy()" (click)="backToUpload()">
            Voltar
          </button>
          <button
            type="button"
            class="btn-action-primary"
            [disabled]="busy() || !hasCommitable()"
            (click)="runCommit()"
          >
            {{ busy() ? 'Aplicando...' : 'Confirmar importação' }}
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: [
    `
      .bulk-wiz {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .bulk-wiz__steps {
        display: flex;
        gap: 0.75rem;
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 0.75rem;
        font-weight: 600;
        color: #94a3b8;
      }
      .bulk-wiz__steps li.is-active {
        color: #0369a1;
      }
      .bulk-wiz__steps li.is-done {
        color: #64748b;
      }
      .bulk-wiz__summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1rem;
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .bulk-wiz__table-wrap {
        max-height: min(50vh, 420px);
        overflow: auto;
        border: 1px solid #e2e8f0;
        border-radius: 0.75rem;
      }
      .bulk-wiz__table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
      }
      .bulk-wiz__table th,
      .bulk-wiz__table td {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        vertical-align: top;
      }
      .bulk-wiz__table th {
        position: sticky;
        top: 0;
        background: #f8fafc;
        z-index: 1;
      }
      .bulk-wiz__row--error {
        background: #fff1f2;
      }
      .bulk-wiz__badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        background: #e2e8f0;
      }
      .bulk-wiz__badge[data-status='create'] {
        background: #d1fae5;
        color: #065f46;
      }
      .bulk-wiz__badge[data-status='update'] {
        background: #e0f2fe;
        color: #075985;
      }
      .bulk-wiz__badge[data-status='link'] {
        background: #f1f5f9;
        color: #334155;
      }
      .bulk-wiz__badge[data-status='error'] {
        background: #ffe4e6;
        color: #9f1239;
      }
      .bulk-wiz__diffs {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
    `,
  ],
})
export class BulkImportWizardComponent {
  @Input() open = false;
  @Input() title = 'Upload em lote';
  @Input() subtitle = 'Envie a planilha, revise divergências e confirme a importação.';
  @Input({ required: true }) adapters!: BulkImportAdapters;

  @Output() closed = new EventEmitter<void>();
  @Output() completed = new EventEmitter<BulkCommitResult>();

  step = signal<WizardStep>('upload');
  file = signal<File | null>(null);
  preview = signal<BulkPreviewResult | null>(null);
  decisions = signal<Record<number, RowDecisionState>>({});
  commitResult = signal<BulkCommitResult | null>(null);
  busy = signal(false);
  templateDownloading = signal(false);
  dragOver = signal(false);
  filter = signal<ReviewFilter>('all');

  readonly filterOptions: { id: ReviewFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'create', label: 'Novos' },
    { id: 'update', label: 'Atualizar' },
    { id: 'link', label: 'Vincular/igual' },
    { id: 'error', label: 'Erros' },
  ];

  filteredRows = computed(() => {
    const rows = this.preview()?.rows || [];
    const f = this.filter();
    if (f === 'all') return rows;
    return rows.filter((r) => r.status === f);
  });

  constructor(private notification: NotificationService) {}

  onClose(): void {
    if (this.busy()) return;
    const result = this.commitResult();
    this.reset();
    this.closed.emit();
    if (result) this.completed.emit(result);
  }

  backToUpload(): void {
    this.step.set('upload');
    this.preview.set(null);
    this.decisions.set({});
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] || null);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.setFile(event.dataTransfer?.files?.[0] || null);
  }

  downloadTemplate(): void {
    if (!this.adapters?.downloadTemplate) return;
    this.templateDownloading.set(true);
    this.adapters.downloadTemplate().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.adapters.templateFilename || 'template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.templateDownloading.set(false);
      },
      error: () => {
        this.templateDownloading.set(false);
        this.notification.error('Falha ao baixar template.');
      },
    });
  }

  runPreview(): void {
    const file = this.file();
    if (!file || !this.adapters) return;
    this.busy.set(true);
    this.adapters.preview(file).subscribe({
      next: (result) => {
        this.preview.set(result);
        this.decisions.set(this.buildDefaultDecisions(result.rows));
        this.step.set('review');
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao analisar a planilha.');
      },
    });
  }

  runCommit(): void {
    const prev = this.preview();
    if (!prev || !this.adapters) return;
    const payload = this.buildCommitPayload(prev.rows);
    if (!payload.length) {
      this.notification.error('Nenhuma linha selecionada para importar.');
      return;
    }
    this.busy.set(true);
    this.adapters.commit(prev.previewId, payload).subscribe({
      next: (result) => {
        this.commitResult.set(result);
        this.step.set('result');
        this.busy.set(false);
        this.notification.success(
          `Importação concluída: ${result.created} criados, ${result.updated} atualizados, ${result.linked} vinculados.`,
        );
      },
      error: (err) => {
        this.busy.set(false);
        this.notification.error(this.extractError(err) || 'Falha ao confirmar importação.');
      },
    });
  }

  toggleInclude(line: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.decisions.update((map) => {
      const current = map[line];
      if (!current) return map;
      return { ...map, [line]: { ...current, include: checked } };
    });
  }

  toggleField(line: number, field: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.decisions.update((map) => {
      const current = map[line];
      if (!current) return map;
      return {
        ...map,
        [line]: { ...current, fields: { ...current.fields, [field]: checked } },
      };
    });
  }

  selectAllActionable(include: boolean): void {
    this.decisions.update((map) => {
      const next = { ...map };
      for (const row of this.preview()?.rows || []) {
        if (row.status === 'error') continue;
        if (next[row.line]) next[row.line] = { ...next[row.line], include };
      }
      return next;
    });
  }

  hasCommitable(): boolean {
    return Object.values(this.decisions()).some((d) => d.include);
  }

  statusLabel(status: BulkRowStatus): string {
    switch (status) {
      case 'create':
        return 'Novo';
      case 'update':
        return 'Atualizar';
      case 'link':
        return 'Vincular/igual';
      default:
        return 'Erro';
    }
  }

  formatKey(row: BulkPreviewRow): string {
    return Object.entries(row.key || {})
      .map(([k, v]) => `${k}=${v ?? ''}`)
      .join(' · ');
  }

  formatIncoming(row: BulkPreviewRow): string {
    return Object.entries(row.incoming || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  }

  displayVal(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  private setFile(file: File | null): void {
    if (!file) {
      this.file.set(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.notification.error('Arquivo excede 5 MB.');
      return;
    }
    this.file.set(file);
  }

  private buildDefaultDecisions(rows: BulkPreviewRow[]): Record<number, RowDecisionState> {
    const map: Record<number, RowDecisionState> = {};
    for (const row of rows) {
      const fields: Record<string, boolean> = {};
      for (const d of row.diffs || []) fields[d.field] = true;
      map[row.line] = {
        include: row.status !== 'error',
        fields,
      };
    }
    return map;
  }

  private buildCommitPayload(rows: BulkPreviewRow[]): BulkDecision[] {
    const decisions = this.decisions();
    const out: BulkDecision[] = [];
    for (const row of rows) {
      const state = decisions[row.line];
      if (!state) continue;
      if (!state.include || row.status === 'error') {
        out.push({ line: row.line, action: 'skip' });
        continue;
      }
      const action: BulkDecisionAction =
        row.status === 'create' ? 'create' : row.status === 'update' ? 'update' : 'link';
      const decision: BulkDecision = { line: row.line, action };
      if (action === 'update') {
        decision.fields = Object.entries(state.fields)
          .filter(([, on]) => on)
          .map(([field]) => field);
      }
      out.push(decision);
    }
    return out.filter((d) => d.action !== 'skip');
  }

  private reset(): void {
    this.step.set('upload');
    this.file.set(null);
    this.preview.set(null);
    this.decisions.set({});
    this.commitResult.set(null);
    this.filter.set('all');
    this.busy.set(false);
  }

  private extractError(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return e?.error?.message || e?.message || '';
  }
}
