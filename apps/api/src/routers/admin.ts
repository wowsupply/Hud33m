import { cohorts, dictionaryItems, foods, meals, overeatingNotes, programs, users, weeklyReports } from '@hud/db';
import { COMMENT_TARGETS, DICTIONARY_KINDS, PROGRAM_KINDS, weekStartOf } from '@hud/shared';
import { dateStrSchema, per100Schema } from '@hud/shared/schemas';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { createInvite } from '../services/auth';
import { audit } from '../services/audit';
import { createComment, listThreads, markCommentsRead } from '../services/comments';
import { calendar, weightHistory } from '../services/diary';
import { getDaySummary, getDayView, getWeeklyReport, listWeeks } from '../services/insights';
import {
  assertCanAccessStudent,
  attention,
  changeEnrollment,
  createStudent,
  inviteStatus,
  lastWeight,
  listStudents,
  studentEnrollments,
  updateStudent,
} from '../services/staff';
import {
  currentTargets,
  latestQuestionnaire,
  recalculateTargets,
  setManualTargets,
  targetsHistory,
} from '../services/targets';
import { adminProcedure, router, staffProcedure } from '../trpc';

const studentId = z.object({ studentId: z.uuid() });

/** Процедура с проверкой, что наставник имеет доступ к ученице. */
const studentScoped = staffProcedure.input(studentId).use(async ({ ctx, input, next }) => {
  const student = await assertCanAccessStudent(ctx.deps, ctx.user, input.studentId);
  return next({ ctx: { ...ctx, student } });
});

