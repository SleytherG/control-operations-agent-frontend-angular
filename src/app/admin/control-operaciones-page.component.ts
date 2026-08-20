import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';

import { ControlOperacionesFacade } from './application/control-operaciones.facade';
import {
  ControlOperationsFilter,
  DEFAULT_OPERATIONS_FILTER,
  OperationStatus,
  getTrendVariant,
} from './application/ports/control-operaciones-gateway';

// ── Chip CSS class names per status (FR-036, FR-037) ─────────────────────
// Uses SCSS BEM classes from .control-operaciones-page.component.scss

const STATUS_CHIP_CLASSES: Record<OperationStatus, string> = {
  COMPLETADA:           'status-chip status-chip--completada',
  CANCELADA:            'status-chip status-chip--cancelada',
  EN_PROCESO:           'status-chip status-chip--en-proceso',
  PENDIENTE_VALIDACION: 'status-chip status-chip--pendiente',
};

/** Returns the SCSS class string for a given OperationStatus (FR-036, FR-037). */
export function getStatusChipClasses(status: OperationStatus): string {
  return STATUS_CHIP_CLASSES[status] ?? 'status-chip';
}

/** Maps an OperationStatus to its display label (FR-036, FR-037). */
export function getStatusLabel(status: OperationStatus): string {
  const labels: Record<OperationStatus, string> = {
    COMPLETADA:           'Completada',
    CANCELADA:            'CANCELADA',
    EN_PROCESO:           'En Proceso',
    PENDIENTE_VALIDACION: 'Pendiente Valid.',
  };
  return labels[status] ?? status;
}

// ── Component ─────────────────────────────────────────────────────────────

@Component({
  selector: 'app-control-operaciones-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatTooltipModule,
    MatIconModule,
  ],
  templateUrl: './control-operaciones-page.component.html',
  styleUrl:    './control-operaciones-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInPanel', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('250ms cubic-bezier(0.4, 0, 0.6, 1)', style({ transform: 'translateX(100%)' })),
      ]),
    ]),
    trigger('fadeBackdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('180ms ease', style({ opacity: 0 })),
      ]),
    ]),
  ],
})
export class ControlOperacionesPageComponent implements OnInit, OnDestroy {

  readonly facade = inject(ControlOperacionesFacade);

  // ── Expose helpers to template ────────────────────────────────────────
  readonly getTrendVariant      = getTrendVariant;
  readonly getStatusChipClasses = getStatusChipClasses;
  readonly getStatusLabel       = getStatusLabel;

  // ── Filter form state ─────────────────────────────────────────────────

  /**
   * Staged filter values — signal so that [value] bindings update on Limpiar (T048, FR-026).
   */
  readonly pendingFilter = signal<ControlOperationsFilter>({ ...DEFAULT_OPERATIONS_FILTER });

  /** True when pendingFilter has montoMin > montoMax (FR-024). */
  readonly hasMontoRangeError = signal<boolean>(false);

  /** Controls visibility of the contextual action menu per row. */
  readonly activeMenuRowId = signal<string | null>(null);

  /** Operation currently shown in the detail side panel. */
  readonly detailOp = signal<import('./application/ports/control-operaciones-gateway').OperationRecord | null>(null);

  /** Operation pending cancel confirmation. */
  readonly confirmCancelOp = signal<import('./application/ports/control-operaciones-gateway').OperationRecord | null>(null);

  /** Raw value displayed in the Operador search input */
  operadorInputValue = '';

  /** Whether the Operador autocomplete dropdown is visible */
  showOperadorDropdown = false;

  /**
   * Returns operator names matching the current search query.
   * Returns EMPTY array when no query typed (no default suggestions on focus).
   */
  get filteredOperadorOptions(): string[] {
    const query = this.operadorInputValue.trim();
    if (!query) return [];
    const q = query.toLowerCase();
    return this.facade.operators()
      .filter(op => op.name.toLowerCase().includes(q))
      .map(op => op.name)
      .slice(0, 8);
  }

  /**
   * Angular Material date range FormGroup for the date range picker.
   * Value changes are synced to pendingFilter automatically.
   */
  readonly dateRangeGroup = new FormGroup({
    fechaInicio: new FormControl<Date | null>(null),
    fechaFin:    new FormControl<Date | null>(null),
  });

  /** Timer ID for cancel error toast auto-dismiss (T047). */
  private cancelToastTimerId: ReturnType<typeof setTimeout> | null = null;

  // ── Resizable columns ─────────────────────────────────────────────────────

