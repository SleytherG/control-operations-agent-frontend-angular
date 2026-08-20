import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthFacade } from '../auth/application/auth.facade';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../auth/application/ports/auth-gateway';

/**
 * HTTP interceptor that:
 * 1. Attaches the JWT Bearer token to every outgoing non-login request.
 * 2. On 401 SESSION_REVOKED: calls AuthFacade.invalidateSession('session_revoked')
 *    so the login page shows "your session was closed because you logged in on
 *    another device" (FR-028 single-session enforcement).
 * 3. On any other 401: clears localStorage and navigates to /login (generic expiry).
 *
 * Registered in app.config.ts via withInterceptors([authHttpInterceptor]).
 */
export const authHttpInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const facade = inject(AuthFacade);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  // Do NOT attach the token to the login endpoint — login does not require auth.
  // Logout and refresh already attach it manually via AuthHttpGateway.
  const isLoginEndpoint = req.url.includes('/auth/login');
  const authenticatedReq = (token && !isLoginEndpoint)
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authenticatedReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const errorCode = (error.error?.errorCode as string | undefined) ?? '';

        if (errorCode === 'SESSION_REVOKED') {
          // FR-028: session was revoked because the user logged in from another device.
          // AuthFacade.invalidateSession() clears state, stops inactivity, and navigates
          // to /login. The sessionRevokedReason signal triggers the info banner there.
          facade.invalidateSession('session_revoked');
        } else {
          // Generic 401 (expired JWT, tampered token, etc.) — clear session silently.
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
          localStorage.removeItem('must_change_password');
          facade.invalidateSession();
        }
      }
      return throwError(() => error);
    })
  );
};
