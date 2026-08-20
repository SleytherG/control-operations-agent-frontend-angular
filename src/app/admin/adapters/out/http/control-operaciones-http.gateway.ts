import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AgencyOption,
  ControlOperationsFilter,
  ControlOperationsGateway,
  ControlOperationsKpisResponse,
  OperationsPageResponse,
  OperatorOption,
  PaginationParams,
} from '../../../application/ports/control-operaciones-gateway';

@Injectable({ providedIn: 'root' })
export class ControlOperacionesHttpGateway implements ControlOperationsGateway {

  private readonly BASE = '/api/v1/control-operaciones';

  constructor(private readonly http: HttpClient) {}

  getKpis(): Observable<ControlOperationsKpisResponse> {
    return this.http.get<ControlOperationsKpisResponse>(`${this.BASE}/kpis`);
  }

  getOperations(
    filter: ControlOperationsFilter,
    pagination: PaginationParams
  ): Observable<OperationsPageResponse> {
    let params = new HttpParams()
      .set('page',     pagination.page.toString())
      .set('pageSize', pagination.pageSize.toString());

    if (filter.agenciaId   !== null) params = params.set('agenciaId',   filter.agenciaId);
    if (filter.operador    !== null) params = params.set('operador',    filter.operador);
    if (filter.fechaInicio !== null) params = params.set('fechaInicio', filter.fechaInicio);
    if (filter.fechaFin    !== null) params = params.set('fechaFin',    filter.fechaFin);
    if (filter.montoMin    !== null) params = params.set('montoMin',    filter.montoMin.toString());
    if (filter.montoMax    !== null) params = params.set('montoMax',    filter.montoMax.toString());
    if (filter.estado      !== null) params = params.set('estado',      filter.estado);

    return this.http.get<OperationsPageResponse>(`${this.BASE}/operaciones`, { params });
  }

  exportOperations(filter: ControlOperationsFilter): Observable<Blob> {
    let params = new HttpParams();

    if (filter.agenciaId   !== null) params = params.set('agenciaId',   filter.agenciaId);
    if (filter.operador    !== null) params = params.set('operador',    filter.operador);
    if (filter.fechaInicio !== null) params = params.set('fechaInicio', filter.fechaInicio);
    if (filter.fechaFin    !== null) params = params.set('fechaFin',    filter.fechaFin);
    if (filter.montoMin    !== null) params = params.set('montoMin',    filter.montoMin.toString());
    if (filter.montoMax    !== null) params = params.set('montoMax',    filter.montoMax.toString());
    if (filter.estado      !== null) params = params.set('estado',      filter.estado);

    return this.http.get(`${this.BASE}/export`, {
      params,
      responseType: 'blob',
    });
  }

  cancelOperation(id: string): Observable<void> {
    return this.http.patch<void>(`${this.BASE}/${id}/cancel`, null);
  }

  getAgencies(): Observable<AgencyOption[]> {
    return this.http.get<AgencyOption[]>(`${this.BASE}/agencias`);
  }

  getOperators(): Observable<OperatorOption[]> {
    return this.http.get<OperatorOption[]>(`${this.BASE}/operadores`);
  }
}
