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
import { UserListComponent } from './pages/admin/users/user-list.component';
import { CompanyListComponent } from './pages/admin/companies/company-list.component';
import { CollaboratorListComponent } from './pages/admin/collaborators/collaborator-list.component';
import { EventListComponent } from './pages/admin/events/event-list.component';
import { EventDetailComponent } from './pages/admin/events/event-detail.component';
import { GateControlComponent } from './pages/gate/gate-control.component';
import { VehicleListComponent } from './pages/patrimonial/vehicle-list.component';
import { ServiceRequestListComponent } from './pages/patrimonial/service-request-list.component';
import { DocumentApprovalsComponent } from './pages/admin/document-approvals/document-approvals.component';
import { ProductListComponent } from './pages/admin/merchandise/product-list.component';
import { StorageLocationListComponent } from './pages/admin/merchandise/storage-location-list.component';
import { MerchandiseReportsComponent } from './pages/admin/merchandise/merchandise-reports.component';
import { MerchandiseMovementPageComponent } from './pages/merchandise/merchandise-movement-page.component';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [{ path: '', component: LoginComponent }],
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
        data: { roles: ['ADMIN', 'USER', 'CONTROLADOR'], title: 'Início' },
      },
      {
        path: 'portaria',
        component: GateControlComponent,
        canActivate: [AuthGuard],
        data: { roles: ['CONTROLADOR', 'ADMIN'], title: 'Portaria' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'mercadorias/entrada',
        component: MerchandiseMovementPageComponent,
        canActivate: [AuthGuard],
        data: { roles: ['CONTROLADOR', 'ADMIN'], movementType: 'ENTRADA', title: 'Registrar entrada' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'mercadorias/saida',
        component: MerchandiseMovementPageComponent,
        canActivate: [AuthGuard],
        data: { roles: ['CONTROLADOR', 'ADMIN'], movementType: 'SAIDA', title: 'Registrar saída' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/usuarios',
        component: UserListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Usuários' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/empresas',
        component: CompanyListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Empresas' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/colaboradores',
        component: CollaboratorListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Colaboradores' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/aprovacoes-documento',
        component: DocumentApprovalsComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Aprovações de documento' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/frota',
        component: VehicleListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'], title: 'Frota' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/solicitacoes-servico',
        component: ServiceRequestListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'], title: 'Solicitações de serviço' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos',
        component: EventListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'], title: 'Eventos' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/:id',
        component: EventDetailComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'], title: 'Detalhe do evento' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/mercadorias/relatorios',
        component: MerchandiseReportsComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Relatórios de mercadorias' },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/configuracoes',
        component: SettingsLayoutComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'], title: 'Configurações' },
        children: [
          { path: '', redirectTo: 'tenants-azure', pathMatch: 'full' },
          {
            path: 'tenants-azure',
            component: TenantListComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Tenants Azure' },
          },
          {
            path: 'smtp',
            component: SmtpSettingsComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Envios SMTP' },
          },
          {
            path: 'sessao',
            component: SessionSettingsComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Sessão' },
          },
          {
            path: 'teams',
            component: TeamsIntegrationComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Integração Teams' },
          },
          {
            path: 'relatorios-sistema',
            component: SystemReportsComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Relatórios do sistema' },
          },
          {
            path: 'mercadorias-produtos',
            component: ProductListComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Produtos' },
          },
          {
            path: 'mercadorias-locais',
            component: StorageLocationListComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Locais de armazenagem' },
          },
          {
            path: 'sobre',
            component: AboutComponent,
            runGuardsAndResolvers: 'always',
            data: { title: 'Sobre' },
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
    ],
  },
  { path: '**', redirectTo: 'login' },
];
