import { Injectable, signal } from '@angular/core';
import { ControlOperacionesHttpGateway } from '../adapters/out/http/control-operaciones-http.gateway';
import {
  AgencyOption,
  ControlOperationsFilter,
  ControlOperationsKpisResponse,
  DEFAULT_OPERATIONS_FILTER,
  DEFAULT_PAGINATION,
  OperationRecord,
  OperationsPageResponse,
  OperatorOption,
  PaginationParams,
  SectionState,
} from './ports/control-operaciones-gateway';

@Injectable({ providedIn: 'root' })
export class ControlOperacionesFacade {

  // ── Signals (reactive UI state) ───────────────────────────────────────

  private readonly _kpisState      = signal<SectionState<ControlOperationsKpisResponse>>({ status: 'loading', data: null });
  private readonly _opsState       = signal<SectionState<OperationsPageResponse>>({ status: 'loading', data: null });
  private readonly _agenciesState   = signal<AgencyOption[]>([]);
  private readonly _operatorsState  = signal<OperatorOption[]>([]);
  private readonly _isFiltering = signal<boolean>(false);
  private readonly _isExporting = signal<boolean>(false);
  private readonly _cancellingId     = signal<string | null>(null);
  private readonly _cancelErrorMessage = signal<string | null>(null);

  readonly kpisState          = this._kpisState.asReadonly();
  readonly operationsState    = this._opsState.asReadonly();
  readonly agencies           = this._agenciesState.asReadonly();
  readonly operators          = this._operatorsState.asReadonly();
  readonly isFiltering        = this._isFiltering.asReadonly();
  readonly isExporting        = this._isExporting.asReadonly();
  readonly cancellingId       = this._cancellingId.asReadonly();
  readonly cancelErrorMessage = this._cancelErrorMessage.asReadonly();

  // ── Internal state ────────────────────────────────────────────────────

  private activeFilter: ControlOperationsFilter = { ...DEFAULT_OPERATIONS_FILTER };
  private activePagination: PaginationParams    = { ...DEFAULT_PAGINATION };

  constructor(private readonly gateway: ControlOperacionesHttpGateway) {}

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Called once on component init. Loads today's KPI summary (GET /control-operaciones/kpis).
   * Also triggers the initial table load with default filter.
   */
  loadKpis(): void {
    this._kpisState.set({ status: 'loading', data: null });
    this.gateway.getKpis().subscribe({
      next:  data  => this._kpisState.set({ status: 'content', data }),
      error: err   => this._kpisState.set({ status: 'error', data: null, error: err?.message ?? 'Error' }),
    });
    // Load agencies for the filter dropdown
    this.gateway.getAgencies().subscribe({
      next:  list => this._agenciesState.set(list),
      error: ()   => {},
    });
    // Load operators (system_users with role OPERADOR) for the autocomplete
    this.gateway.getOperators().subscribe({
      next:  list => this._operatorsState.set(list),
      error: ()   => {},
    });
    // Also load initial page of operations
    this.fetchOperations();
  }

  /**
   * Applies the given filter and resets to page 1.
   * Triggered by the "Filtrar" button click.
   */
  applyFilter(filter: ControlOperationsFilter): void {
    this.activeFilter     = { ...filter };
    this.activePagination = { ...DEFAULT_PAGINATION };
    this.fetchOperations();
  }

  /**
   * Resets all filters to defaults and reloads page 1.
   * Triggered by the "Limpiar" button click.
   */
  reset(): void {
    this.activeFilter     = { ...DEFAULT_OPERATIONS_FILTER };
    this.activePagination = { ...DEFAULT_PAGINATION };
    this.fetchOperations();
  }

  /**
   * Navigates to a specific page while keeping the active filter.
   * @param page - 1-based page number
   */
  goToPage(page: number): void {
    this.activePagination = { ...this.activePagination, page };
    this.fetchOperations();
  }

  /**
   * Downloads the currently filtered operations as an Excel XLSX file (GET /control-operaciones/export).
   * The Exportar button is disabled while isExporting is true (FR-052).
   */
  export(): void {
    if (this._isExporting()) return;
    this._isExporting.set(true);
    this.gateway.exportOperations(this.activeFilter).subscribe({
      next: (blob) => {
        this.triggerBlobDownload(blob, 'control-operaciones.xlsx');
        this._isExporting.set(false);
      },
      error: () => this._isExporting.set(false),
    });
  }

  /**
   * Cancels a single operation by ID (PATCH /control-operaciones/{id}/cancel).
   * - Sets cancellingId to the target ID while the request is in flight (FR-052).
   * - On success: transitions the row's estado to CANCELADA in the current page state.
   * - On failure: sets cancelErrorMessage for the toast display (FR-052, Decision 12).
   */
  cancelOperation(id: string): void {
    if (this._cancellingId() === id) return;
    this._cancellingId.set(id);
    this._cancelErrorMessage.set(null);

    this.gateway.cancelOperation(id).subscribe({
      next: () => {
        this._cancellingId.set(null);
        this.updateOperationStatus(id, 'CANCELADA');
      },
      error: () => {
        this._cancellingId.set(null);
        this._cancelErrorMessage.set('No se pudo cancelar la operacion. Intente nuevamente.');
      },
    });
  }

  /**
   * Clears the cancel error message (called after the toast is dismissed).
   */
  clearCancelError(): void {
    this._cancelErrorMessage.set(null);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Fetches the current page of operations and updates the operations signal.
   * Sets isFiltering to true while in-flight (disables the Filtrar button, FR-052).
   */
  private fetchOperations(): void {
    this._isFiltering.set(true);
    this._opsState.set({ status: 'loading', data: null });

    this.gateway.getOperations(this.activeFilter, this.activePagination).subscribe({
      next:  data  => {
        this._opsState.set({ status: 'content', data });
        this._isFiltering.set(false);
      },
      error: err   => {
        this._opsState.set({ status: 'error', data: null, error: err?.message ?? 'Error' });
        this._isFiltering.set(false);
      },
    });
  }

  /**
   * Updates a single operation row's status in the current operations state.
   * Used after a successful cancel to reflect the new status without reloading.
   */
  private updateOperationStatus(id: string, newStatus: OperationRecord['estado']): void {
    const current = this._opsState();
    if (current.status !== 'content' || !current.data) return;

    const updatedItems = current.data.items.map((op) =>
      op.id === id ? { ...op, estado: newStatus } : op
    );

    this._opsState.set({
      ...current,
      data: { ...current.data, items: updatedItems },
    });
  }

  /**
   * Programmatically triggers a browser file download from a Blob response.
   */
  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
