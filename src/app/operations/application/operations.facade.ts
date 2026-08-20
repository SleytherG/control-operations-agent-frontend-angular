import { Injectable, Inject, Signal, signal, OnDestroy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { OPERATIONS_GATEWAY, OperationsGateway } from './ports/operations-gateway';
import { PENDING_CONFIRMATION_STORE, PendingConfirmationStore } from './ports/pending-confirmation-store';
import { OperationResponse, PendingConfirmation } from '../domain/operation';
import { parseAmount, getDecimalSeparator, buildCanonicalPayload } from '../domain/operation-validation';
import { CrossTabCoordinator } from '../adapters/out/storage/cross-tab-coordinator';
import { EditDialogComponent, EditDialogData, EditDialogResult } from '../adapters/in/ui/edit-dialog/edit-dialog.component';
import { ConflictDialogComponent, ConflictDialogResult } from '../adapters/in/ui/conflict-dialog/conflict-dialog.component';

/** All possible states of the operations UI state machine */
export type OperationsState = {
  status: 'loading' | 'content' | 'error' | 'invalid' | 'submitting'
         | 'pending-review' | 'storage-error' | 'cleanup-error' | 'draft';
  operations: OperationResponse[];
  rawType: string;
  rawAmount: string;
  pendingKey?: string;
  fieldErrors?: { type?: string; amount?: string };
  errorMessage?: string;
};

@Injectable({ providedIn: 'root' })
export class OperationsFacade implements OnDestroy {

  private readonly _state = signal<OperationsState>({
    status: 'loading',
    operations: [],
    rawType: '',
    rawAmount: '',
  });

  readonly state: Signal<OperationsState> = this._state.asReadonly();

  private cleanupCrossTab?: () => void;

  private readonly dialog = inject(MatDialog);

  constructor(
    @Inject(OPERATIONS_GATEWAY) private readonly gateway: OperationsGateway,
    @Inject(PENDING_CONFIRMATION_STORE) private readonly pendingStore: PendingConfirmationStore,
  ) {
    this.initialize();
    if (typeof window !== 'undefined') {
      this.cleanupCrossTab = CrossTabCoordinator.onRemoteChange(() => {
        const remote = this.pendingStore.load();
        if (remote && this._state().status !== 'submitting') {
          this._state.update(s => ({
            ...s,
            status: 'pending-review',
            rawType: remote.rawType,
            rawAmount: remote.rawAmount,
            pendingKey: remote.idempotencyKey,
          }));
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.cleanupCrossTab?.();
  }

  private initialize(): void {
    const pending = this.pendingStore.load();
    if (pending) {
      this._state.set({
        status: 'pending-review',
        operations: [],
        rawType: pending.rawType,
        rawAmount: pending.rawAmount,
        pendingKey: pending.idempotencyKey,
      });
      return;
    }
    this.loadHistory();
  }

  setDraft(rawType: string, rawAmount: string): void {
    this._state.update(s => ({ ...s, rawType, rawAmount }));
  }

  async confirm(): Promise<void> {
    return CrossTabCoordinator.withExclusiveLock(() => this.doConfirm());
  }

  private async doConfirm(): Promise<void> {
    const { rawType, rawAmount } = this._state();

    // Accept any non-empty type string — DEPOSIT/WITHDRAWAL for legacy hardcoded enum,
    // or an operation type UUID when loaded from /api/v1/operation-types.
    const typeValid = rawType != null && rawType.trim().length > 0;
    const amountResult = parseAmount(rawAmount, getDecimalSeparator());

    if (!typeValid || !amountResult.ok) {
      this._state.update(s => ({
        ...s,
        status: 'invalid',
        fieldErrors: {
          type: typeValid ? undefined : 'Seleccione un tipo vรกlido (Depรณsito o Retiro)',
          amount: amountResult.ok ? undefined : amountResult.error,
        },
      }));
      return;
    }

    const canonicalAmount = amountResult.canonical;
    const payload = buildCanonicalPayload(rawType, canonicalAmount);
    const idempotencyKey = crypto.randomUUID();

    const snapshot: PendingConfirmation = {
      version: 1,
      rawType,
      rawAmount,
      payload,
      idempotencyKey,
    };

    try {
      this.pendingStore.save(snapshot);
    } catch {
      this._state.update(s => ({
        ...s,
        status: 'storage-error',
        errorMessage: 'No se puede registrar: almacenamiento local no disponible.',
      }));
      return;
    }

    this._state.update(s => ({ ...s, status: 'submitting', pendingKey: idempotencyKey }));
    await this.submitPending(snapshot);
  }

  async retry(): Promise<void> {
    return CrossTabCoordinator.withExclusiveLock(() => this.doRetry());
  }

  private async doRetry(): Promise<void> {
    const pending = this.pendingStore.load();
    if (!pending) return;
    this._state.update(s => ({ ...s, status: 'submitting' }));
    await this.submitPending(pending);
  }

  editNew(): void {
    const { rawType, rawAmount } = this._state();
    try {
      this.pendingStore.remove();
      CrossTabCoordinator.notifyChange();
    } catch {
      // best-effort removal on edit
    }
    this._state.update(s => ({
      ...s,
      status: 'draft',
      rawType,
      rawAmount,
      pendingKey: undefined,
    }));
  }

  discard(): void {
    const { rawType, rawAmount } = this._state();
    try {
      this.pendingStore.remove();
    } catch {
      // best-effort
    }
    this._state.update(s => ({
      ...s,
      status: 'draft',
      rawType,
      rawAmount,
      pendingKey: undefined,
    }));
  }

  /**
   * Reload history with optional server-side filters.
   * When any filter value is provided it is forwarded to the backend.
   * Passing no arguments clears the filters and loads the full history.
   *
   * Always transitions the state to 'loading' first so the history page renders
   * a skeleton and the loaded operations are always visible — even when the facade
   * is in 'draft' or 'pending-review' state (e.g. registration page is active).
   */
  refresh(filters?: { from?: string; to?: string; type?: string; status?: string }): void {
    // Force status to 'loading' so loadHistory() is always allowed to update operations.
    this._state.update(s => ({ ...s, status: 'loading', operations: [] }));
    this.loadHistory(filters?.from, filters?.to, filters?.type, filters?.status);
  }

  /**
   * Opens the edit dialog and orchestrates the save/cancel/error/conflict flow.
   * Now also handles cancel_operation action from the dialog (T025).
   */
  async editOperation(operation: OperationResponse): Promise<void> {
    const result = await this.openEditDialog(operation);
    if (!result) return; // dialog dismissed

    if (result.action === 'cancel_operation') {
      // Dialog made the HTTP call and carries the canceled operation โ�� just update state (T043)
      this._state.update(s => ({
        ...s,
        operations: s.operations.map(op =>
          op.id === result.canceledOperation.id ? result.canceledOperation : op
        ),
      }));
      return;
    }

    await this.performUpdate(operation, result);
  }

  private openEditDialog(operation: OperationResponse): Promise<EditDialogResult | undefined> {
    const ref = this.dialog.open<EditDialogComponent, EditDialogData, EditDialogResult | undefined>(
      EditDialogComponent,
      {
        data: { operation },
        disableClose: true,
      }
    );
    return firstValueFrom(ref.afterClosed());
  }

  private async performUpdate(
    operation: OperationResponse,
    edited: Extract<EditDialogResult, { action: 'save' }>
  ): Promise<void> {
    const result = await firstValueFrom(
      this.gateway.updateOperation(operation.id, edited.type, edited.amount, operation.lastModifiedAt)
    );

    if (result.ok) {
      this._state.update(s => ({
        ...s,
        operations: s.operations.map(op => (op.id === operation.id ? result.operation : op)),
      }));
      return;
    }

    if (!result.ok && result.conflict) {
      await this.handleConflict(operation);
      return;
    }

    const message = !result.ok && result.definitive
      ? 'No se pudo guardar: datos invรกlidos o la operaciรณn ya no existe.'
      : 'No se pudo comunicar con el servidor. Intente nuevamente.';

    const retryResult = await this.reopenEditDialogWithError(operation, message);
    if (!retryResult) return;

    if (retryResult.action === 'cancel_operation') {
      // Dialog handled the retry cancel and returned a canceled operation
      this._state.update(s => ({
        ...s,
        operations: s.operations.map(op =>
          op.id === retryResult.canceledOperation.id ? retryResult.canceledOperation : op
        ),
      }));
    } else {
      await this.performUpdate(operation, retryResult);
    }
  }

  private reopenEditDialogWithError(
    operation: OperationResponse,
    message: string
  ): Promise<EditDialogResult | undefined> {
    const ref = this.dialog.open<EditDialogComponent, EditDialogData, EditDialogResult | undefined>(
      EditDialogComponent,
      {
        data: { operation },
        disableClose: true,
      }
    );
    ref.componentInstance.restoreAfterError(message);
    return firstValueFrom(ref.afterClosed());
  }

  private async handleConflict(operation: OperationResponse): Promise<void> {
    const conflictRef = this.dialog.open<ConflictDialogComponent, unknown, ConflictDialogResult>(
      ConflictDialogComponent
    );
    const action = await firstValueFrom(conflictRef.afterClosed());

    if (action !== 'reedit') return;

    const operations = await firstValueFrom(this.gateway.list());
    const latest = operations.find(op => op.id === operation.id);
    if (!latest) return;

    this._state.update(s => ({
      ...s,
      operations: s.operations.map(op => (op.id === operation.id ? latest : op)),
    }));

    await this.editOperation(latest);
  }

  private async submitPending(snapshot: PendingConfirmation): Promise<void> {
    const result = await firstValueFrom(
      this.gateway.create(snapshot.payload, snapshot.idempotencyKey)
    );

    if (result.ok) {
      try {
        this.pendingStore.remove();
        CrossTabCoordinator.notifyChange();
      } catch {
        this._state.update(s => ({
          ...s,
          status: 'cleanup-error',
          errorMessage:
            'Operaciรณn registrada, pero no se pudo limpiar la confirmaciรณn pendiente. ' +
            'Descarte manualmente para continuar.',
        }));
        return;
      }
      this._state.update(s => ({
        ...s,
        status: 'content',
        rawType: '',
        rawAmount: '',
        pendingKey: undefined,
        fieldErrors: undefined,
      }));
      this.loadHistory();
      return;
    }

    if (!result.ok && result.definitive && result.conflict) {
      try { this.pendingStore.remove(); CrossTabCoordinator.notifyChange(); } catch { /* ignore */ }
      this._state.update(s => ({
        ...s,
        status: 'draft',
        pendingKey: undefined,
        errorMessage: 'La confirmaciรณn fue descartada automรกticamente por conflicto de clave. Puede volver a registrar.',
      }));
      return;
    }

    if (!result.ok && result.definitive) {
      this._state.update(s => ({
        ...s,
        status: 'pending-review',
        errorMessage: 'Error de validaciรณn en el servidor. Revise los datos e intente de nuevo.',
      }));
      return;
    }

    this._state.update(s => ({
      ...s,
      status: 'pending-review',
      errorMessage: 'No se pudo confirmar la operaciรณn. Reintente manualmente con la misma confirmaciรณn.',
    }));
  }

  private loadHistory(from?: string, to?: string, type?: string, status?: string): void {
    firstValueFrom(this.gateway.list(from, to, type, status))
      .then(operations => {
        // Always overwrite when called via refresh() — state was already set to 'loading'.
        this._state.update(s => {
          const safeToOverwrite: OperationsState['status'][] = ['loading', 'content', 'error'];
          if (!safeToOverwrite.includes(s.status)) return s;
          return { ...s, status: 'content', operations };
        });
      })
      .catch(() => {
        this._state.update(s => {
          const safeToOverwrite: OperationsState['status'][] = ['loading', 'content', 'error'];
          if (!safeToOverwrite.includes(s.status)) return s;
          return {
            ...s,
            status: 'error',
            errorMessage: 'No se pudo cargar el historial. Reintente manualmente.',
          };
        });
      });
  }
}
