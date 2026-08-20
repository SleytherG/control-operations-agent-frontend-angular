import { Injectable } from '@angular/core';
import { PendingConfirmationStore } from '../../../application/ports/pending-confirmation-store';
import { PendingConfirmation, isPendingConfirmation } from '../../../domain/operation';

const CURRENT_VERSION = 1;

/**
 * localStorage-backed implementation of {@link PendingConfirmationStore}.
 *
 * Versioned snapshot: only version 1 is accepted.
 * All read failures return null rather than throwing.
 * Write and remove failures propagate as thrown errors so the facade can block POST.
 */
@Injectable({ providedIn: 'root' })
export class BrowserPendingConfirmationStore implements PendingConfirmationStore {

  static readonly STORAGE_KEY = 'pending-confirmation-v1';

  save(snapshot: PendingConfirmation): void {
    // Throws on quota or security error — caller must handle
    localStorage.setItem(
      BrowserPendingConfirmationStore.STORAGE_KEY,
      JSON.stringify(snapshot)
    );

    // Read back to verify write was successful
    const readBack = this.load();
    if (!readBack || readBack.idempotencyKey !== snapshot.idempotencyKey) {
      throw new Error('Pending confirmation write could not be verified');
    }
  }

  load(): PendingConfirmation | null {
    try {
      const raw = localStorage.getItem(BrowserPendingConfirmationStore.STORAGE_KEY);
      if (!raw) return null;

      const parsed: unknown = JSON.parse(raw);

      // Validate schema version
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (parsed as Record<string, unknown>)['version'] !== CURRENT_VERSION
      ) {
        return null;
      }

      // Full runtime validation
      if (!isPendingConfirmation(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  remove(): void {
    // Throws on security error — caller must handle cleanup failure
    localStorage.removeItem(BrowserPendingConfirmationStore.STORAGE_KEY);
  }
}
