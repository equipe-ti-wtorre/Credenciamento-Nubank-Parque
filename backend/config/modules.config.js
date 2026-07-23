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
  { key: "gate", label: "Portaria", group: "Operação" },
  { key: "merchandise_entry", label: "Registrar entrada", group: "Operação" },
  { key: "merchandise_exit", label: "Registrar saída", group: "Operação" },
  { key: "credential_denials", label: "Negações de credenciamento", group: "Operação" },
  { key: "access_reports", label: "Relatório de acessos", group: "Operação" },
  { key: "users", label: "Usuários", group: "Administração" },
  { key: "company_users", label: "Usuários Empresas", group: "Administração" },
  { key: "profiles", label: "Perfis de acesso", group: "Administração" },
  { key: "companies", label: "Empresas", group: "Administração" },
  { key: "collaborators", label: "Colaboradores", group: "Administração" },
  { key: "document_approvals", label: "Aprovações de documento", group: "Administração" },
  { key: "sectors", label: "Setores", group: "Administração" },
  { key: "fleet", label: "Frota", group: "Administração" },
  { key: "service_access", label: "Acessos de serviço", group: "Administração" },
  { key: "events", label: "Eventos", group: "Administração" },
  { key: "merchandise_products", label: "Produtos", group: "Administração" },
  { key: "merchandise_locations", label: "Locais de armazenagem", group: "Administração" },
  { key: "merchandise_reports", label: "Relatórios de mercadorias", group: "Administração" },
  { key: "settings_tenants", label: "Tenants Azure", group: "Configurações" },
  { key: "settings_smtp", label: "Envios SMTP", group: "Configurações" },
  { key: "settings_session", label: "Sessão", group: "Configurações" },
  { key: "settings_appearance", label: "Aparência", group: "Configurações" },
  { key: "settings_teams", label: "Integração Teams", group: "Configurações" },
  { key: "settings_system_reports", label: "Relatórios do sistema", group: "Configurações" },
  { key: "settings_about", label: "Sobre", group: "Configurações" },
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
      ["events", ["view", "create", "edit"]],
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
      ["events", ["view", "create", "edit"]],
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
      ["events", ["view", "create", "edit"]],
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
      ["events", ["view", "create", "edit"]],
      ["service_access", ["view", "create", "edit"]],
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
