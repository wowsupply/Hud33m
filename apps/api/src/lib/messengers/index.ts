import type { MessengerChannel } from '@hud/shared';
import type { AppConfig } from '../../config';
import { MaxAdapter } from './max';
import { TelegramAdapter } from './telegram';
import type { MessengerAdapter } from './types';

export type MessengerRegistry = Map<MessengerChannel, MessengerAdapter>;

/** Подключает только те мессенджеры, для которых заданы токены. */
export function createMessengers(config: AppConfig): MessengerRegistry {
  const map: MessengerRegistry = new Map();
  if (config.TELEGRAM_BOT_TOKEN) {
    map.set(
      'telegram',
      new TelegramAdapter({
        token: config.TELEGRAM_BOT_TOKEN,
        username: config.TELEGRAM_BOT_USERNAME!,
        secret: config.TELEGRAM_WEBHOOK_SECRET!,
        apiUrl: config.TELEGRAM_API_URL,
      }),
    );
  }
  if (config.MAX_BOT_TOKEN) {
    map.set(
      'max',
      new MaxAdapter({
        token: config.MAX_BOT_TOKEN,
        botName: config.MAX_BOT_NAME!,
        secret: config.MAX_WEBHOOK_SECRET!,
        apiUrl: config.MAX_API_URL,
        deepLinkTemplate: config.MAX_DEEPLINK_TEMPLATE,
      }),
    );
  }
  return map;
}

export * from './max';
export * from './telegram';
export * from './types';
