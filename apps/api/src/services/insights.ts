import type { DaySummaryText } from '@hud/ai';
import {
  comments,
  dailySummaries,
  meals,
  nutritionTargets,
  questionnaires,
  weeklyReports,
  weightEntries,
  type WeeklyReportText,
} from '@hud/db';
import {
  addDays,
  buildDayFacts,
  buildWeekFacts,
  dateRange,
  localDate,
  weekStartOf,
  type DayFacts,
  type TargetsForStats,
  type WeekFacts,
} from '@hud/shared';
import { and, asc, desc, eq, gte, lt, lte, min } from 'drizzle-orm';
import type { Deps } from '../deps';
import { hashJson } from '../lib/crypto';
import { logAiCall } from './audit';
import { aiAllowed } from './consents';
import { loadMeals, type MealView } from './diary';

type TargetRow = typeof nutritionTargets.$inferSelect;

/** Цели, действовавшие на дату (по местной дате создания записи). */
function targetsOn(rows: TargetRow[], date: string, tz: string): TargetsForStats | null {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let pick: TargetRow | undefined;
  for (const r of sorted) if (localDate(r.createdAt, tz) <= date) pick = r;
  pick ??= sorted[0];
  return pick ? { kcal: pick.kcal, proteinG: pick.proteinG, fatG: pick.fatG, carbsG: pick.carbsG } : null;
}

function mealsForStats(list: MealView[]) {
  return list.map((m) => ({
    mealType: m.mealType,
    time: m.time,
    kcal: m.kcal,
    protein: m.protein,
    fat: m.fat,
    carbs: m.carbs,
    isOvereating: m.isOvereating,
    note: m.note,
  }));
}

/** Данные дня: приёмы пищи, вес, итоги. Используется и ученицей, и наставником. */
export async function loadDays(deps: Deps, user: { id: string; timezone: string }, from: string, to: string) {
  const [mealList, targetRows, weights, [prevWeight]] = await Promise.all([
    loadMeals(deps.db, user.id, from, to),
    deps.db.select().from(nutritionTargets).where(eq(nutritionTargets.userId, user.id)),
    deps.db
      .select({ id: weightEntries.id, date: weightEntries.diaryDate, weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, user.id), gte(weightEntries.diaryDate, from), lte(weightEntries.diaryDate, to)))
      .orderBy(asc(weightEntries.diaryDate)),
    deps.db
      .select({ weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, user.id), lt(weightEntries.diaryDate, from)))
      .orderBy(desc(weightEntries.diaryDate))
      .limit(1),
  ]);

  let previous = prevWeight?.weightKg ?? null;
  return dateRange(from, to).map((date) => {
    const dayMeals = mealList.filter((m) => m.diaryDate === date);
    const weight = weights.find((w) => w.date === date) ?? null;
    const facts = buildDayFacts({
      date,
      meals: mealsForStats(dayMeals),
      targets: targetsOn(targetRows, date, user.timezone),
      weightKg: weight?.weightKg ?? null,
      previousWeightKg: previous,
    });
    if (weight) previous = weight.weightKg;
    return { date, facts, meals: dayMeals, weight };
  });
}

export async function getDayView(deps: Deps, user: { id: string; timezone: string }, date: string) {
  const [day] = await loadDays(deps, user, date, date);
  const dayComments = await deps.db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.studentId, user.id), eq(comments.targetType, 'day'), eq(comments.targetId, date)));
  const [summary] = await deps.db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, user.id), eq(dailySummaries.diaryDate, date)));
  return {
    date,
    facts: day!.facts,
    meals: day!.meals,
    weight: day!.weight,
    dayCommentsCount: dayComments.length,
    summaryReady: !!summary && summary.factsHash === hashJson(day!.facts),
  };
}

export interface DaySummaryView extends DaySummaryText {
  facts: DayFacts;
  engine: string;
  generatedAt: Date;
}

/** Итоги дня: текст пересчитывается только если факты дня изменились. */
export async function getDaySummary(
  deps: Deps,
  user: { id: string; timezone: string },
  date: string,
  opts: { generate: boolean } = { generate: true },
): Promise<DaySummaryView | null> {
  const [day] = await loadDays(deps, user, date, date);
  const facts = day!.facts;
  const factsHash = hashJson(facts);
  const [stored] = await deps.db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, user.id), eq(dailySummaries.diaryDate, date)));
  if (stored && stored.factsHash === factsHash) {
    return { facts, text: stored.text, question: stored.question, engine: stored.engine, generatedAt: stored.createdAt };
  }
  if (!opts.generate) return null;

  const { value, meta } = await deps.ai.daySummary(facts, { allowLlm: await aiAllowed(deps.db, user.id) });
  await logAiCall(deps.db, user.id, meta);
  const row = {
    userId: user.id,
    diaryDate: date,
    facts,
    factsHash,
    text: value.text,
    question: value.question,
    engine: meta.engine,
    model: meta.model,
    promptVersion: meta.promptVersion,
    createdAt: deps.now(),
  };
  await deps.db
    .insert(dailySummaries)
    .values(row)
    .onConflictDoUpdate({ target: [dailySummaries.userId, dailySummaries.diaryDate], set: row });
  return { facts, ...value, engine: meta.engine, generatedAt: row.createdAt };
}

