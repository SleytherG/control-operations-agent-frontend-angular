import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  AuditExportParams,
  AuditGateway,
  ListAuditParams,
  SessionAuditPageResponse,
} from '../../../application/ports/audit-gateway';

/**
 * HTTP implementation of AuditGateway.
 * Calls the backend REST endpoints under /api/v1/audit/sessions.
 */
@Injectable({ providedIn: 'root' })
export class AuditHttpGateway implements AuditGateway {
  private readonly base = '/api/v1/audit/sessions';

  constructor(private readonly http: HttpClient) {}

  /** GET /api/v1/audit/sessions — paginated list with optional filters. */
  listSessions(params: ListAuditParams): Observable<SessionAuditPageResponse> {
    let p = new HttpParams();
    if (params.dateFrom) p = p.set('dateFrom', params.dateFrom);
    if (params.dateTo)   p = p.set('dateTo',   params.dateTo);
    if (params.role)     p = p.set('role',     params.role);
    if (params.status)   p = p.set('status',   params.status);
    if (params.device)   p = p.set('device',   params.device);
    if (params.page != null) p = p.set('page', params.page);
    if (params.size != null) p = p.set('size', params.size);
    return this.http.get<SessionAuditPageResponse>(this.base, { params: p });
  }

  /**
   * GET /api/v1/audit/sessions/export — CSV download.
   * Returns the Blob plus the X-Export-Truncated flag from the response header.
   */
  exportCsv(params: AuditExportParams): Observable<{ blob: Blob; truncated: boolean }> {
    let p = new HttpParams();
    if (params.dateFrom) p = p.set('dateFrom', params.dateFrom);
    if (params.dateTo)   p = p.set('dateTo',   params.dateTo);
    if (params.role)     p = p.set('role',     params.role);
    if (params.status)   p = p.set('status',   params.status);
    if (params.device)   p = p.set('device',   params.device);

    return this.http
      .get(`${this.base}/export`, {
        params: p,
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          truncated: response.headers.get('X-Export-Truncated') === 'true',
        }))
      );
  }

  /** GET /api/v1/audit/sessions/devices — distinct device values. */
  listDeviceOptions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/devices`);
  }
}
