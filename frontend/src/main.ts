import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import * as microsoftTeams from '@microsoft/teams-js';

const PENDING_KEY = 'teams.pendingDeepLink';

function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep */
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      value = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }
  if (/^(aprovacoes|acessos-servico|admin)\b/i.test(value)) value = `/${value}`;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.startsWith('/login') || value.startsWith('/auth/')) return null;
  return value;
}

async function captureTeamsDeepLinkBeforeBoot(): Promise<void> {
  // Se o Graph abriu a URL https do SPA, já estamos no path certo
  const loc = `${window.location.pathname}${window.location.search}`;
  if (/^\/(aprovacoes|acessos-servico)(\/|\?)/.test(loc)) {
    try {
      sessionStorage.setItem(PENDING_KEY, loc.split('?')[0] === loc ? loc : loc);
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    await microsoftTeams.app.initialize();
    const ctx = await microsoftTeams.app.getContext();
    const page = ctx?.page as { subPageId?: string; subEntityId?: string } | undefined;
    const raw = page?.subPageId || page?.subEntityId || (ctx as { subEntityId?: string })?.subEntityId;
    const path = normalizePath(raw);
    if (path) {
      sessionStorage.setItem(PENDING_KEY, path);
    }
  } catch {
    /* fora do Teams */
  }
}

captureTeamsDeepLinkBeforeBoot().finally(() => {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
});
