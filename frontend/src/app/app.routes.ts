import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { MainLayoutComponent } from './layouts/main-layout.component';
import { SettingsLayoutComponent } from './layouts/settings-layout.component';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { TenantListComponent } from './pages/admin/tenants/tenant-list.component';
import { SmtpSettingsComponent } from './pages/admin/smtp/smtp-settings.component';
import { WhatsappSettingsComponent } from './pages/admin/whatsapp/whatsapp-settings.component';
import { FacialSettingsComponent } from './pages/admin/facial/facial-settings.component';
import { EmailTemplatesComponent } from './pages/admin/email-templates/email-templates.component';
import { SessionSettingsComponent } from './pages/admin/session/session-settings.component';
import { AppearanceSettingsComponent } from './pages/admin/appearance/appearance-settings.component';
import { TeamsIntegrationComponent } from './pages/admin/teams/teams-integration.component';
import { AboutComponent } from './pages/admin/about/about.component';
import { EventAccreditationNotifySettingsComponent } from './pages/admin/event-accreditation-notify/event-accreditation-notify-settings.component';
import { AccessScheduleSettingsComponent } from './pages/admin/access-schedule/access-schedule-settings.component';
import { SystemReportsComponent } from './pages/admin/system-reports/system-reports.component';
import { ProfileListComponent } from './pages/admin/profiles/profile-list.component';
import { UserListComponent } from './pages/admin/users/user-list.component';
import { CompanyUserListComponent } from './pages/admin/company-users/company-user-list.component';
import { CompanyListComponent } from './pages/admin/companies/company-list.component';
import { CollaboratorListComponent } from './pages/admin/collaborators/collaborator-list.component';
import { BlocklistListComponent } from './pages/admin/blocklist/blocklist-list.component';
import { EventListComponent } from './pages/admin/events/event-list.component';
import { EventCreateComponent } from './pages/admin/events/event-create.component';
import { EventDetailComponent } from './pages/admin/events/event-detail.component';
import { EventCollaboratorsComponent } from './pages/admin/events/event-collaborators.component';
import { EventAccreditationListComponent } from './pages/event-accreditation/event-accreditation-list.component';
import { EventAccreditationCreateComponent } from './pages/event-accreditation/event-accreditation-create.component';
import { EventAccreditationDetailComponent } from './pages/event-accreditation/event-accreditation-detail.component';
import { GateControlComponent } from './pages/gate/gate-control.component';
import { VehicleListComponent } from './pages/patrimonial/vehicle-list.component';
import { ServiceRequestListComponent } from './pages/patrimonial/service-request-list.component';
import { ServiceAccessCreateWizardComponent } from './pages/patrimonial/service-access-create-wizard.component';
import { ServiceAccessDetailComponent } from './pages/patrimonial/service-access-detail.component';
import { ProductListComponent } from './pages/admin/merchandise/product-list.component';
import { StorageLocationListComponent } from './pages/admin/merchandise/storage-location-list.component';
import { MerchandiseReportsComponent } from './pages/admin/merchandise/merchandise-reports.component';
import { MerchandiseMovementPageComponent } from './pages/merchandise/merchandise-movement-page.component';
import { ExternalCompanyListComponent } from './pages/admin/merchandise/external-company-list.component';
import { CredentialDenialsReportComponent } from './pages/operations/credential-denials-report.component';
import { AccessReportComponent } from './pages/operations/access-report.component';
import { AuditListComponent } from './pages/operations/audit-list.component';
import { SectorListComponent } from './pages/admin/sectors/sector-list.component';
import { SectorDetailComponent } from './pages/admin/sectors/sector-detail.component';
import { ApprovalsInboxComponent } from './pages/approvals/approvals-inbox.component';
import { AuthGuard } from './core/guards/auth.guard';
import { TeamsAwareAuthGuard } from './core/guards/teams-aware-auth.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { SectorGestorGuard } from './core/guards/sector-gestor.guard';
import { handoffGuard, requireNavStateGuard } from './core/guards/nav-state.guard';

