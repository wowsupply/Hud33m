import { weekStartOf } from '@hud/shared';
import { dateStrSchema } from '@hud/shared/schemas';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getDaySummary, getWeeklyReport, listWeeks } from '../services/insights';
import { router, studentProcedure } from '../trpc';

export const insightsRouter = router({
  daySummary: studentProcedure
    .input(z.object({ date: dateStrSchema }))
    .query(({ ctx, input }) => getDaySummary(ctx.deps, ctx.user, input.date, { generate: true })),

  weeks: studentProcedure.query(({ ctx }) => listWeeks(ctx.deps, ctx.user)),

  weeklyReport: studentProcedure.input(z.object({ weekStart: dateStrSchema })).query(({ ctx, input }) => {
    if (weekStartOf(input.weekStart) !== input.weekStart) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неделя должна начинаться с понедельника' });
    }
    return getWeeklyReport(ctx.deps, ctx.user, input.weekStart);
  }),
});
