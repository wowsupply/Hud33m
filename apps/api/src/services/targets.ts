import { nutritionTargets, questionnaires, users, weightEntries, type Db } from '@hud/db';
import {
  ageFromBirthDate,
  computeTargets,
  localDate,
  type QuestionnaireInput,
  type TargetsResult,
} from '@hud/shared';
import { desc, eq } from 'drizzle-orm';
import type { Deps } from '../deps';
import { upsertWeight } from './diary';

export type TargetsRow = typeof nutritionTargets.$inferSelect;

export async function currentTargets(db: Db, userId: string): Promise<TargetsRow | null> {
  const [row] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .orderBy(desc(nutritionTargets.createdAt))
    .limit(1);
  return row ?? null;
}

export async function targetsHistory(db: Db, userId: string): Promise<TargetsRow[]> {
  return db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .orderBy(desc(nutritionTargets.createdAt));
}

export async function latestQuestionnaire(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.userId, userId))
    .orderBy(desc(questionnaires.createdAt))
    .limit(1);
  return row ?? null;
}

function targetsRowValues(userId: string, r: TargetsResult, source: 'auto' | 'mentor', setById: string | null) {
  return {
    userId,
    kcal: r.kcal,
    proteinG: r.proteinG,
    fatG: r.fatG,
    carbsG: r.carbsG,
    deficitPct: r.deficitPct,
    source,
    setById,
    requiresReview: r.requiresReview,
    notes: r.notes,
  };
}

/**
 * Сохраняет стартовую анкету и рассчитывает цели. Если наставник уже установил цели вручную,
 * они не перезаписываются — автоматический расчёт только возвращается для информации.
 */
export async function submitQuestionnaire(
  deps: Deps,
  user: { id: string; timezone: string },
  input: QuestionnaireInput,
): Promise<{ result: TargetsResult; applied: boolean }> {
  const today = localDate(deps.now(), user.timezone);
  const ageYears = ageFromBirthDate(input.birthDate, today);
  const result = computeTargets({ ...input, ageYears, edHistory: input.edHistory ?? false });

  await deps.db.insert(questionnaires).values({ userId: user.id, ...input });
  await deps.db
    .update(users)
    .set({ birthDate: input.birthDate, sex: input.sex, onboardedAt: deps.now(), updatedAt: deps.now() })
    .where(eq(users.id, user.id));

  const existing = await currentTargets(deps.db, user.id);
  const applied = !existing || existing.source === 'auto';
  if (applied) await deps.db.insert(nutritionTargets).values(targetsRowValues(user.id, result, 'auto', null));

  const [anyWeight] = await deps.db
    .select({ id: weightEntries.id })
    .from(weightEntries)
    .where(eq(weightEntries.userId, user.id))
    .limit(1);
  if (!anyWeight) await upsertWeight(deps.db, user.id, today, input.weightKg);

  return { result, applied };
}

/** Пересчёт по последней анкете и последнему взвешиванию (например, наставником с другим дефицитом). */
export async function recalculateTargets(
  deps: Deps,
  studentId: string,
  actorId: string,
  deficit: number | undefined,
): Promise<TargetsResult> {
  const q = await latestQuestionnaire(deps.db, studentId);
  if (!q) throw new Error('Ученица ещё не заполнила анкету');
  const [student] = await deps.db.select().from(users).where(eq(users.id, studentId));
  const [lastWeight] = await deps.db
    .select({ weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, studentId))
    .orderBy(desc(weightEntries.diaryDate))
    .limit(1);
  const today = localDate(deps.now(), student!.timezone);
  const result = computeTargets({
    sex: q.sex,
    weightKg: lastWeight?.weightKg ?? q.weightKg,
    targetWeightKg: q.targetWeightKg,
    heightCm: q.heightCm,
    ageYears: ageFromBirthDate(q.birthDate, today),
    activityLevel: q.activityLevel,
    pregnancyOrLactation: q.pregnancyOrLactation,
    medicalConditions: q.medicalConditions,
    edHistory: q.edHistory ?? false,
    deficit,
  });
  await deps.db.insert(nutritionTargets).values(targetsRowValues(studentId, result, 'mentor', actorId));
  return result;
}

export async function setManualTargets(
  db: Db,
  studentId: string,
  actorId: string,
  t: { kcal: number; proteinG: number; fatG: number; carbsG: number; comment: string | null },
): Promise<void> {
  await db.insert(nutritionTargets).values({
    userId: studentId,
    kcal: t.kcal,
    proteinG: t.proteinG,
    fatG: t.fatG,
    carbsG: t.carbsG,
    source: 'mentor',
    setById: actorId,
    requiresReview: false,
    comment: t.comment,
  });
}
