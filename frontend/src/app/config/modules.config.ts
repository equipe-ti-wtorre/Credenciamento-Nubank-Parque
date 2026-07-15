export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Visualizar',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
};

export interface ModuleDefinition {
  key: string;
  label: string;
  group: string;
}

export const MODULES: ModuleDefinition[] = [
  { key: 'dashboard', label: 'Início', group: 'Geral' },
  { key: 'approvals', label: 'Aprovações', group: 'Geral' },
  { key: 'gate', label: 'Portaria', group: 'Operação' },
  { key: 'merchandise_entry', label: 'Registrar entrada', group: 'Operação' },
  { key: 'merchandise_exit', label: 'Registrar saída', group: 'Operação' },
  { key: 'credential_denials', label: 'Negações de credenciamento', group: 'Operação' },
  { key: 'users', label: 'Usuários', group: 'Administração' },
  { key: 'profiles', label: 'Perfis de acesso', group: 'Administração' },
  { key: 'companies', label: 'Empresas', group: 'Administração' },
  { key: 'collaborators', label: 'Colaboradores', group: 'Administração' },
  { key: 'document_approvals', label: 'Aprovações de documento', group: 'Administração' },
  { key: 'sectors', label: 'Setores', group: 'Administração' },
  { key: 'fleet', label: 'Frota', group: 'Administração' },
  { key: 'service_access', label: 'Acessos de serviço', group: 'Administração' },
  { key: 'events', label: 'Eventos', group: 'Administração' },
  { key: 'merchandise_products', label: 'Produtos', group: 'Administração' },
  { key: 'merchandise_locations', label: 'Locais de armazenagem', group: 'Administração' },
  { key: 'merchandise_reports', label: 'Relatórios de mercadorias', group: 'Administração' },
  { key: 'settings_tenants', label: 'Tenants Azure', group: 'Configurações' },
  { key: 'settings_smtp', label: 'Envios SMTP', group: 'Configurações' },
  { key: 'settings_session', label: 'Sessão', group: 'Configurações' },
  { key: 'settings_teams', label: 'Integração Teams', group: 'Configurações' },
  { key: 'settings_system_reports', label: 'Relatórios do sistema', group: 'Configurações' },
  { key: 'settings_about', label: 'Sobre', group: 'Configurações' },
];

export function permissionKey(module: string, action: PermissionAction): string {
  return `${module}:${action}`;
}
