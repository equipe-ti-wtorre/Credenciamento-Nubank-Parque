export interface AdminMenuItem {
  label: string;
  icon: string;
  /** Chave do registro de icones SVG (ver MainLayoutComponent). */
  iconKey: string;
  route: string;
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { label: 'Usuários', icon: '👥', iconKey: 'users', route: '/admin/usuarios' },
  { label: 'Empresas', icon: '🏢', iconKey: 'building', route: '/admin/empresas' },
  { label: 'Colaboradores', icon: '🪪', iconKey: 'badge', route: '/admin/colaboradores' },
  {
    label: 'Aprovações documento',
    icon: '📝',
    iconKey: 'doc',
    route: '/admin/aprovacoes-documento',
  },
  { label: 'Frota', icon: '🚗', iconKey: 'truck', route: '/admin/frota' },
  { label: 'Eventos', icon: '📅', iconKey: 'calendar', route: '/admin/eventos' },
  {
    label: 'Produtos',
    icon: '📦',
    iconKey: 'box',
    route: '/admin/configuracoes/mercadorias-produtos',
  },
  {
    label: 'Locais de armazenagem',
    icon: '🏪',
    iconKey: 'warehouse',
    route: '/admin/configuracoes/mercadorias-locais',
  },
  {
    label: 'Relatórios mercadorias',
    icon: '📊',
    iconKey: 'chart',
    route: '/admin/mercadorias/relatorios',
  },
  { label: 'Configurações', icon: '⚙️', iconKey: 'settings', route: '/admin/configuracoes' },
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
