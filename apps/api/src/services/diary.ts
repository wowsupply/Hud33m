import {
  comments,
  dictionaryItems,
  mealItems,
  meals,
  overeatingNotes,
  weightEntries,
  type Db,
} from '@hud/db';
import {
  DEFAULT_EMOTIONS_AFTER,
  DEFAULT_EMOTIONS_BEFORE,
  DEFAULT_SITUATIONS,
  localDate,
  mealTotals,
  nutrientsForGrams,
  zonedTimeToUtc,
  type MealInput,
  type MealType,
  type OvereatingNoteData,
} from '@hud/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Deps } from '../deps';

// ---------------------------------------------------------------------------
// Вес
// ---------------------------------------------------------------------------

export async function upsertWeight(db: Db, userId: string, date: string, weightKg: number): Promise<void> {
  const kg = Math.round(weightKg * 10) / 10;
  await db
    .insert(weightEntries)
    .values({ userId, diaryDate: date, weightKg: kg })
    .onConflictDoUpdate({
      target: [weightEntries.userId, weightEntries.diaryDate],
      set: { weightKg: kg, updatedAt: new Date() },
    });
}

export async function deleteWeight(db: Db, userId: string, date: string): Promise<void> {
  await db.delete(weightEntries).where(and(eq(weightEntries.userId, userId), eq(weightEntries.diaryDate, date)));
}

export async function weightHistory(db: Db, userId: string, from?: string) {
  return db
    .select({ id: weightEntries.id, date: weightEntries.diaryDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), from ? gte(weightEntries.diaryDate, from) : undefined))
    .orderBy(asc(weightEntries.diaryDate));
}

export async function weightOn(db: Db, userId: string, date: string) {
  const [current] = await db
    .select()
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), eq(weightEntries.diaryDate, date)));
  const [previous] = await db
    .select({ weightKg: weightEntries.weightKg, date: weightEntries.diaryDate })
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), lt(weightEntries.diaryDate, date)))
    .orderBy(desc(weightEntries.diaryDate))
    .limit(1);
  return { current: current ?? null, previous: previous ?? null };
}

// ---------------------------------------------------------------------------
// Приёмы пищи
// ---------------------------------------------------------------------------

export interface MealItemView {
  id: string;
  name: string;
  foodId: string | null;
  grams: number;
  quantityText: string | null;
  per100: { kcal: number; protein: number; fat: number; carbs: number };
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  valueSource: 'db' | 'ai' | 'manual';
  isEstimated: boolean;
}

export interface MealView {
  id: string;
  diaryDate: string;
  time: string;
  mealType: MealType;
  description: string;
  rawInput: string | null;
  inputMethod: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  isOvereating: boolean;
  note: OvereatingNoteData | null;
  items: MealItemView[];
  commentsCount: number;
}

/** Приёмы пищи ученицы за период вместе с продуктами и заметками о переедании. */
export async function loadMeals(db: Db, userId: string, from: string, to: string): Promise<MealView[]> {
  const mealRows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.diaryDate, from), lte(meals.diaryDate, to)))
    .orderBy(asc(meals.diaryDate), asc(meals.localTime));
  if (mealRows.length === 0) return [];
  const ids = mealRows.map((m) => m.id);

  const [itemRows, noteRows, commentRows] = await Promise.all([
    db.select().from(mealItems).where(inArray(mealItems.mealId, ids)).orderBy(asc(mealItems.position)),
    db.select().from(overeatingNotes).where(inArray(overeatingNotes.mealId, ids)),
    db
      .select({ targetId: comments.targetId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.targetType, 'meal'), inArray(comments.targetId, ids)))
      .groupBy(comments.targetId),
  ]);

  return mealRows.map((m) => {
    const note = noteRows.find((n) => n.mealId === m.id);
    return {
      id: m.id,
      diaryDate: m.diaryDate,
      time: m.localTime,
      mealType: m.mealType,
      description: m.description,
      rawInput: m.rawInput,
      inputMethod: m.inputMethod,
      kcal: m.kcal,
      protein: m.protein,
      fat: m.fat,
      carbs: m.carbs,
      isOvereating: m.isOvereating,
      note:
        m.isOvereating && note
          ? {
              situationTags: note.situationTags,
              situationText: note.situationText,
              emotionsBefore: note.emotionsBefore,
              emotionsAfter: note.emotionsAfter,
              comment: note.comment,
            }
          : null,
      items: itemRows
        .filter((i) => i.mealId === m.id)
        .map((i) => ({
          id: i.id,
          name: i.name,
          foodId: i.foodId,
          grams: i.grams,
          quantityText: i.quantityText,
          per100: { kcal: i.kcalPer100, protein: i.proteinPer100, fat: i.fatPer100, carbs: i.carbsPer100 },
          kcal: i.kcal,
          protein: i.protein,
          fat: i.fat,
          carbs: i.carbs,
          valueSource: i.valueSource,
          isEstimated: i.isEstimated,
        })),
      commentsCount: commentRows.find((c) => c.targetId === m.id)?.n ?? 0,
    };
  });
}

