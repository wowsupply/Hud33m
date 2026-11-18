import { dateStrSchema, mealInputSchema, weightInputSchema } from '@hud/shared';
import { z } from 'zod';
import { logAiCall } from '../services/audit';
import { aiAllowed } from '../services/consents';
import {
  calendar,
  createMeal,
  deleteMeal,
  deleteWeight,
  dictionaries,
  getMealOwned,
  loadMeals,
  recentMeals,
  updateMeal,
  upsertWeight,
  weightHistory,
} from '../services/diary';
import { getDayView } from '../services/insights';
import { latestQuestionnaire } from '../services/targets';
import { router, studentProcedure, studentWriteProcedure } from '../trpc';

export const diaryRouter = router({
  day: studentProcedure.input(z.object({ date: dateStrSchema })).query(async ({ ctx, input }) => ({
    ...(await getDayView(ctx.deps, ctx.user, input.date)),
    canWrite: ctx.access.canWrite,
  })),

  calendar: studentProcedure
    .input(z.object({ from: dateStrSchema, to: dateStrSchema }))
    .query(({ ctx, input }) => calendar(ctx.deps.db, ctx.user.id, input.from, input.to)),

  saveWeight: studentWriteProcedure.input(weightInputSchema).mutation(async ({ ctx, input }) => {
    await upsertWeight(ctx.deps.db, ctx.user.id, input.date, input.weightKg);
    return { ok: true };
  }),

  deleteWeight: studentWriteProcedure.input(z.object({ date: dateStrSchema })).mutation(async ({ ctx, input }) => {
    await deleteWeight(ctx.deps.db, ctx.user.id, input.date);
    return { ok: true };
  }),

  weightHistory: studentProcedure.input(z.object({ from: dateStrSchema.optional() })).query(async ({ ctx, input }) => {
    const [entries, q] = await Promise.all([
      weightHistory(ctx.deps.db, ctx.user.id, input.from),
      latestQuestionnaire(ctx.deps.db, ctx.user.id),
    ]);
    return { entries, targetWeightKg: q?.targetWeightKg ?? null, startWeightKg: q?.weightKg ?? null };
  }),

  /** Разбор описания приёма пищи: ИИ (если есть согласие) или правила + база продуктов. */
  parseMeal: studentWriteProcedure
    .input(z.object({ text: z.string().trim().min(2).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const foods = await ctx.deps.foods.all();
      const { items, meta } = await ctx.deps.ai.parseMeal(input.text, foods, {
        allowLlm: await aiAllowed(ctx.deps.db, ctx.user.id),
      });
      const aiRequestId = await logAiCall(ctx.deps.db, ctx.user.id, meta);
      return { items, engine: meta.engine, aiRequestId };
    }),

  searchFoods: studentProcedure
    .input(z.object({ q: z.string().trim().min(1).max(100) }))
    .query(async ({ ctx, input }) => ctx.deps.foods.search(input.q, 15)),

  getMeal: studentProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const meal = await getMealOwned(ctx.deps.db, ctx.user.id, input.id);
    const [view] = (await loadMeals(ctx.deps.db, ctx.user.id, meal.diaryDate, meal.diaryDate)).filter(
      (m) => m.id === input.id,
    );
    return view!;
  }),

  createMeal: studentWriteProcedure
    .input(mealInputSchema.extend({ aiRequestId: z.uuid().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      const { aiRequestId, ...meal } = input;
      return { id: await createMeal(ctx.deps, ctx.user, meal, aiRequestId) };
    }),

  updateMeal: studentWriteProcedure
    .input(mealInputSchema.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...meal } = input;
      await updateMeal(ctx.deps, ctx.user, id, meal);
      return { ok: true };
    }),

  deleteMeal: studentWriteProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await deleteMeal(ctx.deps.db, ctx.user.id, input.id);
    return { ok: true };
  }),

  recentMeals: studentProcedure.query(({ ctx }) => recentMeals(ctx.deps.db, ctx.user.id)),

  dictionaries: studentProcedure.query(({ ctx }) => dictionaries(ctx.deps.db, ctx.user.id)),
});
