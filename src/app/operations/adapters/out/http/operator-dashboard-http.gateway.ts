import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  OperatorDashboardGateway,
  OperatorHourlyVolumeResponse,
  OperatorRecentOperationsResponse,
  OperatorSummaryResponse,
  OperatorTypeDistributionResponse,
} from '../../../application/ports/operator-dashboard-gateway';

/**
 * HTTP adapter for the Operator Dashboard API (spec 013).
 * Calls the 4 backend endpoints under /api/v1/operator/dashboard/.
 * The JWT is sent automatically by the Angular HTTP interceptor.
 * The backend resolves the operator's agent_id from the JWT — no explicit agent_id needed here.
 */
@Injectable({ providedIn: 'root' })
export class OperatorDashboardHttpGateway implements OperatorDashboardGateway {

  private readonly BASE = '/api/v1/operator/dashboard';

  constructor(private readonly http: HttpClient) {}

  getSummary(): Observable<OperatorSummaryResponse> {
    return this.http.get<OperatorSummaryResponse>(`${this.BASE}/summary`);
  }

  getHourlyVolume(): Observable<OperatorHourlyVolumeResponse> {
    return this.http.get<OperatorHourlyVolumeResponse>(`${this.BASE}/hourly-volume`);
  }

  getTypeDistribution(): Observable<OperatorTypeDistributionResponse> {
    return this.http.get<OperatorTypeDistributionResponse>(`${this.BASE}/type-distribution`);
  }

  getRecentOperations(): Observable<OperatorRecentOperationsResponse> {
    return this.http.get<OperatorRecentOperationsResponse>(`${this.BASE}/recent`);
  }
}
