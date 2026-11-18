import { mentorAssignments, safetyFlags, users } from '@hud/db';
import { detectSafetySignals, SAFETY_SUPPORT, type SafetyLevel } from '@hud/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Deps } from '../deps';
import { notify } from './notifications';

export interface SafetyResponse {
  level: SafetyLevel;
  title: string;
  text: string;
  contacts: Array<{ label: string; phone: string }>;
}

/**
 * Проверяет свободный текст ученицы. При тревожном сигнале сохраняет его, срочно уведомляет
 * закреплённых наставников и возвращает бережное сообщение для показа ученице.
 */
export async function scanForSafety(
  deps: Deps,
  student: { id: string; firstName: string; lastName?: string },
  src: { source: 'meal' | 'comment'; sourceId: string; diaryDate: string | null; texts: Array<string | null | undefined> },
): Promise<SafetyResponse | null> {
  const signal = detectSafetySignals(src.texts);
  if (!signal) return null;

  const excerpt = src.texts.filter(Boolean).join(' · ').slice(0, 500);
  const inserted = await deps.db
    .insert(safetyFlags)
    .values({
      studentId: student.id,
      level: signal.level,
      source: src.source,
      sourceId: src.sourceId,
      diaryDate: src.diaryDate,
      excerpt,
      matches: signal.matches,
    })
    .onConflictDoUpdate({
      target: [safetyFlags.source, safetyFlags.sourceId],
      set: { level: signal.level, excerpt, matches: signal.matches, reviewedAt: null, reviewedById: null },
    })
    .returning({ id: safetyFlags.id });

  const mentors = await deps.db
    .select({ id: mentorAssignments.mentorId })
    .from(mentorAssignments)
    .where(eq(mentorAssignments.studentId, student.id));
  const name = `${student.firstName} ${student.lastName ?? ''}`.trim();
  for (const m of mentors) {
    await notify(deps, {
      userId: m.id,
      type: 'safety_alert',
      title: signal.level === 'high' ? `Срочно: тревожный сигнал — ${name}` : `Важно: проверьте запись — ${name}`,
      body: 'В записи ученицы есть фразы, на которые стоит обратить внимание.',
      link: src.diaryDate ? `/students/${student.id}/diary?date=${src.diaryDate}` : `/students/${student.id}/comments`,
      dedupeKey: `safety:${inserted[0]?.id}:${signal.level}:${excerpt.length}`,
    });
  }
  await deps.events.publish({ kind: 'safety', studentId: student.id });
  return { level: signal.level, ...SAFETY_SUPPORT[signal.level] };
}

export async function openSafetyFlags(deps: Deps, studentIds: string[] | null) {
  if (studentIds && studentIds.length === 0) return [];
  return deps.db
    .select({ flag: safetyFlags, firstName: users.firstName, lastName: users.lastName })
    .from(safetyFlags)
    .innerJoin(users, eq(users.id, safetyFlags.studentId))
    .where(and(isNull(safetyFlags.reviewedAt), studentIds ? inArray(safetyFlags.studentId, studentIds) : undefined))
    .orderBy(desc(safetyFlags.createdAt))
    .limit(100);
}

export async function studentSafetyFlags(deps: Deps, studentId: string) {
  return deps.db.select().from(safetyFlags).where(eq(safetyFlags.studentId, studentId)).orderBy(desc(safetyFlags.createdAt)).limit(50);
}
