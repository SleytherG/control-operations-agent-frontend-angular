import { Observable } from 'rxjs';

export type OperationTypeStatus = 'ACTIVO' | 'INACTIVO';
export type OperationTypeFlow = 'INGRESO' | 'EGRESO';

/** Full operation type record returned by list, create, update, and change-status endpoints. */
export interface OperationTypeResponse {
  id: string;
  name: string;
  category: string;
  /** Flow direction: INGRESO (entrada) or EGRESO (salida). */
  flow: OperationTypeFlow;
  status: OperationTypeStatus;
}

/** Lightweight projection returned by the autocomplete endpoint (FR-003). */
export interface OperationTypeAutocompleteItem {
  id: string;
  name: string;
}

/** Paginated list response shape (FR-008). */
export interface OperationTypePageResponse {
  content: OperationTypeResponse[];
  totalElements: number;
  page: number;
  size: number;
}

/** Query parameters for the paginated list endpoint (FR-002). */
export interface ListOperationTypesParams {
  q?: string | null;
  category?: string | null;
  status?: OperationTypeStatus | null;
  page: number;
  size: number;
}

/** Request body for creating an operation type (FR-010). */
export interface CreateOperationTypeRequest {
  name: string;
  category: string;
  /** Flow direction: INGRESO (entrada) or EGRESO (salida). */
  flow: OperationTypeFlow;
}

/** Request body for updating an operation type (FR-011). */
export interface UpdateOperationTypeRequest {
  name: string;
  category: string;
  /** Flow direction: INGRESO (entrada) or EGRESO (salida). */
  flow: OperationTypeFlow;
  /** true → ACTIVO, false → INACTIVO (blocked by FK if operations reference this type — FR-024). */
  enabled: boolean;
}

/** Request body for the quick status-change row button (FR-012). */
export interface ChangeOperationTypeStatusRequest {
  status: OperationTypeStatus;
}

/** Port interface — implemented by OperationTypesHttpGateway. */
export interface OperationTypesGateway {
  listOperationTypes(params: ListOperationTypesParams): Observable<OperationTypePageResponse>;
  autocomplete(q: string): Observable<OperationTypeAutocompleteItem[]>;
  getCategories(): Observable<string[]>;
  createOperationType(req: CreateOperationTypeRequest): Observable<OperationTypeResponse>;
  updateOperationType(id: string, req: UpdateOperationTypeRequest): Observable<OperationTypeResponse>;
  changeStatus(id: string, req: ChangeOperationTypeStatusRequest): Observable<OperationTypeResponse>;
}
