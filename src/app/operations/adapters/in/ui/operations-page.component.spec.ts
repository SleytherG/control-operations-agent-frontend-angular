import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { OperationsPageComponent } from './operations-page.component';
import { OperationsFacade } from '../../../application/operations.facade';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

const sampleActivoOp = {
  id: '42',
  type: 'DEPOSITO',
  amount: '1250.50',
  registeredAt: '2026-08-08T14:32:10.000000Z',
  lastModifiedAt: '2026-08-08T14:32:10.000000Z',
  status: 'ACTIVO',
};

const sampleAnuladoOp = {
  id: '43',
  type: 'RETIRO',
  amount: '100.00',
  registeredAt: '2026-08-08T14:00:00.000000Z',
  lastModifiedAt: '2026-08-08T14:00:00.000000Z',
  status: 'ANULADO',
};

const makeFacade = (stateOverrides = {}) => {
  const state = signal({
    status: 'content',
    operations: [sampleActivoOp],
    rawType: '',
    rawAmount: '',
    ...stateOverrides,
  });
  return {
    state,
    confirm: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
    editNew: vi.fn(),
    discard: vi.fn(),
    refresh: vi.fn(),
    setDraft: vi.fn(),
    editOperation: vi.fn(() => Promise.resolve()),
  };
};

