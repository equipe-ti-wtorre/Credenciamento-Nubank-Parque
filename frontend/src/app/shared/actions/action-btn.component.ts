import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionIconName, ActionIconVariant } from './action-icon.type';

@Component({
  selector: 'app-action-btn',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="action-btn"
      [class.action-btn--primary]="variant === 'primary'"
      [class.action-btn--neutral]="variant === 'neutral'"
      [class.action-btn--danger]="variant === 'danger'"
      [disabled]="disabled"
      [attr.title]="title"
      [attr.aria-label]="title"
      (click)="action.emit()"
    >
      <svg
        class="action-btn__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <ng-container [ngSwitch]="icon">
          <!-- Editar -->
          <g *ngSwitchCase="'edit'">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </g>
          <!-- Usuários -->
          <g *ngSwitchCase="'users'">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </g>
          <!-- Imprimir -->
          <g *ngSwitchCase="'print'">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </g>
          <!-- Grade / layout -->
          <g *ngSwitchCase="'grid'">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </g>
          <!-- Documento -->
          <g *ngSwitchCase="'document'">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8" />
            <path d="M8 17h8" />
            <path d="M8 9h2" />
          </g>
          <!-- Enviar / testar -->
          <g *ngSwitchCase="'send'">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </g>
          <!-- Link -->
          <g *ngSwitchCase="'link'">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </g>
          <!-- Excluir -->
          <g *ngSwitchCase="'delete'">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </g>
          <!-- Restaurar -->
          <g *ngSwitchCase="'restore'">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </g>
          <!-- Desativar -->
          <g *ngSwitchCase="'deactivate'">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <path d="M12 2v10" />
          </g>
        </ng-container>
      </svg>
    </button>
  `,
})
export class ActionBtnComponent {
  @Input({ required: true }) icon!: ActionIconName;
  @Input({ required: true }) title!: string;
  @Input() variant: ActionIconVariant = 'neutral';
  @Input() disabled = false;
  @Output() action = new EventEmitter<void>();
}
