import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AgentDistributionResponse,
  AgentPanelFilter,
  DashboardEvolutionResponse,
  DashboardFilter,
  DashboardGateway,
  DashboardSummaryResponse,
  FlowComparisonResponse,
  TopOperatorsResponse,
} from '../../../application/ports/dashboard-gateway';

@Injectable({ providedIn: 'root' })
export class DashboardHttpGateway implements DashboardGateway {

  private readonly BASE = '/api/v1/dashboard';

  constructor(private readonly http: HttpClient) {}

  getSummary(filter: DashboardFilter): Observable<DashboardSummaryResponse> {
    return this.http.get<DashboardSummaryResponse>(
      `${this.BASE}/summary`,
      { params: this.toParams(filter) }
    );
  }

  getEvolution(filter: DashboardFilter, mode: 'vol' | 'val'): Observable<DashboardEvolutionResponse> {
    const params = this.toParams(filter).set('mode', mode);
    return this.http.get<DashboardEvolutionResponse>(
      `${this.BASE}/evolution`,
      { params }
    );
  }

  getAgentDistribution(
    filter: DashboardFilter,
    panel: AgentPanelFilter
  ): Observable<AgentDistributionResponse> {
    let params = this.toParams(filter);
    if (panel.mode !== 'NINGUNO' && panel.value != null) {
      const filterType = panel.mode === 'POR_AGENTE' ? 'agent' : 'region';
      params = params.set('filterType', filterType).set('filterValue', panel.value);
    }
    return this.http.get<AgentDistributionResponse>(
      `${this.BASE}/agent-distribution`,
      { params }
    );
  }

  getFlowComparison(filter: DashboardFilter): Observable<FlowComparisonResponse> {
    return this.http.get<FlowComparisonResponse>(
      `${this.BASE}/flow-comparison`,
      { params: this.toParams(filter) }
    );
  }

  getTopOperators(filter: DashboardFilter): Observable<TopOperatorsResponse> {
    return this.http.get<TopOperatorsResponse>(
      `${this.BASE}/top-operators`,
      { params: this.toParams(filter) }
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private toParams(f: DashboardFilter): HttpParams {
    let p = new HttpParams().set('dateRange', f.dateRange);

    if (f.dateRange === 'PERSONALIZADO') {
      if (f.startDate) p = p.set('startDate', f.startDate);
      if (f.endDate)   p = p.set('endDate',   f.endDate);
    }
    if (f.departmentId != null) p = p.set('departmentId', f.departmentId.toString());
    if (f.provinceId   != null) p = p.set('provinceId',   f.provinceId.toString());
    if (f.districtId   != null) p = p.set('districtId',   f.districtId.toString());
    if (f.operator     != null && f.operator.trim() !== '') p = p.set('operator', f.operator.trim());
    if (f.operationStatus && f.operationStatus !== 'TODOS') p = p.set('operationStatus', f.operationStatus);

    return p;
  }
}
