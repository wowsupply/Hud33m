import {
  cohorts,
  comments,
  enrollmentEvents,
  enrollments,
  invites,
  meals,
  mentorAssignments,
  programs,
  users,
  weightEntries,
} from '@hud/db';
import {
  addDays,
  daysBetween,
  isValidTimeZone,
  localDate,
  normalizePhone,
  weekStartOf,
  type EnrollmentStatus,
} from '@hud/shared';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNull, max, ne, sql } from 'drizzle-orm';
import type { Deps } from '../deps';
import type { SessionUser } from '../trpc';
import { computeAccess } from './access';
import { createInvite } from './auth';

/** Наставник видит только закреплённых учениц, администратор — всех. */
export async function assertCanAccessStudent(deps: Deps, actor: SessionUser, studentId: string) {
  const [student] = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, 'student')));
  if (!student) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ученица не найдена' });
  if (actor.role === 'admin') return student;
  const [link] = await deps.db
    .select()
    .from(mentorAssignments)
    .where(and(eq(mentorAssignments.mentorId, actor.id), eq(mentorAssignments.studentId, studentId)));
  if (!link) throw new TRPCError({ code: 'FORBIDDEN', message: 'Ученица закреплена за другим наставником' });
  return student;
}

async function visibleStudentIds(deps: Deps, actor: SessionUser): Promise<string[] | null> {
  if (actor.role === 'admin') return null;
  const rows = await deps.db
    .select({ id: mentorAssignments.studentId })
    .from(mentorAssignments)
    .where(eq(mentorAssignments.mentorId, actor.id));
  return rows.map((r) => r.id);
}

export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  timezone: string;
  onboarded: boolean;
  lastLoginAt: Date | null;
  lastEntryDate: string | null;
  daysWithoutEntries: number | null;
  episodesThisWeek: number;
  unreadReplies: number;
  enrollment: {
    id: string;
    status: EnrollmentStatus;
    accessStatus: string;
    programId: string | null;
    programName: string | null;
    cohortId: string | null;
    cohortName: string | null;
    startsOn: string;
    endsOn: string;
    daysLeft: number | null;
  } | null;
}

export async function listStudents(
  deps: Deps,
  actor: SessionUser,
  f: { search?: string; programId?: string; cohortId?: string; accessStatus?: string; endingWithinDays?: number },
): Promise<StudentRow[]> {
  const visible = await visibleStudentIds(deps, actor);
  if (visible && visible.length === 0) return [];
  const studentRows = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.role, 'student'), visible ? inArray(users.id, visible) : undefined))
    .orderBy(users.lastName, users.firstName);
  if (studentRows.length === 0) return [];
  const ids = studentRows.map((s) => s.id);

  const [enrollRows, lastMeals, episodes, unread] = await Promise.all([
    deps.db
      .select({ e: enrollments, programName: programs.name, cohortName: cohorts.name })
      .from(enrollments)
      .leftJoin(programs, eq(programs.id, enrollments.programId))
      .leftJoin(cohorts, eq(cohorts.id, enrollments.cohortId))
      .where(inArray(enrollments.userId, ids))
      .orderBy(desc(enrollments.endsOn), desc(enrollments.createdAt)),
    deps.db
      .select({ userId: meals.userId, last: max(meals.diaryDate) })
      .from(meals)
      .where(inArray(meals.userId, ids))
      .groupBy(meals.userId),
    deps.db
      .select({ userId: meals.userId, diaryDate: meals.diaryDate })
      .from(meals)
      .where(and(inArray(meals.userId, ids), eq(meals.isOvereating, true), gte(meals.diaryDate, addDays(localDate(deps.now(), 'Europe/Moscow'), -14)))),
    deps.db
      .select({ studentId: comments.studentId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(inArray(comments.studentId, ids), isNull(comments.readAt), eq(comments.authorId, comments.studentId)))
      .groupBy(comments.studentId),
  ]);

  const search = f.search?.trim().toLowerCase();
  const rows: StudentRow[] = studentRows.map((s) => {
    const today = localDate(deps.now(), s.timezone);
    const er = enrollRows.find((r) => r.e.userId === s.id);
    const access = er
      ? computeAccess(
          { id: er.e.id, status: er.e.status, startsOn: er.e.startsOn, endsOn: er.e.endsOn, programName: er.programName },
          today,
          deps.config.ACCESS_AFTER_END,
        )
      : null;
    const last = lastMeals.find((m) => m.userId === s.id)?.last ?? null;
    const weekStart = weekStartOf(today);
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      timezone: s.timezone,
      onboarded: !!s.onboardedAt,
      lastLoginAt: s.lastLoginAt,
      lastEntryDate: last,
      daysWithoutEntries: last ? Math.max(0, daysBetween(last, today)) : null,
      episodesThisWeek: episodes.filter((e) => e.userId === s.id && e.diaryDate >= weekStart).length,
      unreadReplies: unread.find((u) => u.studentId === s.id)?.n ?? 0,
      enrollment: er
        ? {
            id: er.e.id,
            status: er.e.status,
            accessStatus: access!.status,
            programId: er.e.programId,
            programName: er.programName,
            cohortId: er.e.cohortId,
            cohortName: er.cohortName,
            startsOn: er.e.startsOn,
            endsOn: er.e.endsOn,
            daysLeft: access!.daysLeft,
          }
        : null,
    };
  });

  return rows.filter((r) => {
    if (search && !`${r.firstName} ${r.lastName} ${r.phone}`.toLowerCase().includes(search)) return false;
    if (f.programId && r.enrollment?.programId !== f.programId) return false;
    if (f.cohortId && r.enrollment?.cohortId !== f.cohortId) return false;
    if (f.accessStatus && r.enrollment?.accessStatus !== f.accessStatus) return false;
    if (f.endingWithinDays != null) {
      if (!r.enrollment || r.enrollment.accessStatus !== 'active') return false;
      if ((r.enrollment.daysLeft ?? 999) > f.endingWithinDays) return false;
    }
    return true;
  });
}

