import { notificationSettings, notifications, type Db } from '@hud/db';
import type { NotificationSettingsInput, NotificationType } from '@hud/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';

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
 * Создаёт уведомление в ленте приложения. Каналы доставки (Web Push, бот в мессенджере)
 * подключаются следующим этапом и будут читать эту же таблицу.
 */
export async function notify(db: Db, n: NotifyInput): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? '',
      link: n.link ?? null,
      dedupeKey: n.dedupeKey ?? null,
      channels: ['inapp'],
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function listNotifications(db: Db, userId: string, limit = 50) {
  return db
    .select()
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
