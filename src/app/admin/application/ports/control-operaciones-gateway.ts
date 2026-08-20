import { Observable } from 'rxjs';

// ── Section loading state ─────────────────────────────────────────────────

export type SectionStatus = 'loading' | 'content' | 'error';

export interface SectionState<T> {
  status: SectionStatus;
  data:   T | null;
  error?: string;
}

// ── Filter & pagination ───────────────────────────────────────────────────

/**
 * Filter applied via the "Filtrar" button (explicit, not reactive).
 * All fields are nullable — omitted from query params when null.
 * Field names match the API query parameter names exactly (contracts/operations-api.yaml).
 */
export interface ControlOperationsFilter {
  agenciaId:   string | null;
  operador:    string | null;          // partial search by operator ID or name
  fechaInicio: string | null;          // ISO date string, e.g. "2023-10-01"
  fechaFin:    string | null;          // ISO date string, e.g. "2023-10-31"
  montoMin:    number | null;
  montoMax:    number | null;
  estado:      OperationStatus | null; // filter by operation status
}

export const DEFAULT_OPERATIONS_FILTER: ControlOperationsFilter = {
  agenciaId:   null,
  operador:    null,
  fechaInicio: null,
  fechaFin:    null,
  montoMin:    null,
  montoMax:    null,
  estado:      null,
};

export interface PaginationParams {
  page:     number;   // 1-based
  pageSize: number;   // default 5
}

export const DEFAULT_PAGINATION: PaginationParams = {
  page:     1,
  pageSize: 5,
};

// ── KPI response ──────────────────────────────────────────────────────────

/**
 * Response from GET /control-operaciones/kpis.
 * All variation fields compare today (HOY) vs yesterday (D-1).
 * Field names match the API response schema exactly.
 */
export interface ControlOperationsKpisResponse {
  totalOperadoHoy:          number;   // total operated today in Soles
  variacionTotalOperado:    number;   // percentage vs D-1 (positive = increase)
  totalOperaciones:         number;   // integer count of operations today
  variacionOperaciones:     number;   // percentage vs D-1
  ticketPromedio:           number;   // average operation amount today in Soles
  variacionTicketPromedio:  number;   // percentage vs D-1 (negative = decrease)
}

// ── Operations table response ─────────────────────────────────────────────

export type OperationStatus =
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'EN_PROCESO'
  | 'PENDIENTE_VALIDACION';

/**
 * Single row in the operations table.
 * Field names match the API response schema exactly.
 */
export interface OperationRecord {
  id:             string;         // format: TRX-XXXXXL
  fechaHora:      string;         // display: "DD/MM/YY HH:MM:SS"
  operadorId:     string;         // e.g. "OP-442"
  operadorNombre: string;         // e.g. "M. Rossi"
  agenciaId:      string;
  agenciaNombre:  string;         // e.g. "Agencia Central (CABA)"
  tipoOperacion:  string;         // e.g. "Deposito Efectivo"
  monto:          number;         // decimal in Soles
  estado:         OperationStatus;
}

/**
 * Paginated response from GET /control-operaciones/operaciones.
 * Sorted by fechaHora descending (newest first) by default.
 */
export interface OperationsPageResponse {
  items:              OperationRecord[];
  paginaActual:       number;
  totalRegistros:     number;
  registrosPorPagina: number;
  totalPaginas:       number;
}

// ── Trend badge variant ───────────────────────────────────────────────────

/**
 * Visual variant for a KPI trend badge (FR-051).
 * - 'positive': green badge + trending_up icon (variacion > 0)
 * - 'negative': red badge + trending_down icon (variacion < 0)
 * - 'neutral':  grey badge, no icon (variacion === 0 or null/no D-1 data)
 */
export type TrendBadgeVariant = 'positive' | 'negative' | 'neutral';

/**
 * Derives the trend badge variant from a variation percentage value.
 * @param variation - percentage value from the KPI response; null if no D-1 data
 */
export function getTrendVariant(variation: number | null): TrendBadgeVariant {
  if (variation === null || variation === 0) return 'neutral';
  return variation > 0 ? 'positive' : 'negative';
}

// ── Agency option for the Agencia filter dropdown ─────────────────────────

export interface AgencyOption {
  id:   number;
  name: string;
}

// ── Operator option for the Operador autocomplete filter ──────────────────

export interface OperatorOption {
  id:   number;
  name: string;
}

// ── Gateway interface ─────────────────────────────────────────────────────

export interface ControlOperationsGateway {
  /** Load today's KPI summary (GET /control-operaciones/kpis). */
  getKpis(): Observable<ControlOperationsKpisResponse>;

  /** Load a page of operations with optional filter (GET /control-operaciones/operaciones). */
  getOperations(
    filter: ControlOperationsFilter,
    pagination: PaginationParams
  ): Observable<OperationsPageResponse>;

  /** Download all matching operations as Excel XLSX (GET /control-operaciones/export). */
  exportOperations(filter: ControlOperationsFilter): Observable<Blob>;

  /** Cancel a single operation by ID (PATCH /control-operaciones/{id}/cancel). */
  cancelOperation(id: string): Observable<void>;

  /** Load active agencies for the Agencia filter select (GET /control-operaciones/agencias). */
  getAgencies(): Observable<AgencyOption[]>;

  /** Load active operators for the Operador autocomplete (GET /control-operaciones/operadores). */
  getOperators(): Observable<OperatorOption[]>;
}
