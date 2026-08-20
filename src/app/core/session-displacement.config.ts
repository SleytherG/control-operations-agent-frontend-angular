import { InjectionToken } from '@angular/core';

/**
 * Injection token for the session displacement countdown duration in seconds.
 *
 * Default: 8 seconds (FR-006 — configurable without code changes).
 * Override in app.config.ts providers to change the value.
 */
export const SESSION_DISPLACEMENT_COUNTDOWN_SECONDS =
  new InjectionToken<number>('SESSION_DISPLACEMENT_COUNTDOWN_SECONDS', {
    providedIn: 'root',
    factory: () => 8,
  });
