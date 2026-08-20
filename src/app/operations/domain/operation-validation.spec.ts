import { describe, it, expect } from 'vitest';
import {
  OperationType,
  parseAmount,
  buildCanonicalPayload,
} from './operation-validation';

describe('OperationType', () => {
  it('accepts DEPOSITO', () => {
    expect(OperationType.DEPOSITO).toBe('DEPOSITO');
  });

  it('accepts RETIRO', () => {
    expect(OperationType.RETIRO).toBe('RETIRO');
  });

  it('has exactly two values', () => {
    const values = Object.values(OperationType);
    expect(values).toHaveLength(2);
    expect(values).toContain('DEPOSITO');
    expect(values).toContain('RETIRO');
  });

  it('rejects unknown type at type guard', () => {
    expect(Object.values(OperationType).includes('TRANSFERENCIA' as OperationType)).toBe(false);
  });
});

describe('parseAmount', () => {
  // Valid values
  it('parses integer amount', () => {
    const result = parseAmount('100', '.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('100');
  });

  it('parses one decimal place', () => {
    const result = parseAmount('10.5', '.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('10.5');
  });

  it('parses two decimal places', () => {
    const result = parseAmount('1250.50', '.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('1250.50');
  });

  it('parses locale comma separator', () => {
    const result = parseAmount('1250,50', ',');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('1250.50');
  });

  it('does not convert through JavaScript floating point', () => {
    // 0.1 + 0.2 floating point trap — must stay exact
    const result = parseAmount('0.10', '.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe('0.10');
  });

  it('accepts arbitrarily large integer beyond JS safe integer', () => {
    const large = '999999999999999999999999999';
    const result = parseAmount(large, '.');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.canonical).toBe(large);
  });

  // Invalid values
  it('rejects empty string', () => {
    const result = parseAmount('', '.');
    expect(result.ok).toBe(false);
  });

  it('rejects zero', () => {
    const result = parseAmount('0', '.');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/positive/i);
  });

  it('rejects negative', () => {
    const result = parseAmount('-1', '.');
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric', () => {
    const result = parseAmount('abc', '.');
    expect(result.ok).toBe(false);
  });

  it('rejects three decimal places', () => {
    const result = parseAmount('1.123', '.');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/decimal/i);
  });

  it('rejects plus-prefixed value', () => {
    const result = parseAmount('+100', '.');
    expect(result.ok).toBe(false);
  });

  it('rejects exponent notation', () => {
    const result = parseAmount('1E2', '.');
    expect(result.ok).toBe(false);
  });
});

describe('buildCanonicalPayload', () => {
  it('produces stable payload for same type and amount', () => {
    const a = buildCanonicalPayload('DEPOSITO', '1250.50');
    const b = buildCanonicalPayload('DEPOSITO', '1250.50');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces correct type and amount fields', () => {
    const payload = buildCanonicalPayload('RETIRO', '50.00');
    expect(payload.type).toBe('RETIRO');
    expect(payload.amount).toBe('50.00');
  });
});
