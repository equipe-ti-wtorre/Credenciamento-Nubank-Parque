import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-3xl">
      <h1 class="page-title">Início</h1>
      <p class="page-subtitle mb-6">Bem-vindo ao sistema de Credenciamento.</p>
      <div class="card-surface p-6">
        <p class="text-sm text-[var(--app-text-muted)]">Usuário</p>
        <p class="text-lg font-semibold text-slate-800">{{ user?.nome_completo || user?.email }}</p>
        <p class="text-sm mt-2 text-[var(--app-text-muted)]">Perfil: {{ user?.role }}</p>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  user: Awaited<ReturnType<AuthService['getCurrentUser']>> = null;

  constructor(private authService: AuthService) {}

  async ngOnInit() {
    this.user = await this.authService.getCurrentUser();
  }
}
