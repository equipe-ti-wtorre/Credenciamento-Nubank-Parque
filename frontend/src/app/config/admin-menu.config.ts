export type MenuIconLibrary = 'svg' | 'material' | 'fontawesome' | 'image';

export interface SettingsNavItem {
  path: string;
  label: string;
  icon: string;
  subtitle?: string;
  /** Módulo de permissão (action view) — omitir = visível para quem acessa Configurações. */
  module?: string;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  icon: string;
  subtitle?: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: 'acesso',
    label: 'Acesso',
    icon: '🔗',
    subtitle: 'Azure, sessão e horários',
    items: [
      {
        path: 'tenants-azure',
        label: 'Tenants Azure',
        icon: '🔗',
        subtitle: 'Autenticação AD',
        module: 'settings_tenants',
      },
      {
        path: 'sessao',
        label: 'Sessão',
        icon: '🔒',
        subtitle: 'Inatividade e login',
        module: 'settings_session',
      },
      {
        path: 'horarios-acesso',
        label: 'Horários de acesso',
        icon: '🕒',
        subtitle: 'Comercial / Noturno',
        module: 'settings_access_schedule',
      },
    ],
  },
  {
    id: 'email',
    label: 'E-mail',
    icon: '📧',
    subtitle: 'SMTP e templates',
    items: [
      {
        path: 'smtp',
        label: 'Envios de e-mail',
        icon: '📧',
        subtitle: 'SMTP / Azure ACS',
        module: 'settings_smtp',
      },
      {
        path: 'templates-email',
        label: 'Templates de e-mail',
        icon: '✉️',
        subtitle: 'HTML e assuntos',
        module: 'settings_email_templates',
      },
    ],
  },
  {
    id: 'comunicacao',
    label: 'Comunicação',
    icon: '💬',
    subtitle: 'WhatsApp, Teams e avisos',
    items: [
      {
        path: 'whatsapp',
        label: 'WhatsApp',
        icon: '📱',
        subtitle: 'Gateway OpenWA',
        module: 'settings_whatsapp',
      },
      {
        path: 'teams',
        label: 'Integração Teams',
        icon: '💬',
        subtitle: 'Microsoft Graph',
        module: 'settings_teams',
      },
      {
        path: 'notificacoes-credenciamento',
        label: 'Notificações de credenciamento',
        icon: '🔔',
        subtitle: 'Aviso interno AD',
        module: 'settings_event_accreditation',
      },
    ],
  },
  {
    id: 'facial',
    label: 'Integração facial',
    icon: '🙂',
    subtitle: 'HTTP poll / Service Bus',
    items: [
      {
        path: 'facial',
        label: 'Integração facial',
        icon: '🙂',
        subtitle: 'HTTP poll / Service Bus',
        module: 'settings_facial',
      },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: '🎨',
    subtitle: 'Aparência e relatórios',
    items: [
      {
        path: 'aparencia',
        label: 'Aparência',
        icon: '🎨',
        subtitle: 'Paleta de cores',
        module: 'settings_appearance',
      },
      {
        path: 'relatorios-sistema',
        label: 'Relatórios do sistema',
        icon: '📋',
        subtitle: 'Auditoria e erros',
        module: 'settings_system_reports',
      },
    ],
  },
  {
    id: 'sobre',
    label: 'Sobre',
    icon: 'ℹ️',
    subtitle: 'Versão do sistema',
    items: [
      {
        path: 'sobre',
        label: 'Sobre',
        icon: 'ℹ️',
        subtitle: 'Versão do sistema',
        module: 'settings_about',
      },
    ],
  },
];
