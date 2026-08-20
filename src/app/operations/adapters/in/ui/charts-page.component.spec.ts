import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChartsPageComponent, groupByDate, groupByType } from './charts-page.component';
import { ChartsFacade } from '../../../application/charts.facade';
import type { OperationResponse } from '../../../domain/operation';

// ── Mock Chart.js so canvas is never touched in jsdom ───────────────────────
vi.mock('chart.js', () => {
  // Must use a regular function (not arrow) so `new Chart(...)` works as a constructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockChart = vi.fn().mockImplementation(function (this: any) {
    this.destroy = vi.fn();
    this.update = vi.fn();
    this.data = {};
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockChart as any).register = vi.fn();
  return { Chart: MockChart, registerables: [] };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Noon UTC = 07:00 Lima (UTC-5) — unambiguously "today" in the Lima timezone */
function todayNoonUtcIso(): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function makeOp(overrides: Partial<OperationResponse> = {}): OperationResponse {
  return {
    id: '1',
    type: 'DEPOSITO',
    amount: '100.00',
    registeredAt: todayNoonUtcIso(),
    lastModifiedAt: todayNoonUtcIso(),
    status: 'ACTIVO',
    ...overrides,
  };
}

/** Returns a today YYYY-MM-DD string (local). */
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const makeFacade = (overrides: { status?: string; operations?: OperationResponse[] } = {}) => {
  const st = signal<{ status: string; operations: OperationResponse[]; errorMessage?: string }>({
    status: overrides.status ?? 'content',
    operations: overrides.operations ?? [],
  });
  return {
    state: st.asReadonly(),
    reload: vi.fn(),
    loadWithFilter: vi.fn(),
    reset: vi.fn(),
  };
};

const setup = (facadeOverrides: { status?: string; operations?: OperationResponse[] } = {}) => {
  const facade = makeFacade(facadeOverrides);
  TestBed.configureTestingModule({
    imports: [ChartsPageComponent, NoopAnimationsModule],
    providers: [{ provide: ChartsFacade, useValue: facade }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ChartsPageComponent);
  fixture.detectChanges();
  return { fixture, facade };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ChartsPageComponent — default date filter', () => {
  // T-DEFAULT-01
  it('desdeControl is initialized to today on construction', () => {
    const { fixture } = setup({ status: 'loading' });
    const today = new Date();
    const desde = fixture.componentInstance.desdeControl.value as Date;
    expect(desde).not.toBeNull();
    expect(desde!.getFullYear()).toBe(today.getFullYear());
    expect(desde!.getMonth()).toBe(today.getMonth());
    expect(desde!.getDate()).toBe(today.getDate());
  });

  // T-DEFAULT-02
  it('hastaControl is initialized to today on construction', () => {
    const { fixture } = setup({ status: 'loading' });
    const today = new Date();
    const hasta = fixture.componentInstance.hastaControl.value as Date;
    expect(hasta).not.toBeNull();
    expect(hasta!.getFullYear()).toBe(today.getFullYear());
    expect(hasta!.getMonth()).toBe(today.getMonth());
    expect(hasta!.getDate()).toBe(today.getDate());
  });

  // T-DEFAULT-03 — on construction, loadWithFilter is called with today's date
  it('calls facade.loadWithFilter with today\'s date on construction', () => {
    const { facade } = setup({ status: 'loading' });
    expect(facade.loadWithFilter).toHaveBeenCalledOnce();
    expect(facade.loadWithFilter).toHaveBeenCalledWith(todayYmd(), todayYmd());
  });

  // T-DISABLED-01 — controls are disabled when facade is loading
  it('desdeControl and hastaControl are disabled when facade status is loading', () => {
    const { fixture } = setup({ status: 'loading' });
    fixture.detectChanges();
    expect(fixture.componentInstance.desdeControl.disabled).toBe(true);
    expect(fixture.componentInstance.hastaControl.disabled).toBe(true);
  });

  // T-DISABLED-02 — controls are enabled when facade has content
  it('desdeControl and hastaControl are enabled when facade status is content', () => {
    const { fixture } = setup({ status: 'content', operations: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.desdeControl.disabled).toBe(false);
    expect(fixture.componentInstance.hastaControl.disabled).toBe(false);
  });

  // T-DEFAULT-05 — datepicker input shows today's date visually
  it('renders today\'s date in the "Desde" input on initial load', () => {
    const { fixture } = setup({ status: 'loading' });
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '[data-testid="input-desde"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    // The value is formatted by AppDateAdapter as DD/MM/YYYY
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear());
    expect(input.value).toBe(`${day}/${month}/${year}`);
  });
});

describe('ChartsPageComponent — onAplicar', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // T-APLICAR-01 — calls facade.loadWithFilter with the selected date range
  it('calls facade.loadWithFilter with desde and hasta in YYYY-MM-DD format', () => {
    const { fixture, facade } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;

    const desde = new Date(2026, 0, 15); // 2026-01-15
    const hasta = new Date(2026, 0, 20); // 2026-01-20
    comp.desdeControl.setValue(desde);
    comp.hastaControl.setValue(hasta);

    comp.onAplicar();

    expect(facade.loadWithFilter).toHaveBeenLastCalledWith('2026-01-15', '2026-01-20');
  });

  // T-APLICAR-02 — does NOT call loadWithFilter when desde > hasta (validation error)
  it('does not call facade.loadWithFilter when desde is after hasta', () => {
    const { fixture, facade } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;
    const callsBefore = (facade.loadWithFilter as ReturnType<typeof vi.fn>).mock.calls.length;

    comp.desdeControl.setValue(new Date(2026, 0, 20));
    comp.hastaControl.setValue(new Date(2026, 0, 15));

    comp.onAplicar();

    // No additional call should have been made
    expect((facade.loadWithFilter as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
    expect(comp.rangeError()).not.toBeNull();
  });

  // T-APLICAR-03 — clears a previous rangeError on a valid submit
  it('clears rangeError when desde <= hasta', () => {
    const { fixture } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;

    // First set an error
    comp.desdeControl.setValue(new Date(2026, 0, 20));
    comp.hastaControl.setValue(new Date(2026, 0, 15));
    comp.onAplicar();
    expect(comp.rangeError()).not.toBeNull();

    // Then submit a valid range
    comp.desdeControl.setValue(new Date(2026, 0, 15));
    comp.hastaControl.setValue(new Date(2026, 0, 20));
    comp.onAplicar();
    expect(comp.rangeError()).toBeNull();
  });

  // T-APLICAR-04 — null desde sends undefined to loadWithFilter
  it('passes undefined for desde when desdeControl is null', () => {
    const { fixture, facade } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;
    comp.desdeControl.setValue(null);
    comp.hastaControl.setValue(new Date(2026, 0, 20));

    comp.onAplicar();

    expect(facade.loadWithFilter).toHaveBeenLastCalledWith(undefined, '2026-01-20');
  });
});

describe('ChartsPageComponent — onLimpiar', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // T-LIMPIAR-01 — resets controls to null
  it('resets desdeControl and hastaControl to null', () => {
    const { fixture } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;
    comp.onLimpiar();
    expect(comp.desdeControl.value).toBeNull();
    expect(comp.hastaControl.value).toBeNull();
  });

  // T-LIMPIAR-02 — calls facade.reset() (not loadWithFilter) so charts clear immediately
  it('calls facade.reset() to clear charts without a backend request', () => {
    const { fixture, facade } = setup({ status: 'content', operations: [] });
    const callsBefore = (facade.loadWithFilter as ReturnType<typeof vi.fn>).mock.calls.length;
    fixture.componentInstance.onLimpiar();
    expect(facade.reset).toHaveBeenCalledOnce();
    // No additional loadWithFilter call should be triggered by Limpiar
    expect((facade.loadWithFilter as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  // T-LIMPIAR-03 — clears rangeError
  it('clears rangeError on limpiar', () => {
    const { fixture } = setup({ status: 'content', operations: [] });
    const comp = fixture.componentInstance;
    // Set an error first
    comp.desdeControl.setValue(new Date(2026, 0, 20));
    comp.hastaControl.setValue(new Date(2026, 0, 15));
    comp.onAplicar();
    expect(comp.rangeError()).not.toBeNull();

    comp.onLimpiar();
    expect(comp.rangeError()).toBeNull();
  });
});

describe('ChartsPageComponent — isEmpty', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('isEmpty is true when facade state has no operations', () => {
    const { fixture } = setup({ status: 'content', operations: [] });
    expect(fixture.componentInstance.isEmpty()).toBe(true);
  });

  it('isEmpty is false when facade state has operations', () => {
    const { fixture } = setup({ status: 'content', operations: [makeOp()] });
    expect(fixture.componentInstance.isEmpty()).toBe(false);
  });
});

// ── Pure function tests ───────────────────────────────────────────────────────

describe('groupByDate', () => {
  it('returns empty labels and data when ops array is empty', () => {
    const result = groupByDate([]);
    expect(result.labels).toHaveLength(0);
    expect(result.datasets[0].data).toHaveLength(0);
  });

  it('counts operations per Lima local date', () => {
    const ops = [
      makeOp({ registeredAt: '2026-08-10T12:00:00.000Z' }),
      makeOp({ registeredAt: '2026-08-10T18:00:00.000Z' }),
      makeOp({ registeredAt: '2026-08-11T12:00:00.000Z' }),
    ];
    const result = groupByDate(ops);
    expect(result.labels).toHaveLength(2);
    expect(result.datasets[0].data[0]).toBe(2); // 2 ops on 2026-08-10
    expect(result.datasets[0].data[1]).toBe(1); // 1 op  on 2026-08-11
  });

  it('returns labels sorted ascending by date', () => {
    const ops = [
      makeOp({ registeredAt: '2026-08-12T12:00:00.000Z' }),
      makeOp({ registeredAt: '2026-08-10T12:00:00.000Z' }),
    ];
    const result = groupByDate(ops);
    expect((result.labels as string[])[0]).toBe('2026-08-10');
    expect((result.labels as string[])[1]).toBe('2026-08-12');
  });
});

describe('groupByType', () => {
  it('counts DEPOSITO and RETIRO correctly', () => {
    const ops = [
      makeOp({ type: 'DEPOSITO' }),
      makeOp({ type: 'DEPOSITO' }),
      makeOp({ type: 'RETIRO' }),
    ];
    const result = groupByType(ops);
    expect(result.datasets[0].data[0]).toBe(2); // DEPOSITO
    expect(result.datasets[0].data[1]).toBe(1); // RETIRO
  });

  it('returns zero counts when ops array is empty', () => {
    const result = groupByType([]);
    expect(result.datasets[0].data[0]).toBe(0);
    expect(result.datasets[0].data[1]).toBe(0);
  });

  it('labels are DEPOSITO and RETIRO in that order', () => {
    const result = groupByType([]);
    expect(result.labels).toEqual(['DEPOSITO', 'RETIRO']);
  });
});