const studentsRouter = router({
  list: staffProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        programId: z.uuid().optional(),
        cohortId: z.uuid().optional(),
        accessStatus: z.enum(['active', 'not_started', 'paused', 'ended']).optional(),
        endingWithinDays: z.number().int().min(0).max(365).optional(),
      }),
    )
    .query(({ ctx, input }) => listStudents(ctx.deps, ctx.user, input)),

  create: staffProcedure
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().max(60).default(''),
        phone: z.string().min(5).max(30),
        timezone: z.string().default('Europe/Moscow'),
        programId: z.uuid().nullable().default(null),
        cohortId: z.uuid().nullable().default(null),
        startsOn: dateStrSchema,
        endsOn: dateStrSchema,
        mentorId: z.uuid().nullable().default(null),
      }),
    )
    .mutation(({ ctx, input }) => createStudent(ctx.deps, ctx.user, input)),

  update: staffProcedure
    .input(
      z.object({
        id: z.uuid(),
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().max(60),
        phone: z.string().min(5).max(30),
        timezone: z.string(),
        isBlocked: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updateStudent(ctx.deps, ctx.user, input);
      return { ok: true };
    }),

  get: studentScoped.query(async ({ ctx }) => {
    const s = ctx.student;
    await audit(ctx.deps.db, { actorId: ctx.user.id, studentId: s.id, action: 'view_student' });
    const [questionnaire, targets, history, enrollments, invite, weight] = await Promise.all([
      latestQuestionnaire(ctx.deps.db, s.id),
      currentTargets(ctx.deps.db, s.id),
      targetsHistory(ctx.deps.db, s.id),
      studentEnrollments(ctx.deps, s.id),
      inviteStatus(ctx.deps, s.id),
      lastWeight(ctx.deps, s.id),
    ]);
    return {
      student: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        birthDate: s.birthDate,
        timezone: s.timezone,
        isBlocked: s.isBlocked,
        onboardedAt: s.onboardedAt,
        lastLoginAt: s.lastLoginAt,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
      },
      questionnaire,
      targets,
      targetsHistory: history,
      enrollments,
      invite,
      lastWeight: weight,
    };
  }),

  regenerateInvite: studentScoped.mutation(async ({ ctx }) => ({
    inviteUrl: await createInvite(ctx.deps, ctx.student.id, ctx.user.id),
  })),

  day: studentScoped.input(z.object({ date: dateStrSchema })).query(async ({ ctx, input }) => {
    await audit(ctx.deps.db, { actorId: ctx.user.id, studentId: ctx.student.id, action: 'view_day', meta: { date: input.date } });
    const [view, summary] = await Promise.all([
      getDayView(ctx.deps, ctx.student, input.date),
      getDaySummary(ctx.deps, ctx.student, input.date, { generate: false }),
    ]);
    return { ...view, summary };
  }),

  generateDaySummary: studentScoped
    .input(z.object({ date: dateStrSchema }))
    .mutation(({ ctx, input }) => getDaySummary(ctx.deps, ctx.student, input.date, { generate: true })),

  calendar: studentScoped
    .input(z.object({ from: dateStrSchema, to: dateStrSchema }))
    .query(({ ctx, input }) => calendar(ctx.deps.db, ctx.student.id, input.from, input.to)),

  weights: studentScoped.query(async ({ ctx }) => {
    const [entries, q] = await Promise.all([
      weightHistory(ctx.deps.db, ctx.student.id),
      latestQuestionnaire(ctx.deps.db, ctx.student.id),
    ]);
    return { entries, targetWeightKg: q?.targetWeightKg ?? null, startWeightKg: q?.weightKg ?? null };
  }),

  /** Все эпизоды переедания с самонаблюдением — для вкладки «Эмоции». */
  episodes: studentScoped
    .input(z.object({ from: dateStrSchema.optional(), to: dateStrSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.deps.db
        .select({ meal: meals, note: overeatingNotes })
        .from(meals)
        .leftJoin(overeatingNotes, eq(overeatingNotes.mealId, meals.id))
        .where(
          and(
            eq(meals.userId, ctx.student.id),
            eq(meals.isOvereating, true),
            input.from ? gte(meals.diaryDate, input.from) : undefined,
            input.to ? lte(meals.diaryDate, input.to) : undefined,
          ),
        )
        .orderBy(desc(meals.diaryDate), desc(meals.localTime))
        .limit(200);
      return rows.map(({ meal, note }) => ({
        id: meal.id,
        diaryDate: meal.diaryDate,
        time: meal.localTime,
        mealType: meal.mealType,
        description: meal.description,
        kcal: meal.kcal,
        note,
      }));
    }),

  weeks: studentScoped.query(({ ctx }) => listWeeks(ctx.deps, ctx.student)),

  weeklyReport: studentScoped.input(z.object({ weekStart: dateStrSchema })).query(async ({ ctx, input }) => {
    if (weekStartOf(input.weekStart) !== input.weekStart) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неделя должна начинаться с понедельника' });
    }
    await audit(ctx.deps.db, { actorId: ctx.user.id, studentId: ctx.student.id, action: 'view_week', meta: input });
    return getWeeklyReport(ctx.deps, ctx.student, input.weekStart);
  }),

  setWeeklyComment: studentScoped
    .input(z.object({ weekStart: dateStrSchema, comment: z.string().trim().max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await getWeeklyReport(ctx.deps, ctx.student, input.weekStart);
      await ctx.deps.db
        .update(weeklyReports)
        .set({ mentorComment: input.comment || null })
        .where(and(eq(weeklyReports.userId, ctx.student.id), eq(weeklyReports.weekStart, input.weekStart)));
      return { ok: true };
    }),

  setTargets: studentScoped
    .input(
      z.object({
        kcal: z.number().int().min(800).max(5000),
        proteinG: z.number().int().min(0).max(400),
        fatG: z.number().int().min(0).max(300),
        carbsG: z.number().int().min(0).max(700),
        comment: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setManualTargets(ctx.deps.db, ctx.student.id, ctx.user.id, input);
      return { ok: true };
    }),

  recalculateTargets: studentScoped
    .input(z.object({ deficit: z.number().min(0).max(0.3).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await recalculateTargets(ctx.deps, ctx.student.id, ctx.user.id, input.deficit);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Ошибка расчёта' });
      }
    }),

  threads: studentScoped.query(({ ctx }) => listThreads(ctx.deps, ctx.student.id, 'staff')),

  comment: studentScoped
    .input(
      z.object({
        targetType: z.enum(COMMENT_TARGETS),
        targetId: z.string().min(1).max(64),
        parentId: z.uuid().nullable().default(null),
        body: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { studentId: _sid, ...comment } = input;
      return { id: await createComment(ctx.deps, { ...comment, studentId: ctx.student.id, author: ctx.user }) };
    }),

  markCommentsRead: studentScoped.mutation(async ({ ctx }) => {
    await markCommentsRead(ctx.deps, ctx.student.id, 'staff');
    return { ok: true };
  }),
});

const enrollmentsRouter = router({
  extend: staffProcedure
    .input(z.object({ enrollmentId: z.uuid(), endsOn: dateStrSchema }))
    .mutation(({ ctx, input }) => changeEnrollment(ctx.deps, ctx.user, input.enrollmentId, { type: 'extend', endsOn: input.endsOn })),
  pause: staffProcedure
    .input(z.object({ enrollmentId: z.uuid() }))
    .mutation(({ ctx, input }) => changeEnrollment(ctx.deps, ctx.user, input.enrollmentId, { type: 'pause' })),
  resume: staffProcedure
    .input(z.object({ enrollmentId: z.uuid() }))
    .mutation(({ ctx, input }) => changeEnrollment(ctx.deps, ctx.user, input.enrollmentId, { type: 'resume' })),
  close: staffProcedure
    .input(z.object({ enrollmentId: z.uuid() }))
    .mutation(({ ctx, input }) => changeEnrollment(ctx.deps, ctx.user, input.enrollmentId, { type: 'close' })),
  renew: staffProcedure
    .input(
      z.object({
        enrollmentId: z.uuid(),
        startsOn: dateStrSchema,
        endsOn: dateStrSchema,
        programId: z.uuid().nullable().default(null),
        cohortId: z.uuid().nullable().default(null),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { enrollmentId, ...rest } = input;
      return changeEnrollment(ctx.deps, ctx.user, enrollmentId, { type: 'renew', ...rest });
    }),
});

const programsRouter = router({
  list: staffProcedure.query(async ({ ctx }) => {
    const list = await ctx.deps.db.select().from(programs).orderBy(asc(programs.isArchived), desc(programs.createdAt));
    const cohortRows = list.length
      ? await ctx.deps.db
          .select()
          .from(cohorts)
          .where(inArray(cohorts.programId, list.map((p) => p.id)))
          .orderBy(desc(cohorts.startsOn))
      : [];
    return list.map((p) => ({ ...p, cohorts: cohortRows.filter((c) => c.programId === p.id) }));
  }),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        kind: z.enum(PROGRAM_KINDS),
        defaultDurationDays: z.number().int().min(1).max(730),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.deps.db.insert(programs).values(input).returning();
      return row!;
    }),
  update: adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(120),
        defaultDurationDays: z.number().int().min(1).max(730),
        isArchived: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await ctx.deps.db.update(programs).set(rest).where(eq(programs.id, id));
      return { ok: true };
    }),
  createCohort: adminProcedure
    .input(
      z.object({
        programId: z.uuid(),
        name: z.string().trim().min(1).max(120),
        startsOn: dateStrSchema.nullable(),
        endsOn: dateStrSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.deps.db.insert(cohorts).values(input).returning();
      return row!;
    }),
});

