import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SystemSettingsService } from '../../services/system-settings.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

const LAST_ACTIVITY_KEY = 'session.lastActivityAt';
const DEFAULT_IDLE_MINUTES = 30;

@Injectable({ providedIn: 'root' })
export class SessionIdleService {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly authService = inject(AuthService);
  private readonly storage = inject(StorageService);

  private idleMinutes = DEFAULT_IDLE_MINUTES;
  private idleExpired = false;
  private monitoring = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private boundOnActivity = () => this.recordActivity();
  private boundOnVisibility = () => void this.handleVisibilityChange();

  getIdleTimeoutMs(): number {
    return this.idleMinutes * 60 * 1000;
  }

  isIdleExpired(): boolean {
    return this.idleExpired;
  }

  markIdleExpired(): void {
    this.idleExpired = true;
  }

  hasExceededIdleLimit(): boolean {
    if (this.idleExpired) return true;
    const last = this.getLastActivityAt();
    if (!last) return false;
    return Date.now() - last >= this.getIdleTimeoutMs();
  }

  async loadConfig(): Promise<void> {
    try {
      const res = await firstValueFrom(this.systemSettings.getSessionSettings());
      await this.applyIdleMinutes(res.settings.session_idle_minutes);
    } catch {
      await this.applyIdleMinutes(DEFAULT_IDLE_MINUTES);
    }
  }

  async applyIdleMinutes(minutes: number): Promise<void> {
    this.idleMinutes = Math.min(480, Math.max(5, minutes));
    if (this.monitoring) {
      this.scheduleTimeout();
    }
  }

  async startMonitoring(): Promise<void> {
    if (typeof document === 'undefined') return;
    if (this.monitoring) return;

    const token = await this.storage.get('token');
    if (!token) return;

    this.idleExpired = false;
    await this.loadConfig();

    if (this.getLastActivityAt() && this.hasExceededIdleLimit()) {
      await this.expireDueToIdle();
      return;
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    for (const event of events) {
      document.addEventListener(event, this.boundOnActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.boundOnVisibility);

    if (!this.getLastActivityAt()) {
      this.recordActivity();
    } else {
      this.scheduleTimeout();
    }

    this.monitoring = true;
  }

  stopMonitoring(): void {
    if (!this.monitoring && typeof document === 'undefined') return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    for (const event of events) {
      document.removeEventListener(event, this.boundOnActivity);
    }
    document.removeEventListener('visibilitychange', this.boundOnVisibility);
    this.clearScheduledTimeout();
    this.monitoring = false;
  }

  resetAfterLogin(): void {
    this.idleExpired = false;
    this.recordActivity();
    void this.startMonitoring();
  }

  clearOnLogout(): void {
    this.stopMonitoring();
    this.idleExpired = false;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    }
  }

  recordActivity(): void {
    if (this.idleExpired) return;
    const now = Date.now();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }
    this.scheduleTimeout();
  }

  private getLastActivityAt(): number | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private scheduleTimeout(): void {
    this.clearScheduledTimeout();
    const last = this.getLastActivityAt() ?? Date.now();
    const remaining = this.getIdleTimeoutMs() - (Date.now() - last);
    const delay = Math.max(0, remaining);
    this.timeoutId = setTimeout(() => {
      void this.expireDueToIdle();
    }, delay);
  }

  private clearScheduledTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async handleVisibilityChange(): Promise<void> {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!(await this.storage.get('token'))) return;
    if (this.hasExceededIdleLimit()) {
      await this.expireDueToIdle();
    }
  }

  private async expireDueToIdle(): Promise<void> {
    if (this.idleExpired) return;
    this.markIdleExpired();
    this.stopMonitoring();
    if (this.authService.isLoggingOut()) return;
    await this.authService.logout({ reason: 'idle' });
  }
}
