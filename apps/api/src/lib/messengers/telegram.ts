import { safeEqual } from '../crypto';
import { header, httpsButton, type IncomingUpdate, type LinkButton, type MessengerAdapter } from './types';

/**
 * Бот Telegram (Bot API). Важно: в РФ Telegram поэтапно ограничивают — канал необязательный.
 * Бот может написать первым только после того, как пользователь нажал «Старт» по ссылке привязки.
 */
export class TelegramAdapter implements MessengerAdapter {
  readonly channel = 'telegram' as const;

  constructor(
    private readonly cfg: { token: string; username: string; secret: string; apiUrl: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  deepLink(payload: string) {
    return `https://t.me/${this.cfg.username}?start=${payload}`;
  }

  private async call(method: string, body: unknown) {
    const res = await this.fetchImpl(`${this.cfg.apiUrl}/bot${this.cfg.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
    return data;
  }

  async send(externalId: string, text: string, button?: LinkButton) {
    const b = httpsButton(button);
    await this.call('sendMessage', {
      chat_id: externalId,
      text,
      disable_web_page_preview: true,
      ...(b ? { reply_markup: { inline_keyboard: [[{ text: b.text, url: b.url }]] } } : {}),
    });
  }

  verify(headers: Record<string, string | string[] | undefined>) {
    const got = header(headers, 'x-telegram-bot-api-secret-token');
    return !!got && safeEqual(got, this.cfg.secret);
  }

  parseUpdate(body: unknown): IncomingUpdate | null {
    const u = body as {
      message?: { chat?: { id?: number; type?: string }; text?: string };
      my_chat_member?: { chat?: { id?: number }; new_chat_member?: { status?: string } };
    };
    if (u.my_chat_member?.chat?.id != null) {
      const status = u.my_chat_member.new_chat_member?.status;
      return {
        externalId: String(u.my_chat_member.chat.id),
        startPayload: null,
        text: null,
        stopped: status === 'kicked' || status === 'left',
      };
    }
    const chatId = u.message?.chat?.id;
    if (chatId == null || u.message?.chat?.type !== 'private') return null;
    const text = u.message.text ?? null;
    const start = text?.match(/^\/start(?:\s+(\S+))?/);
    return {
      externalId: String(chatId),
      startPayload: start?.[1] ?? null,
      text,
      stopped: text?.trim() === '/stop',
    };
  }

  async setupWebhook(url: string) {
    await this.call('setWebhook', {
      url,
      secret_token: this.cfg.secret,
      allowed_updates: ['message', 'my_chat_member'],
      drop_pending_updates: true,
    });
  }
}
