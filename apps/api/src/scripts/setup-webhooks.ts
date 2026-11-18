import { loadConfig } from '../config';
import { createMessengers } from '../lib/messengers';

/**
 * Регистрирует вебхуки ботов у мессенджеров. Запускается один раз после выкладывания:
 *   setup-webhooks --base https://app.example.ru
 */
const config = loadConfig();
const baseArg = process.argv.indexOf('--base');
const base = (baseArg > 0 ? process.argv[baseArg + 1] : config.PUBLIC_STUDENT_URL)!.replace(/\/$/, '');
const messengers = createMessengers(config);
if (messengers.size === 0) {
  console.log('Боты не настроены (нет TELEGRAM_BOT_TOKEN / MAX_BOT_TOKEN)');
  process.exit(0);
}
for (const [channel, adapter] of messengers) {
  const url = `${base}/api/bots/${channel}`;
  try {
    await adapter.setupWebhook(url);
    console.log(`${channel}: вебхук → ${url}`);
  } catch (e) {
    console.error(`${channel}: ошибка`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
