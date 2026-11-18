import {
  comments,
  consents,
  dailySummaries,
  enrollments,
  mealItems,
  meals,
  nutritionTargets,
  overeatingNotes,
  questionnaires,
  users,
  weeklyReports,
  weightEntries,
} from '@hud/db';
import { eq, inArray } from 'drizzle-orm';
import type { Deps } from '../deps';

/** Все данные ученицы одним JSON-документом. */
export async function exportStudentData(deps: Deps, userId: string) {
  const db = deps.db;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const mealRows = await db.select().from(meals).where(eq(meals.userId, userId));
  const ids = mealRows.map((m) => m.id);
  const [items, notes] = ids.length
    ? await Promise.all([
        db.select().from(mealItems).where(inArray(mealItems.mealId, ids)),
        db.select().from(overeatingNotes).where(inArray(overeatingNotes.mealId, ids)),
      ])
    : [[], []];
  return {
    exportedAt: deps.now().toISOString(),
    profile: user
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          birthDate: user.birthDate,
          timezone: user.timezone,
        }
      : null,
    questionnaires: await db.select().from(questionnaires).where(eq(questionnaires.userId, userId)),
    targets: await db.select().from(nutritionTargets).where(eq(nutritionTargets.userId, userId)),
    enrollments: await db.select().from(enrollments).where(eq(enrollments.userId, userId)),
    weights: await db.select().from(weightEntries).where(eq(weightEntries.userId, userId)),
    meals: mealRows.map((m) => ({
      ...m,
      items: items.filter((i) => i.mealId === m.id),
      overeatingNote: notes.find((n) => n.mealId === m.id) ?? null,
    })),
    dailySummaries: await db.select().from(dailySummaries).where(eq(dailySummaries.userId, userId)),
    weeklyReports: await db.select().from(weeklyReports).where(eq(weeklyReports.userId, userId)),
    comments: await db.select().from(comments).where(eq(comments.studentId, userId)),
    consents: await db.select().from(consents).where(eq(consents.userId, userId)),
  };
}
