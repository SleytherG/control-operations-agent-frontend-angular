import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../auth/application/ports/auth-gateway';

/**
 * Route guard for the OPERADOR dashboard (/dashboard).
 *
 * Rules:
 * - Unauthenticated / expired JWT → redirect to /login
 * - Authenticated as ADMIN          → redirect to /admin/dashboard
 * - Authenticated as OPERADOR       → allow
 *
 * Remediation C1 (spec 013): ADMIN users must not access the operator dashboard.
 * The existing authGuard was reverted to auth-only (no role check) to avoid
 * breaking shared routes (/agents, /users, /operation-types) that both roles use.
 */
export const operatorGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  const token = typeof localStorage !== 'undefined'
      ? localStorage.getItem(AUTH_TOKEN_KEY)
      : null;

  if (!token) {
    return router.createUrlTree(['/login']);
  }

  try {
    const payload   = JSON.parse(atob(token.split('.')[1]));
    const isExpired = Date.now() > payload.exp * 1000;

    if (isExpired) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      return router.createUrlTree(['/login']);
    }

    // ADMIN users have their own dashboard — redirect them gracefully
    if (payload.role === 'ADMIN') {
      return router.createUrlTree(['/admin/dashboard']);
    }

    return true;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    return router.createUrlTree(['/login']);
  }
};
