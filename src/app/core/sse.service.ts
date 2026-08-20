import { Injectable } from '@angular/core';

/**
 * SseService manages the lifecycle of the Server-Sent Events connection
 * used to receive real-time session displacement notifications (spec 017, FR-001).
 *
 * Responsibilities:
 * - Open an EventSource connection after successful login (connect).
 * - Listen for the 'session_revoked' named event and notify AuthFacade.
 * - Close the connection on logout or session invalidation (disconnect).
 *
 * Design decisions (Research Decisions 2, 8):
 * - JWT is passed as a query parameter (?token=...) because the native
 *   EventSource API does not support custom request headers.
 * - onopen and onerror handlers are intentional no-ops: only the named
 *   'session_revoked' event triggers the displacement modal (FR-011).
 * - No application-level reconnect limit: EventSource reconnects natively.
 */
@Injectable({ providedIn: 'root' })
export class SseService {
  private eventSource: EventSource | null = null;

  /**
   * Open the SSE connection for the authenticated session.
   * Registers the 'session_revoked' event listener that calls the provided callback.
   *
   * @param token            the JWT bearer token for the current session
   * @param onSessionRevoked callback invoked when a session_revoked event is received
   */
  connect(token: string, onSessionRevoked: () => void): void {
    if (this.eventSource) {
      // Already connected — disconnect previous connection first
      this.disconnect();
    }

    const url = `/api/v1/notifications/sse?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);

    // Only the named 'session_revoked' event triggers the displacement modal (FR-011).
    // The onopen callback fires on initial connect AND on every automatic reconnect,
    // so it MUST NOT trigger the modal.
    this.eventSource.addEventListener('session_revoked', () => {
      onSessionRevoked();
    });

    // onopen: no-op — connect/reconnect must not trigger the modal (FR-011)
    this.eventSource.onopen = () => { /* intentional no-op */ };

    // onerror: no-op — transient errors trigger EventSource's built-in reconnect;
    // the displacement check falls back to the per-request JWT filter (FR-013)
    this.eventSource.onerror = () => { /* intentional no-op */ };
  }

  /**
   * Close the SSE connection and release the reference.
   * Called on explicit logout or session invalidation (FR-012).
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
