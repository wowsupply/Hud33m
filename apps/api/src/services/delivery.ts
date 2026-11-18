import { messengerLinks, notificationSettings, notifications, pushSubscriptions, users } from '@hud/db';
import type { NotificationType } from '@hud/shared';
import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Deps } from '../deps';

const MAX_ATTEMPTS = 3;

type Settings = typeof notificationSettings.$inferSelect | null;

/** Разрешена ли доставка во внешние каналы по настройкам пользователя. В ленте уведомление остаётся всегда. */
export function externalAllowed(type: NotificationType, s: Settings): boolean {
  switch (type) {
    case 'weigh_in_reminder':
      return s?.weighInEnabled ?? true;
    case 'diary_reminder':
      return s?.diaryEnabled ?? true;
    case 'mentor_comment':
      return s?.commentsEnabled ?? true;
    case 'weekly_report_ready':
      return s?.reportsEnabled ?? true;
    case 'access_ending':
    case 'access_ended':
      return s?.accessEnabled ?? true;
    default:
      return true;
  }
}

/**
 * Текст для экрана блокировки и мессенджера: без содержимого переписки и подробностей о питании —
 * уведомление может увидеть посторонний.
 */
export function externalBody(type: NotificationType, body: string): string {
  if (type === 'mentor_comment') return 'Откройте приложение, чтобы прочитать.';
  if (type === 'student_reply') return 'Откройте кабинет, чтобы прочитать.';
  if (type === 'safety_alert') return 'Откройте кабинет: запись ученицы требует внимания.';
  return body;
}

export async function dispatchNotification(deps: Deps, id: string): Promise<void> {
  const [row] = await deps.db
    .select({ n: notifications, s: notificationSettings, role: users.role })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(notificationSettings, eq(notificationSettings.userId, notifications.userId))
    .where(eq(notifications.id, id));
  if (!row || row.n.deliveredAt) return;
  const n = row.n;

  const channels = new Set(n.channels);
  const errors: string[] = [];

  if (externalAllowed(n.type, row.s)) {
    const body = externalBody(n.type, n.body);
    const base = row.role === 'student' ? deps.config.PUBLIC_STUDENT_URL : deps.config.PUBLIC_ADMIN_URL;
    const url = n.link ? `${base.replace(/\/$/, '')}${n.link}` : base;

    if (deps.push) {
      const subs = await deps.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
      for (const sub of subs) {
        try {
          const r = await deps.push.send(sub, { title: n.title, body, link: n.link, tag: n.type });
          if (r === 'gone') {
            await deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          } else {
            channels.add('push');
            await deps.db.update(pushSubscriptions).set({ lastSuccessAt: deps.now() }).where(eq(pushSubscriptions.id, sub.id));
          }
        } catch (e) {
          errors.push(`push: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const links = await deps.db.select().from(messengerLinks).where(eq(messengerLinks.userId, n.userId));
    for (const link of links) {
      const adapter = deps.messengers.get(link.channel);
      if (!adapter || channels.has(link.channel)) continue;
      try {
        await adapter.send(link.externalId, body ? `${n.title}\n${body}` : n.title, { text: 'Открыть', url });
        channels.add(link.channel);
      } catch (e) {
        errors.push(`${link.channel}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const attempts = n.deliveryAttempts + 1;
  const done = errors.length === 0 || attempts >= MAX_ATTEMPTS;
  await deps.db
    .update(notifications)
    .set({
      channels: [...channels],
      deliveryAttempts: attempts,
      deliveryError: errors.length ? errors.join('; ').slice(0, 1000) : null,
      deliveredAt: done ? deps.now() : null,
    })
    .where(eq(notifications.id, id));
}

/** Повторная доставка того, что не ушло сразу (вызывается воркером). */
export async function sweepDeliveries(deps: Deps, limit = 50): Promise<number> {
  const now = deps.now().getTime();
  const rows = await deps.db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        isNull(notifications.deliveredAt),
        lt(notifications.deliveryAttempts, MAX_ATTEMPTS),
        lt(notifications.createdAt, new Date(now - 60_000)),
        gt(notifications.createdAt, new Date(now - 24 * 3600_000)),
      ),
    )
    .limit(limit);
  for (const r of rows) await dispatchNotification(deps, r.id);
  return rows.length;
}

export async function deliveryStats(deps: Deps, userIds: string[]) {
  if (!userIds.length) return [];
  return deps.db
    .select({ userId: pushSubscriptions.userId, n: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds))
    .groupBy(pushSubscriptions.userId);
}
