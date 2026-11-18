import { messengerLinks, notifications, pushSubscriptions } from '@hud/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runTick } from '../src/jobs';
import type { IncomingUpdate, LinkButton, MessengerAdapter } from '../src/lib/messengers';
import { MaxAdapter, TelegramAdapter } from '../src/lib/messengers';
import { buildServer } from '../src/server';
import { handleMessengerUpdate } from '../src/services/messengers';
import { createStaff, login, onboardStudent, useTestDeps } from './helpers';

class FakeMessenger implements MessengerAdapter {
  readonly channel = 'max' as const;
  sent: Array<{ externalId: string; text: string; button?: LinkButton }> = [];
  failNext = false;
  deepLink(payload: string) {
    return `https://max.example/bot?start=${payload}`;
  }
  async send(externalId: string, text: string, button?: LinkButton) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('network');
    }
    this.sent.push({ externalId, text, button });
  }
  verify(headers: Record<string, string | string[] | undefined>) {
    return headers['x-test-secret'] === 'ok';
  }
  parseUpdate(body: unknown): IncomingUpdate | null {
    const b = body as { user?: string; start?: string };
    return b.user ? { externalId: b.user, startPayload: b.start ?? null, text: null, stopped: false } : null;
  }
  async setupWebhook() {}
}

const messenger = new FakeMessenger();
const { deps, clock, push } = useTestDeps({ messengers: [messenger] });

async function setup() {
  messenger.sent = [];
  await createStaff(deps, '+79991112233');
  const admin = await login(deps, '+79991112233', 'admin');
  const s = await onboardStudent(deps, admin);
  return { admin, ...s };
}

const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BOr4n8tPpFakeKeyFakeKey12345', auth: 'authsecret123' } };

