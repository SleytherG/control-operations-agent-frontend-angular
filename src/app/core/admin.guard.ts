import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../auth/application/ports/auth-gateway';

/**
 * Route guard that restricts access to ADMIN-only routes (FR-022, FR-023).
 * First validates authentication (same logic as authGuard), then checks the
 * decoded JWT role claim. Non-admin authenticated users are redirected to
 * /dashboard rather than /login, since they are already logged in.
 *
 * Applied to: /audit (and any future ADMIN-only routes).
 * Server-side enforcement remains the authoritative gate; this guard provides
 * a graceful client-side redirect for OPERADOR users who navigate directly.
 */
export const adminGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (!token) {
    return router.createUrlTree(['/login']);
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const isExpired = Date.now() > payload.exp * 1000;

    if (isExpired) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      return router.createUrlTree(['/login']);
    }

    // Check role claim — must be ADMIN to access guarded route (FR-022)
    if (payload.role !== 'ADMIN') {
      // Authenticated but not an admin — redirect to the operator dashboard
      return router.createUrlTree(['/dashboard']);
    }

    return true;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    return router.createUrlTree(['/login']);
  }
};
