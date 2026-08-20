import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { OperationType, parseAmount, getDecimalSeparator, OPERATION_TYPE_LABELS } from '../../../../domain/operation-validation';
import { OperationResponse } from '../../../../domain/operation';
import { CancelResult, OPERATIONS_GATEWAY, OperationsGateway } from '../../../../application/ports/operations-gateway';

export interface EditDialogData {
  operation: OperationResponse;
}

/** Discriminated union result from the edit dialog */
export type EditDialogResult =
  | { action: 'save'; type: string; amount: string }
  | { action: 'cancel_operation'; canceledOperation: OperationResponse };

@Component({
  selector: 'app-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './edit-dialog.component.html',
  styleUrl: './edit-dialog.component.scss',
})
export class EditDialogComponent {

  readonly operationTypes = Object.values(OperationType);
  readonly operationTypeLabels = OPERATION_TYPE_LABELS;
  readonly data = inject<EditDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EditDialogComponent, EditDialogResult | undefined>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  constructor(@Inject(OPERATIONS_GATEWAY) private readonly gateway: OperationsGateway) {}

  isSaving = false;
  /** T043/FR-016: true while cancel HTTP request is in-flight */
  isCanceling = signal(false);
  errorMessage: string | null = null;

  form: FormGroup = this.fb.group({
    type: [this.data.operation.type, Validators.required],
    amount: [this.data.operation.amount, Validators.required],
  });

  onSave(): void {
    if (this.form.invalid || this.isSaving || this.isCanceling()) return;

    const rawType = this.form.value['type'] ?? '';
    const rawAmount = this.form.value['amount'] ?? '';

    const typeValid = rawType === 'DEPOSIT' || rawType === 'WITHDRAWAL';
    const amountResult = parseAmount(rawAmount, getDecimalSeparator());

    if (!typeValid || !amountResult.ok) {
      this.errorMessage = !typeValid
        ? 'Seleccione un tipo válido (DEPÓSITO o RETIRO)'
        : amountResult.ok ? null : amountResult.error;
      return;
    }

    this.isSaving = true;
    this.errorMessage = null;
    this.form.disable();

    this.dialogRef.close({ action: 'save', type: rawType, amount: amountResult.canonical });
  }

  onCancel(): void {
    if (this.isCanceling()) return;
    this.dialogRef.close(undefined);
  }

  /**
   * T043/FR-016: Opens confirmation, then makes the HTTP cancel request while keeping the
   * dialog open. Shows spinner for the full server wait. Closes on success. Shows inline
   * error on failure so the operator can retry without losing context (FR-015, US2/AC5).
   */
  async onCancelOperation(): Promise<void> {
    if (this.isCanceling() || this.isSaving) return;

    // T028: Escape-safe confirmation — disableClose: false so Escape closes only confirmation
    const confirmed = await this.openCancelConfirmation();
    if (!confirmed) return;

    // Set loading state — dialog stays open during the full HTTP request (FR-016)
    this.isCanceling.set(true);
    this.errorMessage = null;
    this.form.disable();

    try {
      const result: CancelResult = await firstValueFrom(this.gateway.cancelOperation(this.data.operation.id));

      if (result.ok) {
        // Success: close dialog with the canceled operation so facade can update state
        this.dialogRef.close({ action: 'cancel_operation', canceledOperation: result.operation });
      } else {
        // Failure: show inline error, re-enable button for retry (FR-015, US2/AC5)
        let message: string;
        if ('notFound' in result && result.notFound) {
          message = 'No se encontró la operación. Puede haber sido eliminada.';
        } else if ('alreadyCanceled' in result && result.alreadyCanceled) {
          message = 'La operación ya fue anulada por otro operador.';
        } else {
          message = 'No se pudo anular la operación. Intente nuevamente.';
        }
        this.restoreAfterError(message);
      }
    } catch {
      this.restoreAfterError('No se pudo comunicar con el servidor. Intente nuevamente.');
    }
  }

  /** Opens a small inline-confirmation via MatDialog. Returns true if confirmed. */
  private async openCancelConfirmation(): Promise<boolean> {
    const ref = this.dialog.open(CancelConfirmationDialogComponent, {
      disableClose: false, // Escape closes only the confirmation dialog
      autoFocus: 'dialog',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return result === true;
  }

  /** Called by the facade when a save attempt fails, to restore the dialog for retry. */
  restoreAfterError(message: string): void {
    this.isSaving = false;
    this.isCanceling.set(false);
    this.errorMessage = message;
    this.form.enable();
  }
}

/**
 * T028: Inline confirmation dialog for the cancel action.
 * Opens as a child dialog — Escape closes only this dialog, not the parent edit dialog.
 */
@Component({
  selector: 'app-cancel-confirmation-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title id="cancel-confirm-title">Confirmar anulación</h2>
    <mat-dialog-content>
      <p>¿Está seguro de anular esta operación? <strong>Esta acción es irreversible.</strong></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="false" data-testid="cancel-confirm-no">
        Cancelar
      </button>
      <button mat-raised-button color="warn" [mat-dialog-close]="true" data-testid="cancel-confirm-yes">
        Anular operación
      </button>
    </mat-dialog-actions>
  `,
})
export class CancelConfirmationDialogComponent {}
