import { describe, expect, it } from 'vitest';
import { detectSafetySignals } from './safety';

describe('detectSafetySignals', () => {
  it('распознаёт признаки кризиса', () => {
    expect(detectSafetySignals(['Иногда кажется, что не хочу жить'])?.level).toBe('high');
    expect(detectSafetySignals([null, 'хочется причинить себе боль'])?.level).toBe('high');
    expect(detectSafetySignals(['Думаю о суициде'])?.matches).toEqual(['суицид']);
  });

  it('распознаёт компенсаторное поведение', () => {
    expect(detectSafetySignals(['после ужина вызвала рвоту'])?.level).toBe('medium');
    expect(detectSafetySignals(['выпила слабительное'])?.level).toBe('medium');
    expect(detectSafetySignals(['не ела весь день, потом сорвалась'])?.level).toBe('medium');
  });

  it('не реагирует на обычные записи', () => {
    expect(detectSafetySignals(['Устала на работе, хотелось сладкого'])).toBeNull();
    expect(detectSafetySignals(['чуть не умерла со смеху на празднике'])).toBeNull();
    expect(detectSafetySignals(['', null, undefined])).toBeNull();
  });
});
