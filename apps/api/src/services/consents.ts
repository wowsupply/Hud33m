import { consents, type Db } from '@hud/db';
import { CONSENT_DOCS, CONSENT_TYPES, type ConsentType } from '@hud/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';

export type ConsentState = Record<ConsentType, { accepted: boolean; version: string | null; acceptedAt: Date | null }>;

export async function consentState(db: Db, userId: string): Promise<ConsentState> {
  const rows = await db
    .select()
    .from(consents)
    .where(and(eq(consents.userId, userId), isNull(consents.revokedAt)))
    .orderBy(desc(consents.acceptedAt));
  const state = {} as ConsentState;
  for (const type of CONSENT_TYPES) {
    const row = rows.find((r) => r.type === type);
    state[type] = {
      accepted: !!row && row.version === CONSENT_DOCS[type].version,
      version: row?.version ?? null,
      acceptedAt: row?.acceptedAt ?? null,
    };
  }
  return state;
}

export async function hasRequiredConsents(db: Db, userId: string): Promise<boolean> {
  const state = await consentState(db, userId);
  return CONSENT_TYPES.filter((t) => CONSENT_DOCS[t].required).every((t) => state[t].accepted);
}

export async function aiAllowed(db: Db, userId: string): Promise<boolean> {
  return (await consentState(db, userId)).ai_processing.accepted;
}

export async function acceptConsents(db: Db, userId: string, types: ConsentType[], userAgent: string | null) {
  const state = await consentState(db, userId);
  const toInsert = types
    .filter((t) => !state[t].accepted)
    .map((type) => ({ userId, type, version: CONSENT_DOCS[type].version, userAgent }));
  if (toInsert.length) await db.insert(consents).values(toInsert);
}

export async function revokeConsent(db: Db, userId: string, type: ConsentType, now: Date) {
  await db
    .update(consents)
    .set({ revokedAt: now })
    .where(and(eq(consents.userId, userId), eq(consents.type, type), isNull(consents.revokedAt)));
}