export const routes: Routes = [
  {
    // Compat: rota Angular antiga → página estática (rápida, sem bootstrap).
    path: 'auth/teams',
    redirectTo: '/auth/teams.html',
    pathMatch: 'full',
  },
  {
    path: 'login/teams-popup',
    redirectTo: '/auth/teams.html',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [{ path: '', component: LoginComponent }],
  },
  {
    path: 'cadastro-acesso',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/auth/invite-register.component').then((m) => m.InviteRegisterComponent),
        data: { title: 'Cadastro de acesso' },
      },
    ],
  },
  {
    path: 'cadastro-empresa',
    loadComponent: () =>
      import('./pages/auth/company-self-register.component').then(
        (m) => m.CompanySelfRegisterComponent,
      ),
    data: { title: 'Cadastro da empresa' },
  },
  // Página focada (Teams / deep link) — SSO automático no Teams, sem tela de login
  {
    path: 'aprovacoes/detalhe',
    loadComponent: () =>
      import('./pages/approvals/teams-approval-page.component').then(
        (m) => m.TeamsApprovalPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, requireNavStateGuard],
    data: {
      permission: { module: 'approvals', action: 'view' },
      title: 'Aprovação',
      navRoute: '/aprovacoes/detalhe',
      listRoute: '/aprovacoes',
    },
  },
  {
    path: 'aprovacoes/abrir/:publicId',
    loadComponent: () =>
      import('./pages/approvals/teams-approval-page.component').then(
        (m) => m.TeamsApprovalPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, handoffGuard],
    data: {
      permission: { module: 'approvals', action: 'view' },
      title: 'Aprovação',
      cleanRoute: '/aprovacoes/detalhe',
      listRoute: '/aprovacoes',
    },
  },
  {
    path: 'acessos-servico/detalhe',
    loadComponent: () =>
      import('./pages/patrimonial/service-access-view-page.component').then(
        (m) => m.ServiceAccessViewPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, requireNavStateGuard],
    data: {
      permission: { module: 'service_access', action: 'view' },
      title: 'Acesso de serviço',
      navRoute: '/acessos-servico/detalhe',
      listRoute: '/admin/acessos-servico',
    },
  },
  {
    path: 'acessos-servico/abrir/:publicId',
    loadComponent: () =>
      import('./pages/patrimonial/service-access-view-page.component').then(
        (m) => m.ServiceAccessViewPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, handoffGuard],
    data: {
      permission: { module: 'service_access', action: 'view' },
      title: 'Acesso de serviço',
      cleanRoute: '/acessos-servico/detalhe',
      listRoute: '/admin/acessos-servico',
    },
  },
  {
    path: 'credenciamento-eventos/detalhe',
    loadComponent: () =>
      import('./pages/event-accreditation/event-accreditation-view-page.component').then(
        (m) => m.EventAccreditationViewPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, requireNavStateGuard],
    data: {
      permissionAny: [
        { module: 'event_accreditation', action: 'view' },
        { module: 'approvals', action: 'view' },
      ],
      allowAdInternal: true,
      title: 'Credenciamento',
      navRoute: '/credenciamento-eventos/detalhe',
      listRoute: '/admin/credenciamento-eventos',
    },
  },
  {
    path: 'credenciamento-eventos/abrir/:publicId',
    loadComponent: () =>
      import('./pages/event-accreditation/event-accreditation-view-page.component').then(
        (m) => m.EventAccreditationViewPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard, handoffGuard],
    data: {
      permissionAny: [
        { module: 'event_accreditation', action: 'view' },
        { module: 'approvals', action: 'view' },
      ],
      allowAdInternal: true,
      title: 'Credenciamento',
      cleanRoute: '/credenciamento-eventos/detalhe',
      listRoute: '/admin/credenciamento-eventos',
    },
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'dashboard', action: 'view' }, title: 'Início' },
      },
      {
        path: 'aprovacoes',
        component: ApprovalsInboxComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'approvals', action: 'view' }, title: 'Aprovações' },
      },
      {
        path: 'portaria',
        component: GateControlComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'gate', action: 'view' }, title: 'Portaria' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'mercadorias/entrada',
        component: MerchandiseMovementPageComponent,
        canActivate: [PermissionGuard],
        data: {
          permission: { module: 'merchandise_entry', action: 'view' },
          movementType: 'ENTRADA',
          title: 'Registrar entrada',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'mercadorias/saida',
        component: MerchandiseMovementPageComponent,
        canActivate: [PermissionGuard],
        data: {
          permission: { module: 'merchandise_exit', action: 'view' },
          movementType: 'SAIDA',
          title: 'Registrar saída',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'operacao/negacoes-credenciamento',
        component: CredentialDenialsReportComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'credential_denials', action: 'view' }, title: 'Recusas de acessos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'operacao/relatorio-acessos',
        component: AccessReportComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'access_reports', action: 'view' }, title: 'Relatório de acessos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'operacao/auditoria',
        component: AuditListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'audit', action: 'view' }, title: 'Auditoria' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/perfis',
        component: ProfileListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'profiles', action: 'view' }, title: 'Perfis de acesso' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/usuarios',
        component: UserListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'users', action: 'view' }, title: 'Usuários internos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/usuarios-empresas',
        component: CompanyUserListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'company_users', action: 'view' }, title: 'Usuários de empresas' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/empresas',
        component: CompanyListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'companies', action: 'view' }, title: 'Empresas' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/colaboradores',
        component: CollaboratorListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'collaborators', action: 'view' }, title: 'Colaboradores' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/gestao-bloqueio',
        component: BlocklistListComponent,
        canActivate: [PermissionGuard],
        data: {
          permission: { module: 'collaborator_blocklist', action: 'view' },
          title: 'Gestão de bloqueio',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/frota',
        component: VehicleListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'fleet', action: 'view' }, title: 'Frota' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/acessos-servico',
        component: ServiceRequestListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'service_access', action: 'view' }, title: 'Acessos de Serviço' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/acessos-servico/novo',
        component: ServiceAccessCreateWizardComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'service_access', action: 'create' }, title: 'Novo acesso de serviço' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/acessos-servico/detalhe',
        component: ServiceAccessDetailComponent,
        canActivate: [PermissionGuard, requireNavStateGuard],
        data: {
          permission: { module: 'service_access', action: 'view' },
          title: 'Detalhe do acesso de serviço',
          navRoute: '/admin/acessos-servico/detalhe',
          listRoute: '/admin/acessos-servico',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/solicitacoes-servico',
        redirectTo: 'admin/acessos-servico',
        pathMatch: 'full',
      },
      {
        path: 'admin/credenciamento-eventos',
        component: EventAccreditationListComponent,
        canActivate: [PermissionGuard],
        data: {
          permissionAny: [
            { module: 'event_accreditation', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          allowAdInternal: true,
          title: 'Credenciamento',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/credenciamento-eventos/novo',
        component: EventAccreditationCreateComponent,
        canActivate: [PermissionGuard],
        data: {
          permission: { module: 'event_accreditation', action: 'create' },
          denyRequiresCompany: true,
          title: 'Novo credenciamento',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/credenciamento-eventos/detalhe',
        component: EventAccreditationDetailComponent,
        canActivate: [PermissionGuard, requireNavStateGuard],
        data: {
          permissionAny: [
            { module: 'event_accreditation', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          allowAdInternal: true,
          title: 'Detalhe do credenciamento',
          navRoute: '/admin/credenciamento-eventos/detalhe',
          listRoute: '/admin/credenciamento-eventos',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/credenciamento-eventos/abrir/:publicId',
        component: EventAccreditationDetailComponent,
        canActivate: [PermissionGuard, handoffGuard],
        data: {
          permissionAny: [
            { module: 'event_accreditation', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          allowAdInternal: true,
          title: 'Detalhe do credenciamento',
          cleanRoute: '/admin/credenciamento-eventos/detalhe',
          listRoute: '/admin/credenciamento-eventos',
        },
      },
      {
        path: 'admin/eventos',
        component: EventListComponent,
        canActivate: [PermissionGuard],
        data: {
          permissionAny: [
            { module: 'events', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          title: 'Eventos',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/novo',
        component: EventCreateComponent,
        canActivate: [PermissionGuard],
        data: {
          permission: { module: 'events', action: 'create' },
          title: 'Novo evento',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/detalhe',
        component: EventDetailComponent,
        canActivate: [PermissionGuard, requireNavStateGuard],
        data: {
          permissionAny: [
            { module: 'events', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          title: 'Detalhe do evento',
          navRoute: '/admin/eventos/detalhe',
          listRoute: '/admin/eventos',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/colaboradores',
        component: EventCollaboratorsComponent,
        canActivate: [PermissionGuard, requireNavStateGuard],
        data: {
          permissionAny: [
            { module: 'events', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          title: 'Colaboradores do evento',
          navRoute: '/admin/eventos/colaboradores',
          listRoute: '/admin/eventos',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/abrir/:publicId',
        component: EventDetailComponent,
        canActivate: [PermissionGuard, handoffGuard],
        data: {
          permissionAny: [
            { module: 'events', action: 'view' },
            { module: 'approvals', action: 'view' },
          ],
          title: 'Detalhe do evento',
          cleanRoute: '/admin/eventos/detalhe',
          listRoute: '/admin/eventos',
        },
      },
      {
        path: 'admin/mercadorias/relatorios',
        component: MerchandiseReportsComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'merchandise_reports', action: 'view' }, title: 'Relatório de mercadorias' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/mercadorias-produtos',
        component: ProductListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'merchandise_products', action: 'view' }, title: 'Produtos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/mercadorias-locais',
        component: StorageLocationListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'merchandise_locations', action: 'view' }, title: 'Locais de armazenagem' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/mercadorias-eventuais',
        component: ExternalCompanyListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'merchandise_external_companies', action: 'view' }, title: 'Empresas eventuais' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/setores',
        component: SectorListComponent,
        canActivate: [PermissionGuard, SectorGestorGuard],
        data: { permission: { module: 'sectors', action: 'view' }, title: 'Times' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/setores/detalhe',
        component: SectorDetailComponent,
        canActivate: [PermissionGuard, SectorGestorGuard, requireNavStateGuard],
        data: {
          permission: { module: 'sectors', action: 'view' },
          title: 'Detalhe do setor',
          navRoute: '/admin/setores/detalhe',
          listRoute: '/admin/setores',
        },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/configuracoes',
        component: SettingsLayoutComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'settings_tenants', action: 'view' }, title: 'Configurações' },
        children: [
          { path: '', redirectTo: 'tenants-azure', pathMatch: 'full' },
          {
            path: 'tenants-azure',
            component: TenantListComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_tenants', action: 'view' }, title: 'Tenants Azure' },
          },
          {
            path: 'smtp',
            component: SmtpSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_smtp', action: 'view' }, title: 'Envios SMTP' },
          },
          {
            path: 'whatsapp',
            component: WhatsappSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_whatsapp', action: 'view' }, title: 'WhatsApp (OpenWA)' },
          },
          {
            path: 'facial',
            component: FacialSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: {
              permission: { module: 'settings_facial', action: 'view' },
              title: 'Integração facial',
            },
          },
          {
            path: 'templates-email',
            component: EmailTemplatesComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: {
              permission: { module: 'settings_email_templates', action: 'view' },
              title: 'Templates de e-mail',
            },
          },
          {
            path: 'sessao',
            component: SessionSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_session', action: 'view' }, title: 'Sessão' },
          },
          {
            path: 'aparencia',
            component: AppearanceSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: {
              permission: { module: 'settings_appearance', action: 'view' },
              title: 'Aparência',
            },
          },
          {
            path: 'teams',
            component: TeamsIntegrationComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_teams', action: 'view' }, title: 'Integração Teams' },
          },
          {
            path: 'relatorios-sistema',
            component: SystemReportsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_system_reports', action: 'view' }, title: 'Relatórios do sistema' },
          },
          {
            path: 'sobre',
            component: AboutComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_about', action: 'view' }, title: 'Sobre' },
          },
          {
            path: 'notificacoes-credenciamento',
            component: EventAccreditationNotifySettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: {
              permission: { module: 'settings_event_accreditation', action: 'view' },
              title: 'Notificações de credenciamento',
            },
          },
          {
            path: 'horarios-acesso',
            component: AccessScheduleSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: {
              permission: { module: 'settings_access_schedule', action: 'view' },
              title: 'Horários de acesso',
            },
          },
        ],
      },
      {
        path: 'admin/tenants',
        redirectTo: 'admin/configuracoes/tenants-azure',
        pathMatch: 'full',
      },
      {
        path: 'admin/configuracoes/usuarios',
        redirectTo: 'admin/usuarios',
        pathMatch: 'full',
      },
      {
        path: 'admin/configuracoes/mercadorias-produtos',
        redirectTo: 'admin/mercadorias-produtos',
        pathMatch: 'full',
      },
      {
        path: 'admin/configuracoes/mercadorias-locais',
        redirectTo: 'admin/mercadorias-locais',
        pathMatch: 'full',
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
