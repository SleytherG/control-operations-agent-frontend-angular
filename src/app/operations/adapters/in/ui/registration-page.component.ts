import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { firstValueFrom } from 'rxjs';
import { OperationsFacade } from '../../../application/operations.facade';
import { OperationType, formatOperationType, OPERATION_TYPE_LABELS } from '../../../domain/operation-validation';
import { OperationTypesHttpGateway } from '../../../../admin/adapters/out/http/operation-types-http.gateway';
import { OperationTypeResponse } from '../../../../admin/application/ports/operation-types-gateway';

interface SuccessData {
  amount: string;
  type: string;
  time: string;
  internalCode: string;
}

@Component({
  selector: 'app-registration-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
  ],
  templateUrl: './registration-page.component.html',
  styleUrl: './registration-page.component.scss',
})
export class RegistrationPageComponent implements OnInit {
  readonly facade = inject(OperationsFacade);
  private readonly opTypesGateway = inject(OperationTypesHttpGateway);
  private readonly router = inject(Router);

  // ── Hardcoded fallback (used if backend returns no types) ─────────────────
  readonly operationTypes = Object.values(OperationType);
  readonly operationTypeLabels = OPERATION_TYPE_LABELS;

  // ── Backend-loaded operation types (populated on init) ────────────────────
  readonly backendOpTypes = signal<OperationTypeResponse[]>([]);
  readonly opTypesLoading = signal(true);

  readonly showSuccess = signal(false);
  successData: SuccessData | null = null;

  form!: FormGroup;
  private readonly fb = inject(FormBuilder);

  formatType(type: string): string {
    return formatOperationType(type);
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      type: ['', Validators.required],
      amount: ['', Validators.required],
    });

    // Load operation types from backend
    firstValueFrom(
      this.opTypesGateway.listOperationTypes({ page: 1, size: 100, status: 'ACTIVO' })
    ).then(resp => {
      this.backendOpTypes.set(resp.content ?? []);
    }).catch(() => {
      // Fall back to hardcoded enum (network error or unauthenticated)
      this.backendOpTypes.set([]);
    }).finally(() => {
      this.opTypesLoading.set(false);
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

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    const rawType: string = this.form.value['type'] ?? '';
    const rawAmount: string = this.form.value['amount'] != null
      ? String(this.form.value['amount'])
      : '';

    this.facade.setDraft(rawType, rawAmount);
    await this.facade.confirm();

    if (this.state.status === 'content') {
      const suffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      this.successData = {
        amount: parseFloat(rawAmount).toFixed(2),
        type: formatOperationType(rawType),
        time: (() => { const n = new Date(); return `${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}:${n.getSeconds().toString().padStart(2,'0')}`; })(),
        internalCode: `TRX-${suffix}`,
      };
      this.showSuccess.set(true);
      this.form.reset({ type: '', amount: '' });
    }
  }

  onRegisterAnother(): void {
    this.showSuccess.set(false);
    this.successData = null;
    this.form.reset({ type: '', amount: '' });
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

  /** Navigates to the history page and signals it to auto-open the most recent operation detail. */
  onViewDetail(): void {
    this.router.navigate(['/history'], { state: { openLastDetail: true } });
  }
}
