import { Injectable, signal, computed } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  ChangeOperationTypeStatusRequest,
  CreateOperationTypeRequest,
  ListOperationTypesParams,
  OperationTypeAutocompleteItem,
  OperationTypePageResponse,
  OperationTypeResponse,
  OperationTypeStatus,
  UpdateOperationTypeRequest,
} from './ports/operation-types-gateway';
import { OperationTypesHttpGateway } from '../adapters/out/http/operation-types-http.gateway';

// ── State shapes ──────────────────────────────────────────────────────────────

export type OperationTypesLoadStatus = 'loading' | 'content' | 'error';
/** FR-019: add and edit panels are mutually exclusive. */
export type OperationTypesActivePanel = 'add' | 'edit' | null;

export interface OperationTypeFilters {
  q: string | null;
  category: string | null;
  status: OperationTypeStatus | null;
}

/** Primary list state. */
export interface OperationTypesState {
  status: OperationTypesLoadStatus;
  items: OperationTypeResponse[];
  totalElements: number;
  currentPage: number;
  /** Default 10 per FR-023. */
  pageSize: number;
  filters: OperationTypeFilters;
  /** FR-019: add and edit panels are mutually exclusive. */
  activePanel: OperationTypesActivePanel;
  /** The row data passed to the edit panel on open. */
  editTarget: OperationTypeResponse | null;
  error: string | null;
}

/** Autocomplete suggestion state — separate lifecycle from the main list. */
export interface OperationTypeAutocompleteState {
  loading: boolean;
  results: OperationTypeAutocompleteItem[];
}

// ── Facade ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class OperationTypesFacade {

  // ── Signals ─────────────────────────────────────────────────────────────────

  private readonly _state = signal<OperationTypesState>({
    status: 'loading',
    items: [],
    totalElements: 0,
    currentPage: 1,
    pageSize: 10,
    filters: { q: null, category: null, status: null },
    activePanel: null,
    editTarget: null,
    error: null,
  });

  readonly state = this._state.asReadonly();

  /** Computed total pages derived from totalElements and pageSize. */
  readonly totalPages = computed(() =>
    Math.ceil(this._state().totalElements / this._state().pageSize) || 1,
  );

  private readonly _autocomplete = signal<OperationTypeAutocompleteState>({
    loading: false,
    results: [],
  });
  readonly autocomplete = this._autocomplete.asReadonly();

  // ── Autocomplete debounce subject ─────────────────────────────────────────────

  private readonly autocompleteInput$ = new Subject<string>();

  constructor(private readonly gateway: OperationTypesHttpGateway) {
    // Wire up the 300ms debounce + switchMap pipeline (FR-004, FR-005)
    this.autocompleteInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (!q || q.length < 1) {
            this._autocomplete.set({ loading: false, results: [] });
            return [];
          }
          this._autocomplete.set({ loading: true, results: [] });
          return this.gateway.autocomplete(q);
        }),
      )
      .subscribe({
        next: (results) => this._autocomplete.set({ loading: false, results }),
        error: () => this._autocomplete.set({ loading: false, results: [] }),
      });

    // Load operation types on construction
    this.load();
  }

  // ── List management ──────────────────────────────────────────────────────────

  /** Fetch operation types with current filters and page. */
  load(): void {
    const s = this._state();
    this._state.update((prev) => ({ ...prev, status: 'loading', error: null }));
    const params: ListOperationTypesParams = {
      page: s.currentPage,
      size: s.pageSize,
      q: s.filters.q ?? undefined,
      category: s.filters.category ?? undefined,
      status: s.filters.status ?? undefined,
    };
    firstValueFrom(this.gateway.listOperationTypes(params)).then(
      (res: OperationTypePageResponse) =>
        this._state.update((prev) => ({
          ...prev,
          status: 'content',
          items: res.content,
          totalElements: res.totalElements,
          error: null,
        })),
      (err: unknown) =>
        this._state.update((prev) => ({
          ...prev,
          status: 'error',
          items: [],
          error: (err as Error)?.message ?? 'Error cargando tipos de operación',
        })),
    );
  }

  /**
   * Retry the last failed list request.
   * Preserves current filters and page (FR-021).
   */
  reload(): void {
    this.load();
  }

  /**
   * Apply a partial filter update, reset page to 1, and reload (FR-009).
   */
  applyFilters(partial: Partial<OperationTypeFilters>): void {
    this._state.update((prev) => ({
      ...prev,
      filters: { ...prev.filters, ...partial },
      currentPage: 1,
    }));
    this.load();
  }

  /** Navigate to a specific page while preserving all active filters. */
  goToPage(page: number): void {
    this._state.update((prev) => ({ ...prev, currentPage: page }));
    this.load();
  }

  // ── Autocomplete ─────────────────────────────────────────────────────────────

  /** Push a keystroke into the debounced autocomplete pipeline (FR-004, FR-005). */
  searchAutocomplete(q: string): void {
    this.autocompleteInput$.next(q);
  }

  /** Clear autocomplete suggestions (e.g., on field blur or selection). */
  clearAutocomplete(): void {
    this._autocomplete.set({ loading: false, results: [] });
  }

  // ── Panel management (FR-019 — add and edit panels mutually exclusive) ────────

  /**
   * Open a panel, closing any currently open panel first.
   * For 'edit', pass the row's operation type data as editTarget.
   */
  openPanel(type: 'add' | 'edit', target?: OperationTypeResponse): void {
    this._state.update((prev) => ({
      ...prev,
      activePanel: type,
      editTarget: type === 'edit' ? (target ?? null) : null,
    }));
  }

  /** Close the currently open panel. */
  closePanel(): void {
    this._state.update((prev) => ({ ...prev, activePanel: null, editTarget: null }));
  }

  // ── CRUD operations ──────────────────────────────────────────────────────────

  /** Create an operation type (FR-010, FR-013, FR-026). Returns Observable for component subscribe. */
  createOperationType(req: CreateOperationTypeRequest): Observable<OperationTypeResponse> {
    return this.gateway.createOperationType(req);
  }

  /** Update an operation type (FR-011, FR-014). Returns Observable for component subscribe. */
  updateOperationType(id: string, req: UpdateOperationTypeRequest): Observable<OperationTypeResponse> {
    return this.gateway.updateOperationType(id, req);
  }

  /** Quick status change from row button (FR-012, FR-015). Returns Observable. */
  changeStatus(id: string, req: ChangeOperationTypeStatusRequest): Observable<OperationTypeResponse> {
    return this.gateway.changeStatus(id, req);
  }
}
