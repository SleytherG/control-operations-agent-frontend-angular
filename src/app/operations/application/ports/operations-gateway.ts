import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateOperationRequest, OperationResponse } from '../../domain/operation';

/**
 * Result of a cancel operation attempt.
 */
export type CancelResult =
  | { ok: true; operation: OperationResponse }
  | { ok: false; notFound: true }
  | { ok: false; notFound?: false; alreadyCanceled: true }
  | { ok: false; notFound?: false; alreadyCanceled?: false; errorType: 'network' | 'timeout' | 'uncertain' };

/**
 * Result of a create operation attempt.
 */
export type CreateResult =
  | { ok: true; replayed: boolean; operation: OperationResponse }
  | { ok: false; definitive: true; conflict: true }
  | { ok: false; definitive: true; conflict?: false; fieldErrors?: unknown[] }
  | { ok: false; definitive: false; errorType: 'network' | 'timeout' | 'uncertain' };

/**
 * Result of an update operation attempt.
 */
export type UpdateResult =
  | { ok: true; conflict: false; definitive: true; operation: OperationResponse }
  | { ok: false; conflict: true; definitive: true }
  | { ok: false; conflict: false; definitive: true; notFound?: boolean; fieldErrors?: unknown[] }
  | { ok: false; conflict: false; definitive: false; errorType: 'network' | 'timeout' | 'uncertain' };

/**
 * Output port for HTTP communication with the backend operations API.
 * No Angular-specific imports — injected via DI token.
 */
export interface OperationsGateway {
  /**
   * POST /api/v1/operations with idempotency key.
   * Returns a result classifying success, replay, definitive error or uncertain error.
   * Never throws — all errors are classified and returned as result values.
   */
  create(request: CreateOperationRequest, idempotencyKey: string): Observable<CreateResult>;

  /**
   * GET /api/v1/operations — complete global history newest first.
   * Any combination of filters is forwarded as query params to the backend.
   * All params are optional; omitting all → returns full unfiltered history.
   *
   * @param from   start date (YYYY-MM-DD Lima local, inclusive)
   * @param to     end date (YYYY-MM-DD Lima local, inclusive)
   * @param type   operation type filter (e.g. "DEPOSIT", "WITHDRAWAL")
   * @param status status filter (e.g. "ACTIVE", "CANCELLED")
   */
  list(from?: string, to?: string, type?: string, status?: string): Observable<OperationResponse[]>;

  /**
   * PUT /api/v1/operations/{id} with If-Unmodified-Since header.
   * Returns a result classifying success, conflict (412), not-found (404),
   * validation error (422) or uncertain error. Never throws.
   */
  updateOperation(
    id: string,
    type: string,
    amount: string,
    lastModifiedAt: string
  ): Observable<UpdateResult>;

  /**
   * POST /api/v1/operations/{id}/cancel — cancel an active operation.
   * Returns a result classifying success, not-found (404),
   * already-canceled (422) or uncertain error. Never throws.
   */
  cancelOperation(id: string): Observable<CancelResult>;
}

export const OPERATIONS_GATEWAY = new InjectionToken<OperationsGateway>('OperationsGateway');
