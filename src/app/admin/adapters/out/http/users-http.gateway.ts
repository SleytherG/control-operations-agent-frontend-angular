import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ChangeUserStatusRequest,
  CreateUserRequest,
  ListUsersParams,
  UserAutocompleteItem,
  UserPageResponse,
  UserResponse,
  UsersGateway,
  UpdateUserRequest,
} from '../../../application/ports/users-gateway';

/**
 * HTTP implementation of UsersGateway.
 * Calls the backend REST endpoints.
 * Base path: /api/v1/operators (backend entity name retained for API compatibility)
 */
@Injectable({ providedIn: 'root' })
export class UsersHttpGateway implements UsersGateway {
  private readonly base = '/api/v1/users';

  constructor(private http: HttpClient) {}

  /** GET /api/v1/operators — paginated list with optional filters. */
  listUsers(params: ListUsersParams): Observable<UserPageResponse> {
    let p = new HttpParams()
      .set('page', params.page)
      .set('size', params.size);
    if (params.q)       p = p.set('q', params.q);
    if (params.agentId) p = p.set('agentId', params.agentId);
    if (params.status)  p = p.set('status', params.status);
    return this.http.get<UserPageResponse>(this.base, { params: p });
  }

  /** GET /api/v1/operators/autocomplete?q= — typeahead suggestions. */
  autocomplete(q: string): Observable<UserAutocompleteItem[]> {
    return this.http.get<UserAutocompleteItem[]>(`${this.base}/autocomplete`, {
      params: new HttpParams().set('q', q),
    });
  }

  /** GET /api/v1/operators/{id} — single user by ID. */
  getUser(id: string): Observable<UserResponse> {
    return this.http.get<UserResponse>(`${this.base}/${id}`);
  }

  /** POST /api/v1/operators — create a new user. */
  createUser(req: CreateUserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(this.base, req);
  }

  /** PUT /api/v1/operators/{id} — update all editable fields. */
  updateUser(id: string, req: UpdateUserRequest): Observable<UserResponse> {
    return this.http.put<UserResponse>(`${this.base}/${id}`, req);
  }

  /** PATCH /api/v1/operators/{id}/status — quick status toggle. */
  changeStatus(id: string, req: ChangeUserStatusRequest): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.base}/${id}/status`, req);
  }

  /**
   * POST /api/v1/users/{id}/reset-password — admin password restoration (spec 016).
   * Returns a one-time plain-text temporary password for manual delivery.
   * ADMIN role required.
   */
  resetPassword(userId: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(
      `${this.base}/${userId}/reset-password`, {}
    );
  }
}
