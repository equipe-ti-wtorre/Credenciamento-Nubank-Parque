import { Injectable } from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';

const PREFIX = 'nav:';

export interface NavRecord {
  public_id: string;
  company_id?: string;
  action?: string;
}

@Injectable({ providedIn: 'root' })
export class NavigationStateService {
  constructor(private router: Router) {}

  navegar(rota: string, dados: NavRecord, extras?: NavigationExtras): Promise<boolean> {
    this.gravar(rota, dados);
    return this.router.navigate([rota], {
      ...extras,
      state: { ...(extras?.state as object | undefined), ...dados },
    });
  }

  obter(rota: string): NavRecord | null {
    const atual = this.router.getCurrentNavigation();
    const fromNav = this.normalizar((atual?.extras?.state as Record<string, unknown> | undefined) || null);
    if (fromNav) {
      this.gravar(rota, fromNav);
      return fromNav;
    }
    if (!atual) {
      const fromHistory = this.lerHistory();
      if (fromHistory) {
        this.gravar(rota, fromHistory);
        return fromHistory;
      }
    }
    return this.lerStorage(rota);
  }

  remover(rota: string): void {
    try {
      sessionStorage.removeItem(PREFIX + rota);
    } catch {
      /* storage indisponível */
    }
  }

  limpar(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((key) => sessionStorage.removeItem(key));
    } catch {
      /* storage indisponível */
    }
  }

  private gravar(rota: string, dados: NavRecord): void {
    try {
      sessionStorage.setItem(PREFIX + rota, JSON.stringify(dados));
    } catch {
      /* storage indisponível */
    }
  }

  private lerHistory(): NavRecord | null {
    try {
      return this.normalizar(history.state as Record<string, unknown> | null);
    } catch {
      return null;
    }
  }

  private lerStorage(rota: string): NavRecord | null {
    try {
      const raw = sessionStorage.getItem(PREFIX + rota);
      if (!raw) return null;
      return this.normalizar(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  private normalizar(value: Record<string, unknown> | null): NavRecord | null {
    if (!value || typeof value['public_id'] !== 'string' || !value['public_id']) return null;
    const record: NavRecord = { public_id: value['public_id'] };
    if (typeof value['company_id'] === 'string' && value['company_id']) {
      record.company_id = value['company_id'];
    }
    if (typeof value['action'] === 'string' && value['action']) record.action = value['action'];
    return record;
  }
}
