import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { NavigationStateService } from '../core/services/navigation-state.service';
import { Subscription, filter, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService, hasPermission } from '../core/services/auth.service';
import { CompanyItem, CompanyService, formatCnpj } from '../services/company.service';
import {
  CollaboratorItem,
  CollaboratorService,
  formatCpf,
  isCpfDocumentType,
} from '../services/collaborator.service';

type SearchHit =
  | { kind: 'company'; id: number; title: string; subtitle: string }
  | { kind: 'collaborator'; id: number; title: string; subtitle: string };

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="global-search" #root>
        <div class="search" #searchBox>
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" stroke-linecap="round" />
          </svg>
          <input
            type="search"
            [placeholder]="placeholder"
            aria-label="Busca global"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            [attr.aria-expanded]="open()"
            [attr.aria-controls]="listId"
            [attr.aria-activedescendant]="activeDescendant()"
            [value]="query()"
            (input)="onInput($event)"
            (focus)="onFocus()"
            (keydown)="onKeydown($event)"
          />
        </div>
        @if (open()) {
          <div
            #panel
            class="global-search__panel"
            [id]="listId"
            role="listbox"
            [style.top.px]="panelTop"
            [style.left.px]="panelLeft"
            (mousedown)="$event.preventDefault()"
          >
            @if (searching()) {
              <p class="global-search__empty">Buscando...</p>
            } @else if (!hasAnyResult() && !companyError() && !collabError()) {
              <p class="global-search__empty">Nenhum resultado</p>
            } @else {
              @if (canSearchCompanies) {
                <div class="global-search__group">
                  <div class="global-search__group-title">Empresas</div>
                  @if (companyError()) {
                    <p class="global-search__empty">Não foi possível buscar empresas.</p>
                  } @else if (companies().length === 0) {
                    <p class="global-search__empty">Nenhuma empresa</p>
                  } @else {
                    @for (hit of companyHits(); track hit.id; let i = $index) {
                      <button
                        type="button"
                        class="global-search__item"
                        role="option"
                        [id]="optionId('company', hit.id)"
                        [class.is-active]="activeIndex() === i"
                        [attr.aria-selected]="activeIndex() === i"
                        (mouseenter)="activeIndex.set(i)"
                        (click)="select(hit)"
                      >
                        <span class="global-search__item-title">{{ hit.title }}</span>
                        <span class="global-search__item-sub">{{ hit.subtitle }}</span>
                      </button>
                    }
                  }
                </div>
              }
              @if (canSearchCollaborators) {
                <div class="global-search__group">
                  <div class="global-search__group-title">Colaboradores</div>
                  @if (collabError()) {
                    <p class="global-search__empty">Não foi possível buscar colaboradores.</p>
                  } @else if (collaborators().length === 0) {
                    <p class="global-search__empty">Nenhum colaborador</p>
                  } @else {
                    @for (hit of collabHits(); track hit.id; let i = $index) {
                      <button
                        type="button"
                        class="global-search__item"
                        role="option"
                        [id]="optionId('collaborator', hit.id)"
                        [class.is-active]="activeIndex() === companyHits().length + i"
                        [attr.aria-selected]="activeIndex() === companyHits().length + i"
                        (mouseenter)="activeIndex.set(companyHits().length + i)"
                        (click)="select(hit)"
                      >
                        <span class="global-search__item-title">{{ hit.title }}</span>
                        <span class="global-search__item-sub">{{ hit.subtitle }}</span>
                      </button>
                    }
                  }
                </div>
              }
            }
          </div>
        }
      </div>
    }
  `,
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationStateService);
  private readonly companyService = inject(CompanyService);
  private readonly collaboratorService = inject(CollaboratorService);

  @ViewChild('searchBox') private searchBoxRef?: ElementRef<HTMLElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  readonly listId = 'global-search-results';
  readonly visible = signal(false);
  readonly query = signal('');
  readonly open = signal(false);
  readonly searching = signal(false);
  readonly companies = signal<CompanyItem[]>([]);
  readonly collaborators = signal<CollaboratorItem[]>([]);
  readonly companyError = signal(false);
  readonly collabError = signal(false);
  readonly activeIndex = signal(0);

  canSearchCompanies = false;
  canSearchCollaborators = false;
  placeholder = 'Buscar empresa, colaborador...';

  panelTop = 0;
  panelLeft = 0;

  readonly companyHits = computed(() => this.companies().map((c) => this.toCompanyHit(c)));
  readonly collabHits = computed(() => this.collaborators().map((c) => this.toCollabHit(c)));
  readonly hits = computed(() => [...this.companyHits(), ...this.collabHits()]);
  readonly hasAnyResult = computed(() => this.hits().length > 0);
  readonly activeDescendant = computed(() => {
    if (!this.open()) return null;
    const hit = this.hits()[this.activeIndex()];
    return hit ? this.optionId(hit.kind, hit.id) : null;
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private panelMovedToBody = false;
  private ignoreNextDocumentClick = false;
  private routerSub?: Subscription;

  ngOnInit(): void {
    void this.resolvePermissions();
    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.open()) this.close();
      });
  }

  ngOnDestroy(): void {
    this.searchRequestId += 1;
    this.clearDebounce();
    this.routerSub?.unsubscribe();
    this.detachPanelFromBody();
  }

  optionId(kind: SearchHit['kind'], id: number): string {
    return `global-search-${kind}-${id}`;
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.scheduleSearch(value);
  }

  onFocus(): void {
    const q = this.query().trim();
    if (q.length >= MIN_CHARS && (this.hasAnyResult() || this.searching())) {
      this.openPanel();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open()) {
        const q = this.query().trim();
        if (q.length >= MIN_CHARS) this.openPanel();
        return;
      }
      const total = this.hits().length;
      if (!total) return;
      this.activeIndex.set((this.activeIndex() + 1) % total);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const total = this.hits().length;
      if (!total) return;
      this.activeIndex.set((this.activeIndex() - 1 + total) % total);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = this.hits()[this.activeIndex()] ?? this.hits()[0];
      if (hit) this.select(hit);
    }
  }

  select(hit: SearchHit): void {
    this.query.set('');
    this.companies.set([]);
    this.collaborators.set([]);
    this.close();
    const path = hit.kind === 'company' ? '/admin/empresas' : '/admin/colaboradores';
    void this.nav.navegar(path, { public_id: String(hit.id) });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.ignoreNextDocumentClick) {
      this.ignoreNextDocumentClick = false;
      return;
    }
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    const panel = this.getPanelElement();
    if (target && panel?.contains(target)) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.open()) this.updatePanelPosition();
  }

  private async resolvePermissions(): Promise<void> {
    const user = await this.auth.getCurrentUser();
    this.canSearchCompanies = hasPermission(user, 'companies', 'view');
    this.canSearchCollaborators = hasPermission(user, 'collaborators', 'view');
    this.visible.set(this.canSearchCompanies || this.canSearchCollaborators);
    if (this.canSearchCompanies && this.canSearchCollaborators) {
      this.placeholder = 'Buscar empresa, colaborador...';
    } else if (this.canSearchCompanies) {
      this.placeholder = 'Buscar empresa...';
    } else {
      this.placeholder = 'Buscar colaborador...';
    }
    this.cdr.detectChanges();
  }

  private scheduleSearch(raw: string): void {
    this.clearDebounce();
    const q = raw.trim();
    if (q.length < MIN_CHARS) {
      this.searchRequestId += 1;
      this.searching.set(false);
      this.companies.set([]);
      this.collaborators.set([]);
      this.companyError.set(false);
      this.collabError.set(false);
      this.close();
      return;
    }
    this.openPanel();
    if (this.panelMovedToBody) {
      this.runPanelUiUpdate(() => this.searching.set(true));
    } else {
      this.searching.set(true);
    }
    this.debounceTimer = setTimeout(() => this.runSearch(q), DEBOUNCE_MS);
  }

  private runSearch(term: string): void {
    const requestId = ++this.searchRequestId;
    const companies$ = this.canSearchCompanies
      ? this.companyService.list(1, 5, { name: term }).pipe(
          map((res) => ({ items: res.companies || [], error: false })),
          catchError(() => of({ items: [] as CompanyItem[], error: true })),
        )
      : of({ items: [] as CompanyItem[], error: false });

    const collabs$ = this.canSearchCollaborators
      ? this.collaboratorService.searchByTerm(term).pipe(
          map((res) => ({ items: res.results || [], error: false })),
          catchError(() => of({ items: [] as CollaboratorItem[], error: true })),
        )
      : of({ items: [] as CollaboratorItem[], error: false });

    forkJoin({ companies: companies$, collaborators: collabs$ }).subscribe({
      next: ({ companies, collaborators }) => {
        if (requestId !== this.searchRequestId) return;
        this.runPanelUiUpdate(() => {
          this.companies.set(companies.items);
          this.collaborators.set(collaborators.items);
          this.companyError.set(companies.error);
          this.collabError.set(collaborators.error);
          this.searching.set(false);
          this.activeIndex.set(0);
        });
      },
    });
  }

  private openPanel(): void {
    if (this.open()) {
      this.updatePanelPosition();
      return;
    }
    this.ignoreNextDocumentClick = true;
    this.open.set(true);
    this.cdr.detectChanges();
    setTimeout(() => {
      this.attachPanelToBody();
      this.updatePanelPosition();
      this.cdr.detectChanges();
    }, 0);
  }

  private close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.detachPanelFromBody();
    this.cdr.detectChanges();
  }

  /**
   * O painel vai para document.body (overflow/backdrop-filter do layout).
   * Mutações do template precisam ocorrer com o nó de volta no host.
   */
  private runPanelUiUpdate(mutate: () => void): void {
    const wasOnBody = this.panelMovedToBody;
    if (wasOnBody) this.detachPanelFromBody();
    mutate();
    this.cdr.detectChanges();
    if (this.open()) {
      this.attachPanelToBody();
      this.updatePanelPosition();
      this.cdr.detectChanges();
    }
  }

  private attachPanelToBody(): void {
    const panel = this.getPanelElement();
    if (!panel || this.panelMovedToBody) return;
    document.body.appendChild(panel);
    this.panelMovedToBody = true;
  }

  private detachPanelFromBody(): void {
    if (!this.panelMovedToBody) return;
    const panel = this.getPanelElement();
    const root = this.host.nativeElement;
    if (panel && panel.parentElement === document.body && root) {
      root.appendChild(panel);
    }
    this.panelMovedToBody = false;
  }

  private getPanelElement(): HTMLElement | null {
    return (
      this.panelRef?.nativeElement ??
      (this.host.nativeElement.querySelector('.global-search__panel') as HTMLElement | null)
    );
  }

  private updatePanelPosition(): void {
    const trigger = this.searchBoxRef?.nativeElement;
    const panel = this.getPanelElement();
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 360;
    const panelHeight = panel.offsetHeight || 200;
    const gap = 8;
    const margin = 8;

    let top = rect.bottom + gap;
    let left = rect.right - panelWidth;

    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - panelHeight - gap);
    }
    if (left < margin) left = margin;
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin;
    }

    this.panelTop = top;
    this.panelLeft = left;
  }

  private toCompanyHit(c: CompanyItem): SearchHit {
    const title = c.fancy_name?.trim() || c.company_name;
    const parts = [
      c.fancy_name?.trim() && c.fancy_name.trim() !== c.company_name ? c.company_name : null,
      formatCnpj(c.cnpj),
      c.company_type?.description || null,
    ].filter(Boolean);
    return { kind: 'company', id: c.id_company, title, subtitle: parts.join(' · ') };
  }

  private toCollabHit(c: CollaboratorItem): SearchHit {
    const doc = isCpfDocumentType(c.document_type?.description)
      ? formatCpf(c.document)
      : c.document;
    const parts = [doc, c.role?.description || null].filter(Boolean);
    return { kind: 'collaborator', id: c.id_collaborator, title: c.name, subtitle: parts.join(' · ') };
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
