import { Injectable, computed, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  AuditExportParams,
  AuditSessionStatus,
  AuditUserRole,
  ListAuditParams,
  SessionAuditRecordResponse,
} from './ports/audit-gateway';
import { AuditHttpGateway } from '../adapters/out/http/audit-http.gateway';

// ── State shapes ──────────────────────────────────────────────────────────────

export type AuditLoadStatus = 'loading' | 'content' | 'error';

/**
 * Applied and draft filter state.
 * draft: reflects current UI control values (not yet sent to backend).
 * applied: the last filter set actually submitted via applyFilters() or clearFilters().
 */
export interface AuditFilters {
  dateFrom: string;   // ISO yyyy-MM-dd; defaults to first day of current month
  dateTo: string;     // ISO yyyy-MM-dd; defaults to last day of current month
  role: AuditUserRole | null;
  status: AuditSessionStatus | null;
  device: string | null;
}

export interface AuditState {
  status: AuditLoadStatus;
  items: SessionAuditRecordResponse[];
  totalElements: number;
  currentPage: number;
  pageSize: number;          // Fixed at 8 (FR-021)
  filters: AuditFilters;     // Last APPLIED filters (drive the backend call)
  draftFilters: AuditFilters; // Current UI control values, not yet applied
  deviceOptions: string[];
  error: string | null;
  exporting: boolean;
  exportTruncated: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonthFilters(): AuditFilters {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${year}-${month}-01`,
    dateTo:   `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    role: null,
    status: null,
    device: null,
  };
}

function filtersToParams(filters: AuditFilters, page: number, size: number): ListAuditParams {
  return {
    dateFrom: filters.dateFrom || undefined,
    dateTo:   filters.dateTo   || undefined,
    role:     filters.role     || undefined,
    status:   filters.status   || undefined,
    device:   filters.device   || undefined,
    page,
    size,
  };
}

// ── Facade ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AuditFacade {

  private static readonly PAGE_SIZE = 8; // FR-021

  // ── Signals ─────────────────────────────────────────────────────────────────

  private readonly _state = signal<AuditState>({
    status: 'loading',
    items: [],
    totalElements: 0,
    currentPage: 1,
    pageSize: AuditFacade.PAGE_SIZE,
    filters: currentMonthFilters(),
    draftFilters: currentMonthFilters(),
    deviceOptions: [],
    error: null,
    exporting: false,
    exportTruncated: false,
  });

  readonly state = this._state.asReadonly();

  /** Computed total pages derived from backend totalElements. */
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this._state().totalElements / AuditFacade.PAGE_SIZE))
  );

  // ── Request pipeline (research.md Decision 7: switchMap for cancellation) ────

  private readonly loadTrigger$ = new Subject<ListAuditParams>();

  constructor(private readonly gateway: AuditHttpGateway) {
    // Wire the switchMap pipeline: new load requests cancel pending ones
    this.loadTrigger$
      .pipe(switchMap((params) => this.gateway.listSessions(params)))
      .subscribe({
        next: (res) =>
          this._state.update((s) => ({
            ...s,
            status: 'content',
            items: res.content,
            totalElements: res.totalElements,
            error: null,
          })),
        error: (err) =>
          this._state.update((s) => ({
            ...s,
            status: 'error',
            items: [],
            error: (err as Error)?.message ?? 'Error cargando registros de auditoría',
          })),
      });

    // Load device options once on construction (US5 / T032)
    firstValueFrom(this.gateway.listDeviceOptions()).then(
      (opts) => this._state.update((s) => ({ ...s, deviceOptions: opts })),
      () => { /* device options load failure is non-blocking */ }
    );

    // Initial load with current month default (spec Clarifications Q3)
    this.load();
  }

  // ── Load (triggered by pipeline) ─────────────────────────────────────────────

  /** Emit a new list request into the switchMap pipeline. */
  load(): void {
    const s = this._state();
    this._state.update((prev) => ({ ...prev, status: 'loading', error: null }));
    this.loadTrigger$.next(filtersToParams(s.filters, s.currentPage, s.pageSize));
  }

  /**
   * Retry the last failed request with the same page/filters (FR-020).
   * Identical to load() — preserved as a named method for template clarity.
   */
  retry(): void {
    this.load();
  }

  // ── Draft filter management (US2–US5) ────────────────────────────────────────

  /**
   * Update draft filter values without triggering a backend request (FR-007).
   * Call this from filter control (change) events.
   */
  updateDraftFilter(partial: Partial<AuditFilters>): void {
    this._state.update((s) => ({
      ...s,
      draftFilters: { ...s.draftFilters, ...partial },
    }));
  }

  /**
   * Apply a single filter value immediately — no button required.
   * Homologated with the users-page / operation-types-page pattern where
   * each dropdown change auto-applies without an "Aplicar Filtros" button.
   * Resets to page 1 and triggers a backend reload (FR-010).
   */
  applyFilter(partial: Partial<AuditFilters>): void {
    this._state.update((s) => ({
      ...s,
      filters: { ...s.filters, ...partial },
      draftFilters: { ...s.draftFilters, ...partial },
      currentPage: 1,
    }));
    this.load();
  }

  /**
   * Commit draft filters → applied filters, reset to page 1, reload (FR-008, FR-010).
   * Kept for programmatic use; UI now uses applyFilter() per control.
   */
  applyFilters(): void {
    this._state.update((s) => ({
      ...s,
      filters: { ...s.draftFilters },
      currentPage: 1,
    }));
    this.load();
  }

  /**
   * Reset all filters to defaults and reload immediately — no Aplicar Filtros required (FR-009).
   */
  clearFilters(): void {
    const defaults = currentMonthFilters();
    this._state.update((s) => ({
      ...s,
      filters: defaults,
      draftFilters: defaults,
      currentPage: 1,
    }));
    this.load();
  }

  // ── Pagination (US8) ──────────────────────────────────────────────────────────

  /**
   * Navigate to a specific page while preserving active filters (FR-008 scenario 3).
   */
  goToPage(page: number): void {
    this._state.update((s) => ({ ...s, currentPage: page }));
    this.load();
  }

  // ── CSV Export (US9) ──────────────────────────────────────────────────────────

  /**
   * Trigger a CSV download using the currently applied filters (FR-018, FR-019).
   * Disables the button during the request and surfaces the partial-export warning
   * when X-Export-Truncated is true.
   */
  exportCsv(): void {
    const filters = this._state().filters;
    this._state.update((s) => ({ ...s, exporting: true, exportTruncated: false }));

    const params: AuditExportParams = {
      dateFrom: filters.dateFrom || undefined,
      dateTo:   filters.dateTo   || undefined,
      role:     filters.role     || undefined,
      status:   filters.status   || undefined,
      device:   filters.device   || undefined,
    };

    firstValueFrom(this.gateway.exportCsv(params)).then(
      ({ blob, truncated }) => {
        // Trigger browser download (no library — FR constraint)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `auditoria-sesiones-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this._state.update((s) => ({ ...s, exporting: false, exportTruncated: truncated }));
      },
      (err: unknown) => {
        this._state.update((s) => ({
          ...s,
          exporting: false,
          error: (err as Error)?.message ?? 'Error al exportar CSV',
        }));
      }
    );
  }
}
