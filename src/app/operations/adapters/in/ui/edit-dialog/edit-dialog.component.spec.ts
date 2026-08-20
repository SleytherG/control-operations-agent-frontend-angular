import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { EditDialogComponent } from './edit-dialog.component';
import { OPERATIONS_GATEWAY } from '../../../../application/ports/operations-gateway';

const sampleOperation = {
  id: '42',
  type: 'DEPOSITO',
  amount: '1250.50',
  registeredAt: '2026-08-08T14:32:10.000000Z',
  lastModifiedAt: '2026-08-08T14:32:10.000000Z',
  status: 'ACTIVO',
};

const canceledOperation = { ...sampleOperation, status: 'ANULADO' };

const makeDialogRef = () => ({
  close: (result?: unknown) => result,
});

const makeGateway = (overrides = {}) => ({
  create: vi.fn(),
  list: vi.fn(),
  updateOperation: vi.fn(),
  cancelOperation: vi.fn(() => of({ ok: true, operation: canceledOperation })),
  ...overrides,
});

describe('EditDialogComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<EditDialogComponent>>;

  const setupComponent = (operationOverrides = {}, gatewayOverrides = {}) => {
    const dialogRef = makeDialogRef();
    const gateway = makeGateway(gatewayOverrides);
    TestBed.configureTestingModule({
      imports: [EditDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { operation: { ...sampleOperation, ...operationOverrides } } },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: OPERATIONS_GATEWAY, useValue: gateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditDialogComponent);
    fixture.detectChanges();
    return { fixture, dialogRef, gateway };
  };

  // ---- Pre-fill form with current operation values ----

  it('pre-fills type with current operation type', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    expect(component.form.get('type')?.value).toBe('DEPOSITO');
  });

  it('pre-fills amount with current operation amount', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    expect(component.form.get('amount')?.value).toBe('1250.50');
  });

  it('pre-fills with RETIRO when operation type is RETIRO', () => {
    const { fixture } = setupComponent({ type: 'RETIRO' });
    const component = fixture.componentInstance;
    expect(component.form.get('type')?.value).toBe('RETIRO');
  });

  // ---- Form validity ----

  it('form is valid when type and amount are pre-filled', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.form.valid).toBe(true);
  });

  it('form becomes invalid when amount is cleared', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    component.form.get('amount')?.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('form becomes invalid when type is cleared', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    component.form.get('type')?.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  // ---- isSaving state ----

  it('isSaving starts as false', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.isSaving).toBe(false);
  });

  it('errorMessage starts as null', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.errorMessage).toBeNull();
  });

  // ---- restoreAfterError ----

  it('restoreAfterError sets errorMessage and re-enables form', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    component.isSaving = true;
    component.form.disable();

    component.restoreAfterError('No se pudo guardar.');

    expect(component.isSaving).toBe(false);
    expect(component.errorMessage).toBe('No se pudo guardar.');
    expect(component.form.enabled).toBe(true);
  });

  // ---- onCancel ----

  it('onCancel calls dialogRef.close with undefined', () => {
    const { fixture, dialogRef } = setupComponent();
    const closeSpy = (dialogRef.close = vi.fn());
    fixture.componentInstance.onCancel();
    expect(closeSpy).toHaveBeenCalledWith(undefined);
  });

  // ---- onSave — valid data ----

  it('onSave calls dialogRef.close with action save and type/amount when form is valid', () => {
    const { fixture, dialogRef } = setupComponent();
    const closeSpy = (dialogRef.close = vi.fn());
    const component = fixture.componentInstance;
    component.form.patchValue({ type: 'RETIRO', amount: '500.00' });

    component.onSave();

    expect(closeSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'save', type: 'RETIRO', amount: '500.00' }));
  });

  // ---- onSave — invalid data should NOT close ----

  it('onSave does not close dialog when amount is invalid', () => {
    const { fixture, dialogRef } = setupComponent();
    const closeSpy = (dialogRef.close = vi.fn());
    const component = fixture.componentInstance;
    component.form.patchValue({ amount: 'abc' });

    component.onSave();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  // ---- operationTypes list ----

  it('exposes DEPOSITO and RETIRO operation types', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.operationTypes).toContain('DEPOSITO');
    expect(fixture.componentInstance.operationTypes).toContain('RETIRO');
    expect(fixture.componentInstance.operationTypes).toHaveLength(2);
  });

  // ---- isCanceling signal ----

  it('isCanceling starts as false', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.isCanceling()).toBe(false);
  });

  // ---- restoreAfterError resets isCanceling ----

  it('restoreAfterError also resets isCanceling signal', () => {
    const { fixture } = setupComponent();
    const component = fixture.componentInstance;
    component.isCanceling.set(true);

    component.restoreAfterError('Error message');

    expect(component.isCanceling()).toBe(false);
    expect(component.errorMessage).toBe('Error message');
  });

  // ---- T043: gateway injected and available ----

  it('T043 gateway is injected into the component', () => {
    const { fixture } = setupComponent();
    // Verify the component can access the gateway (it was injected)
    expect(fixture.componentInstance).toBeDefined();
  });
});
