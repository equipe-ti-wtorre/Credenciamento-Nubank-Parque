import { Injectable, Injector } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import {
  Observable,
  throwError,
  from,
  switchMap,
  catchError,
  shareReplay,
  finalize,
  take,
} from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { SessionIdleService } from '../services/session-idle.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshInFlight$: Observable<string | null> | null = null;

  constructor(
    private injector: Injector,
    private api: ApiService,
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const base = this.api.getBaseUrl().replace(/\/+$/, '');
    const isApi =
      req.url.startsWith(base) ||
      req.url.startsWith(`${base}/`) ||
      req.url.startsWith('/api');

    const isPublic =
      req.url.includes('/tenants/msal-config') ||
      req.url.includes('/auth/login') ||
      req.url.includes('/auth/refresh');

    if (isPublic) {
      return next.handle(req);
    }

    const authService = this.injector.get(AuthService);
    const sessionIdle = this.injector.get(SessionIdleService);

    return from(authService.ensureTokensLoaded()).pipe(
      switchMap(() => {
        let authReq = req;
        if (isApi) {
          const token = authService.getAccessTokenSync();
          if (token) {
            authReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
          }
        }

        return next.handle(authReq).pipe(
          catchError((error: HttpErrorResponse) =>
            this.handleError(error, req, next, authService, sessionIdle, isApi),
          ),
        );
      }),
    );
  }

  private handleError(
    error: HttpErrorResponse,
    req: HttpRequest<unknown>,
    next: HttpHandler,
    authService: AuthService,
    sessionIdle: SessionIdleService,
    isApi: boolean,
  ): Observable<HttpEvent<unknown>> {
    if (error.status !== 401 || !isApi || req.url.includes('/auth/refresh')) {
      return throwError(() => error);
    }

    if (sessionIdle.isIdleExpired() || sessionIdle.hasExceededIdleLimit()) {
      if (!authService.isLoggingOut()) {
        void authService.logout({ reason: 'idle' });
      }
      return throwError(() => error);
    }

    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = from(authService.refreshSession()).pipe(
        shareReplay(1),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
      );
    }

    return this.refreshInFlight$.pipe(
      take(1),
      switchMap((newToken) => {
        if (!newToken) {
          if (!authService.isLoggingOut()) {
            void authService.logout();
          }
          return throwError(() => error);
        }
        const retry = req.clone({
          setHeaders: { Authorization: `Bearer ${newToken}` },
        });
        return next.handle(retry);
      }),
      catchError((refreshErr) => {
        if (!authService.isLoggingOut()) {
          void authService.logout();
        }
        return throwError(() => refreshErr);
      }),
    );
  }
}
