import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AuthErrorType,
  AuthState,
  AuthUser,
  ChangePasswordError,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
} from './ports/auth-gateway';
import { AuthHttpGateway } from '../adapters/out/http/auth-http.gateway';
import { InactivityService } from '../../core/inactivity.service';
import { SseService } from '../../core/sse.service';

const INITIAL_STATE: AuthState = {
  status: 'idle',
  user: null,
  errorType: null,
  recoveryStatus: 'idle',
  resetStatus: 'idle',
  mustChangePassword: false,
  changePasswordStatus: 'idle',
  changePasswordError: null,
};

/**
 * AuthFacade centralizes all authentication state using Angular Signals.
 * It mediates between UI components and the AuthHttpGateway.
 *
 * On application startup, it reads the JWT from localStorage and restores
 * session state if the token is still valid.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly _state = signal<AuthState>(INITIAL_STATE);

  /** Public read-only state signal */
  readonly state = this._state.asReadonly();

  /** Convenience computed signals */
  readonly isAuthenticated = computed(() => this._state().status === 'authenticated');
  readonly currentUser = computed(() => this._state().user);

  /**
   * Set to 'session_revoked' when the backend returns SESSION_REVOKED (FR-028).
   * Displayed as a banner on the login page after redirection.
   * Cleared when the user dismisses it or re-authenticates.
   */
  readonly sessionRevokedReason = signal<'session_revoked' | null>(null);

  /**
   * True when a session_revoked SSE event has been received and not yet dismissed.
   * Drives the displacement modal display in AppComponent (spec 017, FR-004).
   * Double-push guard: notifySessionDisplaced() is idempotent — no-op if already true.
   */
  private readonly _sessionDisplaced = signal<boolean>(false);
  readonly isSessionDisplaced = this._sessionDisplaced.asReadonly();

  constructor(
    private readonly gateway: AuthHttpGateway,
    private readonly router: Router,
    private readonly inactivity: InactivityService,
    private readonly sseService: SseService,
  ) {
    this.restoreSession();
  }

  // ─── Login ───────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<void> {
    this._state.update(s => ({ ...s, status: 'loading', errorType: null }));
    try {
      const response = await firstValueFrom(
        this.gateway.login({ email, password }),
      );

      // Parse JWT to get exp claim
      const payload = this.parseJwtPayload(response.token);
      const user: AuthUser = {
        email: payload['sub'] as string,
        displayName: response.displayName,
        role: response.role,
        expiresAt: payload['exp'] as number,
      };

      // Store JWT and user profile in localStorage
      localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));

      // Persist mustChangePassword flag so restoreSession() can restore the modal
      // state if the browser is closed and reopened within the JWT validity window (FR-016)
      if (response.mustChangePassword) {
        localStorage.setItem('must_change_password', 'true');
      } else {
        localStorage.removeItem('must_change_password');
      }

      this._state.update(s => ({
        ...s,
        status: 'authenticated',
        user,
        errorType: null,
        mustChangePassword: response.mustChangePassword,
      }));

      // Start inactivity monitoring — must be called after successful login
      this.inactivity.start();

      // Open SSE connection for real-time session displacement notifications (spec 017, FR-001)
      this.sseService.connect(response.token, () => this.notifySessionDisplaced());

      // Navigate only if no mandatory password change is required (FR-001)
      if (!response.mustChangePassword) {
        const destination =
          response.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
        this.router.navigate([destination]);
      }
      // If mustChangePassword = true, the modal will appear via AppComponent binding
    } catch (error) {
      const errorType = this.mapHttpError(error as HttpErrorResponse);
      this._state.update(s => ({ ...s, status: 'error', errorType }));
    }
  }

  // ─── First-Login Password Change ─────────────────────────────────────────

  /**
   * Calls POST /api/v1/auth/cambiar-contrasena-primer-inicio.
   * On success: clears mustChangePassword flag and navigates to dashboard.
   * On error: maps backend error code to ChangePasswordError type (FR-011).
   */
  async changeFirstLoginPassword(
    temporaryPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    this._state.update(s => ({
      ...s,
      changePasswordStatus: 'submitting',
      changePasswordError: null,
    }));
    try {
      await firstValueFrom(
        this.gateway.changeFirstLoginPassword({
          temporaryPassword,
          newPassword,
          confirmPassword,
        }),
      );

      // Success: clear flag from both state and localStorage (FR-009, FR-016)
      localStorage.removeItem('must_change_password');
      const role = this._state().user?.role;
      this._state.update(s => ({
        ...s,
        mustChangePassword: false,
        changePasswordStatus: 'success',
        changePasswordError: null,
      }));
      const destination = role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
      this.router.navigate([destination]);
    } catch (error) {
      const httpError = error as HttpErrorResponse;
      const errorCode = httpError.error?.errorCode as string | undefined;
      const changePasswordError: ChangePasswordError =
        errorCode === 'INVALID_TEMP_PASSWORD' ? 'invalidTempPassword'
        : errorCode === 'WEAK_PASSWORD'       ? 'weakPassword'
        : errorCode === 'SAME_AS_TEMPORARY'   ? 'sameAsTemporary'
        : 'network';
      this._state.update(s => ({
        ...s,
        changePasswordStatus: 'error',
        changePasswordError,
      }));
    }
  }

  // ─── Logout ──────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    // Disconnect SSE before HTTP logout so the server can clean up the emitter (FR-012)
    this.sseService.disconnect();
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      try {
        await firstValueFrom(this.gateway.logout(token));
      } catch {
        // Ignore logout errors — clear local state regardless
      }
    }
    this.clearSession();
  }

  // ─── Session Refresh ─────────────────────────────────────────────────────

  async refreshSession(): Promise<void> {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    try {
      const response = await firstValueFrom(this.gateway.refresh(token));
      const payload = this.parseJwtPayload(response.token);
      const currentUser = this._state().user;
      if (currentUser) {
        const updatedUser: AuthUser = {
          ...currentUser,
          expiresAt: payload['exp'] as number,
        };
        localStorage.setItem(AUTH_TOKEN_KEY, response.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
        this._state.update(s => ({ ...s, user: updatedUser }));
        // T027: Reconnect SSE with new token after refresh (FR-001, FR-003).
        // The new JWT has a new jwtId — displacement events would be pushed to
        // the new jwtId, so the SSE channel must be re-established with the new token.
        this.sseService.disconnect();
        this.sseService.connect(response.token, () => this.notifySessionDisplaced());
      }
    } catch {
      // If refresh fails, clear session
      this.clearSession();
    }
  }

  // ─── Password Recovery ───────────────────────────────────────────────────

  async requestRecovery(email: string): Promise<void> {
    this._state.update(s => ({ ...s, recoveryStatus: 'sending' }));
    try {
      await firstValueFrom(this.gateway.requestPasswordRecovery({ email }));
      this._state.update(s => ({ ...s, recoveryStatus: 'sent' }));
    } catch (error) {
      const httpError = error as HttpErrorResponse;
      if (httpError.status === 503) {
        this._state.update(s => ({ ...s, recoveryStatus: 'deliveryError' }));
      } else if (httpError.status === 429) {
        this._state.update(s => ({ ...s, recoveryStatus: 'error', errorType: 'rateLimit' }));
      } else {
        this._state.update(s => ({ ...s, recoveryStatus: 'error' }));
      }
    }
  }

  // ─── Password Reset ──────────────────────────────────────────────────────

  async resetPassword(
    token: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    this._state.update(s => ({ ...s, resetStatus: 'submitting' }));
    try {
      await firstValueFrom(
        this.gateway.resetPassword({ token, newPassword, confirmPassword }),
      );
      this._state.update(s => ({ ...s, resetStatus: 'success' }));
      this.router.navigate(['/login']);
    } catch (error) {
      const httpError = error as HttpErrorResponse;
      const errorCode = httpError.error?.errorCode;
      if (errorCode === 'INVALID_RECOVERY_TOKEN') {
        this._state.update(s => ({ ...s, resetStatus: 'invalidToken' }));
      } else {
        this._state.update(s => ({ ...s, resetStatus: 'error' }));
      }
    }
  }

  // ─── Error handling ──────────────────────────────────────────────────────

  clearError(): void {
    this._state.update(s => ({ ...s, status: 'idle', errorType: null }));
  }

  /** Reset recovery status to idle — called when the recovery page is (re-)visited. */
  resetRecoveryStatus(): void {
    this._state.update(s => ({ ...s, recoveryStatus: 'idle', errorType: null }));
  }

  // ─── Session revocation ───────────────────────────────────────────────────

  /**
   * Notify the facade that a session_revoked SSE event was received.
   * Double-push guard: idempotent — subsequent calls while modal is showing are no-ops.
   * Called by SseService when it receives the 'session_revoked' named event.
   */
  notifySessionDisplaced(): void {
    if (!this._sessionDisplaced()) {
      this._sessionDisplaced.set(true);
    }
  }

  invalidateSession(reason?: 'session_revoked'): void {
    if (reason) {
      this.sessionRevokedReason.set(reason);
    }
    // Disconnect SSE and clear displacement signal before clearing session state
    this.sseService.disconnect();
    this._sessionDisplaced.set(false);
    this.inactivity.stop();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('must_change_password');
    this._state.set({ ...INITIAL_STATE, status: 'idle' });
    this.router.navigate(['/login']);
  }

  /** Dismiss the session-revoked banner (called when user clicks the close button). */
  clearSessionRevoked(): void {
    this.sessionRevokedReason.set(null);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Restore session from localStorage on app startup.
   * Validates the exp claim before restoring authenticated state.
   * Also starts inactivity monitoring if a valid session is restored.
   * Preserves mustChangePassword flag if stored alongside session (FR-016).
   */
  private restoreSession(): void {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userJson = localStorage.getItem(AUTH_USER_KEY);
    if (!token || !userJson) return;

    try {
      const user: AuthUser = JSON.parse(userJson);
      const isExpired = Date.now() > user.expiresAt * 1000;
      if (isExpired) {
        this.clearSession();
        return;
      }

      // Re-read mustChangePassword from the JWT payload (it's not stored in AuthUser)
      // to ensure the flag persists across browser close (FR-016)
      const payload = this.parseJwtPayload(token);
      // mustChangePassword is not in the JWT; re-derive from localStorage if available
      const mustChangePassword = this.readMustChangePasswordFromStorage();

      this._state.update(s => ({
        ...s,
        status: 'authenticated',
        user,
        mustChangePassword,
      }));
      // Restart inactivity monitoring for restored sessions
      this.inactivity.start();
      // Reconnect SSE channel for restored sessions (spec 017, FR-001).
      // On page reload, the user's session is still valid but the EventSource
      // connection was lost. Re-connect so displacement events can be received.
      this.sseService.connect(token, () => this.notifySessionDisplaced());
    } catch {
      this.clearSession();
    }
  }

  private clearSession(): void {
    // T028: Disconnect SSE on all session-clearing paths to prevent channel leaks (FR-012).
    // clearSession() is called from refreshSession() on failure and restoreSession() on error.
    this.sseService.disconnect();
    // Stop inactivity monitoring before clearing session
    this.inactivity.stop();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('must_change_password');
    this._state.set({
      ...INITIAL_STATE,
      status: 'idle',
    });
    this.router.navigate(['/login']);
  }

  /** Parse JWT payload without signature verification (exp claim read client-side). */
  private parseJwtPayload(token: string): Record<string, unknown> {
    const base64 = token.split('.')[1];
    return JSON.parse(atob(base64));
  }

  /**
   * Reads the persisted mustChangePassword flag from localStorage.
   * Written when login returns mustChangePassword=true; cleared on success.
   */
  private readMustChangePasswordFromStorage(): boolean {
    return localStorage.getItem('must_change_password') === 'true';
  }

  /**
   * Map HttpErrorResponse errorCode to AuthErrorType.
   * Falls back to 'network' for connection-level errors.
   */
  private mapHttpError(error: HttpErrorResponse): AuthErrorType {
    if (!error.status || error.status === 0) return 'network';
    const errorCode = error.error?.errorCode as string | undefined;
    switch (errorCode) {
      case 'INVALID_CREDENTIALS': return 'credentials';
      case 'ACCOUNT_DEACTIVATED': return 'deactivated';
      case 'RATE_LIMITED': return 'rateLimit';
      default: return 'network';
    }
  }
}
