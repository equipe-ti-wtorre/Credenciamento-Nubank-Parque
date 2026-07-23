import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface CollaboratorDocumentType {
  id_collaborator_document_type: number;
  description: string;
}

export interface CollaboratorRole {
  id_collaborator_role: number;
  description: string;
}

export interface CollaboratorBulkUploadResult {
  totalProcessed: number;
  successCount: number;
  errors: { line: number; reason: string }[];
}

export interface FaceValidationCheck {
  id: string;
  status: 'ok' | 'falha' | 'aviso';
  medido?: unknown;
  limite?: unknown;
  fabricantes_afetados?: string[];
  tipo?: string;
  mensagem?: string;
}

export interface FaceValidationReport {
  apto: { controlid: boolean; dahua: boolean };
  checagens: FaceValidationCheck[];
  resumo?: {
    bloqueios_intrinsecos: FaceValidationCheck[];
    ajustaveis: FaceValidationCheck[];
  };
  meta?: Record<string, unknown>;
}

export interface CollaboratorItem {
  id_collaborator: number;
  id_collaborator_document_type: number;
  id_collaborator_role: number;
  document: string;
  name: string;
  rg: string | null;
  phone: string | null;
  picture?: string | null;
  status: boolean;
  is_blacklisted: boolean;
  can_delete?: boolean;
  criado_em: string;
  atualizado_em: string;
  document_type: CollaboratorDocumentType | null;
  role: CollaboratorRole | null;
}

export interface CollaboratorListFilters {
  q?: string;
  name?: string;
  document?: string;
  status?: boolean;
  is_blacklisted?: boolean;
  id_collaborator_role?: number;
  id_collaborator_document_type?: number;
}

export interface CollaboratorListResponse {
  collaborators: CollaboratorItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CollaboratorCreatePayload {
  id_collaborator_document_type: number;
  id_collaborator_role: number;
  document: string;
  name: string;
  rg?: string | null;
  phone?: string | null;
  status?: boolean;
}

export type CollaboratorUpdatePayload = Partial<CollaboratorCreatePayload>;

@Injectable({ providedIn: 'root' })
export class CollaboratorService {
  constructor(private api: ApiService) {}

  listDocumentTypes(): Observable<{ types: CollaboratorDocumentType[] }> {
    return this.api.get<{ types: CollaboratorDocumentType[] }>('/collaborators/types');
  }

  listRoles(): Observable<{ roles: CollaboratorRole[] }> {
    return this.api.get<{ roles: CollaboratorRole[] }>('/collaborators/roles');
  }

  createRole(description: string): Observable<{ role: CollaboratorRole }> {
    return this.api.post<{ role: CollaboratorRole }>('/collaborators/roles', { description });
  }

  updateRole(id: number, description: string): Observable<{ role: CollaboratorRole }> {
    return this.api.put<{ role: CollaboratorRole }>(`/collaborators/roles/${id}`, { description });
  }

  deleteRole(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`/collaborators/roles/${id}`);
  }

  list(
    page = 1,
    limit = 20,
    filters: CollaboratorListFilters = {},
  ): Observable<CollaboratorListResponse> {
    return this.api.get<CollaboratorListResponse>(
      '/collaborators',
      this.buildParams(page, limit, filters),
    );
  }

  get(id: number): Observable<{ collaborator: CollaboratorItem }> {
    return this.api.get<{ collaborator: CollaboratorItem }>(`/collaborators/${id}`);
  }

  searchByDocument(
    document: string,
    idCollaboratorDocumentType: number,
  ): Observable<{ collaborator: CollaboratorItem | null; found: boolean }> {
    const params = new HttpParams()
      .set('document', document)
      .set('id_collaborator_document_type', String(idCollaboratorDocumentType));
    return this.api.get<{ collaborator: CollaboratorItem | null; found: boolean }>(
      '/collaborators/search',
      params,
    );
  }

  create(data: CollaboratorCreatePayload): Observable<{
    collaborator: CollaboratorItem;
    linked?: boolean;
  }> {
    return this.api.post<{ collaborator: CollaboratorItem; linked?: boolean }>(
      '/collaborators',
      data,
    );
  }

  update(id: number, data: CollaboratorUpdatePayload): Observable<{ collaborator: CollaboratorItem }> {
    return this.api.put<{ collaborator: CollaboratorItem }>(`/collaborators/${id}`, data);
  }

  patchStatus(id: number, status: boolean): Observable<{ collaborator: CollaboratorItem }> {
    return this.api.patch<{ collaborator: CollaboratorItem }>(
      `/collaborators/${id}/status`,
      { status },
    );
  }

  addBlacklist(id: number, reason: string): Observable<{ collaborator: CollaboratorItem }> {
    return this.api.post<{ collaborator: CollaboratorItem }>(
      `/collaborators/${id}/blacklist`,
      { reason },
    );
  }

  removeBlacklist(id: number): Observable<{ collaborator: CollaboratorItem }> {
    return this.api.delete<{ collaborator: CollaboratorItem }>(`/collaborators/${id}/blacklist`);
  }

  delete(id: number): Observable<{ success: boolean; unlinked?: boolean }> {
    return this.api.delete<{ success: boolean; unlinked?: boolean }>(`/collaborators/${id}`);
  }

  bulkUpload(file: File): Observable<CollaboratorBulkUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<CollaboratorBulkUploadResult>('/collaborators/bulk', form);
  }

  bulkPreview(file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkPreviewResult
    >('/collaborators/bulk/preview', form);
  }

  bulkCommit(
    previewToken: string,
    decisoes: import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmBody['decisoes'],
  ) {
    return this.api.post<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmResult
    >('/collaborators/bulk/commit', { previewToken, decisoes });
  }

  downloadBulkTemplate(): Observable<Blob> {
    return this.api.getBlob('/collaborators/bulk/template');
  }

  uploadPicture(id: number, file: File): Observable<{ collaborator: CollaboratorItem; picture: string }> {
    const form = new FormData();
    form.append('picture', file, file.name);
    return this.api.postFormData<{ collaborator: CollaboratorItem; picture: string }>(
      `/collaborators/${id}/picture`,
      form,
    );
  }

  validateFacePicture(file: File): Observable<FaceValidationReport> {
    const form = new FormData();
    form.append('picture', file, file.name);
    return this.api.postFormData<FaceValidationReport>('/faces/validar', form);
  }

  getPictureBlob(filename: string): Observable<Blob> {
    return this.api.getBlob(`/storage/pictures/${filename}`);
  }

  private buildParams(
    page: number,
    limit: number,
    filters: CollaboratorListFilters,
  ): HttpParams {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    if (filters.name?.trim()) params = params.set('name', filters.name.trim());
    if (filters.document?.trim()) params = params.set('document', filters.document.trim());
    if (filters.status !== undefined) params = params.set('status', String(filters.status));
    if (filters.is_blacklisted !== undefined) {
      params = params.set('is_blacklisted', String(filters.is_blacklisted));
    }
    if (filters.id_collaborator_role != null && filters.id_collaborator_role > 0) {
      params = params.set('id_collaborator_role', String(filters.id_collaborator_role));
    }
    if (
      filters.id_collaborator_document_type != null &&
      filters.id_collaborator_document_type > 0
    ) {
      params = params.set(
        'id_collaborator_document_type',
        String(filters.id_collaborator_document_type),
      );
    }
    return params;
  }
}

export function formatCpf(value: string): string {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function normalizeCpfInput(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export function isCpfDocumentType(description: string | undefined): boolean {
  return String(description || '').trim().toUpperCase() === 'CPF';
}
