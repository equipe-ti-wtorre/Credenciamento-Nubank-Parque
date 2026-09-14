import { MenuIconLibrary } from './admin-menu.config';

export interface SidebarNavItemDef {
  label: string;
  route: string;
  iconKey?: string;
  iconLibrary?: MenuIconLibrary;
  iconName?: string;
  iconSrc?: string;
  exact?: boolean;
  showBadge?: boolean;
  badgeSource?: 'combined' | 'approvals' | 'document';
  module?: string;
  permissionAny?: string[];
  allowAdInternal?: boolean;
}

export interface SidebarNavGroupDef {
  id: string;
  title: string;
  items: SidebarNavItemDef[];
}

export const SETORES_NAV_ITEM: SidebarNavItemDef = {
  label: 'Setores',
  route: '/admin/setores',
  iconKey: 'users',
  module: 'sectors',
};

export const SIDEBAR_NAV_GROUPS: SidebarNavGroupDef[] = [
  {
    id: 'geral',
    title: 'Geral',
    items: [
      { label: 'Início', route: '/dashboard', iconKey: 'home', exact: true, module: 'dashboard' },
      {
        label: 'Aprovações',
        route: '/aprovacoes',
        iconKey: 'doc',
        showBadge: true,
        badgeSource: 'combined',
        permissionAny: ['approvals', 'document_approvals'],
      },
    ],
  },
  {
    id: 'acessos',
    title: 'Acessos',
    items: [
      { label: 'Portaria', route: '/portaria', iconKey: 'gate', exact: true, module: 'gate' },
      { label: 'Acessos de Serviço', route: '/admin/acessos-servico', iconKey: 'wrench', module: 'service_access' },
      { label: 'Eventos', route: '/admin/eventos', iconKey: 'calendar', permissionAny: ['events', 'approvals'] },
      {
        label: 'Credenciamento',
        route: '/admin/credenciamento-eventos',
        iconKey: 'badge',
        permissionAny: ['event_accreditation', 'approvals'],
        allowAdInternal: true,
      },
      {
        label: 'Relatório de acessos',
        route: '/operacao/relatorio-acessos',
        iconKey: 'chart',
        module: 'access_reports',
      },
      {
        label: 'Negações',
        route: '/operacao/negacoes-credenciamento',
        iconKey: 'chart',
        module: 'credential_denials',
      },
      {
        label: 'Gestão de bloqueio',
        route: '/admin/gestao-bloqueio',
        iconKey: 'badge',
        module: 'collaborator_blocklist',
      },
    ],
  },
  {
    id: 'mercadorias',
    title: 'Mercadorias',
    items: [
      { label: 'Registrar entrada', route: '/mercadorias/entrada', iconKey: 'in', module: 'merchandise_entry' },
      { label: 'Registrar saída', route: '/mercadorias/saida', iconKey: 'out', module: 'merchandise_exit' },
      { label: 'Produtos', route: '/admin/mercadorias-produtos', iconKey: 'box', module: 'merchandise_products' },
      {
        label: 'Locais de armazenagem',
        route: '/admin/mercadorias-locais',
        iconKey: 'warehouse',
        module: 'merchandise_locations',
      },
      {
        label: 'Relatório de mercadorias',
        route: '/admin/mercadorias/relatorios',
        iconKey: 'chart',
        module: 'merchandise_reports',
      },
    ],
  },
  {
    id: 'cadastros',
    title: 'Cadastros',
    items: [
      { label: 'Empresas', route: '/admin/empresas', iconKey: 'building', module: 'companies' },
      { label: 'Colaboradores', route: '/admin/colaboradores', iconKey: 'badge', module: 'collaborators' },
      {
        label: 'Frota',
        route: '/admin/frota',
        iconLibrary: 'image',
        iconSrc: 'assets/icons/frota.png',
        module: 'fleet',
      },
      SETORES_NAV_ITEM,
    ],
  },
  {
    id: 'sistema',
    title: 'Sistema',
    items: [
      { label: 'Perfis', route: '/admin/perfis', iconKey: 'badge', module: 'profiles' },
      { label: 'Usuários internos', route: '/admin/usuarios', iconKey: 'users', module: 'users' },
      {
        label: 'Usuários de empresas',
        route: '/admin/usuarios-empresas',
        iconKey: 'users',
        module: 'company_users',
      },
      { label: 'Configurações', route: '/admin/configuracoes', iconKey: 'settings', module: 'settings_tenants' },
    ],
  },
];
