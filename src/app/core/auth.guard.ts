import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../auth/application/ports/auth-gateway';

/**
 * Route guard that protects all authenticated routes.
 * Reads the JWT from localStorage and validates the exp claim.
 * If absent or expired, clears session data and redirects to /login.
 *
 * Applied to operator and shared admin routes.
 * Public routes (/login, /recuperar-contrasena, /restablecer-contrasena) are NOT guarded.
 *
 * NOTE: This guard only verifies authentication — it does NOT check roles.
 * Use operatorGuard for routes that must be OPERADOR-only.
 * Use adminGuard for routes that must be ADMIN-only.
 */
export const authGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  const token = typeof localStorage !== 'undefined'
      ? localStorage.getItem(AUTH_TOKEN_KEY)
      : null;

  if (!token) {
    return router.createUrlTree(['/login']);
  }

  try {
    const payload  = JSON.parse(atob(token.split('.')[1]));
    const isExpired = Date.now() > payload.exp * 1000;

    if (isExpired) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      return router.createUrlTree(['/login']);
    }

    return true;
  } catch {
    // Malformed JWT — clear session and redirect to login
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    return router.createUrlTree(['/login']);
  }
};