describe('Web Push', () => {
  it('комментарий наставника приходит push-уведомлением без текста переписки', async () => {
    const { admin, student, studentId } = await setup();
    const channels = await student.call.me.channels();
    expect(channels.push.publicKey).toBe('test-public-key');
    await student.call.me.subscribePush(sub);

    await admin.call.admin.students.comment({ studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Личный комментарий' });
    await deps.background.flush();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]?.payload).toMatchObject({ title: 'Новый комментарий наставника', body: 'Откройте приложение, чтобы прочитать.', link: '/day/2026-11-18' });
    const [n] = await deps.db.select().from(notifications).where(eq(notifications.userId, studentId));
    expect(n?.channels).toEqual(['inapp', 'push']);
    expect(n?.deliveredAt).not.toBeNull();
  });

  it('уважает настройки и удаляет недействительные подписки', async () => {
    const { admin, student, studentId } = await setup();
    await student.call.me.subscribePush(sub);
    const s = await student.call.me.settings();
    await student.call.me.updateSettings({ notifications: { ...s.notifications, commentsEnabled: false } });
    await admin.call.admin.students.comment({ studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Раз' });
    await deps.background.flush();
    expect(push.sent).toHaveLength(0);

    await student.call.me.updateSettings({ notifications: { ...s.notifications, commentsEnabled: true } });
    push.gone.add(sub.endpoint);
    await admin.call.admin.students.comment({ studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Два' });
    await deps.background.flush();
    push.gone.clear();
    expect(await deps.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, studentId))).toHaveLength(0);
  });
});

describe('бот в мессенджере', () => {
  it('привязка по ссылке, доставка, повтор после сбоя и отключение', async () => {
    const { admin, student, studentId } = await setup();
    const status = await student.call.me.channels();
    expect(status.messengers).toEqual([{ channel: 'max', title: 'MAX', linked: false, linkedAt: null }]);

    const { url } = await student.call.me.linkMessenger({ channel: 'max' });
    const token = new URL(url).searchParams.get('start')!;
    await handleMessengerUpdate(deps, 'max', { externalId: '777', startPayload: token, text: null, stopped: false });
    expect(messenger.sent.at(-1)?.text).toMatch(/^Готово/);
    expect((await student.call.me.channels()).messengers[0]?.linked).toBe(true);

    // Повторное использование ссылки не работает.
    await handleMessengerUpdate(deps, 'max', { externalId: '888', startPayload: token, text: null, stopped: false });
    expect(messenger.sent.at(-1)?.text).toMatch(/устарела/);

    messenger.failNext = true;
    await admin.call.admin.students.comment({ studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Тест' });
    await deps.background.flush();
    let [n] = await deps.db.select().from(notifications).where(eq(notifications.userId, studentId));
    expect(n?.deliveredAt).toBeNull();
    expect(n?.deliveryError).toMatch(/network/);

    clock.set('2026-11-18T09:03:00Z');
    const tick = await runTick(deps);
    expect(tick.redelivered).toBe(1);
    [n] = await deps.db.select().from(notifications).where(eq(notifications.userId, studentId));
    expect(n?.channels).toContain('max');
    const delivered = messenger.sent.at(-1)!;
    expect(delivered).toMatchObject({ externalId: '777', text: 'Новый комментарий наставника\nОткройте приложение, чтобы прочитать.' });
    expect(delivered.button?.url).toBe('http://localhost:5173/day/2026-11-18');

    await handleMessengerUpdate(deps, 'max', { externalId: '777', startPayload: null, text: null, stopped: true });
    expect(await deps.db.select().from(messengerLinks).where(eq(messengerLinks.userId, studentId))).toHaveLength(0);
  });
});

describe('вебхук бота', () => {
  it('проверяет секрет и привязывает аккаунт', async () => {
    const { student, studentId } = await setup();
    const { url } = await student.call.me.linkMessenger({ channel: 'max' });
    const token = new URL(url).searchParams.get('start')!;
    const app = await buildServer(deps);
    const unknown = await app.inject({ method: 'POST', url: '/api/bots/telegram', payload: {} });
    expect(unknown.statusCode).toBe(404);
    const denied = await app.inject({ method: 'POST', url: '/api/bots/max', payload: { user: '555', start: token } });
    expect(denied.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/bots/max', headers: { 'x-test-secret': 'ok' }, payload: { user: '555', start: token } });
    expect(ok.statusCode).toBe(200);
    const [link] = await deps.db.select().from(messengerLinks).where(eq(messengerLinks.userId, studentId));
    expect(link?.externalId).toBe('555');
    await app.close();
  });
});

describe('адаптеры мессенджеров', () => {
  it('Telegram: разбор /start и формат отправки', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const tg = new TelegramAdapter({ token: 'T', username: 'hud_bot', secret: 's3cret', apiUrl: 'https://api.telegram.org' }, fetchImpl);
    expect(tg.deepLink('abc')).toBe('https://t.me/hud_bot?start=abc');
    expect(tg.verify({ 'x-telegram-bot-api-secret-token': 's3cret' })).toBe(true);
    expect(tg.verify({ 'x-telegram-bot-api-secret-token': 'nope' })).toBe(false);
    expect(tg.parseUpdate({ message: { chat: { id: 42, type: 'private' }, text: '/start tok_1' } })).toEqual({
      externalId: '42',
      startPayload: 'tok_1',
      text: '/start tok_1',
      stopped: false,
    });
    expect(tg.parseUpdate({ my_chat_member: { chat: { id: 42 }, new_chat_member: { status: 'kicked' } } })?.stopped).toBe(true);
    await tg.send('42', 'Привет', { text: 'Открыть', url: 'https://app.example.ru/' });
    expect(calls[0]).toEqual({
      url: 'https://api.telegram.org/botT/sendMessage',
      body: { chat_id: '42', text: 'Привет', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: 'Открыть', url: 'https://app.example.ru/' }]] } },
    });
  });

  it('MAX: разбор bot_started и формат отправки', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    const fetchImpl = (async (url: URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const max = new MaxAdapter(
      { token: 'M', botName: 'hud_bot', secret: 's', apiUrl: 'https://platform-api2.max.ru', deepLinkTemplate: 'https://max.ru/{bot}?start={payload}' },
      fetchImpl,
    );
    expect(max.deepLink('abc')).toBe('https://max.ru/hud_bot?start=abc');
    expect(max.parseUpdate({ update_type: 'bot_started', timestamp: 1, chat_id: 5, user: { user_id: 99 }, payload: 'tok' })).toEqual({
      externalId: '99',
      startPayload: 'tok',
      text: null,
      stopped: false,
    });
    expect(max.parseUpdate({ update_type: 'message_created', message: { sender: { user_id: 99 }, body: { text: 'привет' } } })?.text).toBe('привет');
    await max.send('99', 'Привет', { text: 'Открыть', url: 'https://app.example.ru/' });
    expect(calls[0]?.url).toBe('https://platform-api2.max.ru/messages?user_id=99');
    expect(calls[0]?.headers.Authorization).toBe('M');
    expect(calls[0]?.body).toEqual({
      text: 'Привет',
      attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'link', text: 'Открыть', url: 'https://app.example.ru/' }]] } }],
    });
  });
});
