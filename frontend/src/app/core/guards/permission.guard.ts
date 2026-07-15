import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SessionIdleService } from '../services/session-idle.service';
import { AuthService, AuthUser, hasPermission, isSuperAdmin } from '../services/auth.service';
import { PermissionAction } from '../../config/modules.config';

export const PermissionGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const storage = inject(StorageService);
  const sessionIdle = inject(SessionIdleService);
  const authService = inject(AuthService);

  const token = await storage.get('token');
  if (!token) {
    if (typeof sessionStorage !== 'undefined' && state?.url) {
      sessionStorage.setItem('auth.returnUrl', state.url);
    }
    router.navigate(['/login']);
    return false;
  }

  if (!sessionIdle.isIdleDisabled() && (sessionIdle.isIdleExpired() || sessionIdle.hasExceededIdleLimit())) {
    if (!authService.isLoggingOut()) {
      void authService.logout({ reason: 'idle' });
    }
    return false;
  }

  const permission = route.data?.['permission'] as
    | { module: string; action?: PermissionAction }
    | undefined;

  if (!permission?.module) {
    return true;
  }

  const currentUserStr = await storage.get('currentUser');
  if (!currentUserStr) {
    router.navigate(['/login']);
    return false;
  }

  const currentUser = JSON.parse(currentUserStr) as AuthUser;
  const action = permission.action || 'view';

  if (!hasPermission(currentUser, permission.module, action)) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

export function canAccessRoute(user: AuthUser | null | undefined, module: string, action: PermissionAction = 'view'): boolean {
  return hasPermission(user, module, action);
}

export function canAccessAny(user: AuthUser | null | undefined, entries: Array<{ module: string; action?: PermissionAction }>): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return entries.some((entry) => hasPermission(user, entry.module, entry.action || 'view'));
}
