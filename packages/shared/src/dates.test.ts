import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  formatDateRu,
  formatWeekRu,
  localParts,
  plural,
  weekStartOf,
  weekdayOf,
  zonedTimeToUtc,
} from './dates';

describe('dates', () => {
  it('местная дата зависит от часового пояса', () => {
    const instant = new Date('2026-11-18T22:30:00Z');
    expect(localParts(instant, 'Europe/Moscow').date).toBe('2026-11-19');
    expect(localParts(instant, 'Europe/Kaliningrad').date).toBe('2026-11-19');
    expect(localParts(instant, 'Europe/Moscow').time).toBe('01:30');
    expect(localParts(new Date('2026-11-18T10:00:00Z'), 'Asia/Vladivostok').time).toBe('20:00');
  });

  it('местное время → UTC', () => {
    expect(zonedTimeToUtc('2026-11-18', '08:00', 'Europe/Moscow').toISOString()).toBe('2026-11-18T05:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-18', '08:00', 'Asia/Yekaterinburg').toISOString()).toBe('2026-11-18T03:00:00.000Z');
  });

  it('недели начинаются с понедельника', () => {
    expect(weekdayOf('2026-11-18')).toBe(3);
    expect(weekStartOf('2026-11-18')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23');
  });

  it('арифметика дат', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(dateRange('2026-11-16', '2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
  });

  it('форматирование по-русски', () => {
    expect(formatDateRu('2026-11-18')).toBe('18 ноября');
    expect(formatDateRu('2026-11-18', { withWeekday: true })).toBe('среда, 18 ноября');
    expect(formatWeekRu('2026-11-16')).toBe('16–22 ноября');
    expect(formatWeekRu('2026-11-30')).toBe('30 ноября – 6 декабря');
    expect(plural(1, ['день', 'дня', 'дней'])).toBe('день');
    expect(plural(3, ['день', 'дня', 'дней'])).toBe('дня');
    expect(plural(11, ['день', 'дня', 'дней'])).toBe('дней');
    expect(plural(22, ['день', 'дня', 'дней'])).toBe('дня');
  });
});
