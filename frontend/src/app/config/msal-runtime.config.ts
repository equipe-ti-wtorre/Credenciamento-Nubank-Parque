import { environment } from '../../environments/environment';

export const MSAL_PLACEHOLDER_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

let msalClientId = environment.msalConfig.auth.clientId;
let msalAuthority = environment.msalConfig.auth.authority;
let msalRedirectUri = environment.msalConfig.auth.redirectUri;

export function setMsalRuntimeConfig(config: {
  clientId: string;
  authority?: string;
  redirectUri?: string | null;
}) {
  msalClientId = config.clientId;
  if (config.authority) msalAuthority = config.authority;
  if (config.redirectUri) msalRedirectUri = config.redirectUri;
}

export function getMsalClientId(): string {
  return msalClientId;
}

export function getMsalAuthority(): string {
  return msalAuthority;
}

export function getMsalRedirectUri(): string {
  return msalRedirectUri;
}

export function isValidMsalClientId(clientId: string | null | undefined): boolean {
  const id = (clientId || '').trim();
  return !!id && id !== MSAL_PLACEHOLDER_CLIENT_ID;
}
