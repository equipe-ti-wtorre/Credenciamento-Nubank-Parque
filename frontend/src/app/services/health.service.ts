import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface HealthInfo {
  status: string;
  db: string;
  appName?: string;
  version: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class HealthService {
  constructor(private api: ApiService) {}

  getHealth(): Observable<HealthInfo> {
    return this.api.get<HealthInfo>('/health');
  }
}
