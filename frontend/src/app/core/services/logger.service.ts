import { Injectable, Inject, Injector, Optional } from '@angular/core';
import { environment } from '../../../environments/environment';
import { API_BASE_URL } from '../tokens/injection-tokens';
import { PlatformService } from './platform.service';
import { AuthService } from './auth.service';

const REPORT_PATH = '/error-logs/client';
const DEDUP_WINDOW_MS = 5000;
const MAX_REPORTS_PER_MINUTE = 10;

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private lastFingerprint = '';
  private lastReportedAt = 0;
  private reportTimes: number[] = [];

  constructor(
    @Optional() @Inject(API_BASE_URL) private apiBaseUrl: string | null,
    private platform: PlatformService,
    private injector: Injector,
  ) {}

  debug(message: string, context?: Record<string, unknown>) {
    if (!environment.production) {
      console.debug(`[Credenciamento] ${message}`, context ?? '');
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    console.info(`[Credenciamento] ${message}`, context ?? '');
  }

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(`[Credenciamento] ${message}`, context ?? '');
  }

  error(message: string, context?: Record<string, unknown>) {
    console.error(`[Credenciamento] ${message}`, context ?? '');
    if (context?.['report'] === false) return;
    this.reportToBackend(message, context);
  }

  private reportToBackend(message: string, context?: Record<string, unknown>) {
    if (typeof fetch === 'undefined') return;

    const fingerprint = `${message}|${String(context?.['stack'] ?? '')}`.slice(0, 400);
    const now = Date.now();
    if (fingerprint === this.lastFingerprint && now - this.lastReportedAt < DEDUP_WINDOW_MS) {
      return;
    }
    this.reportTimes = this.reportTimes.filter((t) => now - t < 60_000);
    if (this.reportTimes.length >= MAX_REPORTS_PER_MINUTE) return;
    this.lastFingerprint = fingerprint;
    this.lastReportedAt = now;
    this.reportTimes.push(now);

    const base = (this.apiBaseUrl || environment.apiBaseUrl || '/api/v1').replace(/\/+$/, '');
    const url = `${base}${REPORT_PATH}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Type': this.platform.getClientType(),
    };

    try {
      const token = this.injector.get(AuthService, null, { optional: true })?.getAccessTokenSync();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      /* AuthService ainda não disponível */
    }

    const errLike = context?.['err'] ?? context?.['error'];
    const stackRaw =
      context?.['stack'] ??
      (errLike instanceof Error ? errLike.stack : null) ??
      (typeof errLike === 'string' ? errLike : null);

    const body = {
      message: String(message).slice(0, 500),
      stack: stackRaw != null ? String(stackRaw).slice(0, 8000) : null,
      path:
        (context?.['path'] != null ? String(context['path']) : null) ||
        (typeof location !== 'undefined' ? location.pathname : null),
      requestId: context?.['requestId'] != null ? String(context['requestId']) : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      clientType: this.platform.getClientType(),
    };

    void fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* não relogar falha do próprio POST */
    });
  }
}
