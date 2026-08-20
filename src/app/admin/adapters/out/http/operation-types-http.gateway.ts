import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ChangeOperationTypeStatusRequest,
  CreateOperationTypeRequest,
  ListOperationTypesParams,
  OperationTypeAutocompleteItem,
  OperationTypePageResponse,
  OperationTypeResponse,
  UpdateOperationTypeRequest,
} from '../../../application/ports/operation-types-gateway';

/**
 * HTTP implementation of OperationTypesGateway.
 * Calls the backend REST endpoints defined in contracts/operation-types-api.yaml.
 * Base path: /api/v1/operation-types
 */
@Injectable({ providedIn: 'root' })
export class OperationTypesHttpGateway {
  private readonly base = '/api/v1/operation-types';

  constructor(private http: HttpClient) {}

  /** GET /api/v1/operation-types — paginated list with optional filters (FR-002). */
  listOperationTypes(params: ListOperationTypesParams): Observable<OperationTypePageResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page))
      .set('size', String(params.size));
    if (params.q) httpParams = httpParams.set('q', params.q);
    if (params.category) httpParams = httpParams.set('category', params.category);
    if (params.status) httpParams = httpParams.set('status', params.status);
    return this.http.get<OperationTypePageResponse>(this.base, { params: httpParams });
  }

  /** GET /api/v1/operation-types/autocomplete?q= — name suggestions (FR-003). */
  autocomplete(q: string): Observable<OperationTypeAutocompleteItem[]> {
    return this.http.get<OperationTypeAutocompleteItem[]>(`${this.base}/autocomplete`, {
      params: new HttpParams().set('q', q),
    });
  }

  /** GET /api/v1/operation-types/categories — distinct category list (FR-006). */
  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/categories`);
  }

  /** POST /api/v1/operation-types — create (FR-010, FR-026). */
  createOperationType(req: CreateOperationTypeRequest): Observable<OperationTypeResponse> {
    return this.http.post<OperationTypeResponse>(this.base, req);
  }

  /** PUT /api/v1/operation-types/{id} — update (FR-011). */
  updateOperationType(id: string, req: UpdateOperationTypeRequest): Observable<OperationTypeResponse> {
    return this.http.put<OperationTypeResponse>(`${this.base}/${id}`, req);
  }

  /** PATCH /api/v1/operation-types/{id}/status — quick status toggle (FR-012). */
  changeStatus(id: string, req: ChangeOperationTypeStatusRequest): Observable<OperationTypeResponse> {
    return this.http.patch<OperationTypeResponse>(`${this.base}/${id}/status`, req);
  }
}
