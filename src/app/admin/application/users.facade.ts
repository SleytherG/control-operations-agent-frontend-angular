import { Injectable, signal, computed } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  ChangeUserStatusRequest,
  CreateUserRequest,
  ListUsersParams,
  UserAutocompleteItem,
  UserPageResponse,
  UserResponse,
  UserStatus,
  UpdateUserRequest,
} from './ports/users-gateway';
import { UsersHttpGateway } from '../adapters/out/http/users-http.gateway';

// ── State shapes ──────────────────────────────────────────────────────────────

export type UsersLoadStatus = 'loading' | 'content' | 'error';
export type ActivePanel = 'add' | 'edit' | 'detail' | null;

export interface UserFilters {
  q: string | null;
  agentId: string | null;
  status: UserStatus | null;
}

/** Primary list state. */
export interface UsersState {
  status: UsersLoadStatus;
  operators: UserResponse[];  // kept as 'operators' for template compatibility
  totalElements: number;
  currentPage: number;
  /** Default 10 per page. */
  pageSize: number;
  filters: UserFilters;
  /** All three panels are mutually exclusive. */
  activePanel: ActivePanel;
  error: string | null;
}

/** Autocomplete suggestion state — separate lifecycle from the main list. */
export interface AutocompleteState {
  loading: boolean;
  results: UserAutocompleteItem[];
}

// ── Facade ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UsersFacade {

  // ── Signals ─────────────────────────────────────────────────────────────────

  private readonly _state = signal<UsersState>({
    status: 'loading',
    operators: [],
    totalElements: 0,
    currentPage: 1,
    pageSize: 10,
    filters: { q: null, agentId: null, status: null },
    activePanel: null,
    error: null,
  });

  readonly state = this._state.asReadonly();

  /** Computed total pages derived from totalElements and pageSize. */
  readonly totalPages = computed(() =>
    Math.ceil(this._state().totalElements / this._state().pageSize) || 1,
  );

  private readonly _autocomplete = signal<AutocompleteState>({
    loading: false,
    results: [],
  });
  readonly autocomplete = this._autocomplete.asReadonly();

  // ── Autocomplete debounce subject ────────────────────────────────────────────

  private readonly autocompleteInput$ = new Subject<string>();

  constructor(private readonly gateway: UsersHttpGateway) {
    // Wire up the 300ms debounce + switchMap pipeline
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

    // Load users on construction
    this.load();
  }

  // ── List management ──────────────────────────────────────────────────────────

  /** Fetch users with current filters and page. */
  load(): void {
    const s = this._state();
    this._state.update((prev) => ({ ...prev, status: 'loading', error: null }));
    const params: ListUsersParams = {
      page: s.currentPage,
      size: s.pageSize,
      q: s.filters.q ?? undefined,
      agentId: s.filters.agentId ?? undefined,
      status: s.filters.status ?? undefined,
    };
    firstValueFrom(this.gateway.listUsers(params)).then(
      (res: UserPageResponse) =>
        this._state.update((prev) => ({
          ...prev,
          status: 'content',
          operators: res.content,
          totalElements: res.totalElements,
          error: null,
        })),
      (err: unknown) =>
        this._state.update((prev) => ({
          ...prev,
          status: 'error',
          operators: [],
          error: (err as Error)?.message ?? 'Error cargando usuarios',
        })),
    );
  }

  /** Retry the last failed list request. */
  reload(): void {
    this.load();
  }

  /** Apply a partial filter update, reset page to 1, and reload. */
  applyFilters(partial: Partial<UserFilters>): void {
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

  /** Push a keystroke into the debounced autocomplete pipeline. */
  searchAutocomplete(q: string): void {
    this.autocompleteInput$.next(q);
  }

  /** Clear autocomplete suggestions. */
  clearAutocomplete(): void {
    this._autocomplete.set({ loading: false, results: [] });
  }

  // ── Panel management ──────────────────────────────────────────────────────────

  /** Open a panel, closing any currently open panel first. */
  openPanel(type: 'add' | 'edit' | 'detail'): void {
    this._state.update((prev) => ({ ...prev, activePanel: type }));
  }

  /** Close the currently open panel. */
  closePanel(): void {
    this._state.update((prev) => ({ ...prev, activePanel: null }));
  }

  // ── CRUD operations ──────────────────────────────────────────────────────────

  /** Create a user. Returns Observable for component subscribe. */
  createOperator(req: CreateUserRequest): Observable<UserResponse> {
    return this.gateway.createUser(req);
  }

  /** Update a user. Returns Observable for component subscribe. */
  updateOperator(id: string, req: UpdateUserRequest): Observable<UserResponse> {
    return this.gateway.updateUser(id, req);
  }

  /** Quick status change from row button. Returns Observable. */
  changeStatus(id: string, req: ChangeUserStatusRequest): Observable<UserResponse> {
    return this.gateway.changeStatus(id, req);
  }

  /** Fetch full user details for the read-only detail panel. */
  getOperator(id: string): Observable<UserResponse> {
    return this.gateway.getUser(id);
  }
}
