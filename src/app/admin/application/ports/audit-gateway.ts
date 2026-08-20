import { Observable } from 'rxjs';

/** Session status values matching backend enum (audit module). */
export type AuditSessionStatus = 'ACTIVA' | 'EXITOSA' | 'CERRADA' | 'EXPIRADA' | 'FALLIDA';

/** Role values matching backend enum (audit module). */
export type AuditUserRole = 'ADMIN' | 'OPERADOR';

/** Single session audit record as returned by GET /api/v1/audit/sessions. */
export interface SessionAuditRecordResponse {
  id: string;
  userEmail: string;
  displayName: string;
  userRole: AuditUserRole;
  ipAddress: string;
  deviceInfo: string;
  status: AuditSessionStatus;
  loginAt: string; // ISO-8601 timestamp
}

/** Paginated response shape from GET /api/v1/audit/sessions. */
export interface SessionAuditPageResponse {
  content: SessionAuditRecordResponse[];
  totalElements: number;
  page: number;
  size: number;
}

/** Query parameters accepted by the list and export endpoints. */
export interface ListAuditParams {
  dateFrom?: string | null;  // ISO-8601 date (yyyy-MM-dd)
  dateTo?: string | null;    // ISO-8601 date (yyyy-MM-dd)
  role?: AuditUserRole | null;
  status?: AuditSessionStatus | null;
  device?: string | null;
  page?: number;
  size?: number;
}

/** Export response metadata — the blob comes from the HTTP response body. */
export interface AuditExportParams extends Omit<ListAuditParams, 'page' | 'size'> {}

/** Port interface — implemented by AuditHttpGateway. */
export interface AuditGateway {
  listSessions(params: ListAuditParams): Observable<SessionAuditPageResponse>;
  exportCsv(params: AuditExportParams): Observable<{ blob: Blob; truncated: boolean }>;
  listDeviceOptions(): Observable<string[]>;
}
