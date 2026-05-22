import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export type TeamsIntegrationTipo = 'user' | 'channel';

export interface TeamsIntegration {
  id?: number;
  nome: string;
  tipo: TeamsIntegrationTipo;
  azure_tenant_ref_id: number;
  azure_tenant_nome?: string | null;
  azure_tenant_id?: string | null;
  team_id?: string | null;
  channel_id?: string | null;
  destinatario_email?: string | null;
  /** URL https ao clicar na notificação no feed do Teams (tipo usuário). */
  activity_web_url?: string | null;
  /** ID do app no catálogo Graph (appCatalogs/teamsApps) após publicar teams-app/. */
  teams_app_id?: string | null;
  ativo: boolean;
}

export interface TeamsTestPayload {
  email?: string;
  mensagem?: string;
}

export interface TeamsConfig {
  defaultTeamsAppId: string | null;
  manifestExternalId: string | null;
}

@Injectable({ providedIn: 'root' })
export class TeamsService {
  constructor(private api: ApiService) {}

  list(): Observable<{ integrations: TeamsIntegration[] }> {
    return this.api.get<{ integrations: TeamsIntegration[] }>('/teams');
  }

  config(): Observable<TeamsConfig> {
    return this.api.get<TeamsConfig>('/teams/config');
  }

  create(data: TeamsIntegration): Observable<{ integration: TeamsIntegration }> {
    return this.api.post<{ integration: TeamsIntegration }>('/teams', data);
  }

  update(id: number, data: Partial<TeamsIntegration>): Observable<{ integration: TeamsIntegration }> {
    return this.api.put<{ integration: TeamsIntegration }>(`/teams/${id}`, data);
  }

  remove(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/teams/${id}`);
  }

  test(id: number, payload?: TeamsTestPayload): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/teams/${id}/test`, payload || {});
  }

  send(id: number, email: string, mensagem: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/teams/${id}/send`, { email, mensagem });
  }
}
