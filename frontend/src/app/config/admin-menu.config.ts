export type MenuIconLibrary = 'svg' | 'material' | 'fontawesome' | 'image';

export interface AdminMenuItem {
  label: string;
  icon: string;
  /** Chave do registro de icones SVG (ver MainLayoutComponent). */
  iconKey?: string;
  iconLibrary?: MenuIconLibrary;
  iconName?: string;
  iconSrc?: string;
  route: string;
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { label: 'Perfis', icon: '🛡️', iconKey: 'badge', route: '/admin/perfis' },
  { label: 'Usuários', icon: '👥', iconKey: 'users', route: '/admin/usuarios' },
  { label: 'Empresas', icon: '🏢', iconKey: 'building', route: '/admin/empresas' },
  { label: 'Colaboradores', icon: '🪪', iconKey: 'badge', route: '/admin/colaboradores' },
  {
    label: 'Aprovações documento',
    icon: '📝',
    iconKey: 'doc',
    route: '/admin/aprovacoes-documento',
  },
  { label: 'Setores', icon: '🏛️', iconKey: 'users', route: '/admin/setores' },
  {
    label: 'Frota',
    icon: '🚐',
    iconLibrary: 'image',
    iconSrc: 'assets/icons/frota.png',
    route: '/admin/frota',
  },
  {
    label: 'Produtos',
    icon: '📦',
    iconKey: 'box',
    route: '/admin/mercadorias-produtos',
  },
  {
    label: 'Locais de armazenagem',
    icon: '🏪',
    iconKey: 'warehouse',
    route: '/admin/mercadorias-locais',
  },
  {
    label: 'Relatórios mercadorias',
    icon: '📊',
    iconKey: 'chart',
    route: '/admin/mercadorias/relatorios',
  },
  { label: 'Configurações', icon: '⚙️', iconKey: 'settings', route: '/admin/configuracoes' },
];

export const ADMIN_MENU_MODULE_MAP: Record<string, string> = {
  '/admin/perfis': 'profiles',
  '/admin/usuarios': 'users',
  '/admin/empresas': 'companies',
  '/admin/colaboradores': 'collaborators',
  '/admin/aprovacoes-documento': 'document_approvals',
  '/admin/setores': 'sectors',
  '/admin/frota': 'fleet',
  '/admin/mercadorias-produtos': 'merchandise_products',
  '/admin/mercadorias-locais': 'merchandise_locations',
  '/admin/mercadorias/relatorios': 'merchandise_reports',
  '/admin/configuracoes': 'settings_tenants',
};

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
  { path: 'sobre', label: 'Sobre', icon: 'ℹ️', subtitle: 'Versão do sistema' },
];
