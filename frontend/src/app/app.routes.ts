import { Routes } from '@angular/router';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { MainLayoutComponent } from './layouts/main-layout.component';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { TenantListComponent } from './pages/admin/tenants/tenant-list.component';
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
        path: 'admin/tenants',
        component: TenantListComponent,
        canActivate: [AuthGuard],
        data: { roles: ['ADMIN'] },
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
