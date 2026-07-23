import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface SessionSettings {
  id?: number;
  session_idle_minutes: number;
  atualizado_em?: string;
}

export type ColorPalette = 'wtorre' | 'nubank-parque';

export interface AppearanceSettings {
  id?: number;
  color_palette: ColorPalette;
  atualizado_em?: string;
}

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  constructor(private api: ApiService) {}

  getSessionSettings(): Observable<{ settings: SessionSettings }> {
    return this.api.get<{ settings: SessionSettings }>('/system-settings/session');
  }

  updateSessionSettings(
    session_idle_minutes: number,
  ): Observable<{ settings: SessionSettings }> {
    return this.api.put<{ settings: SessionSettings }>('/system-settings/session', {
      session_idle_minutes,
    });
  }

  getAppearanceSettings(): Observable<{ settings: AppearanceSettings }> {
    return this.api.get<{ settings: AppearanceSettings }>('/system-settings/appearance');
  }

  updateAppearanceSettings(
    color_palette: ColorPalette,
  ): Observable<{ settings: AppearanceSettings }> {
    return this.api.put<{ settings: AppearanceSettings }>('/system-settings/appearance', {
      color_palette,
    });
  }
}
