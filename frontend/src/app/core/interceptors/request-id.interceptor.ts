import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../services/api.service';

@Injectable()
export class RequestIdInterceptor implements HttpInterceptor {
  constructor(private api: ApiService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const base = this.api.getBaseUrl().replace(/\/+$/, '');
    const isApi =
      req.url.startsWith(base) ||
      req.url.startsWith(`${base}/`) ||
      req.url.startsWith('/api');

    if (!isApi) return next.handle(req);

    const requestId = crypto.randomUUID();
    return next.handle(
      req.clone({ setHeaders: { 'X-Request-Id': requestId } }),
    );
  }
}
