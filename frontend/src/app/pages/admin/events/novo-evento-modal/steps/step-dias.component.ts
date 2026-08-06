import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EventDayType } from '../../../../../services/event.service';
import { EventoCalendarComponent } from '../ui/calendar.component';
import {
  DOW_LONG,
  formatDateBrIso,
  parseIsoDate,
} from '../ui/calendar.util';
import { pluralTipo } from '../models/evento.model';

export interface DayRow {
  iso: string;
  id_type: number;
  tipoNome: string;
}

@Component({
  selector: 'app-novo-evento-step-dias',
  standalone: true,
  imports: [FormsModule, EventoCalendarComponent],
  templateUrl: './step-dias.component.html',
  styleUrl: './step-dias.component.scss',
})
export class NovoEventoStepDiasComponent {
  readonly dataInicio = input.required<string | null>();
  readonly dataFim = input.required<string | null>();
  readonly types = input.required<EventDayType[]>();
  /** Map ISO → id_type */
  readonly dias = input.required<Map<string, number>>();
  readonly brushTypeId = model.required<number>();
  readonly calViewKey = input(0);

  readonly tagDay = output<string>();
  readonly fillPeriod = output<void>();
  readonly changeType = output<{ iso: string; id_type: number }>();
  readonly removeDay = output<string>();

  readonly hasPeriod = computed(() => !!this.dataInicio() && !!this.dataFim());

  readonly typeById = computed(() => {
    const m = new Map<number, EventDayType>();
    for (const t of this.types()) m.set(t.id_event_day_type, t);
    return m;
  });

  readonly taggedNames = computed(() => {
    const out = new Map<string, string>();
    const byId = this.typeById();
    for (const [iso, id] of this.dias()) {
      const nome = byId.get(id)?.description;
      if (nome) out.set(iso, nome);
    }
    return out;
  });

  readonly rows = computed((): DayRow[] => {
    const byId = this.typeById();
    return [...this.dias().entries()]
      .map(([iso, id_type]) => ({
        iso,
        id_type,
        tipoNome: byId.get(id_type)?.description || '—',
      }))
      .sort((a, b) => (a.iso < b.iso ? -1 : 1));
  });

  readonly summaryHtml = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      counts.set(row.tipoNome, (counts.get(row.tipoNome) || 0) + 1);
    }
    const parts: string[] = [];
    for (const t of this.types()) {
      const n = counts.get(t.description) || 0;
      if (!n) continue;
      parts.push(`<b>${n}</b> ${pluralTipo(t.description, n)}`);
    }
    return parts.join(' · ');
  });

  readonly formatBr = formatDateBrIso;

  weekday(iso: string): string {
    const d = parseIsoDate(iso);
    return d ? DOW_LONG[d.getDay()] : '';
  }

  typeOptions(): EventDayType[] {
    return this.types();
  }
}