export async function getMealOwned(db: Db, userId: string, mealId: string) {
  const [meal] = await db.select().from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
  if (!meal) throw new TRPCError({ code: 'NOT_FOUND', message: 'Запись не найдена' });
  return meal;
}

function assertDateAllowed(deps: Deps, tz: string, date: string) {
  const today = localDate(deps.now(), tz);
  if (date > today) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нельзя добавить запись на будущую дату' });
}

function buildMealRows(input: MealInput) {
  const items = input.items.map((item, position) => {
    const n = nutrientsForGrams(item.per100, item.grams);
    return {
      position,
      name: item.name,
      foodId: item.foodId,
      grams: item.grams,
      quantityText: item.quantityText,
      kcalPer100: item.per100.kcal,
      proteinPer100: item.per100.protein,
      fatPer100: item.per100.fat,
      carbsPer100: item.per100.carbs,
      kcal: n.kcal,
      protein: n.protein,
      fat: n.fat,
      carbs: n.carbs,
      valueSource: item.valueSource,
      isEstimated: item.isEstimated,
    };
  });
  const totals = mealTotals(input.items);
  const description =
    input.description.trim() || input.items.map((i) => i.name).join(', ').slice(0, 300);
  return { items, totals, description };
}

export async function createMeal(
  deps: Deps,
  user: { id: string; timezone: string },
  input: MealInput,
  aiRequestId: string | null = null,
): Promise<string> {
  assertDateAllowed(deps, user.timezone, input.diaryDate);
  const { items, totals, description } = buildMealRows(input);
  return deps.db.transaction(async (tx) => {
    const [meal] = await tx
      .insert(meals)
      .values({
        userId: user.id,
        diaryDate: input.diaryDate,
        localTime: input.time,
        eatenAt: zonedTimeToUtc(input.diaryDate, input.time, user.timezone),
        mealType: input.mealType,
        description,
        rawInput: input.rawInput,
        inputMethod: input.inputMethod,
        ...totals,
        isOvereating: input.isOvereating,
        aiRequestId,
      })
      .returning({ id: meals.id });
    await tx.insert(mealItems).values(items.map((i) => ({ ...i, mealId: meal!.id })));
    if (input.isOvereating && input.note) {
      await tx.insert(overeatingNotes).values({ mealId: meal!.id, ...input.note });
    }
    return meal!.id;
  });
}

export async function updateMeal(
  deps: Deps,
  user: { id: string; timezone: string },
  mealId: string,
  input: MealInput,
): Promise<void> {
  await getMealOwned(deps.db, user.id, mealId);
  assertDateAllowed(deps, user.timezone, input.diaryDate);
  const { items, totals, description } = buildMealRows(input);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(meals)
      .set({
        diaryDate: input.diaryDate,
        localTime: input.time,
        eatenAt: zonedTimeToUtc(input.diaryDate, input.time, user.timezone),
        mealType: input.mealType,
        description,
        rawInput: input.rawInput,
        ...totals,
        isOvereating: input.isOvereating,
        updatedAt: new Date(),
      })
      .where(eq(meals.id, mealId));
    await tx.delete(mealItems).where(eq(mealItems.mealId, mealId));
    await tx.insert(mealItems).values(items.map((i) => ({ ...i, mealId })));
    await tx.delete(overeatingNotes).where(eq(overeatingNotes.mealId, mealId));
    if (input.isOvereating && input.note) {
      await tx.insert(overeatingNotes).values({ mealId, ...input.note });
    }
  });
}

