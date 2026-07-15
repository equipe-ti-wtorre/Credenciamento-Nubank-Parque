import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { AuthUser, isSectorGestor, isSuperAdmin } from '../services/auth.service';

export const SectorGestorGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const storage = inject(StorageService);

  const currentUserStr = await storage.get('currentUser');
  if (!currentUserStr) {
    router.navigate(['/login']);
    return false;
  }

  const currentUser = JSON.parse(currentUserStr) as AuthUser;
  if (isSuperAdmin(currentUser) || isSectorGestor(currentUser)) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
