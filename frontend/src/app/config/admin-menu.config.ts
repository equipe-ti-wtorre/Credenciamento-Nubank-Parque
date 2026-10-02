export type MenuIconLibrary = 'svg' | 'material' | 'fontawesome' | 'image';

export interface SettingsNavItem {
  path: string;
  label: string;
  icon: string;
  subtitle?: string;
  /** Módulo de permissão (action view) — omitir = visível para quem acessa Configurações. */
  module?: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    path: 'tenants-azure',
    label: 'Tenants Azure',
    icon: '🔗',
    subtitle: 'Autenticação AD',
    module: 'settings_tenants',
  },
  {
    path: 'smtp',
    label: 'Envios de e-mail',
    icon: '📧',
    subtitle: 'SMTP / Azure ACS',
    module: 'settings_smtp',
  },
  {
    path: 'facial',
    label: 'Integração facial',
    icon: '🙂',
    subtitle: 'HTTP poll / Service Bus',
    module: 'settings_facial',
  },
  {
    path: 'templates-email',
    label: 'Templates de e-mail',
    icon: '✉️',
    subtitle: 'HTML e assuntos',
    module: 'settings_email_templates',
  },
  {
    path: 'sessao',
    label: 'Sessão',
    icon: '🔒',
    subtitle: 'Inatividade e login',
    module: 'settings_session',
  },
  {
    path: 'aparencia',
    label: 'Aparência',
    icon: '🎨',
    subtitle: 'Paleta de cores',
    module: 'settings_appearance',
  },
  {
    path: 'teams',
    label: 'Integração Teams',
    icon: '💬',
    subtitle: 'Microsoft Graph',
    module: 'settings_teams',
  },
  {
    path: 'relatorios-sistema',
    label: 'Relatórios do sistema',
    icon: '📋',
    subtitle: 'Auditoria e erros',
    module: 'settings_system_reports',
  },
  {
    path: 'sobre',
    label: 'Sobre',
    icon: 'ℹ️',
    subtitle: 'Versão do sistema',
    module: 'settings_about',
  },
  {
    path: 'notificacoes-credenciamento',
    label: 'Notificações de credenciamento',
    icon: '🔔',
    subtitle: 'Aviso interno AD',
    module: 'settings_event_accreditation',
  },
  {
    path: 'horarios-acesso',
    label: 'Horários de acesso',
    icon: '🕒',
    subtitle: 'Comercial / Noturno',
    module: 'settings_access_schedule',
  },
];
