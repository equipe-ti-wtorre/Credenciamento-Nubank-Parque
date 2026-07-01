import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SystemSettingsService } from '../../services/system-settings.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

const LAST_ACTIVITY_KEY = 'session.lastActivityAt';
const DEFAULT_IDLE_MINUTES = 30;
const MIN_IDLE_MINUTES = 5;
const MAX_IDLE_MINUTES = 480;

@Injectable({ providedIn: 'root' })
export class SessionIdleService {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly authService = inject(AuthService);
  private readonly storage = inject(StorageService);

  private systemIdleMinutes = DEFAULT_IDLE_MINUTES;
  private userIdleMinutes: number | null = null;
  private idleMinutes = DEFAULT_IDLE_MINUTES;
  private idleDisabled = false;
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

  isIdleDisabled(): boolean {
    return this.idleDisabled;
  }

  markIdleExpired(): void {
    this.idleExpired = true;
  }

  hasExceededIdleLimit(): boolean {
    if (this.idleDisabled) return false;
    if (this.idleExpired) return true;
    const last = this.getLastActivityAt();
    if (!last) return false;
    return Date.now() - last >= this.getIdleTimeoutMs();
  }

  async loadConfig(): Promise<void> {
    try {
      const res = await firstValueFrom(this.systemSettings.getSessionSettings());
      this.systemIdleMinutes = res.settings.session_idle_minutes;
    } catch {
      this.systemIdleMinutes = DEFAULT_IDLE_MINUTES;
    }

    const userMinutes = await this.readUserIdleMinutesFromStorage();
    this.applyPreferenceState(userMinutes);
  }

  async applyUserPreference(minutes: number | null | undefined): Promise<void> {
    this.applyPreferenceState(minutes);

    if (this.idleDisabled) {
      this.stopMonitoring();
      return;
    }

    const token = await this.storage.get('token');
    if (!token) return;

    if (this.monitoring) {
      this.scheduleTimeout();
      return;
    }

    await this.beginMonitoring();
  }

  async applyIdleMinutes(minutes: number): Promise<void> {
    this.systemIdleMinutes = Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, minutes));
    if (!this.idleDisabled) {
      this.applyEffectiveIdleMinutes();
      if (this.monitoring) {
        this.scheduleTimeout();
      }
    }
  }

  async startMonitoring(): Promise<void> {
    if (typeof document === 'undefined') return;
    if (this.monitoring) return;

    const token = await this.storage.get('token');
    if (!token) return;

    this.idleExpired = false;
    await this.loadConfig();

    if (this.idleDisabled) return;

    if (this.getLastActivityAt() && this.hasExceededIdleLimit()) {
      await this.expireDueToIdle();
      return;
    }

    await this.beginMonitoring();
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
    this.idleDisabled = false;
    this.userIdleMinutes = null;
    this.systemIdleMinutes = DEFAULT_IDLE_MINUTES;
    this.idleMinutes = DEFAULT_IDLE_MINUTES;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    }
  }

  recordActivity(): void {
    if (this.idleExpired || this.idleDisabled) return;
    const now = Date.now();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }
    this.scheduleTimeout();
  }

  private applyPreferenceState(minutes: number | null | undefined): void {
    if (minutes === 0) {
      this.idleDisabled = true;
      this.userIdleMinutes = null;
      return;
    }

    this.idleDisabled = false;
    if (minutes !== undefined) {
      this.userIdleMinutes = minutes ?? null;
    }
    this.applyEffectiveIdleMinutes();
  }

  private async beginMonitoring(): Promise<void> {
    if (typeof document === 'undefined' || this.monitoring || this.idleDisabled) return;

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

  private applyEffectiveIdleMinutes(): void {
    const base = this.userIdleMinutes ?? this.systemIdleMinutes;
    this.idleMinutes = Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, base));
  }

  private async readUserIdleMinutesFromStorage(): Promise<number | null | undefined> {
    const raw = await this.storage.get('currentUser');
    if (!raw) return undefined;
    try {
      const user = JSON.parse(raw) as { session_idle_minutes?: number | null };
      if (user.session_idle_minutes === undefined) return undefined;
      return user.session_idle_minutes ?? null;
    } catch {
      return undefined;
    }
  }

  private getLastActivityAt(): number | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private scheduleTimeout(): void {
    if (this.idleDisabled) return;
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
    if (this.idleDisabled) return;
    if (this.hasExceededIdleLimit()) {
      await this.expireDueToIdle();
    }
  }

  private async expireDueToIdle(): Promise<void> {
    if (this.idleDisabled || this.idleExpired) return;
    this.markIdleExpired();
    this.stopMonitoring();
    if (this.authService.isLoggingOut()) return;
    await this.authService.logout({ reason: 'idle' });
  }
}