describe('OperationsPageComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<OperationsPageComponent>>;

  const setupComponent = (facadeOverrides = {}) => {
    const facade = makeFacade(facadeOverrides);
    TestBed.configureTestingModule({
      imports: [OperationsPageComponent, NoopAnimationsModule],
      providers: [{ provide: OperationsFacade, useValue: facade }],
    }).compileComponents();
    fixture = TestBed.createComponent(OperationsPageComponent);
    fixture.detectChanges();
    return { fixture, facade };
  };

  // ---- Content state renders history ----

  it('renders history list when state is content', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('[data-testid="operation-item"]').length).toBeGreaterThan(0);
  });

  // ---- Empty state ----

  it('shows empty state message when no operations', () => {
    const { fixture } = setupComponent({ operations: [] });
    const compiled = fixture.nativeElement as HTMLElement;
    const empty = compiled.querySelector('[data-testid="empty-history"]');
    expect(empty).not.toBeNull();
  });

  // ---- Error state ----

  it('shows error state when status is error', () => {
    const { fixture } = setupComponent({ status: 'error', operations: [] });
    const compiled = fixture.nativeElement as HTMLElement;
    const error = compiled.querySelector('[data-testid="history-error"]');
    expect(error).not.toBeNull();
  });

  // ---- Pending review state ----

  it('shows retry, edit-new and discard buttons in pending-review state', () => {
    const { fixture } = setupComponent({
      status: 'pending-review',
      pendingKey: '8e03978e-40d5-43e8-bc93-6894a57f9324',
      rawType: 'DEPOSITO',
      rawAmount: '100.00',
      operations: [],
    });
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="btn-retry"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="btn-edit-new"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="btn-discard"]')).not.toBeNull();
  });

  // ---- Field errors are programmatically associated ----

  it('type select has aria-describedby pointing to type error', () => {
    const { fixture } = setupComponent({
      status: 'invalid',
      fieldErrors: { type: 'Seleccione un tipo válido' },
      operations: [],
    });
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const typeSelect = compiled.querySelector('[data-testid="field-type"]');
    expect(typeSelect).not.toBeNull();
    expect(typeSelect?.getAttribute('aria-describedby')).toBe('error-type');
  });

  // ---- Keyboard focus order — all interactive controls present ----

  it('has type select, amount input and submit button as focusable controls', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="field-type"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="field-amount"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="btn-submit"]')).not.toBeNull();
  });

  // ---- Type select renders DEPOSITO and RETIRO options ----

  it('type select contains DEPOSITO and RETIRO options', () => {
    const { fixture } = setupComponent();
    const { operationTypes } = fixture.componentInstance;
    expect(operationTypes).toHaveLength(2);
    expect(operationTypes).toContain('DEPOSITO');
    expect(operationTypes).toContain('RETIRO');
  });

  // ---- Manual refresh button ----

  it('has a manual refresh button', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="btn-refresh"]')).not.toBeNull();
  });

  // ---- Register button ----

  it('submit button contains a mat-icon element alongside the label text when not submitting', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const submitBtn = compiled.querySelector('[data-testid="btn-submit"]');
    expect(submitBtn).not.toBeNull();
    const icon = submitBtn?.querySelector('mat-icon');
    expect(icon).not.toBeNull();
    expect(icon?.textContent?.trim()).toBe('save');
  });

  it('submit button label text "Registrar" is present alongside the icon when not submitting', () => {
    const { fixture } = setupComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const submitBtn = compiled.querySelector('[data-testid="btn-submit"]');
    expect(submitBtn?.textContent).toContain('Registrar');
  });

  // ---- T016: Estado column ----

  it('T016 displayedColumns includes status column', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.displayedColumns).toContain('status');
  });

  it('T016 formatStatus returns "Activo" for ACTIVO', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.formatStatus('ACTIVO')).toBe('Activo');
  });

  it('T016 formatStatus returns "Anulado" for ANULADO', () => {
    const { fixture } = setupComponent();
    expect(fixture.componentInstance.formatStatus('ANULADO')).toBe('Anulado');
  });

  it('T016 ANULADO rows get operation-canceled CSS class', () => {
    const { fixture } = setupComponent({ operations: [sampleActivoOp, sampleAnuladoOp] });
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('[data-testid="operation-item"]');
    expect(rows.length).toBe(2);
    expect(rows[0].classList.contains('operation-canceled')).toBe(false);
    expect(rows[1].classList.contains('operation-canceled')).toBe(true);
  });

  // ---- T030: Disabled edit button for ANULADO rows ----

  it('T030 edit button is disabled for ANULADO rows', () => {
    const { fixture } = setupComponent({ operations: [sampleActivoOp, sampleAnuladoOp] });
    const compiled = fixture.nativeElement as HTMLElement;
    const editBtns = compiled.querySelectorAll('[data-testid="btn-edit-operation"]');
    // First button (ACTIVO) — not disabled
    expect((editBtns[0] as HTMLButtonElement).disabled).toBe(false);
    // Second button (ANULADO) — disabled
    expect((editBtns[1] as HTMLButtonElement).disabled).toBe(true);
  });

  // ---- T037: aria-label on edit buttons ----

  it('T037 active row edit button has aria-label "Editar operación"', () => {
    const { fixture } = setupComponent({ operations: [sampleActivoOp] });
    const compiled = fixture.nativeElement as HTMLElement;
    const editBtn = compiled.querySelector('[data-testid="btn-edit-operation"]');
    expect(editBtn?.getAttribute('aria-label')).toBe('Editar operación');
  });

  it('T037 ANULADO row edit button has aria-label "Operación anulada — no editable"', () => {
    const { fixture } = setupComponent({ operations: [sampleAnuladoOp] });
    const compiled = fixture.nativeElement as HTMLElement;
    const editBtn = compiled.querySelector('[data-testid="btn-edit-operation"]');
    expect(editBtn?.getAttribute('aria-label')).toBe('Operación anulada — no editable');
  });

  // ---- formatDate: fixed DD/MM/YYYY HH:mm:ss format ----

  describe('formatDate', () => {
    it('returns output matching DD/MM/YYYY HH:mm:ss pattern', () => {
      const { fixture } = setupComponent();
      const comp = fixture.componentInstance;
      const d = new Date(2026, 7, 9, 14, 26, 35);
      expect(comp.formatDate(d.toISOString())).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    });

    it('zero-pads day, month, hours, minutes and seconds', () => {
      const { fixture } = setupComponent();
      const comp = fixture.componentInstance;
      const d = new Date(2026, 0, 1, 1, 2, 3);
      const result = comp.formatDate(d.toISOString());
      const [datePart, timePart] = result.split(' ');
      const [day, month] = datePart.split('/');
      const [hour, min, sec] = timePart.split(':');
      expect(day).toBe(String(d.getDate()).padStart(2, '0'));
      expect(month).toBe(String(d.getMonth() + 1).padStart(2, '0'));
      expect(hour).toBe(String(d.getHours()).padStart(2, '0'));
      expect(min).toBe(String(d.getMinutes()).padStart(2, '0'));
      expect(sec).toBe(String(d.getSeconds()).padStart(2, '0'));
    });

    it('uses 24-hour clock — no AM/PM suffix present', () => {
      const { fixture } = setupComponent();
      const comp = fixture.componentInstance;
      const d = new Date(2026, 7, 9, 22, 30, 0);
      const result = comp.formatDate(d.toISOString());
      expect(result).not.toMatch(/[AaPp][Mm]/);
      const hourPart = result.split(' ')[1].split(':')[0];
      expect(Number(hourPart)).toBe(d.getHours());
    });

    it('includes 4-digit year', () => {
      const { fixture } = setupComponent();
      const comp = fixture.componentInstance;
      const d = new Date(2026, 7, 9, 10, 0, 0);
      const result = comp.formatDate(d.toISOString());
      const yearPart = result.split('/')[2].split(' ')[0];
      expect(yearPart).toBe(String(d.getFullYear()));
    });

    it('falls back to the raw string when input is not a valid date', () => {
      const { fixture } = setupComponent();
      const comp = fixture.componentInstance;
      expect(comp.formatDate('not-a-date')).toBe('not-a-date');
    });
  });
});
