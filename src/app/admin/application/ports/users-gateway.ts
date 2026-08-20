import { Observable } from 'rxjs';

export type UserStatus = 'ACTIVO' | 'INACTIVO';
/** Two roles only: ADMIN and OPERADOR */
export type UserRole = 'ADMIN' | 'OPERADOR';

/** Full user record returned by list, single-get, create, update, and change-status endpoints. */
export interface UserResponse {
  id: string;
  fullName: string;
  email: string;
  dni: string;
  /** Computed initials: first letter first word + first letter last word (single-word → one letter). */
  initials: string;
  role: UserRole;
  agentId: string | null;
  agentName: string | null;
  agentCode: string | null;
  status: UserStatus;
  enabled: boolean;
  lastConnectionAt: string | null;  // ISO-8601 or null
  lastConnectionDetail: string | null;
}

/** Lightweight projection returned by the autocomplete endpoint. */
export interface UserAutocompleteItem {
  id: string;
  fullName: string;
  dni: string;
}

/** Paginated list response shape. */
export interface UserPageResponse {
  content: UserResponse[];
  totalElements: number;
  page: number;
  size: number;
  totalPages: number;
}

/** Query parameters for the paginated list endpoint. */
export interface ListUsersParams {
  q?: string | null;
  agentId?: string | null;
  status?: UserStatus | null;
  page: number;
  size: number;
}

/** Request body for creating a user. */
export interface CreateUserRequest {
  fullName: string;
  email: string;
  dni: string;
  role: UserRole;
  agentId: string | null;
}

/** Request body for updating a user. */
export interface UpdateUserRequest {
  fullName: string;
  email: string;
  role: UserRole;
  agentId: string | null;
  /** true → ACTIVO, false → INACTIVO */
  enabled: boolean;
}

/** Request body for the quick status-change row button. */
export interface ChangeUserStatusRequest {
  status: UserStatus;
}

/** Port interface — implemented by UsersHttpGateway. */
export interface UsersGateway {
  listUsers(params: ListUsersParams): Observable<UserPageResponse>;
  autocomplete(q: string): Observable<UserAutocompleteItem[]>;
  getUser(id: string): Observable<UserResponse>;
  createUser(req: CreateUserRequest): Observable<UserResponse>;
  updateUser(id: string, req: UpdateUserRequest): Observable<UserResponse>;
  changeStatus(id: string, req: ChangeUserStatusRequest): Observable<UserResponse>;
}
