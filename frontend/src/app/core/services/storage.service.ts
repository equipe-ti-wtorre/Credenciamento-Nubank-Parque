import { Injectable } from '@angular/core';
import { PlatformService } from './platform.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(private platform: PlatformService) {}

  private async getPreferences() {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      return Preferences;
    } catch {
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.platform.isNative()) {
      const Prefs = await this.getPreferences();
      if (Prefs) {
        const { value } = await Prefs.get({ key });
        return value;
      }
    }
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (this.platform.isNative()) {
      const Prefs = await this.getPreferences();
      if (Prefs) {
        await Prefs.set({ key, value });
        return;
      }
    }
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    if (this.platform.isNative()) {
      const Prefs = await this.getPreferences();
      if (Prefs) {
        await Prefs.remove({ key });
        return;
      }
    }
    localStorage.removeItem(key);
  }
}
