import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { PlatformService } from './platform.service';

export interface GatewayConfig {
  enabled: boolean;
  url: string | null;
}

const DISABLED: GatewayConfig = { enabled: false, url: null };

/**
 * Login centralizado (auth-gateway). O cookie nbp_session é httpOnly no domínio pai e vai sozinho
 * para a API, que o valida a cada chamada; o front só consulta o gateway (sessão, login e saída).
 */
@Injectable({ providedIn: 'root' })
export class GatewayAuthService {
  private configPromise: Promise<GatewayConfig> | null = null;

  constructor(
    private api: ApiService,
    private platform: PlatformService,
  ) {}

  loadConfig(): Promise<GatewayConfig> {
    if (!this.configPromise) {
      this.configPromise = firstValueFrom(this.api.get<GatewayConfig>('/auth/gateway/config'))
        .then((cfg) => (cfg?.enabled && cfg.url ? cfg : DISABLED))
        .catch(() => {
          this.configPromise = null;
          return DISABLED;
        });
    }
    return this.configPromise;
  }

  /** Só no navegador comum; app nativo e Teams seguem no fluxo MSAL. */
  async isAvailable(): Promise<boolean> {
    if (this.platform.isNative() || typeof window === 'undefined') return false;
    return (await this.loadConfig()).enabled;
  }

  /** GET /me do gateway: confirma a sessão e renova o cookie se estiver perto de vencer. */
  async hasSession(): Promise<boolean> {
    const { url } = await this.loadConfig();
    if (!url) return false;
    try {
      const res = await fetch(`${url}/me`, { credentials: 'include' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async redirectToLogin(): Promise<void> {
    const { url } = await this.loadConfig();
    if (!url) return;
    const back = `${window.location.origin}/login?gw=1`;
    window.location.href = `${url}/login?redirect=${encodeURIComponent(back)}`;
  }

  async redirectToLogout(): Promise<boolean> {
    const { url } = await this.loadConfig();
    if (!url) return false;
    const back = `${window.location.origin}/login`;
    window.location.href = `${url}/logout?redirect=${encodeURIComponent(back)}`;
    return true;
  }
}
