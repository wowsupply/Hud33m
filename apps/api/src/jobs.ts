import { enrollmentEvents, enrollments, meals, notificationSettings, users, weeklyReports, weightEntries } from '@hud/db';
import { addDays, daysBetween, formatDateRu, formatWeekRu, localParts, plural, weekStartOf } from '@hud/shared';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Deps } from './deps';
import { generateWeeklyReport } from './services/insights';
import { notify } from './services/notifications';

/** Окно, в течение которого напоминание ещё уместно (если воркер был остановлен). */
const REMINDER_WINDOW_MIN = 180;
const WEEKLY_REPORT_HOUR = 7;
const WEEKLY_BATCH = 20;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export interface TickResult {
  expired: number;
  endingNotices: number;
  reminders: number;
  weeklyReports: number;
}

/**
 * Один проход фоновых задач. Идемпотентен: уведомления защищены dedupeKey,
 * отчёты — уникальным индексом, поэтому запуск чаще или на нескольких серверах безопасен.
 */
export async function runTick(deps: Deps, now: Date = deps.now()): Promise<TickResult> {
  const result: TickResult = { expired: 0, endingNotices: 0, reminders: 0, weeklyReports: 0 };

  const rows = await deps.db
    .select({ e: enrollments, u: users, s: notificationSettings })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(notificationSettings, eq(notificationSettings.userId, users.id))
    .where(and(eq(enrollments.status, 'active'), eq(users.role, 'student'), eq(users.isBlocked, false)));

  // 1. Сроки доступа
  const activeStudents: typeof rows = [];
  for (const row of rows) {
    const local = localParts(now, row.u.timezone);
    if (row.e.endsOn < local.date) {
      await deps.db.update(enrollments).set({ status: 'expired', updatedAt: now }).where(eq(enrollments.id, row.e.id));
      await deps.db.insert(enrollmentEvents).values({ enrollmentId: row.e.id, action: 'expired', payload: { endsOn: row.e.endsOn } });
      await notify(deps.db, {
        userId: row.u.id,
        type: 'access_ended',
        title: 'Доступ к программе завершён',
        body: 'Ваши записи сохранены. Чтобы продолжить, напишите наставнику.',
        link: '/profile',
        dedupeKey: `access_ended:${row.e.id}:${row.e.endsOn}`,
      });
      result.expired++;
      continue;
    }
    if (row.e.startsOn <= local.date) activeStudents.push(row);

    const daysLeft = daysBetween(local.date, row.e.endsOn);
    if (daysLeft <= 3 && (row.s?.accessEnabled ?? true)) {
      const created = await notify(deps.db, {
        userId: row.u.id,
        type: 'access_ending',
        title: 'Скоро завершится доступ',
        body:
          daysLeft === 0
            ? 'Сегодня последний день доступа к дневнику.'
            : `Доступ к дневнику действует до ${formatDateRu(row.e.endsOn)} — ещё ${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])}.`,
        link: '/profile',
        dedupeKey: `access_ending:${row.e.id}:${row.e.endsOn}`,
      });
      if (created) result.endingNotices++;
    }
  }

  if (activeStudents.length === 0) return result;
  const ids = activeStudents.map((r) => r.u.id);

  // 2. Напоминания о взвешивании и дневнике
  const dates = [...new Set(activeStudents.map((r) => localParts(now, r.u.timezone).date))];
  const [weights, mealCounts] = await Promise.all([
    deps.db
      .select({ userId: weightEntries.userId, date: weightEntries.diaryDate })
      .from(weightEntries)
      .where(and(inArray(weightEntries.userId, ids), inArray(weightEntries.diaryDate, dates))),
    deps.db
      .select({ userId: meals.userId, date: meals.diaryDate, n: sql<number>`count(*)::int` })
      .from(meals)
      .where(and(inArray(meals.userId, ids), inArray(meals.diaryDate, dates)))
      .groupBy(meals.userId, meals.diaryDate),
  ]);

  for (const row of activeStudents) {
    if (!row.u.onboardedAt) continue;
    const local = localParts(now, row.u.timezone);
    const nowMin = local.hour * 60 + local.minute;
    const s = row.s;

    const weighTime = s?.weighInTime ?? '08:00';
    const weighDue = nowMin >= minutesOf(weighTime) && nowMin < minutesOf(weighTime) + REMINDER_WINDOW_MIN;
    const hasWeight = weights.some((w) => w.userId === row.u.id && w.date === local.date);
    if ((s?.weighInEnabled ?? true) && weighDue && !hasWeight) {
      if (
        await notify(deps.db, {
          userId: row.u.id,
          type: 'weigh_in_reminder',
          title: 'Доброе утро!',
          body: 'Внесите, пожалуйста, утренний вес.',
          link: '/',
          dedupeKey: `weigh:${row.u.id}:${local.date}`,
        })
      )
        result.reminders++;
    }

    const diaryTime = s?.diaryTime ?? '20:00';
    const diaryDue = nowMin >= minutesOf(diaryTime) && nowMin < minutesOf(diaryTime) + REMINDER_WINDOW_MIN;
    const count = mealCounts.find((m) => m.userId === row.u.id && m.date === local.date)?.n ?? 0;
    if ((s?.diaryEnabled ?? true) && diaryDue && count < 2) {
      if (
        await notify(deps.db, {
          userId: row.u.id,
          type: 'diary_reminder',
          title: 'Заполним дневник?',
          body: count === 0 ? 'Сегодня ещё нет записей о питании.' : 'Добавьте приёмы пищи за сегодня, если они были.',
          link: '/',
          dedupeKey: `diary:${row.u.id}:${local.date}`,
        })
      )
        result.reminders++;
    }
  }

  // 3. Недельные отчёты (утром в понедельник и позже, если пропустили)
  const candidates = activeStudents
    .map((row) => {
      const local = localParts(now, row.u.timezone);
      const lastWeek = addDays(weekStartOf(local.date), -7);
      const due = local.weekday > 1 || local.hour >= WEEKLY_REPORT_HOUR;
      return { row, lastWeek, due };
    })
    .filter((c) => c.due && c.row.e.startsOn <= addDays(c.lastWeek, 6));
  if (candidates.length) {
    const existing = await deps.db
      .select({ userId: weeklyReports.userId, weekStart: weeklyReports.weekStart })
      .from(weeklyReports)
      .where(inArray(weeklyReports.userId, candidates.map((c) => c.row.u.id)));
    for (const c of candidates) {
      if (result.weeklyReports >= WEEKLY_BATCH) break;
      if (existing.some((r) => r.userId === c.row.u.id && r.weekStart === c.lastWeek)) continue;
      const [activity] = await deps.db
        .select({ n: sql<number>`count(*)::int` })
        .from(meals)
        .where(and(eq(meals.userId, c.row.u.id), gte(meals.diaryDate, c.lastWeek), lte(meals.diaryDate, addDays(c.lastWeek, 6))));
      if (!activity?.n) continue;
      await generateWeeklyReport(deps, c.row.u, c.lastWeek);
      result.weeklyReports++;
      if (c.row.s?.reportsEnabled ?? true) {
        await notify(deps.db, {
          userId: c.row.u.id,
          type: 'weekly_report_ready',
          title: 'Готов отчёт за неделю',
          body: `Итоги недели ${formatWeekRu(c.lastWeek)}.`,
          link: `/reports/${c.lastWeek}`,
          dedupeKey: `weekly:${c.row.u.id}:${c.lastWeek}`,
        });
      }
    }
  }

  return result;
}
