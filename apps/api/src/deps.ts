import { createAiService, GigaChatClient, LlmEngine, YandexGptClient, type AiService } from '@hud/ai';
import { createDb, type Db, type DbHandle } from '@hud/db';
import type { AppConfig } from './config';
import { createBackground, type Background } from './lib/background';
import { PgEventBus, type EventBus } from './lib/events';
import { createMessengers, type MessengerRegistry } from './lib/messengers';
import { ConsoleSms, SmsRu, type SmsSender } from './lib/sms';
import { WebPushSender, type PushSender } from './lib/webpush';
import { FoodCache } from './services/foods';

export interface Deps {
  db: Db;
  config: AppConfig;
  ai: AiService;
  sms: SmsSender;
  foods: FoodCache;
  now: () => Date;
  events: EventBus;
  background: Background;
  /** null — Web Push не настроен (нет ключей VAPID). */
  push: PushSender | null;
  messengers: MessengerRegistry;
}

export function createAi(config: AppConfig): AiService {
  if (config.AI_PROVIDER === 'gigachat') {
    return createAiService({
      llm: new LlmEngine(
        new GigaChatClient({
          authKey: config.GIGACHAT_AUTH_KEY!,
          scope: config.GIGACHAT_SCOPE,
          model: config.GIGACHAT_MODEL,
        }),
      ),
    });
  }
  if (config.AI_PROVIDER === 'yandexgpt') {
    return createAiService({
      llm: new LlmEngine(
        new YandexGptClient({
          apiKey: config.YANDEX_API_KEY!,
          folderId: config.YANDEX_FOLDER_ID!,
          model: config.YANDEX_MODEL,
        }),
      ),
    });
  }
  return createAiService({ llm: null });
}

export function createSms(config: AppConfig): SmsSender {
  return config.SMS_PROVIDER === 'smsru' ? new SmsRu(config.SMSRU_API_ID!) : new ConsoleSms();
}

export function createPush(config: AppConfig): PushSender | null {
  return config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? new WebPushSender(config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY, config.VAPID_SUBJECT)
    : null;
}

export function createDeps(config: AppConfig): { deps: Deps; handle: DbHandle } {
  const handle = createDb(config.DATABASE_URL);
  const deps: Deps = {
    db: handle.db,
    config,
    ai: createAi(config),
    sms: createSms(config),
    foods: new FoodCache(handle.db),
    now: () => new Date(),
    events: new PgEventBus(handle.sql),
    background: createBackground((e) => console.error('[background]', e)),
    push: createPush(config),
    messengers: createMessengers(config),
  };
  return { deps, handle };
}
