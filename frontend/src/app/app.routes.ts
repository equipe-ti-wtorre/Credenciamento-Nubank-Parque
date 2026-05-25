import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { MainLayoutComponent } from './layouts/main-layout.component';
import { SettingsLayoutComponent } from './layouts/settings-layout.component';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { TenantListComponent } from './pages/admin/tenants/tenant-list.component';
import { SmtpSettingsComponent } from './pages/admin/smtp/smtp-settings.component';
import { TeamsIntegrationComponent } from './pages/admin/teams/teams-integration.component';
import { AboutComponent } from './pages/admin/about/about.component';
import { SystemReportsComponent } from './pages/admin/system-reports/system-reports.component';
import { UserListComponent } from './pages/admin/users/user-list.component';
import { CompanyListComponent } from './pages/admin/companies/company-list.component';
import { CollaboratorListComponent } from './pages/admin/collaborators/collaborator-list.component';
import { EventListComponent } from './pages/admin/events/event-list.component';
import { EventDetailComponent } from './pages/admin/events/event-detail.component';
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
        data: { roles: ['ADMIN', 'USER'] },
      },
      {
        path: 'admin/usuarios',
        component: UserListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'] },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/empresas',
        component: CompanyListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'] },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/colaboradores',
        component: CollaboratorListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'] },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos',
        component: EventListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'] },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/eventos/:id',
        component: EventDetailComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN', 'PRODUTORA', 'PADRAO'] },
        runGuardsAndResolvers: 'always',
      },
      {
        path: 'admin/configuracoes',
        component: SettingsLayoutComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'] },
        children: [
          { path: '', redirectTo: 'tenants-azure', pathMatch: 'full' },
          {
            path: 'tenants-azure',
            component: TenantListComponent,
            runGuardsAndResolvers: 'always',
          },
          {
            path: 'smtp',
            component: SmtpSettingsComponent,
            runGuardsAndResolvers: 'always',
          },
          {
            path: 'teams',
            component: TeamsIntegrationComponent,
            runGuardsAndResolvers: 'always',
          },
          {
            path: 'relatorios-sistema',
            component: SystemReportsComponent,
            runGuardsAndResolvers: 'always',
          },
          {
            path: 'sobre',
            component: AboutComponent,
            runGuardsAndResolvers: 'always',
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
