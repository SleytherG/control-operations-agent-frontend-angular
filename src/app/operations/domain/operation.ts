/**
 * Frontend domain DTOs and runtime validation guards.
 * These match the REST contract defined in contracts/operations-api.yaml.
 */

/** Request body for POST /api/v1/operations */
export interface CreateOperationRequest {
  type: string;
  amount: string;
}

/** Single operation in the global history response */
export interface OperationResponse {
  id: string;
  type: string;
  amount: string;
  registeredAt: string;
  lastModifiedAt: string;
  /** Lifecycle status: 'ACTIVE' or 'CANCELLED' */
  status: string;
  /** Nullable agent ID (numeric string) */
  agentId?: string | null;
  /** Nullable agent business name */
  agentName?: string | null;
}

/** Request body for PUT /api/v1/operations/{id} */
export interface UpdateOperationRequest {
  type: string;
  amount: string;
}

/** Versioned pending confirmation persisted in localStorage before POST */
export interface PendingConfirmation {
  version: 1;
  rawType: string;
  rawAmount: string;
  payload: CreateOperationRequest;
  idempotencyKey: string;
}

/** RFC 9457 Problem Details */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: FieldError[];
}

export interface FieldError {
  pointer: string;
  code: string;
  detail: string;
}

/** Runtime guard: checks that a value looks like a valid OperationResponse.
 *
 * The {@code type} field is intentionally checked only as a non-empty string —
 * it may be a legacy enum value ('DEPOSIT', 'WITHDRAWAL') or a custom operation
 * type name ('Depósito en Efectivo') created via spec 008.
 */
export function isOperationResponse(value: unknown): value is OperationResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    v['id'].length > 0 &&
    typeof v['type'] === 'string' &&
    v['type'].length > 0 &&
    typeof v['amount'] === 'string' &&
    v['amount'].length > 0 &&
    typeof v['registeredAt'] === 'string' &&
    v['registeredAt'].length > 0 &&
    typeof v['lastModifiedAt'] === 'string' &&
    v['lastModifiedAt'].length > 0 &&
    typeof v['status'] === 'string' &&
    (v['status'] === 'ACTIVE' || v['status'] === 'CANCELLED')
  );
}

/** Runtime guard: checks that an array looks like OperationResponse[] */
export function isOperationResponseArray(value: unknown): value is OperationResponse[] {
  return Array.isArray(value) && value.every(isOperationResponse);
}

/** Runtime guard: checks that a value is a valid PendingConfirmation */
export function isPendingConfirmation(value: unknown): value is PendingConfirmation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v['version'] === 1 &&
    typeof v['rawType'] === 'string' &&
    typeof v['rawAmount'] === 'string' &&
    typeof v['payload'] === 'object' &&
    v['payload'] !== null &&
    typeof (v['payload'] as Record<string, unknown>)['type'] === 'string' &&
    typeof (v['payload'] as Record<string, unknown>)['amount'] === 'string' &&
    typeof v['idempotencyKey'] === 'string' &&
    v['idempotencyKey'].length > 0
  );
}
