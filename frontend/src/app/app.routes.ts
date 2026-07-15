import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { MainLayoutComponent } from './layouts/main-layout.component';
import { SettingsLayoutComponent } from './layouts/settings-layout.component';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { TenantListComponent } from './pages/admin/tenants/tenant-list.component';
import { SmtpSettingsComponent } from './pages/admin/smtp/smtp-settings.component';
import { SessionSettingsComponent } from './pages/admin/session/session-settings.component';
import { TeamsIntegrationComponent } from './pages/admin/teams/teams-integration.component';
import { AboutComponent } from './pages/admin/about/about.component';
import { SystemReportsComponent } from './pages/admin/system-reports/system-reports.component';
import { ProfileListComponent } from './pages/admin/profiles/profile-list.component';
import { UserListComponent } from './pages/admin/users/user-list.component';
import { CompanyListComponent } from './pages/admin/companies/company-list.component';
import { CollaboratorListComponent } from './pages/admin/collaborators/collaborator-list.component';
import { EventListComponent } from './pages/admin/events/event-list.component';
import { EventDetailComponent } from './pages/admin/events/event-detail.component';
import { GateControlComponent } from './pages/gate/gate-control.component';
import { VehicleListComponent } from './pages/patrimonial/vehicle-list.component';
import { ServiceRequestListComponent } from './pages/patrimonial/service-request-list.component';
import { ServiceAccessDetailComponent } from './pages/patrimonial/service-access-detail.component';
import { DocumentApprovalsComponent } from './pages/admin/document-approvals/document-approvals.component';
import { ProductListComponent } from './pages/admin/merchandise/product-list.component';
import { StorageLocationListComponent } from './pages/admin/merchandise/storage-location-list.component';
import { MerchandiseReportsComponent } from './pages/admin/merchandise/merchandise-reports.component';
import { MerchandiseMovementPageComponent } from './pages/merchandise/merchandise-movement-page.component';
import { CredentialDenialsReportComponent } from './pages/operations/credential-denials-report.component';
import { SectorListComponent } from './pages/admin/sectors/sector-list.component';
import { SectorDetailComponent } from './pages/admin/sectors/sector-detail.component';
import { ApprovalsInboxComponent } from './pages/approvals/approvals-inbox.component';
import { AuthGuard } from './core/guards/auth.guard';
import { TeamsAwareAuthGuard } from './core/guards/teams-aware-auth.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { SectorGestorGuard } from './core/guards/sector-gestor.guard';

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
  // Página focada (Teams / deep link) — SSO automático no Teams, sem tela de login
  {
    path: 'aprovacoes/:id',
    loadComponent: () =>
      import('./pages/approvals/teams-approval-page.component').then(
        (m) => m.TeamsApprovalPageComponent,
      ),
    canActivate: [TeamsAwareAuthGuard, PermissionGuard],
    data: { permission: { module: 'approvals', action: 'view' }, title: 'Aprovação' },
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
        data: { permission: { module: 'credential_denials', action: 'view' }, title: 'Negações de credenciamento' },
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
        data: { permission: { module: 'users', action: 'view' }, title: 'Usuários' },
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
        path: 'admin/aprovacoes-documento',
        component: DocumentApprovalsComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'document_approvals', action: 'view' }, title: 'Aprovações de documento' },
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
        path: 'admin/acessos-servico/:id',
        component: ServiceAccessDetailComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'service_access', action: 'view' }, title: 'Detalhe do acesso de serviço' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/solicitacoes-servico',
        redirectTo: 'admin/acessos-servico',
        pathMatch: 'full',
      },
      {
        path: 'admin/eventos',
        component: EventListComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'events', action: 'view' }, title: 'Eventos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/:id',
        component: EventDetailComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'events', action: 'view' }, title: 'Detalhe do evento' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/mercadorias/relatorios',
        component: MerchandiseReportsComponent,
        canActivate: [PermissionGuard],
        data: { permission: { module: 'merchandise_reports', action: 'view' }, title: 'Relatórios de mercadorias' },
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
        path: 'admin/setores',
        component: SectorListComponent,
        canActivate: [PermissionGuard, SectorGestorGuard],
        data: { permission: { module: 'sectors', action: 'view' }, title: 'Setores' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/setores/:id',
        component: SectorDetailComponent,
        canActivate: [PermissionGuard, SectorGestorGuard],
        data: { permission: { module: 'sectors', action: 'view' }, title: 'Detalhe do setor' },
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
            path: 'sessao',
            component: SessionSettingsComponent,
            canActivate: [PermissionGuard],
            runGuardsAndResolvers: 'always',
            data: { permission: { module: 'settings_session', action: 'view' }, title: 'Sessão' },
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
