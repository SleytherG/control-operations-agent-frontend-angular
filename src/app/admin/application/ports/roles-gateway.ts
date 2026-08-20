import { Observable } from 'rxjs';

// ── User list types ───────────────────────────────────────────────────────────

/** Lightweight user list item used in the left panel of the Roles y Permisos screen. */
export interface RolesUserListItem {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  role: 'ADMIN' | 'OPERADOR';
  /** true if the user currently has a session_audit_record with status = 'ACTIVA' */
  hasActiveSession: boolean;
  /** true when enabled === true AND status === 'ACTIVO' */
  accountActive: boolean;
}

// ── Permission config types ───────────────────────────────────────────────────

/** Current role and granted granular permissions for a user. */
export interface UserPermissionConfig {
  userId: string;
  role: 'ADMIN' | 'OPERADOR';
  /** Set of permission_id values currently granted. Empty array = no permissions. */
  grantedPermissions: string[];
}

/** Request body for PUT /api/v1/users/{id}/config */
export interface SaveUserConfigRequest {
  role: 'ADMIN' | 'OPERADOR';
  /** COMPLETE set of permission_ids to grant. Permissions not listed are revoked. */
  grantedPermissions: string[];
}

/** Response from POST /api/v1/users/{id}/revoke */
export interface RevokeAccessResponse {
  id: string;
  accountActive: boolean;
  enabled: boolean;
  status: string;
  hasActiveSession: boolean;
  role: 'ADMIN' | 'OPERADOR';
  fullName: string;
  email: string;
  initials: string;
}

// ── Gateway port ──────────────────────────────────────────────────────────────

/** Abstract port implemented by RolesHttpGateway. */
export abstract class RolesGateway {
  /** Load all system users (GET /api/v1/users?size=1000&page=1). */
  abstract listUsers(): Observable<RolesUserListItem[]>;

  /** Get role and permissions for a specific user (GET /api/v1/users/{id}/config). */
  abstract getUserConfig(userId: string): Observable<UserPermissionConfig>;

  /** Atomically save role and permissions (PUT /api/v1/users/{id}/config). */
  abstract saveUserConfig(userId: string, req: SaveUserConfigRequest): Observable<UserPermissionConfig>;

  /** Permanently deactivate a user account (POST /api/v1/users/{id}/revoke). */
  abstract revokeAccess(userId: string): Observable<RevokeAccessResponse>;
}
