import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('phone', () => {
  it('нормализует российские номера', () => {
    expect(normalizePhone('8 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
    expect(normalizePhone('9991234567')).toBe('+79991234567');
    expect(normalizePhone('12345')).toBeNull();
    expect(formatPhone('+79991234567')).toBe('+7 (999) 123-45-67');
  });
});
