import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AppearanceSettings,
  ColorPalette,
  SystemSettingsService,
} from '../../../services/system-settings.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';
import { SettingsReloadable } from '../settings-reloadable';

interface PaletteOption {
  id: ColorPalette;
  label: string;
  description: string;
  swatches: string[];
}

@Component({
  selector: 'app-appearance-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 shrink-0">
        <div>
          <h2 class="page-section-title">Aparência</h2>
          <p class="page-section-subtitle">
            Escolha a paleta de cores padrão do sistema. A alteração vale para todos os usuários.
          </p>
        </div>
        <button
          type="button"
          (click)="salvar()"
          [disabled]="saving || selected === savedPalette"
          class="btn-action-primary disabled:opacity-50 shrink-0"
        >
          {{ saving ? 'Salvando...' : 'Salvar paleta' }}
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
        <button
          type="button"
          *ngFor="let opt of options"
          (click)="select(opt.id)"
          class="palette-card text-left"
          [class.palette-card--active]="selected === opt.id"
        >
          <div class="flex items-center gap-2 mb-3">
            <span
              *ngFor="let c of opt.swatches"
              class="palette-swatch"
              [style.background]="c"
            ></span>
          </div>
          <p class="text-sm font-semibold text-[var(--text-primary)]">{{ opt.label }}</p>
          <p class="text-xs text-[var(--text-muted)] mt-1">{{ opt.description }}</p>
        </button>
      </div>

      <p *ngIf="loadedSettings?.atualizado_em" class="text-xs text-slate-400 mt-4">
        Última alteração: {{ loadedSettings?.atualizado_em | date: 'dd/MM/yyyy HH:mm' }}
      </p>
    </div>
  `,
  styles: [
    `
      .palette-card {
        border: 1px solid var(--app-border);
        border-radius: 1rem;
        padding: 1.25rem;
        background: var(--color-bg-surface);
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .palette-card:hover {
        border-color: color-mix(in srgb, var(--brand) 35%, var(--app-border));
      }
      .palette-card--active {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-focus-ring);
      }
      .palette-swatch {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, #000 8%, transparent);
      }
    `,
  ],
})
export class AppearanceSettingsComponent implements SettingsReloadable, OnDestroy {
  private readonly systemSettings = inject(SystemSettingsService);
  private readonly theme = inject(ThemeService);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly options: PaletteOption[] = [
    {
      id: 'wtorre',
      label: 'WTorre',
      description: 'Azul institucional (padrão atual).',
      swatches: ['#1d54e6', '#1442ba', '#e8eefd', '#f1f5f9'],
    },
    {
      id: 'nubank-parque',
      label: 'Nubank Parque',
      description: 'Core Purple com herança verde.',
      swatches: ['#8d0de3', '#7209bd', '#ecdfff', '#174006'],
    },
  ];

  selected: ColorPalette = 'wtorre';
  savedPalette: ColorPalette = 'wtorre';
  loadedSettings: AppearanceSettings | null = null;
  saving = false;

  constructor() {
    this.reloadPage();
  }

  ngOnDestroy() {
    if (this.selected !== this.savedPalette) {
      this.theme.apply(this.savedPalette);
    }
  }

  reloadPage() {
    this.systemSettings.getAppearanceSettings().subscribe({
      next: (res) => {
        this.loadedSettings = res.settings;
        this.selected = res.settings.color_palette;
        this.savedPalette = res.settings.color_palette;
        this.theme.apply(res.settings.color_palette);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notification.notifyHttpError(err, 'Falha ao carregar aparência.');
        this.cdr.markForCheck();
      },
    });
  }

  select(palette: ColorPalette) {
    this.selected = palette;
    this.theme.apply(palette);
    this.cdr.markForCheck();
  }

  salvar() {
    this.saving = true;
    this.systemSettings.updateAppearanceSettings(this.selected).subscribe({
      next: (res) => {
        this.saving = false;
        this.loadedSettings = res.settings;
        this.selected = res.settings.color_palette;
        this.savedPalette = res.settings.color_palette;
        this.theme.apply(res.settings.color_palette);
        this.notification.success('Paleta de cores salva.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.notification.notifyHttpError(err, 'Falha ao salvar paleta de cores.');
        this.cdr.markForCheck();
      },
    });
  }
}
