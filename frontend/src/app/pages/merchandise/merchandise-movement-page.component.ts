import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MovementType } from '../../services/materials.service';
import { GateMerchandiseFormComponent } from './gate-merchandise-form.component';

@Component({
  selector: 'app-merchandise-movement-page',
  standalone: true,
  imports: [CommonModule, GateMerchandiseFormComponent],
  template: `
    <div class="w-full max-w-6xl mx-auto">
      <div class="mb-4">
        <h2 class="page-section-title">{{ pageTitle }}</h2>
        <p class="page-section-subtitle">{{ pageSubtitle }}</p>
      </div>
      <app-gate-merchandise-form [movementType]="movementType" />
    </div>
  `,
})
export class MerchandiseMovementPageComponent {
  private route = inject(ActivatedRoute);

  readonly movementType = this.route.snapshot.data['movementType'] as MovementType;

  get pageTitle(): string {
    return this.movementType === 'ENTRADA' ? 'Registrar entrada' : 'Registrar saída';
  }

  get pageSubtitle(): string {
    return this.movementType === 'ENTRADA'
      ? 'Registro de mercadorias que entram no site'
      : 'Registro de mercadorias que saem do site';
  }
}
