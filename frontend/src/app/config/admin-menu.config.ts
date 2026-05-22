export interface AdminMenuItem {
  label: string;
  icon: string;
  route: string;
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
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
  { path: 'teams', label: 'Integração Teams', icon: '💬', subtitle: 'Microsoft Graph' },
  { path: 'sobre', label: 'Sobre', icon: 'ℹ️', subtitle: 'Versão do sistema' },
];
