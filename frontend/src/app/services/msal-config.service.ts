import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  IPublicClientApplication,
  PublicClientApplication,
  BrowserCacheLocation,
  LogLevel,
} from '@azure/msal-browser';
import { ApiService } from '../core/services/api.service';
import {
  setMsalRuntimeConfig,
  getMsalClientId,
  getMsalAuthority,
  isValidMsalClientId,
  MSAL_PLACEHOLDER_CLIENT_ID,
} from '../config/msal-runtime.config';
import { PlatformService } from '../core/services/platform.service';
import { environment } from '../../environments/environment';

export interface MsalConfigResponse {
  clientId: string;
  authority: string;
  redirectUri?: string | null;
  redirectUris?: {
    web?: string | null;
    android?: string | null;
    ios?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class MsalConfigService {
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private loadError: string | null = null;
  private msalInstance: IPublicClientApplication | null = null;
  private stubInstance: IPublicClientApplication | null = null;

  constructor(
    private api: ApiService,
    private platform: PlatformService,
  ) {
    this.stubInstance = this.createStubApplication();
    void this.stubInstance.initialize();
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadInternal();
    return this.loadPromise;
  }

  private async loadInternal(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.api.get<MsalConfigResponse>('/tenants/msal-config'),
      );

      if (!isValidMsalClientId(config.clientId)) {
        throw new Error('Client ID inválido retornado pelo servidor.');
      }

      const clientType = this.platform.getClientType();
      const redirectUri =
        config.redirectUris?.[clientType] ||
        config.redirectUri ||
        (typeof window !== 'undefined' ? window.location.origin : environment.msalConfig.auth.redirectUri);

      setMsalRuntimeConfig({
        clientId: config.clientId,
        authority: config.authority,
        redirectUri,
      });

      this.msalInstance = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: config.authority || getMsalAuthority(),
          redirectUri,
          postLogoutRedirectUri: redirectUri,
        },
        cache: {
          cacheLocation: BrowserCacheLocation.LocalStorage,
        },
        system: {
          loggerOptions: {
            loggerCallback: () => {},
            logLevel: LogLevel.Error,
          },
        },
      });

      await this.msalInstance.initialize();
      this.loaded = true;
    } catch {
      this.loadError =
        'Nenhum tenant Azure principal configurado. Entre como admin e cadastre em Administração > Tenants Azure.';
      this.loaded = true;
    }
  }

  /** Usado pelo Angular DI — nunca lança erro. */
  getInstanceForInjection(): IPublicClientApplication {
    return this.msalInstance ?? this.stubInstance!;
  }

  /** Instância real para login Microsoft — só quando configurado. */
  getInstance(): IPublicClientApplication {
    if (!this.msalInstance) {
      throw new Error(
        this.loadError ||
          'MSAL não configurado. Cadastre um tenant Azure principal em Administração > Tenants Azure.',
      );
    }
    return this.msalInstance;
  }

  private createStubApplication(): IPublicClientApplication {
    const redirectUri =
      typeof window !== 'undefined'
        ? window.location.origin
        : environment.msalConfig.auth.redirectUri;

    return new PublicClientApplication({
      auth: {
        clientId: MSAL_PLACEHOLDER_CLIENT_ID,
        authority: getMsalAuthority(),
        redirectUri,
        postLogoutRedirectUri: redirectUri,
      },
      cache: {
        cacheLocation: BrowserCacheLocation.MemoryStorage,
      },
      system: {
        loggerOptions: {
          loggerCallback: () => {},
          logLevel: LogLevel.Error,
        },
      },
    });
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  hasClientId(): boolean {
    return isValidMsalClientId(getMsalClientId()) && !!this.msalInstance;
  }
}
