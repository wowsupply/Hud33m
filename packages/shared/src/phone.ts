/**
 * Нормализует телефон в формат E.164. Российские номера: 8XXXXXXXXXX, 7XXXXXXXXXX,
 * +7XXXXXXXXXX, 9XXXXXXXXX (10 цифр). Возвращает null, если номер некорректный.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }
  if (trimmed.startsWith('+') && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** +79991234567 → +7 (999) 123-45-67 */
export function formatPhone(e164: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (!m) return e164;
  return `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}`;
}
