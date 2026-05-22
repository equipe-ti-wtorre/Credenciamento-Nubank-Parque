import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Container padrão para alinhar botões de ação (ícones quadrados). */
@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="action-menu" role="group">
      <ng-content></ng-content>
    </div>
  `,
})
export class ActionMenuComponent {}