export async function createStudent(
  deps: Deps,
  actor: SessionUser,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    timezone: string;
    programId: string | null;
    cohortId: string | null;
    startsOn: string;
    endsOn: string;
    mentorId: string | null;
  },
): Promise<{ studentId: string; inviteUrl: string }> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Проверьте номер телефона' });
  if (!isValidTimeZone(input.timezone)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный часовой пояс' });
  if (input.endsOn < input.startsOn) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Дата окончания раньше даты начала' });
  }
  const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Пользователь с таким телефоном уже есть' });

  const mentorId = actor.role === 'admin' ? (input.mentorId ?? actor.id) : actor.id;

  const studentId = await deps.db.transaction(async (tx) => {
    const [student] = await tx
      .insert(users)
      .values({
        role: 'student',
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone,
        timezone: input.timezone,
      })
      .returning({ id: users.id });
    const [enrollment] = await tx
      .insert(enrollments)
      .values({
        userId: student!.id,
        programId: input.programId,
        cohortId: input.cohortId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: 'active',
      })
      .returning({ id: enrollments.id });
    await tx.insert(enrollmentEvents).values({
      enrollmentId: enrollment!.id,
      actorId: actor.id,
      action: 'created',
      payload: { startsOn: input.startsOn, endsOn: input.endsOn },
    });
    await tx.insert(mentorAssignments).values({ mentorId, studentId: student!.id });
    return student!.id;
  });

  const inviteUrl = await createInvite(deps, studentId, actor.id);
  return { studentId, inviteUrl };
}

export async function updateStudent(
  deps: Deps,
  actor: SessionUser,
  input: { id: string; firstName: string; lastName: string; phone: string; timezone: string; isBlocked: boolean },
) {
  await assertCanAccessStudent(deps, actor, input.id);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Проверьте номер телефона' });
  if (!isValidTimeZone(input.timezone)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный часовой пояс' });
  const [clash] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.id, input.id)));
  if (clash) throw new TRPCError({ code: 'CONFLICT', message: 'Этот телефон уже используется' });
  await deps.db
    .update(users)
    .set({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone,
      timezone: input.timezone,
      isBlocked: input.isBlocked,
      updatedAt: deps.now(),
    })
    .where(eq(users.id, input.id));
}

export async function studentEnrollments(deps: Deps, studentId: string) {
  const rows = await deps.db
    .select({ e: enrollments, programName: programs.name, cohortName: cohorts.name })
    .from(enrollments)
    .leftJoin(programs, eq(programs.id, enrollments.programId))
    .leftJoin(cohorts, eq(cohorts.id, enrollments.cohortId))
    .where(eq(enrollments.userId, studentId))
    .orderBy(desc(enrollments.endsOn));
  const events = rows.length
    ? await deps.db
        .select({ ev: enrollmentEvents, actorName: users.firstName })
        .from(enrollmentEvents)
        .leftJoin(users, eq(users.id, enrollmentEvents.actorId))
        .where(inArray(enrollmentEvents.enrollmentId, rows.map((r) => r.e.id)))
        .orderBy(desc(enrollmentEvents.createdAt))
    : [];
  return rows.map((r) => ({
    ...r.e,
    programName: r.programName,
    cohortName: r.cohortName,
    events: events
      .filter((x) => x.ev.enrollmentId === r.e.id)
      .map((x) => ({ ...x.ev, actorName: x.actorName })),
  }));
}

export async function inviteStatus(deps: Deps, studentId: string) {
  const [row] = await deps.db
    .select()
    .from(invites)
    .where(eq(invites.userId, studentId))
    .orderBy(desc(invites.createdAt))
    .limit(1);
  return row ? { createdAt: row.createdAt, usedAt: row.usedAt, expiresAt: row.expiresAt } : null;
}

export type EnrollmentAction =
  | { type: 'extend'; endsOn: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'close' }
  | { type: 'renew'; startsOn: string; endsOn: string; programId: string | null; cohortId: string | null };

