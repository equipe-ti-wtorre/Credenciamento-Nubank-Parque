import { ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EventItem, EventService } from '../../services/event.service';
import {
  DenialModuleKey,
  DenialReportFilters,
  DenialReportItem,
  ReportsService,
} from '../../services/reports.service';
import { NotificationService } from '../../core/services/notification.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';

@Component({
  selector: 'app-credential-denials-report',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchSelectComponent],
  templateUrl: './credential-denials-report.component.html',
  styleUrl: './credential-denials-report.component.scss',
})
export class CredentialDenialsReportComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  readonly modules: { key: DenialModuleKey; label: string }[] = [
    { key: 'service_access', label: 'Acesso de serviço' },
    { key: 'event', label: 'Credenciamento de evento' },
    { key: 'credential', label: 'Credencial' },
    { key: 'document', label: 'Documento' },
  ];

  loading = signal(false);
  items = signal<DenialReportItem[]>([]);
  events = signal<EventItem[]>([]);
  readonly eventOptions = computed(() =>
    this.events().map((event) => ({
      value: String(event.id_event),
      label: event.name,
    })),
  );

  filterModule = '';
  filterIdEvent = '';
  filterDateFrom = '';
  filterDateTo = '';

  constructor(
    private reportsService: ReportsService,
    private eventService: EventService,
    private notification: NotificationService,
  ) {}

  ngOnInit(): void {
    this.loadEvents();
    this.load();
  }

  trackByDenial(_index: number, item: DenialReportItem): string {
    return `${item.module_key}-${item.id_denial}`;
  }

  applyFilters(): void {
    this.load();
  }

  clearFilters(): void {
    this.filterModule = '';
    this.filterIdEvent = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reportsService.getDenials(this.buildFilters()).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading.set(false);
        this.notification.notifyHttpError(err, 'Falha ao carregar negações de credenciamento.');
        this.cdr.markForCheck();
      },
    });
  }

  private loadEvents(): void {
    this.eventService.list(1, 100).subscribe({
      next: (res) => {
        this.events.set(res.events ?? []);
        this.cdr.markForCheck();
      },
      error: () => {
        this.events.set([]);
      },
    });
  }

  private buildFilters(): DenialReportFilters {
    return {
      module: this.filterModule || undefined,
      id_event: this.filterIdEvent || undefined,
      date_from: this.filterDateFrom || undefined,
      date_to: this.filterDateTo || undefined,
    };
  }
}
