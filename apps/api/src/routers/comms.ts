import { z } from 'zod';
import { createComment, listThreads, markCommentsRead, unreadFromStaffCount } from '../services/comments';
import { listNotifications, markNotificationsRead, unreadNotificationsCount } from '../services/notifications';
import { scanForSafety } from '../services/safety';
import { authedProcedure, router, studentProcedure } from '../trpc';

export const commsRouter = router({
  threads: studentProcedure.query(({ ctx }) => listThreads(ctx.deps, ctx.user.id, 'student')),

  reply: studentProcedure
    .input(z.object({ parentId: z.uuid(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const id = await createComment(ctx.deps, {
        studentId: ctx.user.id,
        author: ctx.user,
        targetType: 'day',
        targetId: '',
        parentId: input.parentId,
        body: input.body,
      });
      const safety = await scanForSafety(ctx.deps, ctx.user, {
        source: 'comment',
        sourceId: id,
        diaryDate: null,
        texts: [input.body],
      });
      return { id, safety };
    }),

  markRead: studentProcedure
    .input(z.object({ ids: z.array(z.uuid()).optional() }))
    .mutation(async ({ ctx, input }) => {
      await markCommentsRead(ctx.deps, ctx.user.id, 'student', input.ids);
      return { ok: true };
    }),

  notifications: authedProcedure.query(({ ctx }) => listNotifications(ctx.deps.db, ctx.user.id)),

  markNotificationsRead: authedProcedure.mutation(async ({ ctx }) => {
    await markNotificationsRead(ctx.deps.db, ctx.user.id, ctx.deps.now());
    return { ok: true };
  }),

  unread: authedProcedure.query(async ({ ctx }) => ({
    notifications: await unreadNotificationsCount(ctx.deps.db, ctx.user.id),
    comments: ctx.user.role === 'student' ? await unreadFromStaffCount(ctx.deps, ctx.user.id) : 0,
  })),
});
