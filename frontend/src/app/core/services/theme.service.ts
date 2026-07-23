import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ColorPalette,
  SystemSettingsService,
} from '../../services/system-settings.service';
import { StorageService } from './storage.service';

export const COLOR_PALETTES: ColorPalette[] = ['wtorre', 'nubank-parque'];
export const DEFAULT_COLOR_PALETTE: ColorPalette = 'wtorre';
const CACHE_KEY = 'app.color_palette';

const LOGO_WTORRE = 'assets/logo.svg';
const LOGO_MARK_WTORRE = 'assets/wt-mark.svg';
/** Wordmark branco — sidebar, login e convite. */
const LOGO_NUBANK_NEGATIVO = 'assets/logo-nubank-parque-negativo.png';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly storage = inject(StorageService);

  readonly palette = signal<ColorPalette>(DEFAULT_COLOR_PALETTE);

  getPalette(): ColorPalette {
    return this.palette();
  }

  /** Logo em fundos escuros (login, convite) — Nubank em branco. */
  logoFullSrc(): string {
    return this.palette() === 'nubank-parque' ? LOGO_NUBANK_NEGATIVO : LOGO_WTORRE;
  }

  /** Logo da sidebar (fundo roxo escuro → versão branca). */
  logoSidebarSrc(): string {
    return this.palette() === 'nubank-parque' ? LOGO_NUBANK_NEGATIVO : LOGO_WTORRE;
  }

  logoMarkSrc(): string {
    return this.palette() === 'nubank-parque' ? LOGO_NUBANK_NEGATIVO : LOGO_MARK_WTORRE;
  }

  logoAlt(): string {
    return this.palette() === 'nubank-parque' ? 'Nubank Parque' : 'WTorre';
  }

  /** Aplica cache síncrono (anti-FOUC) — usar no APP_INITIALIZER. */
  applyFromCacheSync(): void {
    const cached = this.readCacheSync();
    this.apply(cached, false);
  }

  apply(palette: ColorPalette, persistCache = true): void {
    const next = this.normalize(palette);
    this.palette.set(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
    }
    if (persistCache) {
      void this.storage.set(CACHE_KEY, next);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, next);
      }
    }
  }

  async syncFromApi(): Promise<ColorPalette> {
    try {
      const res = await firstValueFrom(this.systemSettings.getAppearanceSettings());
      const palette = this.normalize(res.settings.color_palette);
      this.apply(palette);
      return palette;
    } catch {
      return this.palette();
    }
  }

  private normalize(value: string | null | undefined): ColorPalette {
    if (value === 'nubank-parque') return 'nubank-parque';
    return 'wtorre';
  }

  private readCacheSync(): ColorPalette {
    try {
      if (typeof localStorage !== 'undefined') {
        return this.normalize(localStorage.getItem(CACHE_KEY));
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_COLOR_PALETTE;
  }
}

/** Cache síncrono anti-FOUC (localStorage). */
export function themeCacheInitializer(theme: ThemeService) {
  return () => {
    theme.applyFromCacheSync();
  };
}

/** Sincroniza paleta global da API (funciona sem login — outro navegador). */
export function themeApiSyncInitializer(theme: ThemeService) {
  return () => theme.syncFromApi();
}
