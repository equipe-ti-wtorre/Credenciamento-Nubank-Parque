import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavigationStateService } from '../services/navigation-state.service';

export const requireNavStateGuard: CanActivateFn = (route) => {
  const nav = inject(NavigationStateService);
  const router = inject(Router);
  const navRoute = String(route.data?.['navRoute'] || '');
  const listRoute = String(route.data?.['listRoute'] || '/dashboard');
  if (!navRoute || !nav.obter(navRoute)?.public_id) {
    return router.parseUrl(listRoute);
  }
  return true;
};

export const handoffGuard: CanActivateFn = (route) => {
  const nav = inject(NavigationStateService);
  const router = inject(Router);
  const publicId = String(route.paramMap.get('publicId') || '').trim();
  const cleanRoute = String(route.data?.['cleanRoute'] || '');
  const listRoute = String(route.data?.['listRoute'] || '/dashboard');
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId);
  if (!uuid || !cleanRoute) {
    void router.navigateByUrl(listRoute, { replaceUrl: true });
    return false;
  }
  const action = route.queryParamMap.get('action') || undefined;
  const dados = action ? { public_id: publicId, action } : { public_id: publicId };
  void nav.navegar(cleanRoute, dados, { replaceUrl: true });
  return false;
};
