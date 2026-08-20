import { Component, OnInit, Inject, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { trigger, style, animate, transition } from '@angular/animations';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { OperationsFacade } from '../../../application/operations.facade';
import { OperationResponse } from '../../../domain/operation';
import { formatOperationType, parseAmount, getDecimalSeparator } from '../../../domain/operation-validation';
import { OPERATIONS_GATEWAY, OperationsGateway } from '../../../application/ports/operations-gateway';
import { OperationTypesHttpGateway } from '../../../../admin/adapters/out/http/operation-types-http.gateway';
import { OperationTypeResponse } from '../../../../admin/application/ports/operation-types-gateway';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
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
export class HistoryPageComponent implements OnInit {
  readonly facade = inject(OperationsFacade);
  private readonly opTypesGateway = inject(OperationTypesHttpGateway);

  /**
   * Set to true when navigating here from the registration success screen
   * via "VER DETALLE". The first loaded operation will be auto-opened in the
   * detail panel.
   */
  private shouldOpenLastDetail = false;

  constructor(@Inject(OPERATIONS_GATEWAY) private readonly gateway: OperationsGateway) {
    // Auto-open detail panel for the most recent operation when redirected
    // from the registration success screen (shouldOpenLastDetail flag set on init).
    effect(() => {
      const state = this.facade.state();
      if (
        this.shouldOpenLastDetail &&
        state.status === 'content' &&
        state.operations.length > 0
      ) {
        this.shouldOpenLastDetail = false; // prevent re-opening on subsequent refreshes
        this.detailPanelOp.set(state.operations[0]);
      }
    });
  }

  // ── Operation types loaded from backend ───────────────────────────────────
  readonly backendOpTypes = signal<OperationTypeResponse[]>([]);
  readonly opTypesLoading = signal(true);

  // ── Valid statuses ────────────────────────────────────────────────────────
  readonly statuses = [
    { value: 'ACTIVE',    label: 'Completado' },
    { value: 'CANCELLED', label: 'Cancelado'  },
  ];

  // ── Filter form controls ──────────────────────────────────────────────────
  readonly dateRangeGroup = new FormGroup({
    dateFrom: new FormControl<Date | null>(null),
    dateTo:   new FormControl<Date | null>(null),
  });
  readonly typeFilter   = new FormControl<string>('');
  readonly statusFilter = new FormControl<string>('');

  // ── Pagination ────────────────────────────────────────────────────────────
  readonly pageSize    = 10;
  readonly currentPage = signal(0);

  // ── Skeleton rows ─────────────────────────────────────────────────────────
  readonly skeletonRows: OperationResponse[] = Array.from({ length: 5 }, (_, i) => ({
    id: `skeleton-${i}`,
    type: '',
    amount: '',
    registeredAt: '',
    lastModifiedAt: '',
    status: 'ACTIVE',
  }));

  // ── View detail side panel (read-only) ───────────────────────────────────
  readonly detailPanelOp    = signal<OperationResponse | null>(null);

  onViewDetailClick(operation: OperationResponse): void {
    this.detailPanelOp.set(operation);
  }

  closeDetailPanel(): void {
    this.detailPanelOp.set(null);
  }

  // ── Edit side panel ───────────────────────────────────────────────────────
  readonly editPanelOp      = signal<OperationResponse | null>(null);
  readonly editForm         = new FormGroup({
    type:   new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly isSaving         = signal(false);
  readonly editErrorMessage = signal<string | null>(null);

  // ── Cancel confirmation modal ─────────────────────────────────────────────
  readonly cancelConfirmOp    = signal<OperationResponse | null>(null);
  readonly isCancelling       = signal(false);
  readonly cancelErrorMessage = signal<string | null>(null);

  // ── Derived state ─────────────────────────────────────────────────────────

  get state() { return this.facade.state(); }
  get isLoading(): boolean { return this.state.status === 'loading'; }

  readonly allFiltered     = computed(() => this.facade.state().operations);
  readonly pagedOperations = computed(() => {
    const start = this.currentPage() * this.pageSize;
    return this.allFiltered().slice(start, start + this.pageSize);
  });
  readonly totalCount      = computed(() => this.allFiltered().length);
  readonly paginationStart = computed(() =>
    this.totalCount() === 0 ? 0 : this.currentPage() * this.pageSize + 1);
  readonly paginationEnd   = computed(() =>
    Math.min((this.currentPage() + 1) * this.pageSize, this.totalCount()));
  readonly isFirstPage     = computed(() => this.currentPage() === 0);
  readonly isLastPage      = computed(() =>
    (this.currentPage() + 1) * this.pageSize >= this.totalCount());

  // ── Date range display ────────────────────────────────────────────────────

  get dateRangeDisplay(): string {
    const start = this.dateRangeGroup.controls.dateFrom.value;
    const end   = this.dateRangeGroup.controls.dateTo.value;
    if (!start && !end) return '';
    const s = start ? this.formatDateDisplay(start) : '...';
    const e = end   ? this.formatDateDisplay(end)   : '...';
    return `${s} - ${e}`;
  }

  private formatDateDisplay(date: Date): string {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const d = String(date.getDate()).padStart(2, '0');
    return `${d} ${months[date.getMonth()]}`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Check if we arrived here from the registration success "VER DETALLE" button.
    // Angular stores router navigation state in window.history.state.
    const navState = (window.history.state ?? {}) as Record<string, unknown>;
    if (navState['openLastDetail'] === true) {
      this.shouldOpenLastDetail = true;
      // Clear the state so a page refresh doesn't re-trigger the panel.
      window.history.replaceState({}, '', window.location.href);
    }

    this.facade.refresh();

    firstValueFrom(
      this.opTypesGateway.listOperationTypes({ page: 1, size: 100, status: 'ACTIVO' })
    ).then(resp => {
      this.backendOpTypes.set(resp.content ?? []);
      // If the edit panel was opened before types loaded, re-resolve the type select value
      const op = this.editPanelOp();
      if (op && !this.isSaving()) {
        const resolved = this.resolveTypeId(op.type);
        if (resolved !== this.editForm.controls.type.value) {
          this.editForm.controls.type.setValue(resolved, { emitEvent: false });
        }
      }
    }).catch(() => {
      this.backendOpTypes.set([]);
    }).finally(() => {
      this.opTypesLoading.set(false);
    });
  }

  // ── Filter actions ────────────────────────────────────────────────────────

  applyFilters(): void {
    const from   = this.dateToIso(this.dateRangeGroup.controls.dateFrom.value);
    const to     = this.dateToIso(this.dateRangeGroup.controls.dateTo.value);
    const type   = this.typeFilter.value   || undefined;
    const status = this.statusFilter.value || undefined;
    this.currentPage.set(0);
    this.facade.refresh({ from, to, type, status });
  }

  clearFilters(): void {
    this.dateRangeGroup.reset({ dateFrom: null, dateTo: null });
    this.typeFilter.reset('');
    this.statusFilter.reset('');
    this.currentPage.set(0);
    this.facade.refresh();
  }

  private dateToIso(date: Date | null): string | undefined {
    if (!date) return undefined;
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Edit side panel ───────────────────────────────────────────────────────

  onEditClick(operation: OperationResponse): void {
    if (operation.status === 'CANCELLED') return;
    this.editPanelOp.set(operation);
    this.editForm.enable();

    // Resolve operation.type to the matching opType.id from backendOpTypes.
    // The API may return the type id (UUID) or a legacy name ('DEPOSIT', 'Depósito en Efectivo').
    // Priority: exact ID match → exact name match → raw value as last resort.
    const resolvedTypeId = this.resolveTypeId(operation.type);

    this.editForm.reset({
      type:   resolvedTypeId,
      amount: operation.amount,
    });
    this.editErrorMessage.set(null);
  }

  /**
   * Resolves an operation.type string to the corresponding opType.id from backendOpTypes.
   * First tries an exact ID match (future-proof when backend returns UUIDs).
   * Falls back to name match for the current API that returns type names.
   * Returns the raw value unchanged if no match is found.
   */
  private resolveTypeId(rawType: string): string {
    const opTypes = this.backendOpTypes();
    if (!opTypes.length) return rawType;
    // Exact ID match (UUID) — preferred; no ambiguity
    const byId = opTypes.find(t => t.id === rawType);
    if (byId) return byId.id;
    // Name match — handles current API that returns the type name in the type field
    const byName = opTypes.find(t => t.name === rawType);
    if (byName) return byName.id;
    return rawType;
  }

  closeEditPanel(): void {
    if (this.isSaving()) return;
    this.editPanelOp.set(null);
    this.editErrorMessage.set(null);
  }

  async onSaveEdit(): Promise<void> {
    if (this.editForm.invalid || this.isSaving()) return;

    const op = this.editPanelOp();
    if (!op) return;

    const rawType   = this.editForm.controls.type.value;
    const rawAmount = this.editForm.controls.amount.value;

    const amountResult = parseAmount(rawAmount, getDecimalSeparator());
    if (!amountResult.ok) {
      this.editErrorMessage.set(amountResult.error);
      return;
    }

    this.isSaving.set(true);
    this.editErrorMessage.set(null);
    this.editForm.disable();

    try {
      const result = await firstValueFrom(
        this.gateway.updateOperation(op.id, rawType, amountResult.canonical, op.lastModifiedAt)
      );

      if (result.ok) {
        this.editPanelOp.set(null);
        this.facade.refresh({
          from:   this.dateToIso(this.dateRangeGroup.controls.dateFrom.value),
          to:     this.dateToIso(this.dateRangeGroup.controls.dateTo.value),
          type:   this.typeFilter.value || undefined,
          status: this.statusFilter.value || undefined,
        });
      } else if (!result.ok && result.conflict) {
        this.editErrorMessage.set(
          'Conflicto: la operación fue modificada. Cierre el panel y vuelva a editar.'
        );
        this.editForm.enable();
      } else {
        this.editErrorMessage.set('No se pudo guardar la operación. Intente nuevamente.');
        this.editForm.enable();
      }
    } catch {
      this.editErrorMessage.set('Error de comunicación. Intente nuevamente.');
      this.editForm.enable();
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Cancel confirmation modal ─────────────────────────────────────────────

  onCancelClick(operation: OperationResponse): void {
    if (operation.status === 'CANCELLED') return;
    this.cancelConfirmOp.set(operation);
    this.cancelErrorMessage.set(null);
  }

  dismissCancelConfirm(): void {
    if (this.isCancelling()) return;
    this.cancelConfirmOp.set(null);
    this.cancelErrorMessage.set(null);
  }

  async confirmCancel(): Promise<void> {
    const op = this.cancelConfirmOp();
    if (!op || this.isCancelling()) return;

    this.isCancelling.set(true);
    this.cancelErrorMessage.set(null);

    try {
      const result = await firstValueFrom(this.gateway.cancelOperation(op.id));

      if (result.ok) {
        this.cancelConfirmOp.set(null);
        this.facade.refresh({
          from:   this.dateToIso(this.dateRangeGroup.controls.dateFrom.value),
          to:     this.dateToIso(this.dateRangeGroup.controls.dateTo.value),
          type:   this.typeFilter.value || undefined,
          status: this.statusFilter.value || undefined,
        });
      } else if (!result.ok && 'alreadyCanceled' in result && result.alreadyCanceled) {
        this.cancelErrorMessage.set('La operación ya fue anulada.');
        this.cancelConfirmOp.set(null);
        this.facade.refresh();
      } else if (!result.ok && 'notFound' in result && result.notFound) {
        this.cancelErrorMessage.set('No se encontró la operación.');
        this.cancelConfirmOp.set(null);
        this.facade.refresh();
      } else {
        this.cancelErrorMessage.set('No se pudo anular la operación. Intente nuevamente.');
      }
    } catch {
      this.cancelErrorMessage.set('Error de comunicación. Intente nuevamente.');
    } finally {
      this.isCancelling.set(false);
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  prevPage(): void {
    if (!this.isFirstPage()) this.currentPage.update((p: number) => p - 1);
  }

  nextPage(): void {
    if (!this.isLastPage()) this.currentPage.update((p: number) => p + 1);
  }

  // ── Formatters ────────────────────────────────────────────────────────────

  formatDate(registeredAt: string): string {
    try {
      const d = new Date(registeredAt);
      if (isNaN(d.getTime())) return registeredAt;
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      const hh   = String(d.getHours()).padStart(2, '0');
      const min  = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
      return registeredAt;
    }
  }

  formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatType(type: string): string {
    return formatOperationType(type);
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'ACTIVE':    return 'Completado';
      case 'CANCELLED': return 'Cancelado';
      default:          return status;
    }
  }

  statusChipClass(status: string): string {
    switch (status) {
      case 'ACTIVE':    return 'chip chip--completed';
      case 'CANCELLED': return 'chip chip--cancelled';
      default:          return 'chip chip--pending';
    }
  }
}
