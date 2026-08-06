/** Páginas filhas de Configurações que carregam dados da API. */
export interface SettingsReloadable {
  reloadPage(): void;
}

export function isSettingsReloadable(value: unknown): value is SettingsReloadable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SettingsReloadable).reloadPage === 'function'
  );
}
