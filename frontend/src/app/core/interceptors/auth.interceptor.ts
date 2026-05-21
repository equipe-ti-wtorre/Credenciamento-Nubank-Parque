import { Injectable, Injector } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, from, switchMap, catchError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshing = false;

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
          catchError((error: HttpErrorResponse) => {
            if (error.status !== 401 || !isApi || req.url.includes('/auth/refresh')) {
              return throwError(() => error);
            }

            if (this.refreshing) {
              return throwError(() => error);
            }

            this.refreshing = true;
            return from(authService.refreshSession()).pipe(
              switchMap((newToken) => {
                this.refreshing = false;
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
                this.refreshing = false;
                if (!authService.isLoggingOut()) {
                  void authService.logout();
                }
                return throwError(() => refreshErr);
              }),
            );
          }),
        );
      }),
    );
  }
}
