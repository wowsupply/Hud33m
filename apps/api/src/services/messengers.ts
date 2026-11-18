import { messengerLinks, messengerLinkTokens } from '@hud/db';
import { MESSENGER_CHANNELS, MESSENGER_TITLES, type MessengerChannel } from '@hud/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Deps } from '../deps';
import { randomToken } from '../lib/crypto';
import type { IncomingUpdate } from '../lib/messengers';

const LINK_TTL_MS = 30 * 60_000;

/** Доступные мессенджеры и статус привязки пользователя. */
export async function messengerStatus(deps: Deps, userId: string) {
  const links = await deps.db.select().from(messengerLinks).where(eq(messengerLinks.userId, userId));
  return MESSENGER_CHANNELS.filter((c) => deps.messengers.has(c)).map((channel) => {
    const link = links.find((l) => l.channel === channel);
    return { channel, title: MESSENGER_TITLES[channel], linked: !!link, linkedAt: link?.linkedAt ?? null };
  });
}

/** Ссылка на бота с одноразовым кодом привязки. */
export async function createLinkUrl(deps: Deps, userId: string, channel: MessengerChannel): Promise<string> {
  const adapter = deps.messengers.get(channel);
  if (!adapter) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Этот мессенджер не подключён' });
  const token = randomToken(18);
  await deps.db.insert(messengerLinkTokens).values({
    token,
    userId,
    channel,
    expiresAt: new Date(deps.now().getTime() + LINK_TTL_MS),
  });
  return adapter.deepLink(token);
}

export async function unlinkMessenger(deps: Deps, userId: string, channel: MessengerChannel) {
  await deps.db.delete(messengerLinks).where(and(eq(messengerLinks.userId, userId), eq(messengerLinks.channel, channel)));
}

const HELP_TEXT =
  'Это бот уведомлений дневника питания: сюда приходят напоминания и сообщения о комментариях наставника. ' +
  'Отвечать наставнику и вести дневник можно в приложении.';

/** Обработка входящего обновления от мессенджера (вебхук). */
export async function handleMessengerUpdate(deps: Deps, channel: MessengerChannel, update: IncomingUpdate): Promise<void> {
  const adapter = deps.messengers.get(channel);
  if (!adapter) return;

  if (update.stopped) {
    await deps.db
      .delete(messengerLinks)
      .where(and(eq(messengerLinks.channel, channel), eq(messengerLinks.externalId, update.externalId)));
    return;
  }

  if (update.startPayload) {
    const [token] = await deps.db
      .select()
      .from(messengerLinkTokens)
      .where(
        and(
          eq(messengerLinkTokens.token, update.startPayload),
          eq(messengerLinkTokens.channel, channel),
          isNull(messengerLinkTokens.usedAt),
          gt(messengerLinkTokens.expiresAt, deps.now()),
        ),
      );
    if (!token) {
      await adapter.send(update.externalId, 'Ссылка для подключения устарела. Откройте приложение и нажмите «Подключить» ещё раз.');
      return;
    }
    await deps.db.transaction(async (tx) => {
      await tx.update(messengerLinkTokens).set({ usedAt: deps.now() }).where(eq(messengerLinkTokens.token, token.token));
      // Один аккаунт мессенджера — одна учётная запись, один мессенджер на пользователя — одна привязка.
      await tx
        .delete(messengerLinks)
        .where(and(eq(messengerLinks.channel, channel), eq(messengerLinks.externalId, update.externalId)));
      await tx.delete(messengerLinks).where(and(eq(messengerLinks.channel, channel), eq(messengerLinks.userId, token.userId)));
      await tx.insert(messengerLinks).values({ userId: token.userId, channel, externalId: update.externalId });
    });
    await deps.events.publish({ kind: 'profile', userId: token.userId });
    await adapter.send(update.externalId, 'Готово! Уведомления дневника питания будут приходить сюда. Отключить можно в профиле приложения.');
    return;
  }

  if (update.text) await adapter.send(update.externalId, HELP_TEXT);
}
