import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ChangeFirstLoginPasswordRequest,
  LoginRequest,
  LoginResponse,
  PasswordRecoveryRequest,
  RefreshResponse,
  ResetPasswordRequest,
} from '../../../application/ports/auth-gateway';

/**
 * HTTP implementation of the auth gateway.
 * Calls the backend REST API and propagates typed errors to the AuthFacade.
 */
@Injectable({ providedIn: 'root' })
export class AuthHttpGateway {
  private readonly baseUrl = '/api/v1/auth';

  constructor(private http: HttpClient) {}

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, request)
      .pipe(catchError(this.passThrough));
  }

  logout(token: string): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(catchError(this.passThrough));
  }

  refresh(token: string): Observable<RefreshResponse> {
    return this.http
      .post<RefreshResponse>(`${this.baseUrl}/refresh`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(catchError(this.passThrough));
  }

  requestPasswordRecovery(request: PasswordRecoveryRequest): Observable<{ message: string }> {
    return this.http
      .post<{ message: string }>(`${this.baseUrl}/recuperar-contrasena`, request)
      .pipe(catchError(this.passThrough));
  }

  resetPassword(request: ResetPasswordRequest): Observable<{ message: string }> {
    return this.http
      .post<{ message: string }>(`${this.baseUrl}/restablecer-contrasena`, request)
      .pipe(catchError(this.passThrough));
  }

  /**
   * POST /api/v1/auth/cambiar-contrasena-primer-inicio
   * Mandatory first-login password change (spec 015, FR-008b).
   * The JWT is automatically attached by AuthHttpInterceptor.
   */
  changeFirstLoginPassword(
    request: ChangeFirstLoginPasswordRequest,
  ): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/cambiar-contrasena-primer-inicio`, request)
      .pipe(catchError(this.passThrough));
  }

  /** Pass HttpErrorResponse through so the facade can map errorCode → errorType. */
  private passThrough(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error);
  }
}
