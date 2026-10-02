import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MovementNature, MovementType } from '../../services/materials.service';
import { GateMerchandiseFormComponent } from './gate-merchandise-form.component';

@Component({
  selector: 'app-merchandise-movement-page',
  standalone: true,
  imports: [CommonModule, GateMerchandiseFormComponent],
  templateUrl: './merchandise-movement-page.component.html',
  styleUrl: './merchandise-movement-page.component.scss',
})
export class MerchandiseMovementPageComponent {
  private route = inject(ActivatedRoute);

  readonly movementType = this.route.snapshot.data['movementType'] as MovementType;
  nature = signal<MovementNature>('ESTOQUE');

  get pageTitle(): string {
    return this.movementType === 'ENTRADA' ? 'Registrar entrada' : 'Registrar saída';
  }

  get pageSubtitle(): string {
    const entrada = this.movementType === 'ENTRADA';
    if (this.nature() === 'ENTREGA') {
      return entrada
        ? 'Entrega ou encomenda que só passa pela portaria.'
        : 'Entrega ou encomenda saindo do site.';
    }
    return entrada
      ? 'Mercadoria que entra no inventário do site.'
      : 'Mercadoria que sai do inventário do site.';
  }
}
