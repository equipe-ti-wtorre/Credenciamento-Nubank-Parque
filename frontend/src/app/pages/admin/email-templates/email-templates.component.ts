import { ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorComponent, TINYMCE_SCRIPT_SRC } from '@tinymce/tinymce-angular';
import type { Editor as TinyMCEEditor } from 'tinymce';
import Swal from 'sweetalert2';
import {
  EmailTemplateDetail,
  EmailTemplateSummary,
  EmailTemplatesService,
} from '../../../services/email-templates.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService, AuthUser, hasPermission } from '../../../core/services/auth.service';
import { SettingsReloadable } from '../settings-reloadable';

type TinyInitEvent = { editor: TinyMCEEditor };

@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, EditorComponent],
  providers: [{ provide: TINYMCE_SCRIPT_SRC, useValue: '/tinymce/tinymce.min.js' }],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Templates de e-mail</h2>
          <p class="page-section-subtitle">
            Edite o HTML e o assunto dos e-mails enviados pelo sistema. Use placeholders
            <code class="text-xs">{{ placeholderHint }}</code>.
          </p>
        </div>
        <div class="flex flex-wrap gap-2 min-w-0 md:justify-end" *ngIf="form">
          <button type="button" class="btn-action-secondary" (click)="abrirPreview()" [disabled]="busy">
            Preview
          </button>
          <button
            type="button"
            class="btn-action-tonal"
            (click)="abrirTeste()"
            [disabled]="busy || !canEdit"
          >
            Enviar teste
          </button>
          <button
            type="button"
            class="btn-action-primary"
            (click)="salvar()"
            [disabled]="busy || !canEdit || saving"
          >
            {{ saving ? 'Salvando...' : 'Salvar template' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        <aside class="card-surface p-3 space-y-1">
          <p class="text-xs font-bold text-[var(--app-text-muted)] uppercase px-2 mb-2">Templates</p>
          <button
            type="button"
            *ngFor="let item of templates"
            class="w-full text-left rounded-xl px-3 py-2.5 transition-colors"
            [ngClass]="
              selectedCodigo === item.codigo
                ? 'bg-[var(--brand-tonal-bg)] text-[var(--brand)]'
                : 'hover:bg-[var(--color-bg-surface-alt)] text-[var(--app-text)]'
            "
            (click)="selectTemplate(item.codigo)"
          >
            <span class="block text-sm font-semibold truncate">{{ item.nome }}</span>
            <span class="block text-[11px] text-[var(--app-text-muted)] truncate">{{ item.codigo }}</span>
            <span
              class="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide"
              [ngClass]="item.ativo ? 'text-[var(--menu-status)]' : 'text-[var(--app-text-muted)]'"
            >
              {{ item.ativo ? 'Ativo' : 'Inativo' }}
            </span>
          </button>
          <p *ngIf="!loading && !templates.length" class="text-sm text-[var(--app-text-muted)] px-2 py-3">
            Nenhum template encontrado.
          </p>
        </aside>

        <div class="card-surface p-5 min-w-0" *ngIf="form; else emptyState">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="text-xs font-bold text-[var(--app-text-muted)] uppercase">Nome</label>
              <input
                [(ngModel)]="form.nome"
                name="nome"
                [disabled]="!canEdit"
                class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-focus-ring)]"
              />
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-sm text-[var(--app-text)] cursor-pointer">
                <input type="checkbox" [(ngModel)]="form.ativo" name="ativo" [disabled]="!canEdit" />
                Template ativo
              </label>
            </div>
          </div>

          <div class="mb-4">
            <label class="text-xs font-bold text-[var(--app-text-muted)] uppercase">Assunto</label>
            <input
              #assuntoInput
              [(ngModel)]="form.assunto"
              name="assunto"
              [disabled]="!canEdit"
              (focus)="lastTextField = 'assunto'"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-focus-ring)]"
            />
          </div>

          <div class="mb-4" *ngIf="form.variables.length">
            <p class="text-xs font-bold text-[var(--app-text-muted)] uppercase mb-2">Variáveis</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                *ngFor="let v of form.variables"
                class="text-xs px-2.5 py-1 rounded-lg border border-[var(--app-border)] bg-[var(--color-bg-surface-alt)] text-[var(--app-text)] hover:border-[var(--brand)]"
                (mousedown)="$event.preventDefault()"
                (click)="inserirVariavel(v.key)"
                [title]="v.label"
              >
                {{ varToken(v.key) }}
              </button>
            </div>
            <p class="text-xs text-[var(--app-text-muted)] mt-2">
              Clique para inserir no campo focado (assunto, HTML ou texto). No HTML, os valores são escapados no envio.
            </p>
          </div>

          <div class="mb-4">
            <label class="text-xs font-bold text-[var(--app-text-muted)] uppercase mb-2 block">
              Corpo HTML
            </label>
            <editor
              [init]="tinyInit"
              [(ngModel)]="form.corpo_html"
              name="corpo_html"
              licenseKey="gpl"
              [disabled]="!canEdit"
              (onInit)="onTinyInit($event)"
            ></editor>
          </div>

          <div>
            <label class="text-xs font-bold text-[var(--app-text-muted)] uppercase">
              Corpo texto (opcional)
            </label>
            <textarea
              #corpoTexto
              [(ngModel)]="form.corpo_texto"
              name="corpo_texto"
              rows="5"
              [disabled]="!canEdit"
              (focus)="lastTextField = 'corpo_texto'"
              class="w-full mt-1 border border-[var(--app-border)] rounded-xl px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-focus-ring)]"
              placeholder="Versão plain text do e-mail"
            ></textarea>
          </div>

          <p *ngIf="form.updated_at" class="text-xs text-[var(--app-text-muted)] mt-4">
            Última alteração: {{ form.updated_at | date: 'dd/MM/yyyy HH:mm' }}
          </p>
        </div>

        <ng-template #emptyState>
          <div class="card-surface p-8 text-sm text-[var(--app-text-muted)]">
            {{ loading ? 'Carregando templates...' : 'Selecione um template à esquerda.' }}
          </div>
        </ng-template>
      </div>
    </div>
  `,
})
export class EmailTemplatesComponent implements SettingsReloadable {
  private readonly api = inject(EmailTemplatesService);
  private readonly notification = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('assuntoInput') private assuntoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('corpoTexto') private corpoTexto?: ElementRef<HTMLTextAreaElement>;

  readonly placeholderHint = '{{variavel}}';

  templates: EmailTemplateSummary[] = [];
  selectedCodigo: string | null = null;
  form: EmailTemplateDetail | null = null;
  loading = false;
  saving = false;
  busy = false;
  private currentUser: AuthUser | null = null;
  private tinyEditor: TinyMCEEditor | null = null;
  /** Último campo de texto focado (assunto / corpo texto), para inserir variável. */
  lastTextField: 'assunto' | 'corpo_texto' | null = null;

  /** UI alinhada ao TinyMCE completo (menubar + toolbar clássica). */
  readonly tinyInit: Record<string, unknown> = {
    base_url: '/tinymce',
    suffix: '.min',
    license_key: 'gpl',
    height: 520,
    menubar: 'file edit view insert format tools table help',
    branding: true,
    promotion: false,
    plugins:
      'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount',
    toolbar:
      'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | ' +
      'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | ' +
      'link image | code removeformat | help',
    content_style:
      'body { font-family: Helvetica, Arial, sans-serif; font-size: 14px; }',
    convert_urls: false,
    relative_urls: false,
    remove_script_host: false,
    image_title: true,
    automatic_uploads: false,
    file_picker_types: 'image',
  };

  get canEdit(): boolean {
    return hasPermission(this.currentUser, 'settings_email_templates', 'edit');
  }

  constructor() {
    void this.auth.getCurrentUser().then((user) => {
      this.currentUser = user;
      this.cdr.markForCheck();
    });
    this.reloadPage();
  }

  reloadPage() {
    this.loading = true;
    this.api.list().subscribe({
      next: (res) => {
        this.templates = res.templates || [];
        this.loading = false;
        const keep = this.selectedCodigo;
        if (keep && this.templates.some((t) => t.codigo === keep)) {
          this.selectTemplate(keep);
        } else if (this.templates[0]) {
          this.selectTemplate(this.templates[0].codigo);
        } else {
          this.form = null;
          this.selectedCodigo = null;
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.notification.notifyHttpError(err, 'Falha ao carregar templates de e-mail.');
        this.cdr.markForCheck();
      },
    });
  }

  selectTemplate(codigo: string) {
    this.selectedCodigo = codigo;
    this.tinyEditor = null;
    this.lastTextField = null;
    this.busy = true;
    this.api.getByCodigo(codigo).subscribe({
      next: (res) => {
        this.form = {
          ...res.template,
          corpo_texto: res.template.corpo_texto ?? '',
        };
        this.busy = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.busy = false;
        this.notification.notifyHttpError(err, 'Falha ao carregar template.');
        this.cdr.markForCheck();
      },
    });
  }

  onTinyInit(event: TinyInitEvent) {
    this.tinyEditor = event.editor;
    this.tinyEditor.on('focus', () => {
      this.lastTextField = null;
    });
  }

  varToken(key: string): string {
    return `{{${key}}}`;
  }

  inserirVariavel(key: string) {
    if (!this.canEdit || !this.form) return;
    const token = this.varToken(key);

    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName === 'INPUT' && active.getAttribute('name') === 'assunto') {
      this.lastTextField = 'assunto';
    } else if (active?.tagName === 'TEXTAREA' && active.getAttribute('name') === 'corpo_texto') {
      this.lastTextField = 'corpo_texto';
    }

    if (this.lastTextField === 'assunto' && this.assuntoInput?.nativeElement) {
      this.insertInInput(this.assuntoInput.nativeElement, token, (v) => {
        this.form!.assunto = v;
      });
      return;
    }

    if (this.lastTextField === 'corpo_texto' && this.corpoTexto?.nativeElement) {
      this.insertInInput(this.corpoTexto.nativeElement, token, (v) => {
        this.form!.corpo_texto = v;
      });
      return;
    }

    if (this.tinyEditor && !this.tinyEditor.removed) {
      this.tinyEditor.focus();
      this.tinyEditor.insertContent(token);
      this.form.corpo_html = this.tinyEditor.getContent();
      this.cdr.markForCheck();
      return;
    }

    this.form.corpo_html = `${this.form.corpo_html || ''}${token}`;
    this.cdr.markForCheck();
  }

  private insertInInput(
    el: HTMLInputElement | HTMLTextAreaElement,
    token: string,
    apply: (value: string) => void,
  ) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    apply(next);
    el.value = next;
    const caret = start + token.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    this.cdr.markForCheck();
  }

  private draftPayload() {
    if (!this.form) return null;
    return {
      nome: this.form.nome,
      descricao: this.form.descricao,
      assunto: this.form.assunto,
      corpo_html: this.form.corpo_html,
      corpo_texto: this.form.corpo_texto || null,
      ativo: this.form.ativo,
    };
  }

  salvar() {
    if (!this.form || !this.canEdit) return;
    const payload = this.draftPayload();
    if (!payload?.assunto?.trim() || !payload.corpo_html?.trim()) {
      this.notification.warning('Campos obrigatórios', 'Informe assunto e corpo HTML.');
      return;
    }

    this.saving = true;
    this.api.update(this.form.codigo, payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.form = {
          ...res.template,
          corpo_texto: res.template.corpo_texto ?? '',
        };
        const idx = this.templates.findIndex((t) => t.codigo === res.template.codigo);
        if (idx >= 0) {
          this.templates[idx] = {
            ...this.templates[idx],
            nome: res.template.nome,
            descricao: res.template.descricao,
            assunto: res.template.assunto,
            ativo: res.template.ativo,
            updated_at: res.template.updated_at,
            updated_by: res.template.updated_by,
          };
        }
        this.notification.success('Template salvo.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar template.');
        this.cdr.markForCheck();
      },
    });
  }

  abrirPreview() {
    if (!this.form) return;
    this.busy = true;
    this.api
      .preview(this.form.codigo, {
        assunto: this.form.assunto,
        corpo_html: this.form.corpo_html,
        corpo_texto: this.form.corpo_texto,
      })
      .subscribe({
        next: (res) => {
          this.busy = false;
          const doc = encodeURIComponent(
            `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${res.preview.html}</body></html>`,
          );
          void Swal.fire({
            title: res.preview.subject,
            html: `<iframe title="Preview" class="w-full border border-slate-200 rounded-xl bg-white" style="height:55vh" src="data:text/html;charset=utf-8,${doc}"></iframe>`,
            width: 720,
            confirmButtonText: 'Fechar',
            customClass: { confirmButton: 'btn-action-primary' },
          });
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.busy = false;
          this.notification.notifyHttpError(err, 'Falha ao gerar preview.');
          this.cdr.markForCheck();
        },
      });
  }

  abrirTeste() {
    if (!this.form || !this.canEdit) return;
    void Swal.fire({
      title: 'Enviar e-mail de teste',
      input: 'email',
      inputLabel: 'Destinatário',
      inputPlaceholder: 'seu@email.com',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      customClass: {
        confirmButton: 'btn-action-primary',
        cancelButton: 'btn-action-secondary',
      },
      preConfirm: (email) => {
        if (!email) {
          Swal.showValidationMessage('Informe um e-mail válido.');
          return false;
        }
        return email;
      },
    }).then((result) => {
      if (!result.isConfirmed || !this.form) return;
      this.busy = true;
      this.api
        .testSend(this.form.codigo, {
          destinatario: String(result.value),
          assunto: this.form.assunto,
          corpo_html: this.form.corpo_html,
          corpo_texto: this.form.corpo_texto,
        })
        .subscribe({
          next: () => {
            this.busy = false;
            this.notification.success('E-mail de teste enviado.');
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.busy = false;
            this.notification.notifyHttpError(err, 'Falha ao enviar e-mail de teste.');
            this.cdr.markForCheck();
          },
        });
    });
  }
}
