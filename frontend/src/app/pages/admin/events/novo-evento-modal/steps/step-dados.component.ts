import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EligibleSector } from '../../../../../services/approval.service';
import { EventDayCompanyBrief } from '../../../../../services/event.service';
import { EventoCalendarComponent } from '../ui/calendar.component';
import { formatDateBrIso } from '../ui/calendar.util';

@Component({
  selector: 'app-novo-evento-step-dados',
  standalone: true,
  imports: [FormsModule, EventoCalendarComponent],
  templateUrl: './step-dados.component.html',
  styleUrl: './step-dados.component.scss',
})
export class NovoEventoStepDadosComponent {
  readonly nome = model.required<string>();
  readonly idSetor = model.required<number | null>();
  readonly idEmpresa = model.required<number | null>();
  readonly dataInicio = model.required<string | null>();
  readonly dataFim = model.required<string | null>();
  readonly picking = input.required<'start' | 'end'>();

  readonly sectors = input.required<EligibleSector[]>();
  readonly producers = input.required<EventDayCompanyBrief[]>();
  readonly lockEmpresa = input(false);
  readonly calViewKey = input(0);

  readonly rangePick = output<string>();

  readonly formatBr = formatDateBrIso;
  readonly startLabel = computed(() => formatDateBrIso(this.dataInicio()));
  readonly endLabel = computed(() => formatDateBrIso(this.dataFim()));
}
