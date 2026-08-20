import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserPendingConfirmationStore } from './browser-pending-confirmation.store';

describe('BrowserPendingConfirmationStore', () => {
  let store: BrowserPendingConfirmationStore;
  const validSnapshot = {
    version: 1 as const,
    rawType: 'DEPOSITO',
    rawAmount: '1250.50',
    payload: { type: 'DEPOSITO', amount: '1250.50' },
    idempotencyKey: '8e03978e-40d5-43e8-bc93-6894a57f9324',
  };

  beforeEach(() => {
    localStorage.clear();
    store = new BrowserPendingConfirmationStore();
  });

  // ---- Write / Read / Remove round-trip ----

  it('saves and loads the snapshot', () => {
    store.save(validSnapshot);
    const loaded = store.load();
    expect(loaded).toEqual(validSnapshot);
  });

  it('returns null when nothing is stored', () => {
    expect(store.load()).toBeNull();
  });

  it('removes the snapshot', () => {
    store.save(validSnapshot);
    store.remove();
    expect(store.load()).toBeNull();
  });

  it('read-after-write returns the same object', () => {
    store.save(validSnapshot);
    const loaded = store.load();
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(validSnapshot));
  });

  // ---- Verification failure blocks POST ----

  it('load returns null if stored JSON does not match schema version', () => {
    localStorage.setItem(
      BrowserPendingConfirmationStore.STORAGE_KEY,
      JSON.stringify({ version: 999, rawType: 'DEPOSITO' })
    );
    expect(store.load()).toBeNull();
  });

  it('load returns null for malformed JSON', () => {
    localStorage.setItem(BrowserPendingConfirmationStore.STORAGE_KEY, 'NOT_JSON{{{');
    expect(store.load()).toBeNull();
  });

  it('load returns null for missing required fields', () => {
    localStorage.setItem(
      BrowserPendingConfirmationStore.STORAGE_KEY,
      JSON.stringify({ version: 1, rawType: 'DEPOSITO' }) // missing payload, idempotencyKey
    );
    expect(store.load()).toBeNull();
  });

  it('load returns null for empty idempotency key', () => {
    localStorage.setItem(
      BrowserPendingConfirmationStore.STORAGE_KEY,
      JSON.stringify({ ...validSnapshot, idempotencyKey: '' })
    );
    expect(store.load()).toBeNull();
  });

  // ---- Quota failure ----

  it('save throws StorageUnavailableError when localStorage quota exceeded', () => {
    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => store.save(validSnapshot)).toThrow();
    mockSetItem.mockRestore();
  });

  // ---- Remove failure ----

  it('remove throws when localStorage removeItem fails', () => {
    const mockRemoveItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage error');
    });

    store.save(validSnapshot);
    expect(() => store.remove()).toThrow();
    mockRemoveItem.mockRestore();
  });
});
