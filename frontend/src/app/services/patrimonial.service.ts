import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';

export interface ServiceAccessCollaborator {
  id_service_access_collaborator: number;
  id_collaborator: number;
  collaborator_name: string;
  collaborator_document: string;
  collaborator_picture?: string | null;
  id_collaborator_role: number;
  role_description: string;
  /** Função no cadastro master (pode diferir da função neste acesso). */
  master_id_collaborator_role?: number | null;
  master_role_description?: string | null;
  access_id: string | null;
  access_check_in: string | null;
  access_check_out: string | null;
  id_substitute: number | null;
}

export interface ServiceAccessVehicle {
  id_service_access_vehicle: number;
  id_vehicle: number;
  plate: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  type?: string | null;
  vehicle_description?: string | null;
  access_id: string | null;
  check_in: string | null;
  check_out: string | null;
  id_substitute_vehicle: number | null;
}

export interface ServiceAccessItem {
  id_service_access: number;
  id_company: number;
  id_access_status: number;
  access_status_description: string;
  status: boolean;
  start_date: string;
  end_date: string;
  finalidade: string;
  requesting_department: string;
  observacao: string | null;
  notificar_entrada?: boolean;
  notificar_entrada_colaborador?: boolean;
  notificar_entrada_veiculo?: boolean;
  id_setor?: number | null;
  setor_nome?: string | null;
  id_aprovacao?: number | null;
  aprovacao_status?: string | null;
  solicitante: { id: number; nome: string; email: string } | null;
  company_fancy_name?: string;
  collaborators: ServiceAccessCollaborator[];
  vehicles: ServiceAccessVehicle[];
  criado_em?: string;
  atualizado_em?: string;
}

export interface ServiceAccessBulkResult {
  totalProcessed: number;
  successCount: number;
  errors: { line: number; reason: string }[];
}

@Injectable({ providedIn: 'root' })
export class PatrimonialService {
  constructor(private api: ApiService) {}

  list(
    page = 1,
    limit = 20,
    filters: Record<string, string | number | boolean | undefined> = {},
  ): Observable<{
    services: ServiceAccessItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.api.get('/patrimonial/services', params);
  }

  getById(id: number): Observable<{ service: ServiceAccessItem }> {
    return this.api.get<{ service: ServiceAccessItem }>(`/patrimonial/services/${id}`);
  }

  create(data: {
    start_date: string;
    end_date: string;
    finalidade: string;
    requesting_department: string;
    observacao?: string | null;
    id_company?: number;
    id_setor: number;
    notificar_entrada?: boolean;
    notificar_entrada_colaborador?: boolean;
    notificar_entrada_veiculo?: boolean;
    notify_approvers?: boolean;
  }): Observable<{ service: ServiceAccessItem }> {
    return this.api.post<{ service: ServiceAccessItem }>('/patrimonial/services', data);
  }

  deleteDraft(id: number): Observable<{ deleted: boolean; id_service_access: number }> {
    return this.api.delete<{ deleted: boolean; id_service_access: number }>(
      `/patrimonial/services/${id}/draft`,
    );
  }

  update(
    id: number,
    data: Partial<{
      start_date: string;
      end_date: string;
      finalidade: string;
      requesting_department: string;
      observacao: string | null;
      id_setor: number;
      notificar_entrada: boolean;
      notificar_entrada_colaborador: boolean;
      notificar_entrada_veiculo: boolean;
    }>,
  ): Observable<{ service: ServiceAccessItem }> {
    return this.api.put<{ service: ServiceAccessItem }>(`/patrimonial/services/${id}`, data);
  }

