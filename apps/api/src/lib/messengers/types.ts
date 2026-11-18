import type { MessengerChannel } from '@hud/shared';

export interface IncomingUpdate {
  /** Идентификатор, по которому бот пишет пользователю (chat_id в Telegram, user_id в MAX). */
  externalId: string;
  /** Параметр запуска бота из ссылки (?start=…). */
  startPayload: string | null;
  text: string | null;
  /** Пользователь остановил или заблокировал бота. */
  stopped: boolean;
}

export interface LinkButton {
  text: string;
  url: string;
}

export interface MessengerAdapter {
  readonly channel: MessengerChannel;
  /** Ссылка, открывающая бота с параметром привязки. */
  deepLink(payload: string): string;
  send(externalId: string, text: string, button?: LinkButton): Promise<void>;
  /** Проверка секрета вебхука. */
  verify(headers: Record<string, string | string[] | undefined>): boolean;
  parseUpdate(body: unknown): IncomingUpdate | null;
  /** Регистрирует адрес вебхука у мессенджера. */
  setupWebhook(url: string): Promise<void>;
}

export const header = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/** Кнопки-ссылки мессенджеры принимают только с https. */
export const httpsButton = (button?: LinkButton) => (button && button.url.startsWith('https://') ? button : undefined);
