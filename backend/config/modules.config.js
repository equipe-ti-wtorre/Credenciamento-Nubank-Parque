const ACTIONS = ["view", "create", "edit", "delete"];

const ACTION_LABELS = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

const MODULES = [
  { key: "dashboard", label: "Início", group: "Geral" },
  { key: "approvals", label: "Aprovações", group: "Geral" },
  { key: "gate", label: "Portaria", group: "Acessos" },
  { key: "service_access", label: "Acessos de serviço", group: "Acessos" },
  { key: "events", label: "Eventos", group: "Acessos" },
  { key: "event_accreditation", label: "Credenciamento", group: "Acessos" },
  { key: "access_reports", label: "Relatório de acessos", group: "Relatórios" },
  { key: "credential_denials", label: "Recusas de acessos", group: "Relatórios" },
  { key: "audit", label: "Auditoria", group: "Relatórios" },
  { key: "collaborator_blocklist", label: "Gestão de bloqueio", group: "Acessos" },
  { key: "merchandise_entry", label: "Registrar entrada", group: "Mercadorias" },
  { key: "merchandise_exit", label: "Registrar saída", group: "Mercadorias" },
  { key: "merchandise_products", label: "Produtos", group: "Mercadorias" },
  { key: "merchandise_locations", label: "Locais de armazenagem", group: "Mercadorias" },
  { key: "merchandise_reports", label: "Relatório de mercadorias", group: "Relatórios" },
  { key: "merchandise_external_companies", label: "Empresas eventuais", group: "Mercadorias" },
  { key: "companies", label: "Empresas", group: "Cadastros" },
  { key: "collaborators", label: "Colaboradores", group: "Cadastros" },
  { key: "fleet", label: "Frota", group: "Cadastros" },
  { key: "sectors", label: "Times", group: "Cadastros" },
  { key: "profiles", label: "Perfis de acesso", group: "Sistema" },
  { key: "users", label: "Usuários internos", group: "Sistema" },
  { key: "company_users", label: "Usuários de empresas", group: "Sistema" },
  { key: "settings_tenants", label: "Tenants Azure", group: "Configurações" },
  { key: "settings_smtp", label: "Envios SMTP", group: "Configurações" },
  { key: "settings_facial", label: "Integração facial", group: "Configurações" },
  { key: "settings_email_templates", label: "Templates de e-mail", group: "Configurações" },
  { key: "settings_session", label: "Sessão", group: "Configurações" },
  { key: "settings_appearance", label: "Aparência", group: "Configurações" },
  { key: "settings_teams", label: "Integração Teams", group: "Configurações" },
  { key: "settings_system_reports", label: "Relatórios do sistema", group: "Configurações" },
  { key: "settings_about", label: "Sobre", group: "Configurações" },
  {
    key: "settings_event_accreditation",
    label: "Notificações de credenciamento",
    group: "Configurações",
  },
  {
    key: "settings_access_schedule",
    label: "Horários de acesso",
    group: "Configurações",
  },
];

const MODULE_KEYS = MODULES.map((m) => m.key);

function allPermissions() {
  return MODULE_KEYS.flatMap((modulo) =>
    ACTIONS.map((acao) => ({ modulo, acao })),
  );
}

function perms(...entries) {
  return entries.flatMap(([modulo, acoes]) =>
    acoes.map((acao) => ({ modulo, acao })),
  );
}

const SEED_PROFILES = [
  {
    codigo: "ADMIN",
    nome: "Administrador",
    descricao: "Acesso total ao sistema",
    is_system: 1,
    is_super_admin: 1,
    requires_company: 0,
    permissions: "all",
  },
  {
    codigo: "USER",
    nome: "Usuário",
    descricao: "Usuário interno padrão",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 0,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "PRODUTORA",
    nome: "Produtora",
    descricao: "Empresa produtora de eventos",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 1,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create", "edit"]],
      ["events", ["view", "edit"]],
      ["event_accreditation", ["view", "edit"]],
      ["fleet", ["view", "create", "edit"]],
      ["service_access", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "PADRAO",
    nome: "Empresa Padrão",
    descricao: "Empresa padrão vinculada",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 1,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create", "edit"]],
      ["events", ["view", "edit"]],
      ["event_accreditation", ["view", "edit"]],
      ["fleet", ["view", "create", "edit"]],
      ["service_access", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "CONTROLADOR",
    nome: "Controlador",
    descricao: "Portaria e movimentação de mercadorias",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 0,
    permissions: perms(
      ["dashboard", ["view"]],
      ["gate", ["view", "create", "edit"]],
      ["merchandise_entry", ["view", "create"]],
      ["merchandise_exit", ["view", "create"]],
      ["access_reports", ["view"]],
    ),
  },
  {
    codigo: "GESTAO",
    nome: "Gestão (legado)",
    descricao: "Perfil legado de gestão",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 0,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "EMPRESA_GESTOR",
    nome: "Gestor da Empresa",
    descricao: "Gestor externo vinculado à empresa",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 1,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create", "edit"]],
      ["company_users", ["view", "create", "edit"]],
      ["collaborators", ["view", "create", "edit", "delete"]],
      ["events", ["view", "edit"]],
      ["event_accreditation", ["view", "edit"]],
      ["service_access", ["view", "create", "edit"]],
      ["fleet", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "EMPRESA_SOLICITANTE",
    nome: "Solicitante da Empresa",
    descricao: "Usuário da empresa com perfil de solicitações",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 1,
    permissions: perms(
      ["dashboard", ["view"]],
      ["approvals", ["view", "create"]],
      ["collaborators", ["view", "create", "edit", "delete"]],
      ["events", ["view", "edit"]],
      ["event_accreditation", ["view", "edit"]],
      ["service_access", ["view", "create", "edit"]],
    ),
  },
  {
    codigo: "GESTAO_BLOQUEIO",
    nome: "Gestão de bloqueio",
    descricao: "Inclui e gerencia o bloqueio de colaboradores na arena",
    is_system: 1,
    is_super_admin: 0,
    requires_company: 0,
    permissions: perms(
      ["dashboard", ["view"]],
      ["collaborator_blocklist", ["view", "create", "edit", "delete"]],
    ),
  },
];

function permissionKey(modulo, acao) {
  return `${modulo}:${acao}`;
}

function getModulesCatalog() {
  const groups = {};
  for (const mod of MODULES) {
    if (!groups[mod.group]) groups[mod.group] = [];
    groups[mod.group].push({
      key: mod.key,
      label: mod.label,
      actions: ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] })),
    });
  }
  return {
    actions: ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] })),
    groups: Object.entries(groups).map(([name, modules]) => ({ name, modules })),
  };
}

module.exports = {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_KEYS,
  SEED_PROFILES,
  allPermissions,
  permissionKey,
  getModulesCatalog,
};
