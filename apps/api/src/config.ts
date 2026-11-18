import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/hud'),
  /** Секрет для хеширования одноразовых кодов. В продакшене обязателен. */
  APP_SECRET: z.string().min(16).default('dev-secret-change-me-in-production'),
  PUBLIC_STUDENT_URL: z.string().default('http://localhost:5173'),
  PUBLIC_ADMIN_URL: z.string().default('http://localhost:5174'),
  /** Только для разработки: фиксированный код входа. */
  DEV_OTP_CODE: z.string().optional(),
  SMS_PROVIDER: z.enum(['console', 'smsru']).default('console'),
  SMSRU_API_ID: z.string().optional(),
  AI_PROVIDER: z.enum(['local', 'gigachat', 'yandexgpt']).default('local'),
  GIGACHAT_AUTH_KEY: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default('GIGACHAT_API_PERS'),
  GIGACHAT_MODEL: z.string().default('GigaChat'),
  YANDEX_API_KEY: z.string().optional(),
  YANDEX_FOLDER_ID: z.string().optional(),
  YANDEX_MODEL: z.string().default('yandexgpt-lite/latest'),
  /** Что видит ученица после окончания доступа: только чтение или блокировка (вопрос к заказчице). */
  ACCESS_AFTER_END: z.enum(['read_only', 'blocked']).default('read_only'),
  WORKER_INTERVAL_MS: z.coerce.number().int().default(60_000),
  TRUST_PROXY: bool,
  /** Web Push: ключи VAPID (сгенерировать: pnpm --filter @hud/api vapid-keys). */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@example.ru'),
  /** Бот Telegram (необязательно). */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_API_URL: z.string().default('https://api.telegram.org'),
  /** Бот MAX (необязательно). */
  MAX_BOT_TOKEN: z.string().optional(),
  MAX_BOT_NAME: z.string().optional(),
  MAX_WEBHOOK_SECRET: z.string().optional(),
  MAX_API_URL: z.string().default('https://platform-api2.max.ru'),
  MAX_DEEPLINK_TEMPLATE: z.string().default('https://max.ru/{bot}?start={payload}'),
  /** Обязательная двухфакторная защита для наставников (по умолчанию — в продакшене). */
  STAFF_TOTP_REQUIRED: z.enum(['true', 'false']).optional(),
});

export type AppConfig = z.infer<typeof envSchema> & { isProd: boolean; staffTotpRequired: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const isProd = parsed.NODE_ENV === 'production';
  if (isProd) {
    if (parsed.DEV_OTP_CODE) throw new Error('DEV_OTP_CODE нельзя использовать в продакшене');
    if (parsed.APP_SECRET.startsWith('dev-secret')) throw new Error('Задайте APP_SECRET для продакшена');
  }
  if (parsed.AI_PROVIDER === 'gigachat' && !parsed.GIGACHAT_AUTH_KEY) {
    throw new Error('AI_PROVIDER=gigachat требует GIGACHAT_AUTH_KEY');
  }
  if (parsed.AI_PROVIDER === 'yandexgpt' && (!parsed.YANDEX_API_KEY || !parsed.YANDEX_FOLDER_ID)) {
    throw new Error('AI_PROVIDER=yandexgpt требует YANDEX_API_KEY и YANDEX_FOLDER_ID');
  }
  if (parsed.SMS_PROVIDER === 'smsru' && !parsed.SMSRU_API_ID) {
    throw new Error('SMS_PROVIDER=smsru требует SMSRU_API_ID');
  }
  if (parsed.TELEGRAM_BOT_TOKEN && (!parsed.TELEGRAM_BOT_USERNAME || !parsed.TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error('Для бота Telegram нужны TELEGRAM_BOT_USERNAME и TELEGRAM_WEBHOOK_SECRET');
  }
  if (parsed.MAX_BOT_TOKEN && (!parsed.MAX_BOT_NAME || !parsed.MAX_WEBHOOK_SECRET)) {
    throw new Error('Для бота MAX нужны MAX_BOT_NAME и MAX_WEBHOOK_SECRET');
  }
  if (!!parsed.VAPID_PUBLIC_KEY !== !!parsed.VAPID_PRIVATE_KEY) {
    throw new Error('Задайте обе переменные VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY');
  }
  const staffTotpRequired = parsed.STAFF_TOTP_REQUIRED ? parsed.STAFF_TOTP_REQUIRED === 'true' : isProd;
  return { ...parsed, isProd, staffTotpRequired };
}
