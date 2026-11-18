import { notificationSettings, notifications, type Db } from '@hud/db';
import type { NotificationType } from '@hud/shared';
import type { NotificationSettingsInput } from '@hud/shared/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Deps } from '../deps';
import { dispatchNotification } from './delivery';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
  /** Ключ идемпотентности: повторное уведомление с тем же ключом не создаётся. */
  dedupeKey?: string;
}

/**
 * Создаёт уведомление в ленте приложения и запускает доставку во внешние каналы
 * (Web Push, бот в мессенджере) в фоне — ответ пользователю не ждёт доставки.
 * Недоставленное воркер повторит.
 */
export async function notify(deps: Deps, n: NotifyInput): Promise<boolean> {
  const rows = await deps.db
    .insert(notifications)
    .values({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? '',
      link: n.link ?? null,
      dedupeKey: n.dedupeKey ?? null,
      channels: ['inapp'],
      createdAt: deps.now(),
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  const id = rows[0]?.id;
  if (!id) return false;
  await deps.events.publish({ kind: 'notification', userId: n.userId });
  deps.background.run(dispatchNotification(deps, id));
  return true;
}

export async function listNotifications(db: Db, userId: string, limit = 50) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationsCount(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markNotificationsRead(db: Db, userId: string, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function getNotificationSettings(db: Db, userId: string) {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
  if (row) return row;
  const [created] = await db.insert(notificationSettings).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)))[0]!;
}

export async function updateNotificationSettings(db: Db, userId: string, input: NotificationSettingsInput) {
  await getNotificationSettings(db, userId);
  await db
    .update(notificationSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(notificationSettings.userId, userId));
}
