import { Injectable, Inject, Signal, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OPERATIONS_GATEWAY, OperationsGateway } from './ports/operations-gateway';
import { OperationResponse } from '../domain/operation';

export interface ChartsState {
  status: 'loading' | 'content' | 'error';
  operations: OperationResponse[];
  errorMessage?: string;
}

/**
 * Application-layer facade for the Operations Charts Dashboard.
 * Loads ACTIVE operations from the gateway for a given date range and exposes
 * them as a readonly signal for the ChartsPageComponent.
 *
 * Deliberately separate from OperationsFacade to avoid coupling the
 * charts page to the registration state machine (pending-review,
 * submitting, cross-tab coordination).
 *
 * loadWithFilter() triggers a new backend request each time it is called,
 * passing the date range as query parameters so the server — not the browser —
 * performs the filtering.  reload() re-issues the last filter that was applied.
 */
@Injectable({ providedIn: 'root' })
export class ChartsFacade {
  private readonly _state = signal<ChartsState>({
    status: 'loading',
    operations: [],
  });

  readonly state: Signal<ChartsState> = this._state.asReadonly();

  /** Last date params used — stored so reload() can repeat the same request. */
  private lastFrom: string | undefined;
  private lastTo: string | undefined;

  constructor(
    @Inject(OPERATIONS_GATEWAY) private readonly gateway: OperationsGateway,
  ) {
    // Do NOT auto-load here: ChartsPageComponent drives the initial load via
    // loadWithFilter() so the correct default date range is applied from the start.
  }

  /**
   * Fetch operations filtered by Lima-local date range and update state.
   * Either or both params may be omitted for open-ended ranges.
   * Each call triggers a real HTTP request — no client-side caching.
   */
  loadWithFilter(from?: string, to?: string): void {
    this.lastFrom = from;
    this.lastTo = to;
    this.load(from, to);
  }

  /**
   * Clears the operations state to an empty content state without making any
   * backend request. Called by ChartsPageComponent.onClear() so the charts
   * are immediately cleared and the empty state is displayed. The stored
   * lastFrom/lastTo are also cleared so a subsequent reload() would fetch
   * all operations rather than repeating a stale filter.
   */
  reset(): void {
    this.lastFrom = undefined;
    this.lastTo = undefined;
    this._state.set({ status: 'content', operations: [] });
  }

  /**
   * Re-fetches with the same filter that was last applied via loadWithFilter().
   * Does NOT reset the DateRangeFilter owned by ChartsPageComponent.
   */
  reload(): void {
    this.load(this.lastFrom, this.lastTo);
  }

  private load(from?: string, to?: string): void {
    this._state.update(s => ({ ...s, status: 'loading', errorMessage: undefined }));
    firstValueFrom(this.gateway.list(from, to))
      .then(operations => {
        this._state.set({
          status: 'content',
          // Also exclude CANCELLED locally as a safety net
          // (the backend already filters ACTIVE when date params are present)
          operations: operations.filter(op => op.status === 'ACTIVE'),
        });
      })
      .catch(() => {
        this._state.set({
          status: 'error',
          operations: [],
          errorMessage: 'No se pudo cargar los datos. Intente nuevamente.',
        });
      });
  }
}
