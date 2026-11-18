import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Шифрование небольших секретов (TOTP) ключом, производным от APP_SECRET: AES-256-GCM. */
const keyFor = (appSecret: string) => createHash('sha256').update(`${appSecret}|secretbox`).digest();

export function seal(appSecret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(appSecret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function open(appSecret: string, sealed: string): string {
  const buf = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(appSecret), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