export async function deleteMeal(db: Db, userId: string, mealId: string): Promise<void> {
  await getMealOwned(db, userId, mealId);
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(and(eq(comments.targetType, 'meal'), eq(comments.targetId, mealId)));
    await tx.delete(meals).where(eq(meals.id, mealId));
  });
}

/** Недавние разные приёмы пищи для кнопки «Повторить». */
export async function recentMeals(db: Db, userId: string, limit = 15): Promise<MealView[]> {
  const rows = await db
    .select({ id: meals.id, description: meals.description, diaryDate: meals.diaryDate })
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(desc(meals.createdAt))
    .limit(100);
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const r of rows) {
    const key = r.description.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(r.id);
    if (picked.length >= limit) break;
  }
  if (picked.length === 0) return [];
  const dates = rows.filter((r) => picked.includes(r.id)).map((r) => r.diaryDate).sort();
  const all = await loadMeals(db, userId, dates[0]!, dates[dates.length - 1]!);
  return picked.map((id) => all.find((m) => m.id === id)).filter((m): m is MealView => !!m);
}

/** Сводка по дням для календаря: число приёмов, ккал, эпизоды, есть ли вес. */
export async function calendar(db: Db, userId: string, from: string, to: string) {
  const mealAgg = await db
    .select({
      date: meals.diaryDate,
      mealsCount: sql<number>`count(*)::int`,
      kcal: sql<number>`coalesce(sum(${meals.kcal}), 0)::float`,
      episodes: sql<number>`count(*) filter (where ${meals.isOvereating})::int`,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), gte(meals.diaryDate, from), lte(meals.diaryDate, to)))
    .groupBy(meals.diaryDate);
  const weights = await db
    .select({ date: weightEntries.diaryDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), gte(weightEntries.diaryDate, from), lte(weightEntries.diaryDate, to)));
  return { meals: mealAgg.map((m) => ({ ...m, kcal: Math.round(m.kcal) })), weights };
}

/** Справочники эмоций и ситуаций + собственные варианты, которые ученица уже использовала. */
export async function dictionaries(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(dictionaryItems)
    .where(eq(dictionaryItems.isActive, true))
    .orderBy(asc(dictionaryItems.sortOrder));
  const pick = (kind: string, fallback: string[]) => {
    const list = rows.filter((r) => r.kind === kind).map((r) => r.label);
    return list.length ? list : fallback;
  };
  const used = await db
    .select({
      situations: overeatingNotes.situationTags,
      before: overeatingNotes.emotionsBefore,
      after: overeatingNotes.emotionsAfter,
    })
    .from(overeatingNotes)
    .innerJoin(meals, eq(meals.id, overeatingNotes.mealId))
    .where(eq(meals.userId, userId))
    .limit(200);
  const custom = (base: string[], values: string[]) => {
    const lower = new Set(base.map((b) => b.toLowerCase()));
    return [...new Set(values.filter((v) => !lower.has(v.toLowerCase())))];
  };
  const emotionsBefore = pick('emotion_before', DEFAULT_EMOTIONS_BEFORE);
  const emotionsAfter = pick('emotion_after', DEFAULT_EMOTIONS_AFTER);
  const situations = pick('situation', DEFAULT_SITUATIONS);
  return {
    emotionsBefore,
    emotionsAfter,
    situations,
    custom: {
      emotionsBefore: custom(emotionsBefore, used.flatMap((u) => u.before)),
      emotionsAfter: custom(emotionsAfter, used.flatMap((u) => u.after)),
      situations: custom(situations, used.flatMap((u) => u.situations)),
    },
  };
}
