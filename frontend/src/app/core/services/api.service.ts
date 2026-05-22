import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/injection-tokens';
import { PlatformService } from './platform.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private baseUrl: string,
    private platform: PlatformService,
  ) {}

  private buildUrl(path: string): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private defaultHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Client-Type': this.platform.getClientType(),
    });
  }

  get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(this.buildUrl(path), {
      headers: this.defaultHeaders(),
      params,
    });
  }

  getBlob(path: string, params?: HttpParams): Observable<Blob> {
    return this.http.get(this.buildUrl(path), {
      headers: this.defaultHeaders(),
      params,
      responseType: 'blob',
    });
  }

  post<T>(
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Observable<T> {
    let headers = this.defaultHeaders();
    if (extraHeaders) {
      Object.entries(extraHeaders).forEach(([k, v]) => {
        headers = headers.set(k, v);
      });
    }
    return this.http.post<T>(this.buildUrl(path), body, { headers });
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.buildUrl(path), body, {
      headers: this.defaultHeaders(),
    });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.buildUrl(path), {
      headers: this.defaultHeaders(),
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
