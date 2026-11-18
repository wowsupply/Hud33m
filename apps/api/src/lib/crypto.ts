import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const hmac = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomDigits = (length: number): string =>
  Array.from({ length }, () => randomInt(0, 10)).join('');

export const hashJson = (value: unknown): string => sha256(JSON.stringify(value));
