import { Component, computed, input } from '@angular/core';
import { EventDayType } from '../../../../../services/event.service';
import {
  DOW_LONG,
  diffDaysInclusive,
  formatDateBrIso,
  pad2,
  parseIsoDate,
} from '../ui/calendar.util';
import { pluralTipo } from '../models/evento.model';

interface ReviewDayCard {
  iso: string;
  day: string;
  month: string;
  weekday: string;
  tipoNome: string;
}

@Component({
  selector: 'app-novo-evento-step-revisao',
  standalone: true,
  templateUrl: './step-revisao.component.html',
  styleUrl: './step-revisao.component.scss',
})
export class NovoEventoStepRevisaoComponent {
  readonly nome = input.required<string>();
  readonly setorNome = input.required<string>();
  readonly empresaNome = input.required<string>();
  readonly dataInicio = input.required<string | null>();
  readonly dataFim = input.required<string | null>();
  readonly dias = input.required<Map<string, number>>();
  readonly types = input.required<EventDayType[]>();

  readonly periodoLabel = computed(() => {
    const s = this.dataInicio();
    const e = this.dataFim();
    if (!s || !e) return '—';
    const n = diffDaysInclusive(s, e);
    const base = `${formatDateBrIso(s)} → ${formatDateBrIso(e)}`;
    return `${base} · ${n} dia${n > 1 ? 's' : ''}`;
  });

  readonly cards = computed((): ReviewDayCard[] => {
    const byId = new Map(this.types().map((t) => [t.id_event_day_type, t.description]));
    return [...this.dias().entries()]
      .map(([iso, id]) => {
        const d = parseIsoDate(iso)!;
        return {
          iso,
          day: pad2(d.getDate()),
          month: pad2(d.getMonth() + 1),
          weekday: DOW_LONG[d.getDay()],
          tipoNome: byId.get(id) || '—',
        };
      })
      .sort((a, b) => (a.iso < b.iso ? -1 : 1));
  });

  readonly phaseCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.cards()) {
      counts.set(c.tipoNome, (counts.get(c.tipoNome) || 0) + 1);
    }
    return this.types()
      .map((t) => ({ nome: t.description, n: counts.get(t.description) || 0 }))
      .filter((x) => x.n > 0)
      .map((x) => ({ ...x, label: pluralTipo(x.nome, x.n) }));
  });
}
