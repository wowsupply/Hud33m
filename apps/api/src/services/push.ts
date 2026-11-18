import { pushSubscriptions } from '@hud/db';
import { and, eq } from 'drizzle-orm';
import type { Deps } from '../deps';

export async function savePushSubscription(
  deps: Deps,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  userAgent: string | null,
) {
  await deps.db
    .insert(pushSubscriptions)
    .values({ userId, ...sub, userAgent })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent } });
}

export async function removePushSubscription(deps: Deps, userId: string, endpoint: string) {
  await deps.db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function pushSubscriptionsCount(deps: Deps, userId: string): Promise<number> {
  return (await deps.db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;
}
