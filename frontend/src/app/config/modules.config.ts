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
  { key: 'document_approvals', label: 'Aprovações de documento', group: 'Geral' },
  { key: 'gate', label: 'Portaria', group: 'Acessos' },
  { key: 'service_access', label: 'Acessos de serviço', group: 'Acessos' },
  { key: 'events', label: 'Eventos', group: 'Acessos' },
  { key: 'event_accreditation', label: 'Credenciamento', group: 'Acessos' },
  { key: 'access_reports', label: 'Relatório de acessos', group: 'Acessos' },
  { key: 'credential_denials', label: 'Negações', group: 'Acessos' },
  { key: 'collaborator_blocklist', label: 'Gestão de bloqueio', group: 'Acessos' },
  { key: 'merchandise_entry', label: 'Registrar entrada', group: 'Mercadorias' },
  { key: 'merchandise_exit', label: 'Registrar saída', group: 'Mercadorias' },
  { key: 'merchandise_products', label: 'Produtos', group: 'Mercadorias' },
  { key: 'merchandise_locations', label: 'Locais de armazenagem', group: 'Mercadorias' },
  { key: 'merchandise_reports', label: 'Relatório de mercadorias', group: 'Mercadorias' },
  { key: 'companies', label: 'Empresas', group: 'Cadastros' },
  { key: 'collaborators', label: 'Colaboradores', group: 'Cadastros' },
  { key: 'fleet', label: 'Frota', group: 'Cadastros' },
  { key: 'sectors', label: 'Setores', group: 'Cadastros' },
  { key: 'profiles', label: 'Perfis de acesso', group: 'Sistema' },
  { key: 'users', label: 'Usuários internos', group: 'Sistema' },
  { key: 'company_users', label: 'Usuários de empresas', group: 'Sistema' },
  { key: 'settings_tenants', label: 'Tenants Azure', group: 'Configurações' },
  { key: 'settings_smtp', label: 'Envios de e-mail', group: 'Configurações' },
  { key: 'settings_facial', label: 'Integração facial', group: 'Configurações' },
  { key: 'settings_email_templates', label: 'Templates de e-mail', group: 'Configurações' },
  { key: 'settings_session', label: 'Sessão', group: 'Configurações' },
  { key: 'settings_appearance', label: 'Aparência', group: 'Configurações' },
  { key: 'settings_teams', label: 'Integração Teams', group: 'Configurações' },
  { key: 'settings_system_reports', label: 'Relatórios do sistema', group: 'Configurações' },
  { key: 'settings_about', label: 'Sobre', group: 'Configurações' },
  {
    key: 'settings_event_accreditation',
    label: 'Notificações de credenciamento',
    group: 'Configurações',
  },
];

export function permissionKey(module: string, action: PermissionAction): string {
  return `${module}:${action}`;
}