export async function loadWeekFacts(
  deps: Deps,
  user: { id: string; timezone: string },
  weekStart: string,
): Promise<WeekFacts> {
  const weekEnd = addDays(weekStart, 6);
  const days = await loadDays(deps, user, weekStart, weekEnd);
  const [q] = await deps.db
    .select({ targetWeightKg: questionnaires.targetWeightKg })
    .from(questionnaires)
    .where(eq(questionnaires.userId, user.id))
    .orderBy(desc(questionnaires.createdAt))
    .limit(1);
  return buildWeekFacts({
    weekStart,
    days: days.map((d) => d.facts),
    weights: days.filter((d) => d.weight).map((d) => ({ date: d.date, weightKg: d.weight!.weightKg })),
    targetWeightKg: q?.targetWeightKg ?? null,
  });
}

export interface WeeklyReportView {
  weekStart: string;
  facts: WeekFacts;
  text: WeeklyReportText;
  engine: string;
  isFinal: boolean;
  generatedAt: Date | null;
  mentorComment: string | null;
}

/**
 * Недельный отчёт. Для завершившейся недели отчёт создаётся один раз и сохраняется.
 * Для текущей недели показывается предварительная версия по шаблону (без запроса к ИИ).
 */
export async function getWeeklyReport(
  deps: Deps,
  user: { id: string; timezone: string },
  weekStart: string,
): Promise<WeeklyReportView> {
  const today = localDate(deps.now(), user.timezone);
  const isFinal = addDays(weekStart, 6) < today;
  const [stored] = await deps.db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.userId, user.id), eq(weeklyReports.weekStart, weekStart)));
  if (stored) {
    return {
      weekStart,
      facts: stored.facts,
      text: stored.text,
      engine: stored.engine,
      isFinal: true,
      generatedAt: stored.createdAt,
      mentorComment: stored.mentorComment,
    };
  }

  const facts = await loadWeekFacts(deps, user, weekStart);
  if (!isFinal) {
    const { value } = await deps.ai.weeklyReport(facts, { allowLlm: false });
    return { weekStart, facts, text: value, engine: 'local', isFinal: false, generatedAt: null, mentorComment: null };
  }
  return generateWeeklyReport(deps, user, weekStart, facts);
}

export async function generateWeeklyReport(
  deps: Deps,
  user: { id: string; timezone: string },
  weekStart: string,
  factsIn?: WeekFacts,
): Promise<WeeklyReportView> {
  const facts = factsIn ?? (await loadWeekFacts(deps, user, weekStart));
  const { value, meta } = await deps.ai.weeklyReport(facts, { allowLlm: await aiAllowed(deps.db, user.id) });
  await logAiCall(deps.db, user.id, meta);
  const createdAt = deps.now();
  await deps.db
    .insert(weeklyReports)
    .values({
      userId: user.id,
      weekStart,
      facts,
      factsHash: hashJson(facts),
      text: value,
      engine: meta.engine,
      model: meta.model,
      promptVersion: meta.promptVersion,
      createdAt,
    })
    .onConflictDoNothing();
  return { weekStart, facts, text: value, engine: meta.engine, isFinal: true, generatedAt: createdAt, mentorComment: null };
}

/** Список недель с первой записи (или первого взвешивания) до текущей. */
export async function listWeeks(deps: Deps, user: { id: string; timezone: string }) {
  const today = localDate(deps.now(), user.timezone);
  const [[firstMeal], [firstWeight], reports] = await Promise.all([
    deps.db.select({ d: min(meals.diaryDate) }).from(meals).where(eq(meals.userId, user.id)),
    deps.db.select({ d: min(weightEntries.diaryDate) }).from(weightEntries).where(eq(weightEntries.userId, user.id)),
    deps.db
      .select({ weekStart: weeklyReports.weekStart })
      .from(weeklyReports)
      .where(eq(weeklyReports.userId, user.id)),
  ]);
  const first = [firstMeal?.d, firstWeight?.d].filter((d): d is string => !!d).sort()[0] ?? today;
  const weeks: Array<{ weekStart: string; isCurrent: boolean; hasReport: boolean }> = [];
  for (let w = weekStartOf(today); w >= weekStartOf(first); w = addDays(w, -7)) {
    weeks.push({ weekStart: w, isCurrent: w === weekStartOf(today), hasReport: reports.some((r) => r.weekStart === w) });
    if (weeks.length >= 52) break;
  }
  return weeks;
}
