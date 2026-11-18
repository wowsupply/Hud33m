import { z } from 'zod';
import { inviteInfo, logout, requestCode, verifyCode } from '../services/auth';
import { publicProcedure, router } from '../trpc';

export const authRouter = router({
  requestCode: publicProcedure
    .input(z.object({ phone: z.string().min(5).max(30) }))
    .mutation(({ ctx, input }) => requestCode(ctx.deps, input.phone, ctx.app)),

  verifyCode: publicProcedure
    .input(z.object({ phone: z.string().min(5).max(30), code: z.string().regex(/^\d{4,8}$/, 'Код — это цифры') }))
    .mutation(async ({ ctx, input }) => {
      const r = await verifyCode(ctx.deps, input.phone, input.code, ctx.app, ctx.userAgent);
      ctx.setSessionCookie(r.token, r.expiresAt);
      return { user: r.user };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionId) await logout(ctx.deps, ctx.sessionId);
    ctx.clearSessionCookie();
    return { ok: true };
  }),

  session: publicProcedure.query(({ ctx }) => ({ user: ctx.user })),

  invite: publicProcedure
    .input(z.object({ token: z.string().min(10).max(100) }))
    .query(({ ctx, input }) => inviteInfo(ctx.deps, input.token)),
});
