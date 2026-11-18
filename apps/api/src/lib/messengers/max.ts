import { safeEqual } from '../crypto';
import { header, httpsButton, type IncomingUpdate, type LinkButton, type MessengerAdapter } from './types';

/**
 * Бот MAX (Bot API). Формат запросов взят из официального клиента @maxhub/max-bot-api:
 * адрес https://platform-api2.max.ru, токен в заголовке Authorization, отправка — POST /messages?user_id=…,
 * вебхук — POST /subscriptions, секрет приходит в заголовке X-Max-Bot-Api-Secret.
 * Формат ссылки запуска бота с параметром настраивается (MAX_DEEPLINK_TEMPLATE) — проверить на реальном боте.
 */
export class MaxAdapter implements MessengerAdapter {
  readonly channel = 'max' as const;

  constructor(
    private readonly cfg: { token: string; botName: string; secret: string; apiUrl: string; deepLinkTemplate: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  deepLink(payload: string) {
    return this.cfg.deepLinkTemplate.replace('{bot}', this.cfg.botName).replace('{payload}', payload);
  }

  private async call(path: string, body: unknown, query: Record<string, string> = {}) {
    const url = new URL(path, this.cfg.apiUrl);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.cfg.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      throw new Error(`MAX ${path}: ${data.message ?? data.code ?? res.status}`);
    }
  }

  async send(externalId: string, text: string, button?: LinkButton) {
    const b = httpsButton(button);
    await this.call(
      '/messages',
      {
        text,
        ...(b
          ? { attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'link', text: b.text, url: b.url }]] } }] }
          : {}),
      },
      { user_id: externalId },
    );
  }

  verify(headers: Record<string, string | string[] | undefined>) {
    const got = header(headers, 'x-max-bot-api-secret');
    return !!got && safeEqual(got, this.cfg.secret);
  }

  parseUpdate(body: unknown): IncomingUpdate | null {
    const u = body as {
      update_type?: string;
      user?: { user_id?: number };
      payload?: string | null;
      message?: { sender?: { user_id?: number } | null; body?: { text?: string | null } };
    };
    if ((u.update_type === 'bot_started' || u.update_type === 'bot_stopped') && u.user?.user_id != null) {
      return {
        externalId: String(u.user.user_id),
        startPayload: u.update_type === 'bot_started' ? (u.payload ?? null) : null,
        text: null,
        stopped: u.update_type === 'bot_stopped',
      };
    }
    if (u.update_type === 'message_created' && u.message?.sender?.user_id != null) {
      const text = u.message.body?.text ?? null;
      const start = text?.match(/^\/start(?:\s+(\S+))?/);
      return { externalId: String(u.message.sender.user_id), startPayload: start?.[1] ?? null, text, stopped: false };
    }
    return null;
  }

  async setupWebhook(url: string) {
    await this.call('/subscriptions', {
      url,
      update_types: ['bot_started', 'bot_stopped', 'message_created'],
      secret: this.cfg.secret,
    });
  }
}
