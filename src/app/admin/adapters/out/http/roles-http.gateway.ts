import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  RolesGateway,
  RolesUserListItem,
  UserPermissionConfig,
  SaveUserConfigRequest,
  RevokeAccessResponse,
} from '../../../application/ports/roles-gateway';

/** Raw shape of one item in the GET /api/v1/users response content array. */
interface ApiUserItem {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  role: 'ADMIN' | 'OPERADOR';
  hasActiveSession: boolean;
  accountActive: boolean;
  status: string;
  enabled: boolean;
}

/** Paginated wrapper returned by GET /api/v1/users. */
interface ApiUserPageResponse {
  content: ApiUserItem[];
  totalElements: number;
  page: number;
  size: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class RolesHttpGateway extends RolesGateway {
  private readonly base = '/api/v1/users';

  constructor(private readonly http: HttpClient) {
    super();
  }

  /** Load all system users — size=1000 to effectively load all users (FR-032/Assumption). */
  override listUsers(): Observable<RolesUserListItem[]> {
    return this.http
      .get<ApiUserPageResponse>(`${this.base}?size=1000&page=1`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      .pipe(
        map((res) =>
          res.content.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            initials: u.initials,
            role: u.role,
            hasActiveSession: u.hasActiveSession,
            accountActive: u.accountActive,
          }))
        )
      );
  }

  /** Get role and granular permissions for a specific user. */
  override getUserConfig(userId: string): Observable<UserPermissionConfig> {
    return this.http.get<UserPermissionConfig>(
      `${this.base}/${userId}/config`,
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  /** Atomically save role and permissions. */
  override saveUserConfig(
    userId: string,
    req: SaveUserConfigRequest
  ): Observable<UserPermissionConfig> {
    return this.http.put<UserPermissionConfig>(
      `${this.base}/${userId}/config`,
      req,
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  /** Permanently deactivate a user account. */
  override revokeAccess(userId: string): Observable<RevokeAccessResponse> {
    return this.http.post<RevokeAccessResponse>(
      `${this.base}/${userId}/revoke`,
      {},
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
