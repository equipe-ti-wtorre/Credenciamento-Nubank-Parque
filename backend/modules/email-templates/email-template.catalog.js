/** Catálogo de templates de sistema e variáveis documentadas na UI. */

const TEMPLATE_CATALOG = {
  invite_access: {
    variables: [
      { key: "nome", label: "Nome do convidado" },
      { key: "organization_name", label: "Nome da organização" },
      { key: "company_name", label: "Nome da empresa" },
      { key: "company_suffix", label: "Sufixo da empresa (ex.: \" da empresa X\")" },
      { key: "perfil_label", label: "Rótulo do perfil" },
      { key: "invite_url", label: "URL do convite" },
      { key: "invite_ttl_hours", label: "Validade do link (horas)" },
    ],
    sampleVars: {
      nome: "Maria Silva",
      organization_name: "Credenciamento",
      company_name: "Empresa Exemplo Ltda",
      company_suffix: " da empresa Empresa Exemplo Ltda",
      perfil_label: "Gestor da Empresa",
      invite_url: "https://exemplo.local/cadastro-acesso?token=abc123",
      invite_ttl_hours: "72",
    },
  },
  company_self_register: {
    variables: [
      { key: "nome", label: "Nome do convidado" },
      { key: "organization_name", label: "Nome da organização" },
      { key: "invite_url", label: "URL do cadastro" },
      { key: "invite_ttl_hours", label: "Validade do link (horas)" },
      { key: "company_type_label", label: "Tipo de empresa" },
    ],
    sampleVars: {
      nome: "Maria Silva",
      organization_name: "Credenciamento",
      invite_url: "https://exemplo.local/cadastro-empresa?token=abc123",
      invite_ttl_hours: "72",
      company_type_label: "Empresa Padrão",
    },
  },
  event_created: {
    variables: [
      { key: "event_name", label: "Nome do evento" },
      { key: "organization_name", label: "Nome da organização" },
      { key: "event_url", label: "URL do evento" },
      { key: "event_url_line", label: "Linha de texto com a URL (corpo texto)" },
    ],
    sampleVars: {
      event_name: "Show Exemplo",
      organization_name: "Credenciamento",
      event_url: "https://exemplo.local/admin/eventos/1",
      event_url_line: "Acesse: https://exemplo.local/admin/eventos/1",
    },
  },
  event_partner_linked: {
    variables: [
      { key: "event_name", label: "Nome do evento" },
      { key: "organization_name", label: "Nome da organização" },
      { key: "partner_name", label: "Nome da empresa parceira" },
      { key: "event_url", label: "URL do evento" },
      { key: "event_url_line", label: "Linha de texto com a URL (corpo texto)" },
    ],
    sampleVars: {
      event_name: "Show Exemplo",
      organization_name: "Credenciamento",
      partner_name: "Parceira Exemplo",
      event_url: "https://exemplo.local/admin/eventos/1",
      event_url_line: "Acesse: https://exemplo.local/admin/eventos/1",
    },
  },
  event_partner_complete: {
    variables: [
      { key: "event_name", label: "Nome do evento" },
      { key: "partner_name", label: "Nome da empresa parceira" },
      { key: "event_url", label: "URL do evento" },
      { key: "event_url_line", label: "Linha de texto com a URL (corpo texto)" },
    ],
    sampleVars: {
      event_name: "Show Exemplo",
      partner_name: "Parceira Exemplo",
      event_url: "https://exemplo.local/admin/eventos/1",
      event_url_line: "Acesse: https://exemplo.local/admin/eventos/1",
    },
  },
  credential_approved: {
    variables: [
      { key: "event_name", label: "Nome do evento" },
      { key: "event_day", label: "Data do dia do evento" },
      { key: "collaborator_name", label: "Nome do colaborador" },
      { key: "access_id", label: "Código de acesso (QR)" },
    ],
    sampleVars: {
      event_name: "Show Exemplo",
      event_day: "2026-08-01",
      collaborator_name: "João Santos",
      access_id: "00000000-0000-0000-0000-000000000001",
    },
  },
};

function getCatalogEntry(codigo) {
  return TEMPLATE_CATALOG[codigo] || null;
}

function listKnownCodigos() {
  return Object.keys(TEMPLATE_CATALOG);
}

module.exports = {
  TEMPLATE_CATALOG,
  getCatalogEntry,
  listKnownCodigos,
};
