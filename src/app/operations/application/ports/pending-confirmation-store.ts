import { InjectionToken } from '@angular/core';
import { PendingConfirmation } from '../../domain/operation';

/**
 * Output port for persisting and retrieving the pending confirmation snapshot.
 * Implementations use browser localStorage with schema versioning and validation.
 */
export interface PendingConfirmationStore {
  /**
   * Persist the pending confirmation before POST.
   * @throws if storage is unavailable (e.g. QuotaExceededError, SecurityError)
   */
  save(snapshot: PendingConfirmation): void;

  /**
   * Load and validate the pending confirmation snapshot.
   * Returns null if nothing is stored, the stored JSON is malformed, the schema
   * version is unsupported, or required fields are missing.
   * Never throws — storage errors return null.
   */
  load(): PendingConfirmation | null;

  /**
   * Remove the pending confirmation after successful registration or explicit discard.
   * @throws if storage removal fails (caller must handle cleanup failure)
   */
  remove(): void;
}

export const PENDING_CONFIRMATION_STORE = new InjectionToken<PendingConfirmationStore>(
  'PendingConfirmationStore'
);
