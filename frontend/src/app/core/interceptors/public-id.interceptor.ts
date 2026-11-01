import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { adaptPublicPayload } from '../public-id.adapter';

@Injectable()
export class PublicIdAdapterInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      map((event) => {
        if (!(event instanceof HttpResponse)) return event;
        const body = event.body;
        if (body == null || typeof body !== 'object' || body instanceof Blob) return event;
        return event.clone({ body: adaptPublicPayload(body) });
      }),
    );
  }
}
