import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SessionIdleService } from '../services/session-idle.service';
import { AuthService } from '../services/auth.service';

export const AuthGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const storage = inject(StorageService);
  const sessionIdle = inject(SessionIdleService);
  const authService = inject(AuthService);

  const token = await storage.get('token');
  if (!token) {
    router.navigate(['/login']);
    return false;
  }

  if (sessionIdle.isIdleExpired() || sessionIdle.hasExceededIdleLimit()) {
    if (!authService.isLoggingOut()) {
      void authService.logout({ reason: 'idle' });
    }
    return false;
  }

  const requiredRoles = route.data?.['roles'] as string[] | undefined;
  if (requiredRoles?.length) {
    const currentUserStr = await storage.get('currentUser');
    if (!currentUserStr) {
      router.navigate(['/login']);
      return false;
    }
    const currentUser = JSON.parse(currentUserStr);
    const userRole = String(currentUser.role || currentUser.perfil || '').toUpperCase();
    if (!requiredRoles.map((r) => r.toUpperCase()).includes(userRole)) {
      router.navigate(['/dashboard']);
      return false;
    }
  }
  return true;
};