const referenceRouter = router({
  dictionaries: staffProcedure.query(({ ctx }) =>
    ctx.deps.db.select().from(dictionaryItems).orderBy(asc(dictionaryItems.kind), asc(dictionaryItems.sortOrder)),
  ),
  addDictionaryItem: adminProcedure
    .input(z.object({ kind: z.enum(DICTIONARY_KINDS), label: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.deps.db
        .insert(dictionaryItems)
        .values({ kind: input.kind, label: input.label.toLowerCase(), sortOrder: 100 })
        .onConflictDoUpdate({ target: [dictionaryItems.kind, dictionaryItems.label], set: { isActive: true } });
      return { ok: true };
    }),
  setDictionaryItemActive: adminProcedure
    .input(z.object({ id: z.uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.deps.db.update(dictionaryItems).set({ isActive: input.isActive }).where(eq(dictionaryItems.id, input.id));
      return { ok: true };
    }),
  searchFoods: staffProcedure
    .input(z.object({ q: z.string().trim().max(100) }))
    .query(async ({ ctx, input }) => {
      if (!input.q) return ctx.deps.db.select().from(foods).orderBy(asc(foods.category), asc(foods.name)).limit(300);
      const found = await ctx.deps.foods.search(input.q, 50);
      if (!found.length) return [];
      return ctx.deps.db.select().from(foods).where(inArray(foods.id, found.map((f) => f.id)));
    }),
  saveFood: adminProcedure
    .input(
      z.object({
        id: z.uuid().nullable(),
        name: z.string().trim().min(1).max(120),
        synonyms: z.array(z.string().trim().min(1).max(60)).max(20),
        category: z.string().trim().min(1).max(40),
        per100: per100Schema,
        defaultGrams: z.number().min(1).max(2000),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const values = {
        name: input.name,
        synonyms: input.synonyms,
        category: input.category,
        ...input.per100,
        defaultGrams: input.defaultGrams,
        isActive: input.isActive,
        updatedAt: ctx.deps.now(),
      };
      if (input.id) {
        await ctx.deps.db.update(foods).set(values).where(eq(foods.id, input.id));
      } else {
        await ctx.deps.db.insert(foods).values({ ...values, source: 'mentor', createdById: ctx.user.id });
      }
      ctx.deps.foods.invalidate();
      return { ok: true };
    }),
  mentors: adminProcedure.query(({ ctx }) =>
    ctx.deps.db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
      .from(users)
      .where(inArray(users.role, ['admin', 'mentor'])),
  ),
});

export const adminRouter = router({
  attention: staffProcedure.query(({ ctx }) => attention(ctx.deps, ctx.user)),
  students: studentsRouter,
  enrollments: enrollmentsRouter,
  programs: programsRouter,
  reference: referenceRouter,
});
