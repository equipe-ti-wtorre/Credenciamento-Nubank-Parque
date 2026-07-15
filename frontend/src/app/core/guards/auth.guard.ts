import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SessionIdleService } from '../services/session-idle.service';
import { AuthService } from '../services/auth.service';

const RETURN_URL_KEY = 'auth.returnUrl';

export function rememberReturnUrl(url: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!url || url.startsWith('/login') || url.startsWith('/auth/')) return;
  sessionStorage.setItem(RETURN_URL_KEY, url);
}

export function consumeReturnUrl(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const url = sessionStorage.getItem(RETURN_URL_KEY);
  if (url) sessionStorage.removeItem(RETURN_URL_KEY);
  return url;
}

export const AuthGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const storage = inject(StorageService);
  const sessionIdle = inject(SessionIdleService);
  const authService = inject(AuthService);

  const token = await storage.get('token');
  if (!token) {
    rememberReturnUrl(state.url);
    router.navigate(['/login']);
    return false;
  }

  if (!sessionIdle.isIdleDisabled() && (sessionIdle.isIdleExpired() || sessionIdle.hasExceededIdleLimit())) {
    if (!authService.isLoggingOut()) {
      void authService.logout({ reason: 'idle' });
    }
    return false;
  }

  const requiredRoles = route.data?.['roles'] as string[] | undefined;
  if (requiredRoles?.length) {
    const currentUserStr = await storage.get('currentUser');
    if (!currentUserStr) {
      rememberReturnUrl(state.url);
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