/** Продление, пауза, возобновление и закрытие доступа — с записью в историю. */
export async function changeEnrollment(deps: Deps, actor: SessionUser, enrollmentId: string, action: EnrollmentAction) {
  const [e] = await deps.db.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
  if (!e) throw new TRPCError({ code: 'NOT_FOUND', message: 'Доступ не найден' });
  const student = await assertCanAccessStudent(deps, actor, e.userId);
  const now = deps.now();
  const today = localDate(now, student.timezone);

  let patch: Partial<typeof enrollments.$inferInsert> = {};
  let newEnrollmentId: string | null = null;
  switch (action.type) {
    case 'extend':
      if (action.endsOn < e.startsOn) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Дата раньше начала доступа' });
      patch = {
        endsOn: action.endsOn,
        status: e.status === 'expired' && action.endsOn >= today ? 'active' : e.status,
      };
      break;
    case 'pause':
      if (e.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Приостановить можно только активный доступ' });
      patch = { status: 'paused', pausedAt: now };
      break;
    case 'resume':
      if (e.status !== 'paused') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Доступ не приостановлен' });
      patch = { status: e.endsOn >= today ? 'active' : 'expired', pausedAt: null };
      break;
    case 'close':
      patch = { status: 'closed' };
      break;
    case 'renew': {
      if (action.endsOn < action.startsOn) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Дата окончания раньше даты начала' });
      const [created] = await deps.db
        .insert(enrollments)
        .values({
          userId: e.userId,
          programId: action.programId,
          cohortId: action.cohortId,
          startsOn: action.startsOn,
          endsOn: action.endsOn,
          status: 'active',
        })
        .returning({ id: enrollments.id });
      newEnrollmentId = created!.id;
      break;
    }
  }
  if (Object.keys(patch).length) {
    await deps.db.update(enrollments).set({ ...patch, updatedAt: now }).where(eq(enrollments.id, enrollmentId));
  }
  const { type, ...payload } = action;
  await deps.db.insert(enrollmentEvents).values({
    enrollmentId: newEnrollmentId ?? enrollmentId,
    actorId: actor.id,
    action: type === 'renew' ? 'created' : type,
    payload: { ...payload, previousEndsOn: e.endsOn, previousStatus: e.status },
  });
  return { enrollmentId: newEnrollmentId ?? enrollmentId };
}

/** «Требуют внимания» — главная страница кабинета. */
export async function attention(deps: Deps, actor: SessionUser) {
  const students = await listStudents(deps, actor, {});
  const active = students.filter((s) => s.enrollment?.accessStatus === 'active');
  const ids = active.map((s) => s.id);

  const recentEpisodes = ids.length
    ? await deps.db
        .select({ id: meals.id, userId: meals.userId, diaryDate: meals.diaryDate, localTime: meals.localTime, mealType: meals.mealType })
        .from(meals)
        .where(
          and(
            inArray(meals.userId, ids),
            eq(meals.isOvereating, true),
            gte(meals.diaryDate, addDays(localDate(deps.now(), 'Europe/Moscow'), -3)),
          ),
        )
        .orderBy(desc(meals.diaryDate), desc(meals.localTime))
    : [];
  const commented = recentEpisodes.length
    ? await deps.db
        .select({ targetId: comments.targetId })
        .from(comments)
        .where(and(eq(comments.targetType, 'meal'), inArray(comments.targetId, recentEpisodes.map((e) => e.id)), ne(comments.authorId, comments.studentId)))
    : [];
  const commentedIds = new Set(commented.map((c) => c.targetId));
  const name = (id: string) => {
    const s = students.find((x) => x.id === id)!;
    return `${s.firstName} ${s.lastName}`.trim();
  };

  return {
    episodes: recentEpisodes
      .filter((e) => !commentedIds.has(e.id))
      .map((e) => ({ ...e, studentName: name(e.userId) })),
    inactive: active
      .filter((s) => s.onboarded && (s.daysWithoutEntries == null || s.daysWithoutEntries >= 2))
      .map((s) => ({ id: s.id, name: name(s.id), daysWithoutEntries: s.daysWithoutEntries, lastEntryDate: s.lastEntryDate })),
    notStarted: active
      .filter((s) => !s.onboarded)
      .map((s) => ({ id: s.id, name: name(s.id), lastLoginAt: s.lastLoginAt })),
    replies: students
      .filter((s) => s.unreadReplies > 0)
      .map((s) => ({ id: s.id, name: name(s.id), count: s.unreadReplies })),
    ending: active
      .filter((s) => (s.enrollment?.daysLeft ?? 999) <= 7)
      .map((s) => ({ id: s.id, name: name(s.id), endsOn: s.enrollment!.endsOn, daysLeft: s.enrollment!.daysLeft })),
    totals: { students: students.length, active: active.length },
  };
}

export async function lastWeight(deps: Deps, studentId: string) {
  const [w] = await deps.db
    .select({ date: weightEntries.diaryDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, studentId))
    .orderBy(desc(weightEntries.diaryDate))
    .limit(1);
  return w ?? null;
}
