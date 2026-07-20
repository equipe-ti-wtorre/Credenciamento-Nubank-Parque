import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService, AuthSession } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

interface InviteInfo {
  email: string;
  nome_completo: string;
  company_name: string | null;
  perfil: string | null;
  expires_at: string;
}

@Component({
  selector: 'app-invite-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="w-full max-w-[400px] mx-auto space-y-6 text-left">
      <div class="flex flex-col items-center text-center">
        <img
          src="assets/logo.svg"
          alt="WTorre"
          class="h-10 w-auto object-contain"
          style="height: 45px"
        />
        <div class="mt-2 w-28 h-0.5 bg-blue-500 rounded-full" aria-hidden="true"></div>
        <h2 class="mt-4 text-xl font-medium text-white">Cadastro de acesso</h2>
        <p class="mt-1 text-sm text-slate-300">Defina sua senha para acessar o sistema.</p>
      </div>

      <div *ngIf="loading()" class="text-center text-slate-300 text-sm py-8">Validando convite...</div>

      <div *ngIf="!loading() && error()" class="space-y-4 text-center">
        <p class="text-amber-300 text-sm">{{ error() }}</p>
        <a routerLink="/login" class="text-sky-300 text-sm underline">Ir para o login</a>
      </div>

      <ng-container *ngIf="!loading() && invite() as inv">
        <div class="rounded-xl bg-slate-800/60 border border-slate-600 px-4 py-3 text-sm space-y-1">
          <p class="text-slate-300"><span class="text-slate-400">Nome:</span> {{ inv.nome_completo }}</p>
          <p class="text-slate-300"><span class="text-slate-400">E-mail:</span> {{ inv.email }}</p>
          <p *ngIf="inv.company_name" class="text-slate-300">
            <span class="text-slate-400">Empresa:</span> {{ inv.company_name }}
          </p>
          <p *ngIf="inv.perfil" class="text-slate-300">
            <span class="text-slate-400">Perfil:</span> {{ inv.perfil }}
          </p>
        </div>

        <form class="space-y-4" (ngSubmit)="submit()">
          <div>
            <label class="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5"
              >Senha</label
            >
            <input
              type="password"
              required
              minlength="8"
              [(ngModel)]="password"
              name="password"
              [disabled]="saving()"
              autocomplete="new-password"
              class="block w-full rounded-lg border-0 bg-gray-700/80 px-4 py-3 text-gray-200"
            />
          </div>
          <div>
            <label class="block text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5"
              >Confirmar senha</label
            >
            <input
              type="password"
              required
              minlength="8"
              [(ngModel)]="passwordConfirm"
              name="passwordConfirm"
              [disabled]="saving()"
              autocomplete="new-password"
              class="block w-full rounded-lg border-0 bg-gray-700/80 px-4 py-3 text-gray-200"
            />
          </div>
          <button
            type="submit"
            [disabled]="saving()"
            class="w-full py-3 rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
          >
            {{ saving() ? 'Salvando...' : 'Definir senha e entrar' }}
          </button>
        </form>
      </ng-container>
    </div>
  `,
})
export class InviteRegisterComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notification = inject(NotificationService);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  invite = signal<InviteInfo | null>(null);

  password = '';
  passwordConfirm = '';
  private token = '';

  ngOnInit() {
    this.token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!this.token) {
      this.loading.set(false);
      this.error.set('Link de cadastro inválido. Solicite um novo envio de acesso.');
      return;
    }
    void this.loadInvite();
  }

  private async loadInvite() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.get<{ invite: InviteInfo }>(`/auth/invite/${encodeURIComponent(this.token)}`),
      );
      this.invite.set(res.invite);
    } catch (err) {
      const e = err as { error?: { message?: string; error?: string } };
      this.error.set(
        e?.error?.message || e?.error?.error || 'Convite inválido ou expirado.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    if (this.password.length < 8) {
      this.notification.error('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (this.password !== this.passwordConfirm) {
      this.notification.error('A confirmação de senha não confere.');
      return;
    }

    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.api.post<AuthSession>(`/auth/invite/${encodeURIComponent(this.token)}/complete`, {
          password: this.password,
          password_confirm: this.passwordConfirm,
        }),
      );
      await this.auth.saveSession(res);
      this.notification.success('Acesso criado com sucesso.');
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
