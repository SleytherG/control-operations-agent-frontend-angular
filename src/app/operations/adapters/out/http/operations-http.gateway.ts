import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { OperationsGateway, CancelResult, CreateResult, UpdateResult } from '../../../application/ports/operations-gateway';
import {
  CreateOperationRequest,
  OperationResponse,
  isOperationResponse,
  isOperationResponseArray,
} from '../../../domain/operation';

const API_BASE = '/api/v1/operations';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class OperationsHttpGateway implements OperationsGateway {

  private readonly http = inject(HttpClient);

  create(request: CreateOperationRequest, idempotencyKey: string): Observable<CreateResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    });

    return this.http.post<unknown>(API_BASE, request, {
      headers,
      observe: 'response',
    }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map(response => {
        const body = response.body;
        const status = response.status;

        if ((status === 201 || status === 200) && isOperationResponse(body)) {
          return {
            ok: true as const,
            replayed: status === 200,
            operation: body,
          };
        }
        // Unexpected status or malformed body — uncertain
        return {
          ok: false as const,
          definitive: false as const,
          errorType: 'uncertain' as const,
        };
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          return of(this.classifyHttpError(error));
        }
        // Timeout or other non-HTTP error — uncertain
        return of({
          ok: false as const,
          definitive: false as const,
          errorType: 'timeout' as const,
        });
      })
    );
  }

  list(from?: string, to?: string, type?: string, status?: string): Observable<OperationResponse[]> {
    let params = new HttpParams();
    if (from)   params = params.set('from',   from);
    if (to)     params = params.set('to',     to);
    if (type)   params = params.set('type',   type);
    if (status) params = params.set('status', status);
    return this.http.get<unknown>(API_BASE, { params }).pipe(
      map(body => {
        if (isOperationResponseArray(body)) return body;
        if (Array.isArray(body) && body.length === 0) return [];
        throw new Error('Unexpected response shape from list');
      }),
      catchError(() => of([] as OperationResponse[]))
    );
  }

  updateOperation(
    id: string,
    type: string,
    amount: string,
    lastModifiedAt: string
  ): Observable<UpdateResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'If-Unmodified-Since': this.toHttpDate(lastModifiedAt),
    });

    return this.http.put<unknown>(`${API_BASE}/${id}`, { type, amount }, {
      headers,
      observe: 'response',
    }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((response): UpdateResult => {
        const body = response.body;
        if (response.status === 200 && isOperationResponse(body)) {
          return { ok: true, conflict: false, definitive: true, operation: body };
        }
        return {
          ok: false,
          conflict: false,
          definitive: false,
          errorType: 'uncertain',
        };
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          return of(this.classifyUpdateHttpError(error));
        }
        return of<UpdateResult>({
          ok: false,
          conflict: false,
          definitive: false,
          errorType: 'timeout',
        });
      })
    );
  }

  /** Convert an RFC 3339 UTC instant string to an RFC 7231 HTTP-date. */
  private toHttpDate(rfc3339: string): string {
    return new Date(rfc3339).toUTCString();
  }

  private classifyHttpError(error: HttpErrorResponse): CreateResult {
    const status = error.status;

    if (status === 0) {
      // Network error or CORS failure
      return { ok: false, definitive: false, errorType: 'network' };
    }

    if (status === 409) {
      return { ok: false, definitive: true, conflict: true };
    }

    if (status === 422 || status === 400) {
      // Definitive validation/client error
      return { ok: false, definitive: true };
    }

    // 503, 500, or any server/intermediate error — uncertain (commit may have occurred)
    return { ok: false, definitive: false, errorType: 'uncertain' };
  }

  cancelOperation(id: string): Observable<CancelResult> {
    return this.http.post<unknown>(`${API_BASE}/${id}/cancel`, null, {
      observe: 'response',
    }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((response): CancelResult => {
        const body = response.body;
        if (response.status === 200 && isOperationResponse(body)) {
          return { ok: true, operation: body };
        }
        return { ok: false, errorType: 'uncertain' };
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          return of(this.classifyCancelHttpError(error));
        }
        return of<CancelResult>({ ok: false, errorType: 'timeout' });
      })
    );
  }

  private classifyUpdateHttpError(error: HttpErrorResponse): UpdateResult {
    const status = error.status;

    if (status === 0) {
      return { ok: false, conflict: false, definitive: false, errorType: 'network' };
    }

    if (status === 412) {
      return { ok: false, conflict: true, definitive: true };
    }

    if (status === 404) {
      return { ok: false, conflict: false, definitive: true, notFound: true };
    }

    if (status === 422 || status === 400) {
      return { ok: false, conflict: false, definitive: true };
    }

    // 503, 500, or any server/intermediate error — uncertain (commit may have occurred)
    return { ok: false, conflict: false, definitive: false, errorType: 'uncertain' };
  }

  private classifyCancelHttpError(error: HttpErrorResponse): CancelResult {
    const status = error.status;

    if (status === 0) {
      return { ok: false, errorType: 'network' };
    }

    if (status === 404) {
      return { ok: false, notFound: true };
    }

    if (status === 422) {
      return { ok: false, alreadyCanceled: true };
    }

    // 503, 500, or any server/intermediate error — uncertain
    return { ok: false, errorType: 'uncertain' };
  }
}
