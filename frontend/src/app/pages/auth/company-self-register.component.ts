import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService, AuthSession } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { formatCnpj, normalizeCnpjInput } from '../../services/company.service';

interface SelfRegisterInvite {
  email: string;
  name: string;
  id_company_type: number;
  company_type_label: string | null;
  expires_at: string;
}

interface GraphicSpan {
  flex: number;
  on: boolean;
}

const GRAPHIC_SEQ: Array<[number, 0 | 1]> = [
  [40, 1],
  [7, 0],
  [12, 1],
  [5, 0],
  [8, 1],
  [4, 0],
  [5, 1],
  [3.5, 0],
  [3, 1],
  [2.5, 0],
  [2, 1],
  [2, 0],
  [1.5, 1],
  [1.5, 0],
  [1, 1],
  [2, 0],
];

function buildGraphicRow(invert: boolean): GraphicSpan[] {
  return GRAPHIC_SEQ.map(([flex, on]) => ({
    flex,
    on: invert ? !on : Boolean(on),
  }));
}

function isValidCnpj(raw: string): boolean {
  const v = raw.replace(/\D/g, '');
  if (v.length !== 14 || /^(\d)\1+$/.test(v)) return false;
  const dig = (base: string, pesos: number[]) => {
    let s = 0;
    for (let i = 0; i < pesos.length; i += 1) s += Number(base[i]) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dig(v, p1) === Number(v[12]) && dig(v, p2) === Number(v[13]);
}

function maskTel(value: string): string {
  const v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

@Component({
  selector: 'app-company-self-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: './company-self-register.component.scss',
  template: `
    <div class="shell">
      <aside class="brand">
        <p class="brand__mark">Nubank Parque</p>
        <p class="brand__lead">
          Portal de credenciamento para empresas prestadoras de serviço e parceiras do Nubank Parque.
        </p>
        <ol class="steps">
          <li class="is-current" aria-current="step">Cadastre a empresa e o contato responsável</li>
          <li>Inclua os colaboradores que vão acessar o parque</li>
          <li>Acompanhe a aprovação e a liberação do acesso</li>
        </ol>
        <div class="graphic" aria-hidden="true">
          <div class="graphic__row">
            <div class="graphic__band">
              <span *ngFor="let s of graphicRow1" [class.on]="s.on" [style.flex]="'0 0 ' + s.flex + '%'"></span>
            </div>
          </div>
          <div class="graphic__row">
            <div class="graphic__band">
              <span *ngFor="let s of graphicRow2" [class.on]="s.on" [style.flex]="'0 0 ' + s.flex + '%'"></span>
            </div>
          </div>
          <div class="graphic__row">
            <div class="graphic__band">
              <span *ngFor="let s of graphicRow3" [class.on]="s.on" [style.flex]="'0 0 ' + s.flex + '%'"></span>
            </div>
          </div>
        </div>
      </aside>

      <main class="pane">
        <div class="pane__inner">
          <div class="head">
            <h1>Cadastro da empresa</h1>
          </div>

          <div *ngIf="loading()" class="state">Validando convite...</div>

          <div *ngIf="!loading() && error()" class="state">
            <p>{{ error() }}</p>
            <p><a routerLink="/login">Ir para o login</a></p>
          </div>

          <form *ngIf="!loading() && invite() as inv" class="card" (ngSubmit)="submit()" novalidate>
            <section class="sec">
              <h2 class="sec__title">Dados da empresa</h2>

              <div class="grid">
                <div class="col-1">
                  <label class="lbl" for="csr-cnpj">CNPJ <span class="star">*</span></label>
                  <input
                    class="ctl mono"
                    [class.err]="cnpjError()"
                    id="csr-cnpj"
                    name="cnpj"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="00.000.000/0000-00"
                    maxlength="18"
                    [(ngModel)]="cnpjDisplay"
                    (ngModelChange)="onCnpjChange($event)"
                    (blur)="validateCnpj()"
                    [disabled]="saving()"
                    required
                  />
                  <p class="msg" *ngIf="cnpjError()">{{ cnpjError() }}</p>
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-company-name">Razão social <span class="star">*</span></label>
                  <input
                    class="ctl"
                    id="csr-company-name"
                    name="companyName"
                    autocomplete="organization"
                    placeholder="Conforme o cartão CNPJ"
                    maxlength="200"
                    [(ngModel)]="companyName"
                    [disabled]="saving()"
                    required
                  />
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-fancy">Nome fantasia <span class="star">*</span></label>
                  <input
                    class="ctl"
                    id="csr-fancy"
                    name="fancyName"
                    placeholder="Como a empresa é conhecida"
                    maxlength="200"
                    [(ngModel)]="fancyName"
                    [disabled]="saving()"
                    required
                  />
                </div>

                <div class="col-1">
                  <label class="lbl">Logo <span class="opt">· opcional</span></label>
                  <div class="logo-row">
                    <div
                      class="drop"
                      [class.over]="logoDragOver()"
                      role="button"
                      tabindex="0"
                      aria-label="Enviar logo da empresa"
                      (click)="openLogoPicker()"
                      (keydown.enter)="openLogoPicker()"
                      (keydown.space)="$event.preventDefault(); openLogoPicker()"
                      (dragover)="onLogoDragOver($event)"
                      (dragleave)="onLogoDragLeave($event)"
                      (drop)="onLogoDrop($event)"
                    >
                      <img *ngIf="logoPreviewUrl()" [src]="logoPreviewUrl()!" alt="Pré-visualização do logo" />
                      <svg
                        *ngIf="!logoPreviewUrl()"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        aria-hidden="true"
                      >
                        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                      </svg>
                    </div>
                    <div class="logo-copy">
                      <p>
                        <button type="button" class="linkish" (click)="openLogoPicker()">Escolher arquivo</button>
                        ou arraste aqui
                      </p>
                      <p class="sub">
                        {{ pendingLogoFile() ? pendingLogoFile()!.name : 'PNG, JPEG ou WebP · até 2 MB' }}
                      </p>
                    </div>
                    <input
                      #logoInput
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      class="sr"
                      (change)="onLogoSelected($event)"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section class="sec">
              <h2 class="sec__title">Contato responsável</h2>

              <div class="grid">
                <div class="col-1">
                  <label class="lbl" for="csr-name">Nome completo <span class="star">*</span></label>
                  <input
                    class="ctl"
                    id="csr-name"
                    name="name"
                    autocomplete="name"
                    maxlength="200"
                    [(ngModel)]="name"
                    [disabled]="saving()"
                    required
                  />
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-dept">Departamento <span class="opt">· opcional</span></label>
                  <input
                    class="ctl"
                    id="csr-dept"
                    name="department"
                    placeholder="Ex.: Operações"
                    maxlength="100"
                    [(ngModel)]="department"
                    [disabled]="saving()"
                  />
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-email">E-mail</label>
                  <div class="lock">
                    <input class="ctl" id="csr-email" [value]="inv.email" readonly aria-describedby="email-hint" />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </div>
                  <p class="hint" id="email-hint">É o e-mail do convite e será seu login.</p>
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-phone">Telefone <span class="star">*</span></label>
                  <input
                    class="ctl mono"
                    id="csr-phone"
                    name="phone"
                    inputmode="tel"
                    placeholder="(11) 99999-9999"
                    maxlength="15"
                    [(ngModel)]="phone"
                    (ngModelChange)="onPhoneChange($event)"
                    [disabled]="saving()"
                    required
                  />
                </div>
              </div>
            </section>

            <section class="sec">
              <h2 class="sec__title">Senha de acesso</h2>
              <p class="sec__hint">Mínimo de 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>

              <div class="grid">
                <div class="col-1">
                  <label class="lbl" for="csr-password">Criar senha <span class="star">*</span></label>
                  <div class="pwd">
                    <input
                      class="ctl"
                      [type]="showPassword() ? 'text' : 'password'"
                      id="csr-password"
                      name="password"
                      autocomplete="new-password"
                      [(ngModel)]="password"
                      (ngModelChange)="onPasswordChange()"
                      [disabled]="saving()"
                      required
                    />
                    <button
                      type="button"
                      class="toggle"
                      [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'"
                      (click)="showPassword.set(!showPassword())"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                    </button>
                  </div>
                  <div class="meter" aria-hidden="true">
                    <i [class.f]="passwordScore() > 0"></i>
                    <i [class.f]="passwordScore() > 1"></i>
                    <i [class.f]="passwordScore() > 2"></i>
                    <i [class.f]="passwordScore() > 3"></i>
                  </div>
                  <p class="hint" role="status">{{ passwordHint() }}</p>
                </div>

                <div class="col-1">
                  <label class="lbl" for="csr-password-confirm">Repetir senha <span class="star">*</span></label>
                  <div class="pwd">
                    <input
                      class="ctl"
                      [class.err]="passwordConfirm.length > 0 && !passwordsMatch()"
                      [type]="showPasswordConfirm() ? 'text' : 'password'"
                      id="csr-password-confirm"
                      name="passwordConfirm"
                      autocomplete="new-password"
                      [(ngModel)]="passwordConfirm"
                      [disabled]="saving()"
                      required
                    />
                    <button
                      type="button"
                      class="toggle"
                      [attr.aria-label]="showPasswordConfirm() ? 'Ocultar senha' : 'Mostrar senha'"
                      (click)="showPasswordConfirm.set(!showPasswordConfirm())"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                    </button>
                  </div>
                  <p
                    class="msg"
                    [class.ok]="passwordsMatch()"
                    *ngIf="passwordConfirm"
                    role="status"
                  >
                    {{ passwordsMatch() ? 'As senhas conferem.' : 'As senhas não são iguais.' }}
                  </p>
                </div>
              </div>
            </section>

            <div class="actions">
              <p class="alt">Já tem cadastro? <a routerLink="/login">Entrar no portal</a></p>
              <button class="btn" type="submit" [disabled]="saving()">
                {{ saving() ? 'Salvando...' : 'Cadastrar empresa' }}
              </button>
            </div>
          </form>

          <p class="foot">© {{ currentYear }} · Credenciamento Nubank Parque</p>
        </div>
      </main>
    </div>
  `,
})
export class CompanySelfRegisterComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notification = inject(NotificationService);

  readonly currentYear = new Date().getFullYear();
  readonly graphicRow1 = buildGraphicRow(false);
  readonly graphicRow2 = buildGraphicRow(true);
  readonly graphicRow3 = buildGraphicRow(false);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  invite = signal<SelfRegisterInvite | null>(null);
  cnpjError = signal<string | null>(null);
  showPassword = signal(false);
  showPasswordConfirm = signal(false);
  passwordScore = signal(0);
  passwordHint = signal('');

  name = '';
  department = '';
  cnpjDisplay = '';
  companyName = '';
  fancyName = '';
  phone = '';
  password = '';
  passwordConfirm = '';
  logoPreviewUrl = signal<string | null>(null);
  pendingLogoFile = signal<File | null>(null);
  logoDragOver = signal(false);
  private readonly logoAcceptMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly logoAcceptExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  private readonly logoMaxBytes = 2 * 1024 * 1024;
  private token = '';

  @ViewChild('logoInput') logoInput?: ElementRef<HTMLInputElement>;

  passwordsMatch(): boolean {
    return this.password.length > 0 && this.password === this.passwordConfirm;
  }

  ngOnInit() {
    this.token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!this.token) {
      this.loading.set(false);
      this.error.set('Link de cadastro inválido. Solicite um novo envio.');
      return;
    }
    void this.loadInvite();
  }

  ngOnDestroy() {
    this.revokeLogoPreview();
  }

  onCnpjChange(value: string) {
    const digits = normalizeCnpjInput(value);
    this.cnpjDisplay = digits.length === 14 ? formatCnpj(digits) : this.maskCnpjPartial(digits);
    this.cnpjError.set(null);
  }

  validateCnpj() {
    if (!this.cnpjDisplay) {
      this.cnpjError.set(null);
      return;
    }
    this.cnpjError.set(isValidCnpj(this.cnpjDisplay) ? null : 'Esse CNPJ não é válido. Confira os números.');
  }

  onPhoneChange(value: string) {
    this.phone = maskTel(value);
  }

  onPasswordChange() {
    const v = this.password;
    const checks = [
      ['8 caracteres', v.length >= 8],
      ['maiúscula e minúscula', /[a-z]/.test(v) && /[A-Z]/.test(v)],
      ['número', /\d/.test(v)],
      ['símbolo', /[^A-Za-z0-9]/.test(v)],
    ] as const;
    const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
    this.passwordScore.set(checks.length - missing.length);
    this.passwordHint.set(!v ? '' : missing.length ? `Falta: ${missing.join(', ')}` : 'Senha forte.');
  }

  openLogoPicker() {
    if (this.saving()) return;
    this.logoInput?.nativeElement.click();
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.applyLogoFile(file);
  }

  onLogoDragOver(event: DragEvent) {
    event.preventDefault();
    if (this.saving()) return;
    this.logoDragOver.set(true);
  }

  onLogoDragLeave(event: DragEvent) {
    event.preventDefault();
    this.logoDragOver.set(false);
  }

  onLogoDrop(event: DragEvent) {
    event.preventDefault();
    this.logoDragOver.set(false);
    if (this.saving()) return;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (!file) return;
    this.applyLogoFile(file);
  }

  private applyLogoFile(file: File) {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!this.logoAcceptMime.has(file.type) && !this.logoAcceptExt.has(ext)) {
      this.notification.error('Imagem inválida. Use JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > this.logoMaxBytes) {
      this.notification.error('O arquivo passa de 2 MB.');
      return;
    }
    this.pendingLogoFile.set(file);
    this.revokeLogoPreview();
    this.logoPreviewUrl.set(URL.createObjectURL(file));
  }

  private revokeLogoPreview() {
    const url = this.logoPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.logoPreviewUrl.set(null);
  }

  private maskCnpjPartial(digits: string): string {
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  private passwordIsStrong(): boolean {
    const v = this.password;
    return (
      v.length >= 8 &&
      /[a-z]/.test(v) &&
      /[A-Z]/.test(v) &&
      /\d/.test(v) &&
      /[^A-Za-z0-9]/.test(v)
    );
  }

  private async loadInvite() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.get<{ invite: SelfRegisterInvite }>(
          `/auth/company-register/${encodeURIComponent(this.token)}`,
        ),
      );
      this.invite.set(res.invite);
      this.name = res.invite.name || '';
    } catch (err) {
      const e = err as { error?: { message?: string; error?: string } };
      this.error.set(e?.error?.message || e?.error?.error || 'Link inválido ou expirado.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    this.validateCnpj();
    const cnpj = normalizeCnpjInput(this.cnpjDisplay);
    if (!isValidCnpj(cnpj)) {
      this.notification.error('Informe um CNPJ válido.');
      return;
    }
    if (!this.name.trim() || !this.companyName.trim() || !this.fancyName.trim()) {
      this.notification.error('Preencha o nome do responsável, a razão social e o nome fantasia.');
      return;
    }
    if (this.phone.replace(/\D/g, '').length < 10) {
      this.notification.error('Informe um telefone válido.');
      return;
    }
    if (!this.passwordIsStrong()) {
      this.notification.error('A senha deve ter 8 caracteres, com maiúscula, minúscula, número e símbolo.');
      return;
    }
    if (this.password !== this.passwordConfirm) {
      this.notification.error('As senhas não são iguais.');
      return;
    }

    this.saving.set(true);
    try {
      const form = new FormData();
      form.append('name', this.name.trim());
      form.append('cnpj', cnpj);
      form.append('company_name', this.companyName.trim());
      form.append('password', this.password);
      form.append('password_confirm', this.passwordConfirm);
      if (this.department.trim()) form.append('department', this.department.trim());
      form.append('fancy_name', this.fancyName.trim());
      form.append('phone', this.phone.trim());
      const logo = this.pendingLogoFile();
      if (logo) form.append('logo', logo, logo.name);

      const res = await firstValueFrom(
        this.api.postFormData<AuthSession>(
          `/auth/company-register/${encodeURIComponent(this.token)}`,
          form,
        ),
      );
      await this.auth.saveSession(res);
      this.notification.success('Empresa cadastrada com sucesso.');
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      const e = err as { error?: { message?: string; error?: string } };
      this.notification.error(
        e?.error?.message || e?.error?.error || 'Não foi possível concluir o cadastro.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
