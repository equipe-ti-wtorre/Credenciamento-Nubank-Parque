import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface AzureTenant {
  id?: number;
  nome: string;
  azure_tenant_id: string;
  client_id: string;
  client_secret?: string;
  ativo: boolean;
  eh_principal: boolean;
  hasSecret?: boolean;
}

export interface TenantStatusItem {
  label: string;
  tenantId: string;
  status: string;
  message: string | null;
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  constructor(private api: ApiService) {}

  list(): Observable<{ tenants: AzureTenant[] }> {
    return this.api.get<{ tenants: AzureTenant[] }>('/tenants');
  }

  get(id: number): Observable<{ tenant: AzureTenant }> {
    return this.api.get<{ tenant: AzureTenant }>(`/tenants/${id}`);
  }

  create(data: AzureTenant): Observable<{ tenant: AzureTenant }> {
    return this.api.post<{ tenant: AzureTenant }>('/tenants', data);
  }

  update(id: number, data: Partial<AzureTenant>): Observable<{ tenant: AzureTenant }> {
    return this.api.put<{ tenant: AzureTenant }>(`/tenants/${id}`, data);
  }

  remove(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/tenants/${id}`);
  }

  status(): Observable<{ tenants: TenantStatusItem[] }> {
    return this.api.get<{ tenants: TenantStatusItem[] }>('/tenants/status');
  }
}