  /**
   * Initial column widths in pixels.
   * Order: ID Operación, Fecha/Hora, Operador, Agencia, Tipo, Monto, Estado, Acciones
   */
  readonly columnWidths = signal<number[]>([130, 145, 145, 150, 150, 100, 115, 130]);

  private resizingColIndex = -1;
  private resizeStartX     = 0;
  private resizeStartWidth = 0;
  private resizeMoveHandler: ((e: MouseEvent) => void) | null = null;
  private resizeUpHandler:   (() => void)             | null = null;

  /** Called on mousedown on a column resize handle. */
  onResizeStart(colIndex: number, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.resizingColIndex = colIndex;
    this.resizeStartX     = event.clientX;
    this.resizeStartWidth = this.columnWidths()[colIndex];

    this.resizeMoveHandler = (e: MouseEvent) => {
      const delta    = e.clientX - this.resizeStartX;
      const newWidth = Math.max(60, this.resizeStartWidth + delta);
      this.columnWidths.update(widths => {
        const next = [...widths];
        next[this.resizingColIndex] = newWidth;
        return next;
      });
    };

    this.resizeUpHandler = () => {
      this.resizingColIndex = -1;
      document.removeEventListener('mousemove', this.resizeMoveHandler!);
      document.removeEventListener('mouseup',   this.resizeUpHandler!);
      this.resizeMoveHandler = null;
      this.resizeUpHandler   = null;
    };

    document.addEventListener('mousemove', this.resizeMoveHandler);
    document.addEventListener('mouseup',   this.resizeUpHandler);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.facade.loadKpis();

    // Sync Material date range picker values to pendingFilter signal
    this.dateRangeGroup.controls.fechaInicio.valueChanges.subscribe(date => {
      const iso = date ? this.toIso(date) : null;
      this.pendingFilter.update(f => ({ ...f, fechaInicio: iso }));
    });
    this.dateRangeGroup.controls.fechaFin.valueChanges.subscribe(date => {
      const iso = date ? this.toIso(date) : null;
      this.pendingFilter.update(f => ({ ...f, fechaFin: iso }));
    });

    // T047: Auto-dismiss the cancel error toast after 4 seconds (FR-052, Decision 12).
    effect(() => {
      const msg = this.facade.cancelErrorMessage();
      if (msg !== null) {
        if (this.cancelToastTimerId) clearTimeout(this.cancelToastTimerId);
        this.cancelToastTimerId = setTimeout(() => {
          this.facade.clearCancelError();
          this.cancelToastTimerId = null;
        }, 4000);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.cancelToastTimerId) clearTimeout(this.cancelToastTimerId);
    // Clean up any lingering resize listeners
    if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
    if (this.resizeUpHandler)   document.removeEventListener('mouseup',   this.resizeUpHandler);
  }

  // ── Filter actions ────────────────────────────────────────────────────

  onAgenciaChange(value: string): void {
    this.pendingFilter.update(f => ({ ...f, agenciaId: value || null }));
  }

  onEstadoChange(value: string): void {
    const estado = value ? value as OperationStatus : null;
    this.pendingFilter.update(f => ({ ...f, estado }));
  }

  /** Called on keystroke in the Operador input — always stages the current value
   *  so that clicking FILTRAR without a dropdown selection still uses what's typed */
  onOperadorInput(value: string): void {
    this.operadorInputValue = value;
    this.showOperadorDropdown = value.trim().length > 0;
    // Always sync the typed value to pendingFilter (mirrors original onOperadorChange behaviour)
    this.pendingFilter.update(f => ({ ...f, operador: value.trim() || null }));
  }

  /** Called when the Operador input loses focus */
  onOperadorBlur(): void {
    setTimeout(() => { this.showOperadorDropdown = false; }, 150);
  }

  /** Called when the user selects an option from the Operador dropdown */
  onOperadorSelect(name: string): void {
    this.operadorInputValue = name;
    this.showOperadorDropdown = false;
    this.pendingFilter.update(f => ({ ...f, operador: name || null }));
  }

  onFechaInicioChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.pendingFilter.update(f => ({ ...f, fechaInicio: value || null }));
  }

  onFechaFinChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.pendingFilter.update(f => ({ ...f, fechaFin: value || null }));
  }

  onMontoMinChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const parsed = value ? parseFloat(value) : null;
    this.pendingFilter.update(f => ({ ...f, montoMin: parsed }));
    this.validateMontoRange();
  }

  onMontoMaxChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const parsed = value ? parseFloat(value) : null;
    this.pendingFilter.update(f => ({ ...f, montoMax: parsed }));
    this.validateMontoRange();
  }

  /** Validates that montoMin <= montoMax when both are set (FR-024). */
  private validateMontoRange(): void {
    const { montoMin, montoMax } = this.pendingFilter();
    this.hasMontoRangeError.set(
      montoMin !== null && montoMax !== null && montoMin > montoMax
    );
  }

  /** Applies the staged filter. Blocked when montoMin > montoMax (FR-024). */
  onFiltrar(): void {
    if (this.hasMontoRangeError() || this.facade.isFiltering()) return;
    this.facade.applyFilter({ ...this.pendingFilter() });
  }

  /** Resets all filter controls and reloads the table (FR-026, T048). */
  onLimpiar(): void {
    // Reset signal — [value] bindings on <select>/<input> will update via OnPush (T048).
    this.pendingFilter.set({ ...DEFAULT_OPERATIONS_FILTER });
    this.hasMontoRangeError.set(false);
    // Reset date range picker and operador custom input
    this.dateRangeGroup.reset({ fechaInicio: null, fechaFin: null });
    this.operadorInputValue = '';
    this.showOperadorDropdown = false;
    this.facade.reset();
  }

  // ── Pagination ────────────────────────────────────────────────────────

  goToPage(page: number): void {
    this.facade.goToPage(page);
  }

  /** Builds the visible page number list: [1, 2, 3, '...'] when totalPages > 3 (FR-042). */
  getVisiblePages(totalPages: number, currentPage: number): (number | '...')[] {
    if (totalPages <= 3) return Array.from({ length: totalPages }, (_, i) => i + 1);
    return [1, 2, 3, '...'];
  }

  // ── Export ────────────────────────────────────────────────────────────

  onExport(): void {
    this.facade.export();
  }

  // ── Row action menu ───────────────────────────────────────────────────

  toggleActionMenu(rowId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.activeMenuRowId.set(this.activeMenuRowId() === rowId ? null : rowId);
  }

  closeActionMenu(): void {
    this.activeMenuRowId.set(null);
  }

  onViewDetail(id: string): void {
    const op = this.facade.operationsState().data?.items.find(o => o.id === id) ?? null;
    this.detailOp.set(op);
    this.closeActionMenu();
  }

  closeDetailPanel(): void {
    this.detailOp.set(null);
  }

  onCancelOperation(id: string, status: OperationStatus): void {
    if (status === 'CANCELADA') return;
    const op = this.facade.operationsState().data?.items.find(o => o.id === id) ?? null;
    this.confirmCancelOp.set(op);
    this.closeActionMenu();
  }

  confirmCancel(): void {
    const op = this.confirmCancelOp();
    if (!op) return;
    this.confirmCancelOp.set(null);
    this.facade.cancelOperation(op.id);
  }

  dismissConfirmCancel(): void {
    this.confirmCancelOp.set(null);
  }

  // ── Utility ───────────────────────────────────────────────────────────

  /** Formats a decimal Soles amount as "S/ 1,500,000.00" (FR-035). */
  formatAmount(amount: number): string {
    return 'S/ ' + amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Formats a KPI Soles amount as "S/45,200,000" (FR-018, no space after S/). */
  formatKpiAmount(amount: number): string {
    return 'S/' + amount.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /** Formats a percentage variation as "+12.5%" or "-1.1%". */
  formatVariation(variation: number): string {
    return (variation >= 0 ? '+' : '') + variation.toFixed(1) + '%';
  }

  /** Calculates the last record index shown on the current page (for the pagination counter). */
  getPaginationEnd(currentPage: number, pageSize: number, total: number): number {
    return Math.min(currentPage * pageSize, total);
  }

  /** Converts a Date object to ISO date string (YYYY-MM-DD) for the filter. */
  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Formats a date for display as "DD MMM" (e.g., "01 Oct"). */
  formatDateDisplay(date: Date | null): string {
    if (!date) return '';
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const d = String(date.getDate()).padStart(2, '0');
    return `${d} ${months[date.getMonth()]}`;
  }

  /** Returns the date range display string (e.g., "01 Oct - 31 Oct") or placeholder. */
  get dateRangeDisplay(): string {
    const start = this.dateRangeGroup.controls.fechaInicio.value;
    const end   = this.dateRangeGroup.controls.fechaFin.value;
    if (!start && !end) return '';
    const s = start ? this.formatDateDisplay(start) : '...';
    const e = end   ? this.formatDateDisplay(end)   : '...';
    return `${s} - ${e}`;
  }
}
