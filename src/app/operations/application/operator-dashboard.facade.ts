import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AUTH_TOKEN_KEY } from '../../auth/application/ports/auth-gateway';
import { OperatorDashboardHttpGateway } from '../adapters/out/http/operator-dashboard-http.gateway';
import {
  OperatorHourlyVolumeResponse,
  OperatorRecentOperationsResponse,
  OperatorSummaryResponse,
  OperatorTypeDistributionResponse,
  SectionState,
} from './ports/operator-dashboard-gateway';

/**
 * Facade for the Operator Dashboard (spec 013).
 *
 * <p>Holds 4 independent section signals — each section loads in parallel
 * and handles its own error state (D-05, D-11). A failure in one section
 * does NOT affect the others (FR-016).
 *
 * <p>The {@code greeting} computed signal resolves the time-of-day greeting
 * in Spanish using the operator's display name from the JWT (D-08, FR-003).
 */
@Injectable({ providedIn: 'root' })
export class OperatorDashboardFacade {

  private readonly gateway = inject(OperatorDashboardHttpGateway);

  // ── Display name — read fresh from JWT on each load() call ───────────────
  private readonly _displayName = signal<string>('');

  // ── Per-section state signals ─────────────────────────────────────────────

  readonly summaryState      = signal<SectionState<OperatorSummaryResponse>>(
      { status: 'loading', data: null });
  readonly hourlyState       = signal<SectionState<OperatorHourlyVolumeResponse>>(
      { status: 'loading', data: null });
  readonly distributionState = signal<SectionState<OperatorTypeDistributionResponse>>(
      { status: 'loading', data: null });
  readonly recentState       = signal<SectionState<OperatorRecentOperationsResponse>>(
      { status: 'loading', data: null });

  // ── Greeting (US1, FR-003, D-08) ─────────────────────────────────────────

  /**
   * Time-of-day greeting in Spanish with operator's first name.
   * Greeting text varies: 00:00–11:59 → "Buenos días", 12:00–17:59 → "Buenas tardes",
   * 18:00–23:59 → "Buenas noches".
   * Display name is read fresh from the JWT in load() to avoid stale cached values
   * when the user switches between sessions (A-02 / C3 remediation).
   */
  readonly greeting = computed<string>(() => {
    const fullName = this._displayName() || 'Operador';
    // Show only the first name in the greeting to keep it concise
    const name = fullName.split(' ')[0] || 'Operador';
    const hour = new Date().getHours();
    let prefix: string;
    if (hour < 12)      prefix = 'Buenos días';
    else if (hour < 18) prefix = 'Buenas tardes';
    else                prefix = 'Buenas noches';
    return `${prefix}, ${name}.`;
  });

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fires all 4 HTTP calls in parallel. Each call independently updates
   * its signal on success or sets an error state on failure (D-11).
   */
  load(): void {
    // Read displayName fresh from the current JWT — avoids the stale singleton cache
    // when the user switched from a different session (admin → operador).
    try {
      const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem(AUTH_TOKEN_KEY)
          : null;
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this._displayName.set(payload.displayName ?? '');
      }
    } catch {
      // Malformed JWT — leave displayName empty, greeting will show fallback 'Operador'
    }

    this.summaryState.set({ status: 'loading', data: null });
    this.hourlyState.set({ status: 'loading', data: null });
    this.distributionState.set({ status: 'loading', data: null });
    this.recentState.set({ status: 'loading', data: null });

    // Summary
    firstValueFrom(this.gateway.getSummary())
        .then(data => this.summaryState.set({ status: 'content', data }))
        .catch(err  => this.summaryState.set({
          status: 'error', data: null,
          error: err?.message ?? 'Error loading summary',
        }));

    // Hourly volume
    firstValueFrom(this.gateway.getHourlyVolume())
        .then(data => this.hourlyState.set({ status: 'content', data }))
        .catch(err  => this.hourlyState.set({
          status: 'error', data: null,
          error: err?.message ?? 'Error loading hourly volume',
        }));

    // Type distribution
    firstValueFrom(this.gateway.getTypeDistribution())
        .then(data => this.distributionState.set({ status: 'content', data }))
        .catch(err  => this.distributionState.set({
          status: 'error', data: null,
          error: err?.message ?? 'Error loading type distribution',
        }));

    // Recent operations
    firstValueFrom(this.gateway.getRecentOperations())
        .then(data => this.recentState.set({ status: 'content', data }))
        .catch(err  => this.recentState.set({
          status: 'error', data: null,
          error: err?.message ?? 'Error loading recent operations',
        }));
  }
}
