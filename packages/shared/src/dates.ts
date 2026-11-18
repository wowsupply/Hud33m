/** Дата в формате YYYY-MM-DD (календарная дата дневника по местному времени). */
export type DateStr = string;

export const DEFAULT_TIMEZONE = 'Europe/Moscow';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateStr = (s: string): boolean => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  date: DateStr;
  hour: number;
  minute: number;
  /** 1 — понедельник … 7 — воскресенье */
  weekday: number;
  time: string;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

export function localParts(instant: Date, tz: string): LocalParts {
  const parts = partsFormatter(tz).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    date,
    hour,
    minute,
    weekday: weekdayOf(date),
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export const localDate = (instant: Date, tz: string): DateStr => localParts(instant, tz).date;

function toUtcMs(d: DateStr): number {
  return Date.parse(`${d}T00:00:00Z`);
}
function fromUtcMs(ms: number): DateStr {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromUtcMs(toUtcMs(d) + n * 86_400_000);
}

/** 1 — понедельник … 7 — воскресенье */
export function weekdayOf(d: DateStr): number {
  const js = new Date(toUtcMs(d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Понедельник недели, в которую входит дата. */
export function weekStartOf(d: DateStr): DateStr {
  return addDays(d, 1 - weekdayOf(d));
}

/** b − a в днях. */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export function dateRange(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Местные дата и время в часовом поясе → момент времени (UTC). */
export function zonedTimeToUtc(date: DateStr, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms: number) => {
    const p = localParts(new Date(ms), tz);
    const [ly, lm, ld] = p.date.split('-').map(Number) as [number, number, number];
    return Date.UTC(ly, lm - 1, ld, p.hour, p.minute) - ms;
  };
  let result = guess - offsetAt(guess);
  const second = guess - offsetAt(result);
  if (second !== result) result = second;
  return new Date(result);
}

export const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
export const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** 2026-11-18 → «18 ноября» (с годом, если withYear). */
export function formatDateRu(d: DateStr, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  let s = `${day} ${MONTHS_GENITIVE[m - 1]}`;
  if (opts.withYear) s += ` ${y}`;
  if (opts.withWeekday) s = `${WEEKDAY_NAMES[weekdayOf(d) - 1]}, ${s}`;
  return s;
}

/** «16–22 ноября» или «28 ноября – 4 декабря» */
export function formatWeekRu(weekStart: DateStr): string {
  const end = addDays(weekStart, 6);
  const [, sm, sd] = weekStart.split('-').map(Number) as [number, number, number];
  const [, em, ed] = end.split('-').map(Number) as [number, number, number];
  if (sm === em) return `${sd}–${ed} ${MONTHS_GENITIVE[em - 1]}`;
  return `${sd} ${MONTHS_GENITIVE[sm - 1]} – ${ed} ${MONTHS_GENITIVE[em - 1]}`;
}

/** Склонение: plural(3, ['день', 'дня', 'дней']) → 'дня' */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}
