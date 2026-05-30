export interface AdminMenuItem {
  label: string;
  icon: string;
  route: string;
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { label: 'Usuários', icon: '👥', route: '/admin/usuarios' },
  { label: 'Empresas', icon: '🏢', route: '/admin/empresas' },
  { label: 'Colaboradores', icon: '🪪', route: '/admin/colaboradores' },
  { label: 'Aprovações documento', icon: '📝', route: '/admin/aprovacoes-documento' },
  { label: 'Frota', icon: '🚗', route: '/admin/frota' },
  { label: 'Eventos', icon: '📅', route: '/admin/eventos' },
  { label: 'Produtos', icon: '📦', route: '/admin/configuracoes/mercadorias-produtos' },
  {
    label: 'Locais de armazenagem',
    icon: '🏪',
    route: '/admin/configuracoes/mercadorias-locais',
  },
  { label: 'Relatórios mercadorias', icon: '📊', route: '/admin/mercadorias/relatorios' },
  { label: 'Configurações', icon: '⚙️', route: '/admin/configuracoes' },
];

export interface SettingsNavItem {
  path: string;
  label: string;
  icon: string;
  subtitle?: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { path: 'tenants-azure', label: 'Tenants Azure', icon: '🔗', subtitle: 'Autenticação AD' },
  { path: 'smtp', label: 'Envios SMTP', icon: '📧', subtitle: 'E-mail e histórico' },
  { path: 'sessao', label: 'Sessão', icon: '🔒', subtitle: 'Inatividade e login' },
  { path: 'teams', label: 'Integração Teams', icon: '💬', subtitle: 'Microsoft Graph' },
  {
    path: 'relatorios-sistema',
    label: 'Relatórios do sistema',
    icon: '📋',
    subtitle: 'Auditoria e erros',
  },
  {
    path: 'mercadorias-produtos',
    label: 'Produtos',
    icon: '📦',
    subtitle: 'Cadastro de mercadorias',
  },
  {
    path: 'mercadorias-locais',
    label: 'Locais de armazenagem',
    icon: '🏪',
    subtitle: 'Depósitos e lojas',
  },
  { path: 'sobre', label: 'Sobre', icon: 'ℹ️', subtitle: 'Versão do sistema' },
];
