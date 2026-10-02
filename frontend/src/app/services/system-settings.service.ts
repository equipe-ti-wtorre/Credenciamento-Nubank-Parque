import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
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

export interface EventAccreditationNotifyUser {
  id: number;
  nome_completo: string;
  email: string;
  departamento: string | null;
}

export interface EventAccreditationNotifySettings {
  id?: number;
  notify_all: boolean;
  users: EventAccreditationNotifyUser[];
  atualizado_em?: string;
}

export interface AccessScheduleSettings {
  id?: number;
  comercial_start: string;
  comercial_end: string;
  noturno_start: string;
  noturno_end: string;
  comercial_crosses_midnight?: boolean;
  noturno_crosses_midnight?: boolean;
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

  getEventAccreditationNotifySettings(): Observable<{ settings: EventAccreditationNotifySettings }> {
    return this.api.get<{ settings: EventAccreditationNotifySettings }>(
      '/system-settings/event-accreditation-notify',
    );
  }

  updateEventAccreditationNotifySettings(payload: {
    notify_all: boolean;
    user_ids: number[];
  }): Observable<{ settings: EventAccreditationNotifySettings }> {
    return this.api.put<{ settings: EventAccreditationNotifySettings }>(
      '/system-settings/event-accreditation-notify',
      payload,
    );
  }

  listAdInternalUsers(search = ''): Observable<{ users: EventAccreditationNotifyUser[] }> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.api.get<{ users: EventAccreditationNotifyUser[] }>(
      '/system-settings/event-accreditation-notify/users',
      params,
    );
  }

  getAccessScheduleSettings(): Observable<{ settings: AccessScheduleSettings }> {
    return this.api.get<{ settings: AccessScheduleSettings }>('/system-settings/access-schedule');
  }

  updateAccessScheduleSettings(
    payload: Pick<
      AccessScheduleSettings,
      'comercial_start' | 'comercial_end' | 'noturno_start' | 'noturno_end'
    >,
  ): Observable<{ settings: AccessScheduleSettings }> {
    return this.api.put<{ settings: AccessScheduleSettings }>(
      '/system-settings/access-schedule',
      payload,
    );
  }
}
