import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { SessionIdleService } from '../services/session-idle.service';
import { AuthService } from '../services/auth.service';
import { TeamsContextService } from '../../services/teams-context.service';
import { rememberReturnUrl } from './auth.guard';

/**
 * Auth para deep links Teams (/aprovacoes/:id):
 * 1) Sessão existente
 * 2) getAuthToken silent → JWT
 * 3) Popup /auth/teams.html (NÃO chamar getAuthToken interativo antes — gera CancelledByUser)
 * 4) Falha → /login
 */
export const TeamsAwareAuthGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const storage = inject(StorageService);
  const sessionIdle = inject(SessionIdleService);
  const authService = inject(AuthService);
  const teamsContext = inject(TeamsContextService);

  const existing = await storage.get('token');
  if (existing) {
    if (
      !sessionIdle.isIdleDisabled() &&
      (sessionIdle.isIdleExpired() || sessionIdle.hasExceededIdleLimit())
    ) {
      if (!authService.isLoggingOut()) {
        void authService.logout({ reason: 'idle' });
      }
      return false;
    }
    return true;
  }

  const inTeams = await teamsContext.ensureInitialized();
  if (!inTeams) {
    rememberReturnUrl(state.url);
    teamsContext.rememberSsoError(
      'Abra pelo app Credenciamento no Teams (não pelo navegador solto) para SSO automático.',
    );
    void router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  rememberReturnUrl(state.url);

  try {
    const silentOk = await authService.tryTeamsSsoLogin({
      silent: true,
      navigate: false,
    });
    if (silentOk) return true;

    // Máquina / sessão sem consentimento: só o popup (sem getAuthToken interativo)
    await authService.loginMicrosoftInTeams({
      navigate: false,
      skipSilent: true,
    });
    if (await storage.get('token')) return true;
  } catch (err: unknown) {
    const detail =
      (err instanceof Error && err.message) ||
      teamsContext.getLastAuthError() ||
      'SSO Teams falhou';
    teamsContext.rememberSsoError(detail);
  }

  const detail =
    teamsContext.getLastAuthError() ||
    'SSO Teams indisponível. Use Entrar com Microsoft.';
  teamsContext.rememberSsoError(detail);

  void router.navigate(['/login'], {
    queryParams: { returnUrl: state.url },
  });
  return false;
};
