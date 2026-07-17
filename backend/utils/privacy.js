const DOC_TYPE_CPF = "CPF";

function maskDocument(document, typeDescription) {
  if (document == null || document === "") return null;
  const doc = String(document);
  const type = String(typeDescription || "").trim();

  if (type === DOC_TYPE_CPF) {
    const digits = doc.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    const last2 = digits.slice(-2);
    const block3 = digits.length >= 5 ? digits.slice(-5, -2) : "***";
    return `***.***.${block3}-${last2}`;
  }

  if (doc.length <= 4) return "****";
  return `${"*".repeat(Math.min(doc.length - 4, 8))}${doc.slice(-4)}`;
}

/** Formata documento completo para conferência na portaria (sem mascarar). */
function formatDocument(document, typeDescription) {
  if (document == null || document === "") return null;
  const doc = String(document).trim();
  const type = String(typeDescription || "").trim();
  if (type === DOC_TYPE_CPF) {
    const digits = doc.replace(/\D/g, "");
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
  }
  return doc;
}

function maskPhone(phone) {
  if (phone == null || phone === "") return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    return `(${ddd}) ****-${last4}`;
  }
  return `****-${last4}`;
}

function mapDocumentType(row) {
  if (!row || row.id_collaborator_document_type == null) return null;
  return {
    id_collaborator_document_type: row.id_collaborator_document_type,
    description: row.document_type_description ?? row.description,
  };
}

function mapRole(row) {
  if (!row || row.id_collaborator_role == null) return null;
  return {
    id_collaborator_role: row.id_collaborator_role,
    description: row.role_description ?? row.description,
  };
}

function toMaskedCollaborator(row, { isBlacklisted = false } = {}) {
  const typeDesc = row.document_type_description ?? row.document_type?.description ?? "";
  return {
    id_collaborator: row.id_collaborator,
    name: row.name,
    document: maskDocument(row.document, typeDesc),
    phone: maskPhone(row.phone),
    status: !!row.status,
    is_blacklisted: !!isBlacklisted,
    document_type: mapDocumentType(row),
    role: mapRole(row),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

module.exports = {
  DOC_TYPE_CPF,
  maskDocument,
  formatDocument,
  maskPhone,
  mapDocumentType,
  mapRole,
  toMaskedCollaborator,
};
