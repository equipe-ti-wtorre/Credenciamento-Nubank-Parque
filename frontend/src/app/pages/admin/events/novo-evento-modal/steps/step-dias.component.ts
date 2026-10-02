import { Component, computed, input, model, output } from '@angular/core';
import { EventDayType } from '../../../../../services/event.service';
import { EventoCalendarComponent } from '../ui/calendar.component';
import {
  DOW_LONG,
  formatDateBrIso,
  parseIsoDate,
} from '../ui/calendar.util';
import { DiasMap, pluralTipo } from '../models/evento.model';

export interface DayTypeChip {
  id_type: number;
  nome: string;
}

export interface DayRow {
  iso: string;
  tipos: DayTypeChip[];
}

@Component({
  selector: 'app-novo-evento-step-dias',
  standalone: true,
  imports: [EventoCalendarComponent],
  templateUrl: './step-dias.component.html',
  styleUrl: './step-dias.component.scss',
})
export class NovoEventoStepDiasComponent {
  readonly dataInicio = input.required<string | null>();
  readonly dataFim = input.required<string | null>();
  readonly types = input.required<EventDayType[]>();
  readonly dias = input.required<DiasMap>();
  readonly brushTypeId = model.required<number>();
  readonly calViewKey = input(0);

  readonly tagDay = output<string>();
  readonly fillPeriod = output<void>();
  readonly removeType = output<{ iso: string; id_type: number }>();
  readonly removeDay = output<string>();

  readonly hasPeriod = computed(() => !!this.dataInicio() && !!this.dataFim());

  readonly typeById = computed(() => {
    const m = new Map<number, EventDayType>();
    for (const t of this.types()) m.set(t.id_event_day_type, t);
    return m;
  });

  readonly taggedNames = computed(() => {
    const out = new Map<string, string[]>();
    const byId = this.typeById();
    const order = new Map(this.types().map((t, i) => [t.id_event_day_type, i]));
    for (const [iso, ids] of this.dias()) {
      const names = [...ids]
        .sort((a, b) => (order.get(a) ?? a) - (order.get(b) ?? b))
        .map((id) => byId.get(id)?.description)
        .filter((n): n is string => !!n);
      if (names.length) out.set(iso, names);
    }
    return out;
  });

  readonly rows = computed((): DayRow[] => {
    const byId = this.typeById();
    const order = new Map(this.types().map((t, i) => [t.id_event_day_type, i]));
    return [...this.dias().entries()]
      .map(([iso, ids]) => ({
        iso,
        tipos: [...ids]
          .sort((a, b) => (order.get(a) ?? a) - (order.get(b) ?? b))
          .map((id_type) => ({
            id_type,
            nome: byId.get(id_type)?.description || '—',
          })),
      }))
      .sort((a, b) => (a.iso < b.iso ? -1 : 1));
  });

  readonly summaryHtml = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      for (const chip of row.tipos) {
        counts.set(chip.nome, (counts.get(chip.nome) || 0) + 1);
      }
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
}
