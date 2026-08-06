import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SessionIdleService } from '../services/session-idle.service';
import { AuthService } from '../services/auth.service';
import { MsalConfigService } from '../../services/msal-config.service';

const RETURN_URL_KEY = 'auth.returnUrl';

export function rememberReturnUrl(url: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!url || url.startsWith('/login') || url.startsWith('/auth/')) return;
  // Nunca gravar URL com code/state OAuth — quebraria o próximo login Microsoft.
  if (/(?:^|[?#&])(code|id_token|error|state)=/i.test(url)) return;
  sessionStorage.setItem(RETURN_URL_KEY, url);
}

export function consumeReturnUrl(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const url = sessionStorage.getItem(RETURN_URL_KEY);
  if (url) sessionStorage.removeItem(RETURN_URL_KEY);
  return url;
}

function hasAzureRedirectInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const target = `${window.location.search}${window.location.hash}`;
  return /(?:^|[?#&])(code|id_token|error)=/i.test(target);
}

export const AuthGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const storage = inject(StorageService);
  const sessionIdle = inject(SessionIdleService);
  const authService = inject(AuthService);
  const msalConfigService = inject(MsalConfigService);

  let token = await storage.get('token');
  if (!token && hasAzureRedirectInUrl()) {
    await msalConfigService.load().catch(() => undefined);
    await authService.handleRedirect();
    token = await storage.get('token');
  }

  if (!token) {
    // Preserva returnUrl limpo (sem OAuth); evita apagar code antes do MSAL se ainda houver.
    if (!hasAzureRedirectInUrl()) {
      rememberReturnUrl(state.url);
    }
    void router.navigate(['/login'], { replaceUrl: true });
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
