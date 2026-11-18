import { DEFAULT_EMOTIONS_AFTER, DEFAULT_EMOTIONS_BEFORE, DEFAULT_SITUATIONS } from '@hud/shared';
import type { Db } from '../client';
import { dictionaryItems, foods } from '../schema';
import { SEED_FOODS } from './foods';

/** Идемпотентно заполняет справочники и стартовую базу продуктов. */
export async function seedReferenceData(db: Db): Promise<{ dictionary: number; foods: number }> {
  const dict = [
    ...DEFAULT_EMOTIONS_BEFORE.map((label, i) => ({ kind: 'emotion_before' as const, label, sortOrder: i })),
    ...DEFAULT_EMOTIONS_AFTER.map((label, i) => ({ kind: 'emotion_after' as const, label, sortOrder: i })),
    ...DEFAULT_SITUATIONS.map((label, i) => ({ kind: 'situation' as const, label, sortOrder: i })),
  ];
  const insertedDict = await db
    .insert(dictionaryItems)
    .values(dict)
    .onConflictDoNothing()
    .returning({ id: dictionaryItems.id });

  const existing = new Set((await db.select({ name: foods.name }).from(foods)).map((r) => r.name));
  const toInsert = SEED_FOODS.filter((f) => !existing.has(f.name)).map((f) => ({ ...f, source: 'reference' }));
  if (toInsert.length > 0) await db.insert(foods).values(toInsert);

  return { dictionary: insertedDict.length, foods: toInsert.length };
}
