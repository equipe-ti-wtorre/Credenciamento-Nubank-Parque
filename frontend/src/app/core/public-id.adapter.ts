/**
 * A API entrega public_id e remove o id numérico.
 * Este adaptador recoloca o UUID nos campos que as telas já usam (id_event, id, …).
 * O valor deixa de ser sequencial.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_TO_LEGACY: Record<string, string> = {
  event_day_company_collaborator_public_id: 'id_event_day_company_collaborator',
  event_day_company_vehicle_public_id: 'id_event_day_company_vehicle',
  event_accreditation_collaborator_public_id: 'id_event_accreditation_collaborator',
  event_accreditation_invite_file_public_id: 'id_event_accreditation_invite_file',
  event_accreditation_company_public_id: 'id_event_accreditation_company',
  event_accreditation_day_public_id: 'id_event_accreditation_day',
  event_accreditation_public_id: 'id_event_accreditation',
  service_access_collaborator_public_id: 'id_service_access_collaborator',
  service_access_vehicle_public_id: 'id_service_access_vehicle',
  service_access_public_id: 'id_service_access',
  material_movement_item_public_id: 'id_material_movement_item',
  material_movement_public_id: 'id_material_movement',
  event_day_company_public_id: 'id_event_day_company',
  event_day_public_id: 'id_event_day',
  event_public_id: 'id_event',
  external_company_public_id: 'id_external_company',
  storage_location_public_id: 'id_storage_location',
  product_public_id: 'id_product',
  vehicle_public_id: 'id_vehicle',
  substitute_vehicle_public_id: 'id_substitute_vehicle',
  collaborator_public_id: 'id_collaborator',
  substitute_public_id: 'id_substitute',
  company_contact_public_id: 'id_company_contact',
  company_public_id: 'id_company',
  company_responsavel_public_id: 'id_company_responsavel',
  company_origem_public_id: 'id_company_origem',
  producer_public_id: 'id_producer',
  bracelet_type_public_id: 'id_bracelet_type',
  collaborator_role_public_id: 'id_collaborator_role',
  setor_public_id: 'id_setor',
  sector_public_id: 'sectorId',
  usuario_public_id: 'id_usuario',
  solicitante_public_id: 'id_solicitante',
  perfil_public_id: 'id_perfil',
  aprovacao_public_id: 'id_aprovacao',
  entidade_public_id: 'id_entidade',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Id de entidade depois do adaptador: UUID público ou inteiro positivo legado. */
export function entityId(value: unknown): number | string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (UUID_RE.test(text)) return text.toLowerCase();
    if (/^\d+$/.test(text)) {
      const n = Number(text);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return null;
}

export function sameEntityId(a: unknown, b: unknown): boolean {
  const left = entityId(a);
  const right = entityId(b);
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

function isRoleCatalog(row: Record<string, unknown>): boolean {
  if (row['description'] == null || row['id_collaborator_role'] != null) return false;
  if (row['name'] != null || row['document'] != null || row['plate'] != null) return false;
  const keys = Object.keys(row);
  return keys.length > 0 && keys.every((k) => k === 'public_id' || k === 'description' || k === 'id');
}

function restoreOwn(row: Record<string, unknown>): void {
  const pub = row['public_id'];
  if (typeof pub !== 'string' || !UUID_RE.test(pub)) return;

  if (row['inscription_start'] != null && row['id_event_accreditation'] == null) {
    row['id_event_accreditation'] = pub;
    return;
  }
  if (row['finalidade'] != null && row['start_date'] != null && row['id_service_access'] == null) {
    row['id_service_access'] = pub;
    return;
  }
  if (
    row['name'] != null &&
    row['start'] != null &&
    row['end'] != null &&
    row['inscription_start'] == null &&
    row['id_event'] == null
  ) {
    row['id_event'] = pub;
    return;
  }
  if (row['date'] != null && row['companies'] != null && row['id_event_day'] == null) {
    row['id_event_day'] = pub;
    return;
  }
  if (row['company'] != null && row['producer'] !== undefined && row['id_event_day_company'] == null) {
    row['id_event_day_company'] = pub;
    return;
  }
  if (row['collaborator_name'] != null && row['id_service_access_collaborator'] == null) {
    row['id_service_access_collaborator'] = pub;
    return;
  }
  if (
    row['plate'] != null &&
    (row['check_in'] !== undefined || row['id_substitute_vehicle'] !== undefined) &&
    row['id_service_access_vehicle'] == null
  ) {
    row['id_service_access_vehicle'] = pub;
    return;
  }
  if (
    (row['company_name'] != null || row['razao_social'] != null || row['cnpj'] != null) &&
    row['id_company'] == null
  ) {
    row['id_company'] = pub;
    return;
  }
  if (
    (row['cpf'] != null || row['document'] != null || row['documento'] != null) &&
    row['id_collaborator'] == null
  ) {
    row['id_collaborator'] = pub;
    return;
  }
  if (row['plate'] != null && row['id_vehicle'] == null) {
    row['id_vehicle'] = pub;
    return;
  }
  // Catálogo de função: a API troca o id numérico por public_id.
  // Os selects comparam id_collaborator_role — sem isso a opção fica vazia.
  if (isRoleCatalog(row)) {
    row['id_collaborator_role'] = pub;
    if (row['id'] == null) row['id'] = pub;
    return;
  }
  if (row['sectorNome'] != null && row['sectorId'] == null) {
    row['sectorId'] = pub;
    return;
  }
  if (
    row['name'] != null &&
    row['event_kind'] != null &&
    (row['color'] != null || row['icon'] != null) &&
    row['inscription_start'] == null &&
    row['id_bracelet_type'] == null
  ) {
    row['id_bracelet_type'] = pub;
    if (row['id'] == null) row['id'] = pub;
    return;
  }
  if (row['id'] == null) row['id'] = pub;
}

export function adaptPublicPayload<T>(body: T): T {
  return adaptNode(body) as T;
}

function adaptNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map((item) => adaptNode(item));
  if (!isRecord(node)) return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'companies_notify' && isRecord(value)) {
      out[key] = value;
      continue;
    }
    out[key] = adaptNode(value);
  }

  for (const [pubKey, legacy] of Object.entries(PUBLIC_TO_LEGACY)) {
    if (out[pubKey] != null && out[legacy] == null) out[legacy] = out[pubKey];
  }
  if (out['entidade_public_id'] != null && out['idEntidade'] == null) {
    out['idEntidade'] = out['entidade_public_id'];
  }
  if (out['setor_public_id'] != null && out['idSetor'] == null) {
    out['idSetor'] = out['setor_public_id'];
  }
  restoreOwn(out);
  return out;
}
