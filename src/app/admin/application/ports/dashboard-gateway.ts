import { Observable } from 'rxjs';

// ── Section loading state ──────────────────────────────────────────────────

export type SectionStatus = 'loading' | 'content' | 'error';

export interface SectionState<T> {
  status: SectionStatus;
  data: T | null;
  error?: string;
}

// ── Filter model ───────────────────────────────────────────────────────────

/**
 * Global filter applied to all 5 dashboard endpoints.
 * Note: the UI labels the geographic level as "Región" but the backend
 * uses "department" — departmentId maps to departments.id in the DB.
 */
export interface DashboardFilter {
  dateRange: 'HOY' | 'AYER' | 'ULTIMOS_7_DIAS' | 'ESTE_MES' | 'PERSONALIZADO';
  startDate: string | null;   // YYYY-MM-DD, only for PERSONALIZADO
  endDate:   string | null;   // YYYY-MM-DD, only for PERSONALIZADO
  departmentId: number | null;
  provinceId:   number | null;
  districtId:   number | null;
  operator:     string | null;
  operationStatus: 'TODOS' | 'ACTIVO' | 'CANCELADO';
}

export const DEFAULT_FILTER: DashboardFilter = {
  dateRange:       'HOY',
  startDate:       null,
  endDate:         null,
  departmentId:    null,
  provinceId:      null,
  districtId:      null,
  operator:        null,
  operationStatus: 'TODOS',
};

// ── Panel-level filter for "Por Agente" doughnut ──────────────────────────

export type AgentPanelMode = 'NINGUNO' | 'POR_REGION' | 'POR_AGENTE';

export interface AgentPanelFilter {
  mode:  AgentPanelMode;
  value: string | null;
}

export const DEFAULT_AGENT_PANEL_FILTER: AgentPanelFilter = {
  mode:  'NINGUNO',
  value: null,
};

// ── Response interfaces ────────────────────────────────────────────────────

export interface DashboardSummaryResponse {
  montoBrutoOperado:   number;
  totalEntradas:       number;
  totalSalidas:        number;
  movimientoNeto:      number;
  liquidezIndicator:   'SUPERAVIT' | 'DEFICIT';
  variacionPorcentaje: number;
  totalOps:            number;
  operadoresActivos:   number;
  agentesActivos:      number;
  operacionesAnuladas: number;
}

export interface EvolutionPoint {
  hour:  string;   // "HH:00"
  value: number;
}

export interface DashboardEvolutionResponse {
  mode:   'vol' | 'val';
  points: EvolutionPoint[];
}

export interface AgentSegment {
  id:         number;
  name:       string;
  volume:     number;
  percentage: number;
  colorIndex: number;
}

export interface AgentDistributionResponse {
  mode:     'AGGREGATE' | 'DRILLDOWN';
  segments: AgentSegment[];
}

export interface RegionFlow {
  region:   string;
  entradas: number;
  salidas:  number;
}

export interface FlowComparisonResponse {
  regions: RegionFlow[];
}

export interface TopOperator {
  id:              number;
  fullName:        string;
  initials:        string;
  operationCount:  number;
  cancellationPct: number;
}

export interface TopOperatorsResponse {
  operators: TopOperator[];
}

// ── Gateway interface ──────────────────────────────────────────────────────

export interface DashboardGateway {
  getSummary(filter: DashboardFilter): Observable<DashboardSummaryResponse>;
  getEvolution(filter: DashboardFilter, mode: 'vol' | 'val'): Observable<DashboardEvolutionResponse>;
  getAgentDistribution(filter: DashboardFilter, panel: AgentPanelFilter): Observable<AgentDistributionResponse>;
  getFlowComparison(filter: DashboardFilter): Observable<FlowComparisonResponse>;
  getTopOperators(filter: DashboardFilter): Observable<TopOperatorsResponse>;
}