  patchStatus(
    id: number,
    body: { id_access_status: number; reason?: string },
  ): Observable<{ service: ServiceAccessItem }> {
    return this.api.patch<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/status`,
      body,
    );
  }

  patchEnabled(id: number, status: boolean): Observable<{ service: ServiceAccessItem }> {
    return this.api.patch<{ service: ServiceAccessItem }>(`/patrimonial/services/${id}/enabled`, {
      status,
    });
  }

  updatePeriod(
    id: number,
    data: { start_date: string; end_date: string },
  ): Observable<{ service: ServiceAccessItem }> {
    return this.api.patch<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/period`,
      data,
    );
  }

  addCollaborator(
    id: number,
    body: { id_collaborator: number; id_collaborator_role: number },
  ): Observable<{ service: ServiceAccessItem }> {
    return this.api.post<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/collaborators`,
      body,
    );
  }

  removeCollaborator(id: number, linkId: number): Observable<{ service: ServiceAccessItem }> {
    return this.api.delete<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/collaborators/${linkId}`,
    );
  }

  bulkCollaborators(id: number, file: File): Observable<ServiceAccessBulkResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<ServiceAccessBulkResult>(
      `/patrimonial/services/${id}/collaborators/bulk`,
      form,
    );
  }

  addVehicle(id: number, body: { id_vehicle: number }): Observable<{ service: ServiceAccessItem }> {
    return this.api.post<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/vehicles`,
      body,
    );
  }

  removeVehicle(id: number, linkId: number): Observable<{ service: ServiceAccessItem }> {
    return this.api.delete<{ service: ServiceAccessItem }>(
      `/patrimonial/services/${id}/vehicles/${linkId}`,
    );
  }

  syncRelations(
    id: number,
    body: {
      collaborators: { id_collaborator: number; id_collaborator_role: number }[];
      vehicles: { id_vehicle: number }[];
      notify_approvers?: boolean;
      id_setor?: number;
    },
  ): Observable<{ service: ServiceAccessItem; relationsChanged: boolean }> {
    return this.api.put<{ service: ServiceAccessItem; relationsChanged: boolean }>(
      `/patrimonial/services/${id}/relations`,
      body,
    );
  }

  bulkVehicles(id: number, file: File): Observable<ServiceAccessBulkResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<ServiceAccessBulkResult>(
      `/patrimonial/services/${id}/vehicles/bulk`,
      form,
    );
  }

  bulkCollaboratorsPreview(id: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<import('../shared/bulk-import/bulk-import.types').BulkPreviewResult>(
      `/patrimonial/services/${id}/collaborators/bulk/preview`,
      form,
    );
  }

  bulkCollaboratorsCommit(
    id: number,
    previewId: string,
    decisions: import('../shared/bulk-import/bulk-import.types').BulkDecision[],
  ) {
    return this.api.post<import('../shared/bulk-import/bulk-import.types').BulkCommitResult>(
      `/patrimonial/services/${id}/collaborators/bulk/commit`,
      { previewId, decisions },
    );
  }

  bulkVehiclesPreview(id: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<import('../shared/bulk-import/bulk-import.types').BulkPreviewResult>(
      `/patrimonial/services/${id}/vehicles/bulk/preview`,
      form,
    );
  }

  bulkVehiclesCommit(
    id: number,
    previewId: string,
    decisions: import('../shared/bulk-import/bulk-import.types').BulkDecision[],
  ) {
    return this.api.post<import('../shared/bulk-import/bulk-import.types').BulkCommitResult>(
      `/patrimonial/services/${id}/vehicles/bulk/commit`,
      { previewId, decisions },
    );
  }

  downloadCollaboratorsBulkTemplate(): Observable<Blob> {
    return this.api.getBlob('/patrimonial/services/bulk-template/collaborators');
  }

  downloadVehiclesBulkTemplate(): Observable<Blob> {
    return this.api.getBlob('/patrimonial/services/bulk-template/vehicles');
  }

  baixarBulkImportTemplate(id: number): Observable<Blob> {
    return this.api.getBlob(`/patrimonial/services/${id}/bulk-import/template`);
  }

  bulkImportPreview(id: number, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.postFormData<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkPreviewResult
    >(`/patrimonial/services/${id}/bulk-import/preview`, form);
  }

  bulkImportConfirm(
    id: number,
    previewToken: string,
    decisoes: import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmBody['decisoes'],
    options?: { notify_approvers?: boolean },
  ) {
    return this.api.post<
      import('../pages/patrimonial/service-access-bulk-import.types').UnifiedBulkConfirmResult
    >(`/patrimonial/services/${id}/bulk-import/confirm`, {
      previewToken,
      decisoes,
      ...(options?.notify_approvers === false ? { notify_approvers: false } : {}),
    });
  }
}
