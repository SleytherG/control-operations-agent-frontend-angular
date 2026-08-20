import { Injectable, signal } from '@angular/core';
import { AUTH_TOKEN_KEY } from '../auth/application/ports/auth-gateway';

/**
 * Auth service — role awareness and user identity from JWT.
 *
 * Reads the JWT from localStorage and exposes:
 * - {@link isAdmin}       true when role === 'ADMIN'
 * - {@link displayName}  operator/user display name from JWT payload (spec 013 D-08, C3 fix)
 * - {@link role}          raw role claim string from JWT
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  /** true when the current user carries the ADMIN role. */
  readonly isAdmin = signal<boolean>(this.readRoleFromToken() === 'ADMIN');

  /**
   * Display name extracted from the JWT payload's {@code displayName} claim.
   * Returns an empty string when unauthenticated or the claim is absent.
   * Used by the operator dashboard greeting (FR-003, spec 013 A-02, D-08).
   */
  readonly displayName = signal<string>(this.readDisplayNameFromToken());

  /** Raw role claim string from the JWT (e.g. "ADMIN", "OPERADOR"). */
  readonly role = signal<string>(this.readRoleFromToken() ?? '');

  // ── Private helpers ─────────────────────────────────────────────────────

  private readRoleFromToken(): string | null {
    try {
      const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem(AUTH_TOKEN_KEY)
          : null;
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role ?? null;
    } catch {
      return null;
    }
  }

  private readDisplayNameFromToken(): string {
    try {
      const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem(AUTH_TOKEN_KEY)
          : null;
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.displayName ?? '';
    } catch {
      return '';
    }
  }
}
