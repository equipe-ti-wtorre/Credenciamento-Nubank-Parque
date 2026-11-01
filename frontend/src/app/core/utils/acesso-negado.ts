import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';

export function redirecionarSeAcessoNegado(
  err: { status?: number } | null | undefined,
  router: Router,
  notification: NotificationService,
  listRoute: string,
): boolean {
  const status = Number(err?.status || 0);
  if (status !== 403 && status !== 404) return false;
  notification.error(
    status === 403
      ? 'Você não tem permissão para ver este registro.'
      : 'Registro não encontrado.',
  );
  void router.navigateByUrl(listRoute);
  return true;
}
