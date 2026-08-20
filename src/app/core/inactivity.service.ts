import { Injectable, OnDestroy } from '@angular/core';
import { Subject, fromEvent, merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AUTH_USER_KEY } from '../auth/application/ports/auth-gateway';

/**
 * InactivityService — monitors user idle time and emits a sessionExpiring$ event
 * when the inactivity threshold is reached (JWT expiry minus 5 minutes).
 *
 * The threshold is derived from the JWT's `exp` claim (stored in localStorage)
 * to coordinate with the server-side token expiry (Research Decision 8).
 *
 * Usage:
 *   - Subscribe to `sessionExpiring$` in SessionExpiryModalComponent
 *   - Call `resetTimer()` after "Continuar sesión" is clicked
 *   - Call `stop()` on logout to prevent false positives
 */
@Injectable({ providedIn: 'root' })
export class InactivityService implements OnDestroy {
  /** Emits when the inactivity warning threshold is reached */
  readonly sessionExpiring$ = new Subject<void>();

  private lastInteractionTimestamp = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly destroy$ = new Subject<void>();

  /** Safety margin: show warning this many ms before JWT expires */
  private static readonly SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
  /** Default warning threshold if no JWT exp is available */
  private static readonly DEFAULT_THRESHOLD_MS = 25 * 60 * 1000; // 25 minutes
  /** Polling interval for idle check */
  private static readonly POLL_INTERVAL_MS = 10_000; // 10 seconds

  constructor() {
    this.listenToUserActivity();
  }

  /** Start monitoring inactivity. Call after successful login. */
  start(): void {
    this.lastInteractionTimestamp = Date.now();
    if (this.intervalId) return; // already running
    this.intervalId = setInterval(() => this.checkIdle(), InactivityService.POLL_INTERVAL_MS);
  }

  /** Stop monitoring. Call on logout or when session expires. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Reset the idle timer. Call after "Continuar sesión" or on activity during warning. */
  resetTimer(): void {
    this.lastInteractionTimestamp = Date.now();
  }

  ngOnDestroy(): void {
    this.stop();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private listenToUserActivity(): void {
    merge(
      fromEvent(document, 'mousemove'),
      fromEvent(document, 'keydown'),
      fromEvent(document, 'click'),
      fromEvent(document, 'scroll'),
      fromEvent(document, 'touchstart'),
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.lastInteractionTimestamp = Date.now();
      });
  }

  private checkIdle(): void {
    const threshold = this.computeWarningThresholdMs();
    const idleMs = Date.now() - this.lastInteractionTimestamp;
    if (idleMs >= threshold) {
      this.stop(); // stop polling — modal takes over
      this.sessionExpiring$.next();
    }
  }

  /**
   * Compute the warning threshold from the JWT exp claim.
   * If JWT is missing or malformed, falls back to DEFAULT_THRESHOLD_MS.
   * Warning fires at: (jwtExpiry - now) - SAFETY_MARGIN_MS
   */
  private computeWarningThresholdMs(): number {
    try {
      const userJson = localStorage.getItem(AUTH_USER_KEY);
      if (!userJson) return InactivityService.DEFAULT_THRESHOLD_MS;
      const user = JSON.parse(userJson) as { expiresAt: number };
      const msUntilExpiry = user.expiresAt * 1000 - Date.now();
      const threshold = msUntilExpiry - InactivityService.SAFETY_MARGIN_MS;
      return Math.max(threshold, 60_000); // minimum 1 minute
    } catch {
      return InactivityService.DEFAULT_THRESHOLD_MS;
    }
  }
}
