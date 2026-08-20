import { Observable } from 'rxjs';

// ── Section loading state ──────────────────────────────────────────────────

export type SectionStatus = 'loading' | 'content' | 'error';

export interface SectionState<T> {
  status: SectionStatus;
  data:   T | null;
  error?: string;
}

// ── Response interfaces (all fields in English, matching backend records) ──

export interface OperatorSummaryResponse {
  totalOpsHoy:            number;
  variacionOpsVsAyer:     number | null;   // null when no yesterday data (A-05)
  montoBruto:             number;
  variacionMontoVsAyer:   number | null;   // null when no yesterday data (A-05)
  totalEntradas:          number;
  countEntradas:          number;
  totalSalidas:           number;
  countSalidas:           number;
  movimientoNeto:         number;
  liquidez:               'POSITIVO' | 'NEGATIVO';  // I1: all-caps (backend enum)
}

export interface HourlyPoint {
  hour:       string;   // "HH:00"
  deposit:    number;
  withdrawal: number;
  other:      number;
}

export interface OperatorHourlyVolumeResponse {
  points: HourlyPoint[];
}

export interface TypeSegment {
  typeName:     string;
  internalCode: string;   // for color/icon mapping: 'DEPOSIT', 'WITHDRAWAL', etc.
  count:        number;
  percentage:   number;   // 0–100 with 1 decimal
}

export interface OperatorTypeDistributionResponse {
  totalOps: number;
  segments: TypeSegment[];
}

export interface RecentOperation {
  id:           number;
  fecha:        string;   // "DD/MM/YYYY"
  hora:         string;   // "HH:MM:SS"
  agente:       string;
  tipo:         string;   // human-readable name from operation_types
  internalCode: string;   // for icon/color mapping
  monto:        number;
  estado:       'ACTIVE' | 'CANCELLED';
}

export interface OperatorRecentOperationsResponse {
  operations: RecentOperation[];
}

// ── Gateway port interface ─────────────────────────────────────────────────

export interface OperatorDashboardGateway {
  getSummary(): Observable<OperatorSummaryResponse>;
  getHourlyVolume(): Observable<OperatorHourlyVolumeResponse>;
  getTypeDistribution(): Observable<OperatorTypeDistributionResponse>;
  getRecentOperations(): Observable<OperatorRecentOperationsResponse>;
}
