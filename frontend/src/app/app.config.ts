import { ApplicationConfig, APP_INITIALIZER, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { BrowserModule } from '@angular/platform-browser';
import { InteractionType } from '@azure/msal-browser';
import {
  MsalService,
  MsalModule,
  MSAL_INSTANCE,
  MSAL_GUARD_CONFIG,
  MsalGuardConfiguration,
} from '@azure/msal-angular';
import { environment } from '../environments/environment';
import { API_BASE_URL } from './core/tokens/injection-tokens';
import { routes } from './app.routes';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { RequestIdInterceptor } from './core/interceptors/request-id.interceptor';
import { ErrorInterceptor } from './core/interceptors/error.interceptor';
import { MsalConfigService } from './services/msal-config.service';
import { PlatformService } from './core/services/platform.service';
import { AuthService } from './core/services/auth.service';
import { bootstrapPlatform } from './core/platform-bootstrap';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

export function platformInitializer(platform: PlatformService) {
  return () => bootstrapPlatform(platform);
}

export function msalConfigInitializer(msalConfigService: MsalConfigService) {
  return () => msalConfigService.load();
}

/** Processa retorno Azure / popup Teams antes do router (evita CancelledByUser por corrida). */
export function teamsAuthRedirectInitializer(authService: AuthService) {
  return () => authService.handleRedirect();
}

export function authTokensInitializer(authService: AuthService) {
  return () => authService.ensureTokensLoaded();
}

export function MSALInstanceFactory(msalConfigService: MsalConfigService) {
  return msalConfigService.getInstanceForInjection();
}

export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: { scopes: ['User.Read'] },
    loginFailedRoute: '/login',
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: RequestIdInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    importProvidersFrom(BrowserModule, MsalModule),
    provideAnimations(),
    provideCharts(withDefaultRegisterables()),
    {
      provide: APP_INITIALIZER,
      useFactory: msalConfigInitializer,
      deps: [MsalConfigService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: teamsAuthRedirectInitializer,
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: platformInitializer,
      deps: [PlatformService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: authTokensInitializer,
      deps: [AuthService],
      multi: true,
    },
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory,
      deps: [MsalConfigService],
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: MSALGuardConfigFactory,
    },
    MsalService,
  ],
};
