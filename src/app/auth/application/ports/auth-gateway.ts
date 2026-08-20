/**
 * Angular auth gateway interface and shared DTOs.
 * Defines the contract between the AuthFacade and the HTTP adapter.
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: 'ADMIN' | 'OPERADOR';
  displayName: string;
  expiresInMinutes: number;
  /** true = user is in "primer inicio de sesión" state — show mandatory change modal */
  mustChangePassword: boolean;
}

export interface RefreshResponse {
  token: string;
  expiresInMinutes: number;
}

export interface PasswordRecoveryRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

/** New — request body for POST /api/v1/auth/cambiar-contrasena-primer-inicio */
export interface ChangeFirstLoginPasswordRequest {
  temporaryPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthUser {
  email: string;
  displayName: string;
  role: 'ADMIN' | 'OPERADOR';
  /** JWT exp claim in epoch seconds (used by InactivityService to compute warning threshold) */
  expiresAt: number;
}

export type AuthErrorType = 'credentials' | 'deactivated' | 'network' | 'rateLimit';
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';
export type RecoveryStatus = 'idle' | 'sending' | 'sent' | 'deliveryError' | 'error';
export type ResetStatus = 'idle' | 'submitting' | 'success' | 'invalidToken' | 'error';

/** Status of the first-login mandatory password change operation */
export type ChangePasswordStatus = 'idle' | 'submitting' | 'success' | 'error';

/** Error types for the first-login change endpoint (FR-011) */
export type ChangePasswordError =
  | 'invalidTempPassword'
  | 'weakPassword'
  | 'sameAsTemporary'
  | 'network'
  | null;

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  errorType: AuthErrorType | null;
  recoveryStatus: RecoveryStatus;
  resetStatus: ResetStatus;
  /** true = user is in "primer inicio de sesión" state → mandatory change modal shown */
  mustChangePassword: boolean;
  /** Loading/error state for POST /cambiar-contrasena-primer-inicio */
  changePasswordStatus: ChangePasswordStatus;
  changePasswordError: ChangePasswordError;
}

/**
 * Output port interface implemented by AuthHttpGateway.
 * All methods return Observables to allow the facade to handle
 * loading state, error mapping, and navigation reactively.
 */
export interface AuthGateway {
  login(request: LoginRequest): import('rxjs').Observable<LoginResponse>;
  logout(token: string): import('rxjs').Observable<void>;
  refresh(token: string): import('rxjs').Observable<RefreshResponse>;
  requestPasswordRecovery(request: PasswordRecoveryRequest): import('rxjs').Observable<void>;
  resetPassword(request: ResetPasswordRequest): import('rxjs').Observable<void>;
  /** Call POST /api/v1/auth/cambiar-contrasena-primer-inicio (FR-008b) */
  changeFirstLoginPassword(
    request: ChangeFirstLoginPasswordRequest,
  ): import('rxjs').Observable<void>;
}

/** Local storage keys */
export const AUTH_TOKEN_KEY = 'auth_token';
export const AUTH_USER_KEY = 'auth_user';
