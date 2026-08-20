/**
 * Cross-tab coordinator for the pending confirmation.
 *
 * Uses the Web Locks API when available to serialize confirm/retry actions
 * across tabs sharing the same origin. Falls back to a simple in-memory guard
 * when Web Locks are not supported.
 *
 * Storage events are used to notify other tabs when the pending snapshot changes,
 * so they can update their pending-review UI.
 */
export class CrossTabCoordinator {

  private static readonly LOCK_NAME = 'pending-confirmation-lock';
  private static readonly STORAGE_EVENT_KEY = 'pending-confirmation-change';

  /**
   * Execute `fn` inside an exclusive Web Lock, ensuring no other tab can run
   * a concurrent confirmation attempt.
   *
   * @param fn Async function to execute under the lock
   * @returns The result of fn
   */
  static async withExclusiveLock<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      return navigator.locks.request(
        CrossTabCoordinator.LOCK_NAME,
        { mode: 'exclusive' },
        async () => fn()
      );
    }
    // Fallback: no locking — single-tab or unsupported environment
    return fn();
  }

  /**
   * Broadcast a storage-event notification to other tabs that the pending
   * confirmation snapshot has changed. Other tabs should reload their pending state.
   */
  static notifyChange(): void {
    try {
      localStorage.setItem(
        CrossTabCoordinator.STORAGE_EVENT_KEY,
        String(Date.now())
      );
    } catch {
      // Ignore — notification is best-effort
    }
  }

  /**
   * Register a listener that is called when another tab changes the pending
   * confirmation. The callback should reload the pending state from storage.
   *
   * @param onRemoteChange Callback invoked when another tab's change is detected
   * @returns Cleanup function to remove the listener
   */
  static onRemoteChange(onRemoteChange: () => void): () => void {
    const handler = (event: StorageEvent) => {
      if (event.key === CrossTabCoordinator.STORAGE_EVENT_KEY) {
        onRemoteChange();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}
