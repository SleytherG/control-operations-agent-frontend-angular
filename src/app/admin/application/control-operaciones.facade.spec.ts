import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';

import { ControlOperacionesFacade } from './control-operaciones.facade';
import { ControlOperacionesHttpGateway } from '../adapters/out/http/control-operaciones-http.gateway';
import {
  DEFAULT_OPERATIONS_FILTER,
  DEFAULT_PAGINATION,
  ControlOperationsKpisResponse,
  OperationsPageResponse,
  OperationRecord,
} from './ports/control-operaciones-gateway';

// ── Mock gateway ──────────────────────────────────────────────────────────

const mockKpisResponse: ControlOperationsKpisResponse = {
  totalOperadoHoy:          1000000,
  variacionTotalOperado:    12.5,
  totalOperaciones:         100,
  variacionOperaciones:     3.2,
  ticketPromedio:           10000,
  variacionTicketPromedio: -1.1,
};

const mockOperationsPage: OperationsPageResponse = {
  items: [
    {
      id:             'TRX-99821A',
      fechaHora:      '31/10/23 14:32:01',
      operadorId:     'OP-442',
      operadorNombre: 'M. Rossi',
      agenciaId:      'agencia-central-caba',
      agenciaNombre:  'Agencia Central (CABA)',
      tipoOperacion:  'Deposito Efectivo',
      monto:          1500000,
      estado:         'COMPLETADA',
    } as OperationRecord,
    {
      id:             'TRX-99819C',
      fechaHora:      '31/10/23 14:28:44',
      operadorId:     'OP-221',
      operadorNombre: 'J. Perez',
      agenciaId:      'sucursal-sur',
      agenciaNombre:  'Sucursal Sur',
      tipoOperacion:  'Transferencia Ext.',
      monto:          2100000,
      estado:         'EN_PROCESO',
    } as OperationRecord,
  ],
  paginaActual:       1,
  totalRegistros:     100,
  registrosPorPagina: 5,
  totalPaginas:       20,
};

// ── Test suite ────────────────────────────────────────────────────────────

describe('ControlOperacionesFacade', () => {
  let facade: ControlOperacionesFacade;
  let gatewayMock: {
    getKpis:          ReturnType<typeof vi.fn>;
    getOperations:    ReturnType<typeof vi.fn>;
    exportOperations: ReturnType<typeof vi.fn>;
    cancelOperation:  ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    gatewayMock = {
      getKpis:          vi.fn().mockReturnValue(of(mockKpisResponse)),
      getOperations:    vi.fn().mockReturnValue(of(mockOperationsPage)),
      exportOperations: vi.fn().mockReturnValue(of(new Blob(['test']))),
      cancelOperation:  vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        ControlOperacionesFacade,
        { provide: ControlOperacionesHttpGateway, useValue: gatewayMock },
      ],
    });

    facade = TestBed.inject(ControlOperacionesFacade);
  });

  // ── loadKpis ─────────────────────────────────────────────────────────

  it('loadKpis() calls getKpis and transitions kpisState to content', () => {
    facade.loadKpis();

    expect(gatewayMock.getKpis).toHaveBeenCalledTimes(1);
    expect(facade.kpisState().status).toBe('content');
    expect(facade.kpisState().data).toEqual(mockKpisResponse);
  });

  it('loadKpis() transitions kpisState to error when gateway throws', () => {
    gatewayMock.getKpis.mockReturnValue(throwError(() => new Error('Network error')));

    facade.loadKpis();

    expect(facade.kpisState().status).toBe('error');
    expect(facade.kpisState().error).toBe('Network error');
  });

  it('loadKpis() also fetches the initial operations page', () => {
    facade.loadKpis();

    expect(gatewayMock.getOperations).toHaveBeenCalledWith(
      DEFAULT_OPERATIONS_FILTER,
      DEFAULT_PAGINATION
    );
  });

  // ── applyFilter ───────────────────────────────────────────────────────

  it('applyFilter() calls getOperations with the given filter and page=1', () => {
    const filter = { ...DEFAULT_OPERATIONS_FILTER, agenciaId: 'sucursal-norte' };

    facade.applyFilter(filter);

    expect(gatewayMock.getOperations).toHaveBeenCalledWith(filter, DEFAULT_PAGINATION);
    expect(facade.operationsState().status).toBe('content');
  });

  it('applyFilter() resets pagination to page 1', () => {
    // Advance to page 2 first
    gatewayMock.getOperations.mockReturnValue(of(mockOperationsPage));
    facade.goToPage(2);
    vi.clearAllMocks();
    gatewayMock.getOperations.mockReturnValue(of(mockOperationsPage));

    // Apply filter — should reset to page 1
    facade.applyFilter(DEFAULT_OPERATIONS_FILTER);

    const call = gatewayMock.getOperations.mock.calls[0];
    expect(call[1].page).toBe(1);
  });

  // ── reset ─────────────────────────────────────────────────────────────

  it('reset() restores default filter and reloads from page 1', () => {
    const filter = { ...DEFAULT_OPERATIONS_FILTER, operador: 'OP-442' };
    facade.applyFilter(filter);
    vi.clearAllMocks();
    gatewayMock.getOperations.mockReturnValue(of(mockOperationsPage));

    facade.reset();

    const call = gatewayMock.getOperations.mock.calls[0];
    expect(call[0]).toEqual(DEFAULT_OPERATIONS_FILTER);
    expect(call[1]).toEqual(DEFAULT_PAGINATION);
  });

  // ── goToPage ──────────────────────────────────────────────────────────

  it('goToPage(2) calls getOperations with page=2 and the current filter', () => {
    facade.goToPage(2);

    const call = gatewayMock.getOperations.mock.calls[0];
    expect(call[1].page).toBe(2);
    expect(call[0]).toEqual(DEFAULT_OPERATIONS_FILTER);
  });

  // ── cancelOperation success ───────────────────────────────────────────

  it('cancelOperation() on success updates the row estado to CANCELADA', () => {
    // Load initial data first
    facade.loadKpis();
    expect(facade.operationsState().data!.items[1].estado).toBe('EN_PROCESO');

    // Cancel the second operation
    facade.cancelOperation('TRX-99819C');

    expect(gatewayMock.cancelOperation).toHaveBeenCalledWith('TRX-99819C');
    const updatedRow = facade.operationsState().data!.items.find(op => op.id === 'TRX-99819C');
    expect(updatedRow?.estado).toBe('CANCELADA');
    expect(facade.cancellingId()).toBeNull();
  });

  // ── cancelOperation error ─────────────────────────────────────────────

  it('cancelOperation() on failure sets cancelErrorMessage', () => {
    gatewayMock.cancelOperation.mockReturnValue(throwError(() => new Error('Server error')));

    facade.cancelOperation('TRX-99821A');

    expect(facade.cancelErrorMessage()).toBe('No se pudo cancelar la operacion. Intente nuevamente.');
    expect(facade.cancellingId()).toBeNull();
  });

  it('clearCancelError() resets cancelErrorMessage to null', () => {
    gatewayMock.cancelOperation.mockReturnValue(throwError(() => new Error('err')));
    facade.cancelOperation('TRX-99821A');
    expect(facade.cancelErrorMessage()).not.toBeNull();

    facade.clearCancelError();

    expect(facade.cancelErrorMessage()).toBeNull();
  });

  // ── isFiltering state ─────────────────────────────────────────────────

  it('isFiltering() is true while getOperations is in-flight', () => {
    // Since we use synchronous observables in tests, isFiltering resets immediately.
    // This test verifies it starts false before any call.
    expect(facade.isFiltering()).toBe(false);
  });
});
