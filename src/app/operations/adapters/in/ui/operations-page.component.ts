/**
 * @deprecated Feature 004 (sidebar-navigation-responsive):
 * This component has been superseded by:
 *   - RegistrationPageComponent (frontend/src/app/operations/adapters/in/ui/registration-page.component.ts)
 *   - HistoryPageComponent (frontend/src/app/operations/adapters/in/ui/history-page.component.ts)
 *
 * This file is preserved to maintain existing unit test references.
 * Do NOT add new features here. Remove after test migration is complete.
 */
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OperationsFacade } from '../../../application/operations.facade';
import { OperationType, formatOperationType, OPERATION_TYPE_LABELS } from '../../../domain/operation-validation';
import { OperationResponse } from '../../../domain/operation';

@Component({
  selector: 'app-operations-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './operations-page.component.html',
  styleUrl: './operations-page.component.scss',
})
export class OperationsPageComponent implements OnInit {

  readonly facade = inject(OperationsFacade);
  readonly operationTypes = Object.values(OperationType);
  readonly operationTypeLabels = OPERATION_TYPE_LABELS;

  /** T013: include 'status' column between 'type' and 'actions' */
  readonly displayedColumns = ['registeredAt', 'amount', 'type', 'status', 'actions'];
  readonly skeletonRows: OperationResponse[] = Array.from({ length: 4 }, (_, i) => ({
    id: `skeleton-${i}`,
    type: '',
    amount: '',
    registeredAt: '',
    lastModifiedAt: '',
    status: 'ACTIVE',
  }));

  get tableData(): OperationResponse[] {
    return this.isLoading ? this.skeletonRows : this.state.operations;
  }

  form!: FormGroup;

  private readonly fb = inject(FormBuilder);

  ngOnInit(): void {
    this.form = this.fb.group({
      type: [this.facade.state().rawType, Validators.required],
      amount: [this.facade.state().rawAmount, Validators.required],
    });
  }

  get state() {
    return this.facade.state();
  }

  get isSubmitting(): boolean {
    return this.state.status === 'submitting';
  }

  get isPendingReview(): boolean {
    return this.state.status === 'pending-review';
  }

  get isLoading(): boolean {
    return this.state.status === 'loading';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.facade.setDraft(
      this.form.value['type'] ?? '',
      this.form.value['amount'] ?? ''
    );
    await this.facade.confirm();
    // If validation passed, clear form on success
    if (this.state.status === 'content') {
      this.form.reset({ type: '', amount: '' });
    }
  }

  async onRetry(): Promise<void> {
    await this.facade.retry();
  }

  onEditNew(): void {
    this.facade.editNew();
    this.form.patchValue({
      type: this.state.rawType,
      amount: this.state.rawAmount,
    });
  }

  onDiscard(): void {
    this.facade.discard();
    this.form.patchValue({
      type: this.state.rawType,
      amount: this.state.rawAmount,
    });
  }

  onRefresh(): void {
    this.facade.refresh();
  }

  onEditClick(operation: OperationResponse, triggerEl?: HTMLElement): void {
    void this.facade.editOperation(operation).then(() => {
      // Return focus to the triggering element after dialog closes (FR-019)
      triggerEl?.focus();
    });
  }

  /** Announce a message to assistive technology via the aria-live region. */
  announceToScreenReader(message: string): void {
    const region = document.getElementById('aria-announcements');
    if (region) {
      region.textContent = '';
      setTimeout(() => { region.textContent = message; }, 50);
    }
  }

  formatDate(registeredAt: string): string {
    try {
      const d = new Date(registeredAt);
      if (isNaN(d.getTime())) return registeredAt;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
    } catch {
      return registeredAt;
    }
  }

  formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return `S/ ${num.toFixed(2)}`;
  }

  formatType(type: string): string {
    return formatOperationType(type);
  }

  /** T014: Maps API status value to display text */
  formatStatus(status: string): string {
    return status === 'CANCELLED' ? 'Anulado' : 'Activo';
  }
}
