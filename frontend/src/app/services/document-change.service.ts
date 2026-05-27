import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface DocumentChangeRequest {
  id: number;
  id_collaborator: number;
  collaborator_name: string;
  old_document: string;
  new_document: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  admin_reason: string | null;
  criado_em: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentChangeService {
  constructor(private api: ApiService) {}

  create(
    collaboratorId: number,
    body: { new_document: string; reason: string },
  ): Observable<{ request: DocumentChangeRequest }> {
    return this.api.post<{ request: DocumentChangeRequest }>(
      `/collaborators/${collaboratorId}/document-change`,
      body,
    );
  }

  listPending(): Observable<{ requests: DocumentChangeRequest[] }> {
    return this.api.get<{ requests: DocumentChangeRequest[] }>(
      '/collaborators/document-change/pending',
    );
  }

  patchStatus(
    id: number,
    body: { status: 'APPROVED' | 'REJECTED'; admin_reason?: string },
  ): Observable<{ request: DocumentChangeRequest }> {
    return this.api.patch<{ request: DocumentChangeRequest }>(
      `/collaborators/document-change/${id}/status`,
      body,
    );
  }
}
