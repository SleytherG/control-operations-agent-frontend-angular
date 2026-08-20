import { Injectable, signal, WritableSignal } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { DashboardHttpGateway } from '../adapters/out/http/dashboard-http.gateway';
import {
  AgentDistributionResponse,
  AgentPanelFilter,
  DashboardEvolutionResponse,
  DashboardFilter,
  DashboardSummaryResponse,
  DEFAULT_AGENT_PANEL_FILTER,
  DEFAULT_FILTER,
  FlowComparisonResponse,
  SectionState,
  TopOperatorsResponse,
} from './ports/dashboard-gateway';

@Injectable({ providedIn: 'root' })
export class DashboardFacade {

  // ── Per-section state signals ─────────────────────────────────────────────

  private readonly _summaryState  = signal<SectionState<DashboardSummaryResponse>>({ status: 'loading', data: null });
  private readonly _evolutionState = signal<SectionState<DashboardEvolutionResponse>>({ status: 'loading', data: null });
  private readonly _agentDistState = signal<SectionState<AgentDistributionResponse>>({ status: 'loading', data: null });
  private readonly _flowState      = signal<SectionState<FlowComparisonResponse>>({ status: 'loading', data: null });
  private readonly _topOpsState    = signal<SectionState<TopOperatorsResponse>>({ status: 'loading', data: null });

  readonly summaryState   = this._summaryState.asReadonly();
  readonly evolutionState = this._evolutionState.asReadonly();
  readonly agentDistState = this._agentDistState.asReadonly();
  readonly flowState      = this._flowState.asReadonly();
  readonly topOpsState    = this._topOpsState.asReadonly();

  // ── Filter streams ────────────────────────────────────────────────────────

  /** Master filter drives summary, flow, top-operators, and (base) agent-distribution. */
  private readonly filter$ = new BehaviorSubject<DashboardFilter>({ ...DEFAULT_FILTER });

  /** Evolution has a separate stream to carry the vol/val mode without triggering other sections. */
  private readonly evolutionFilter$ = new BehaviorSubject<{ filter: DashboardFilter; mode: 'vol' | 'val' }>({
    filter: { ...DEFAULT_FILTER },
    mode: 'vol',
  });

  /** Agent panel filter (Por Región / Por Agente). */
  private readonly agentPanel$ = new BehaviorSubject<{ filter: DashboardFilter; panel: AgentPanelFilter }>({
    filter: { ...DEFAULT_FILTER },
    panel: { ...DEFAULT_AGENT_PANEL_FILTER },
  });

  private readonly subs: Subscription[] = [];

  constructor(private readonly gateway: DashboardHttpGateway) {
    this.subscribeAll();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Applies a partial filter to all 5 sections.
   * Each section independently re-fetches via its own switchMap chain.
   */
  applyFilter(partial: Partial<DashboardFilter>): void {
    const next: DashboardFilter = { ...this.filter$.value, ...partial };
    this.filter$.next(next);
    // Keep evolution and agent panel in sync with the base filter
    this.evolutionFilter$.next({ filter: next, mode: this.evolutionFilter$.value.mode });
    this.agentPanel$.next({ filter: next, panel: this.agentPanel$.value.panel });
  }

  /**
   * Resets all filters to defaults and re-fetches all sections.
   */
  reset(): void {
    const defaults = { ...DEFAULT_FILTER };
    this.filter$.next(defaults);
    this.evolutionFilter$.next({ filter: defaults, mode: 'vol' });
    this.agentPanel$.next({ filter: defaults, panel: { ...DEFAULT_AGENT_PANEL_FILTER } });
  }

  /**
   * Re-fetches only the evolution section with a new vol/val mode.
   * Does NOT affect KPIs, agent distribution, flow, or top-operators (FR-017 carve-out).
   */
  applyEvolutionMode(mode: 'vol' | 'val'): void {
    this.evolutionFilter$.next({ filter: this.filter$.value, mode });
  }

  /**
   * Re-fetches only the agent-distribution section with a panel filter.
   * Combines the current global filter with the panel filter (compound query).
   */
  applyAgentPanelFilter(panel: AgentPanelFilter): void {
    this.agentPanel$.next({ filter: this.filter$.value, panel });
  }

  /**
   * Re-emits the current filter to trigger a full refresh of all 5 sections.
   * Used by the "Actualizar Datos" button.
   */
  reload(): void {
    const f = this.filter$.value;
    this.filter$.next({ ...f });
    this.evolutionFilter$.next({ filter: { ...f }, mode: this.evolutionFilter$.value.mode });
    this.agentPanel$.next({ filter: { ...f }, panel: this.agentPanel$.value.panel });
  }

  // ── Subscriptions (switchMap = AbortController equivalent) ───────────────

  private subscribeAll(): void {

    // Summary — re-fetches on every global filter change
    this.subs.push(
      this.filter$.pipe(
        tap(() => this._summaryState.set({ status: 'loading', data: null })),
        switchMap(f => this.gateway.getSummary(f))
      ).subscribe({
        next:  data => this._summaryState.set({ status: 'content', data }),
        error: err  => this._summaryState.set({ status: 'error',   data: null, error: err?.message ?? 'Error' }),
      })
    );

    // Evolution — re-fetches on filter OR mode change (its own stream)
    this.subs.push(
      this.evolutionFilter$.pipe(
        tap(() => this._evolutionState.set({ status: 'loading', data: null })),
        switchMap(({ filter, mode }) => this.gateway.getEvolution(filter, mode))
      ).subscribe({
        next:  data => this._evolutionState.set({ status: 'content', data }),
        error: err  => this._evolutionState.set({ status: 'error',   data: null, error: err?.message ?? 'Error' }),
      })
    );

    // Agent distribution — panel-aware stream
    this.subs.push(
      this.agentPanel$.pipe(
        tap(() => this._agentDistState.set({ status: 'loading', data: null })),
        switchMap(({ filter, panel }) => this.gateway.getAgentDistribution(filter, panel))
      ).subscribe({
        next:  data => this._agentDistState.set({ status: 'content', data }),
        error: err  => this._agentDistState.set({ status: 'error',   data: null, error: err?.message ?? 'Error' }),
      })
    );

    // Flow comparison
    this.subs.push(
      this.filter$.pipe(
        tap(() => this._flowState.set({ status: 'loading', data: null })),
        switchMap(f => this.gateway.getFlowComparison(f))
      ).subscribe({
        next:  data => this._flowState.set({ status: 'content', data }),
        error: err  => this._flowState.set({ status: 'error',   data: null, error: err?.message ?? 'Error' }),
      })
    );

    // Top operators
    this.subs.push(
      this.filter$.pipe(
        tap(() => this._topOpsState.set({ status: 'loading', data: null })),
        switchMap(f => this.gateway.getTopOperators(f))
      ).subscribe({
        next:  data => this._topOpsState.set({ status: 'content', data }),
        error: err  => this._topOpsState.set({ status: 'error',   data: null, error: err?.message ?? 'Error' }),
      })
    );
  }
}
