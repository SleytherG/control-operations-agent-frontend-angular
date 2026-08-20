import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { OperationsHttpGateway } from './operations-http.gateway';

describe('OperationsHttpGateway', () => {
  let gateway: OperationsHttpGateway;
  let httpMock: HttpTestingController;

  const idempotencyKey = '8e03978e-40d5-43e8-bc93-6894a57f9324';
  const request = { type: 'DEPOSITO', amount: '1250.50' };
  const successResponse = {
    id: '42',
    type: 'DEPOSITO',
    amount: '1250.50',
    registeredAt: '2026-08-08T14:32:10.000000Z',
    lastModifiedAt: '2026-08-08T14:32:10.000000Z',
    status: 'ACTIVO',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        OperationsHttpGateway,
      ],
    });
    gateway = TestBed.inject(OperationsHttpGateway);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---- 201 Success ----

  it('create sends POST with correct headers and returns success result', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    expect(req.request.headers.get('Content-Type')).toContain('application/json');

    req.flush(successResponse, { status: 201, statusText: 'Created' });

    expect((result as { ok: boolean }).ok).toBe(true);
  });

  // ---- 200 Replay ----

  it('create returns replay result for 200 response', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.flush(successResponse, { status: 200, statusText: 'OK' });

    expect((result as { ok: boolean; replayed?: boolean }).replayed).toBe(true);
  });

  // ---- 422 Validation error ----

  it('create returns definitive error for 422', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.flush(
      {
        type: '/problems/validation',
        title: 'Validation failed',
        status: 422,
        detail: 'Invalid amount',
        errors: [{ pointer: '/amount', code: 'positive_decimal', detail: 'Must be positive' }],
      },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect((result as { ok: boolean; definitive: boolean }).ok).toBe(false);
    expect((result as { definitive: boolean }).definitive).toBe(true);
  });

  // ---- 409 Conflict ----

  it('create returns definitive conflict error for 409', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.flush(
      { type: '/problems/idempotency-conflict', status: 409 },
      { status: 409, statusText: 'Conflict' }
    );

    expect((result as { ok: boolean; conflict: boolean }).conflict).toBe(true);
  });

  // ---- 400 Bad request ----

  it('create returns definitive error for 400', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.flush({ status: 400 }, { status: 400, statusText: 'Bad Request' });

    expect((result as { ok: boolean; definitive: boolean }).definitive).toBe(true);
  });

  // ---- 503 Storage unavailable ----

  it('create returns uncertain error for 503', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.flush(
      { type: '/problems/storage-unavailable', status: 503 },
      { status: 503, statusText: 'Service Unavailable' }
    );

    expect((result as { ok: boolean; definitive: boolean }).ok).toBe(false);
    expect((result as { definitive: boolean }).definitive).toBe(false);
  });

  // ---- Timeout / network error — uncertain ----

  it('create returns uncertain error on network failure', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    req.error(new ProgressEvent('error'));

    expect((result as { ok: boolean; definitive: boolean }).ok).toBe(false);
    expect((result as { definitive: boolean }).definitive).toBe(false);
  });

  // ---- Malformed body — uncertain ----

  it('create returns uncertain error for malformed response body', () => {
    let result: unknown;
    gateway.create(request, idempotencyKey).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    // 201 but no id field — invalid shape
    req.flush({ unexpected: true }, { status: 201, statusText: 'Created' });

    expect((result as { ok: boolean }).ok).toBe(false);
  });

  // ---- Exactly one request per action ----

  it('create sends exactly one request', () => {
    gateway.create(request, idempotencyKey).subscribe();

    const reqs = httpMock.match('/api/v1/operations');
    expect(reqs).toHaveLength(1);
    reqs[0].flush(successResponse, { status: 201, statusText: 'Created' });
  });

  // ---- No automatic retry ----

  it('create does not retry on error', () => {
    let callCount = 0;
    gateway.create(request, idempotencyKey).subscribe(() => callCount++);

    httpMock.expectOne('/api/v1/operations').error(new ProgressEvent('error'));
    httpMock.expectNone('/api/v1/operations');

    expect(callCount).toBe(1); // one result (the error result), no retry
  });

  // ---- list ----

  it('list sends GET and returns operations', () => {
    let result: unknown;
    gateway.list().subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations');
    expect(req.request.method).toBe('GET');
    req.flush([successResponse]);

    expect(result).toHaveLength(1);
  });

  it('list returns empty array for empty response', () => {
    let result: unknown;
    gateway.list().subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/operations').flush([]);
    expect(result).toHaveLength(0);
  });

  // ---- updateOperation ----

  it('updateOperation sends PUT with If-Unmodified-Since header formatted as HTTP-date', () => {
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z').subscribe();

    const req = httpMock.expectOne('/api/v1/operations/42');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('If-Unmodified-Since')).toMatch(
      /Sun, 09 Aug 2026 14:32:10 GMT|Sun,\s*09\s*Aug\s*2026\s*14:32:10\s*GMT/
    );
    expect(req.request.body).toEqual({ type: 'RETIRO', amount: '150.75' });
    req.flush(successResponse, { status: 200, statusText: 'OK' });
  });

  it('updateOperation returns ok result with operation for 200 response', () => {
    let result: unknown;
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z')
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations/42');
    req.flush(successResponse, { status: 200, statusText: 'OK' });

    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { operation: unknown }).operation).toBeDefined();
  });

  it('updateOperation returns conflict result for 412 response', () => {
    let result: unknown;
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z')
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations/42');
    req.flush(
      { type: '/problems/precondition-failed', status: 412 },
      { status: 412, statusText: 'Precondition Failed' }
    );

    expect((result as { ok: boolean }).ok).toBe(false);
    expect((result as { conflict: boolean }).conflict).toBe(true);
  });

  it('updateOperation returns not-found result for 404 response', () => {
    let result: unknown;
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z')
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations/42');
    req.flush(
      { type: '/problems/not-found', status: 404 },
      { status: 404, statusText: 'Not Found' }
    );

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['notFound']).toBe(true);
  });

  it('updateOperation returns uncertain error on network failure', () => {
    let result: unknown;
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z')
      .subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/operations/42').error(new ProgressEvent('error'));

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['definitive']).toBe(false);
  });

  it('updateOperation returns definitive error for 422', () => {
    let result: unknown;
    gateway.updateOperation('42', 'RETIRO', '150.75', '2026-08-09T14:32:10.000000Z')
      .subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations/42');
    req.flush({ status: 422 }, { status: 422, statusText: 'Unprocessable Entity' });

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['definitive']).toBe(true);
  });

  // ---- T018: cancelOperation ----

  it('cancelOperation sends POST to /cancel and returns ok with ANULADO operation', () => {
    const canceledResponse = { ...successResponse, status: 'ANULADO' };
    let result: unknown;
    gateway.cancelOperation('42').subscribe((r) => (result = r));

    const req = httpMock.expectOne('/api/v1/operations/42/cancel');
    expect(req.request.method).toBe('POST');
    req.flush(canceledResponse, { status: 200, statusText: 'OK' });

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(true);
    expect((r['operation'] as Record<string, unknown>)['status']).toBe('ANULADO');
  });

  it('cancelOperation returns notFound for 404', () => {
    let result: unknown;
    gateway.cancelOperation('99').subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/operations/99/cancel').flush(
      { type: '/problems/not-found', status: 404 },
      { status: 404, statusText: 'Not Found' }
    );

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['notFound']).toBe(true);
  });

  it('cancelOperation returns alreadyCanceled for 422', () => {
    let result: unknown;
    gateway.cancelOperation('42').subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/operations/42/cancel').flush(
      { type: '/problems/operation-already-canceled', status: 422 },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['alreadyCanceled']).toBe(true);
  });

  it('cancelOperation returns uncertain error on network failure', () => {
    let result: unknown;
    gateway.cancelOperation('42').subscribe((r) => (result = r));

    httpMock.expectOne('/api/v1/operations/42/cancel').error(new ProgressEvent('error'));

    const r = result as Record<string, unknown>;
    expect(r['ok']).toBe(false);
    expect(r['errorType']).toBe('network');
  });
});
