import { TRPCClientError } from '@trpc/client';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** 1234.5 → «1 235» */
export const fmt0 = (n: number | null | undefined) => (n == null ? '—' : nf0.format(n));
/** 84.55 → «84,6» */
export const fmt1 = (n: number | null | undefined) => (n == null ? '—' : nf1.format(n));

export function signed1(n: number): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${nf1.format(Math.abs(n))}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) return e.message || 'Что-то пошло не так';
  if (e instanceof Error) return e.message;
  return 'Что-то пошло не так';
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof TRPCClientError && (e.data as { code?: string } | undefined)?.code === 'UNAUTHORIZED';
}

/** Сегодняшняя дата в часовом поясе устройства (YYYY-MM-DD). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nowTimeLocal(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
