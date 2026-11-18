import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  inviteInfo,
  logout,
  requestCode,
  verifyCode,
  verifyTotpLogin,
} from '../services/auth';
import { authedProcedure, publicProcedure, router } from '../trpc';

const totpCode = z.string().regex(/^\d{6}$/, 'Код — 6 цифр');

const staffOnly = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === 'student') throw new TRPCError({ code: 'FORBIDDEN', message: 'Только для наставников' });
  return next();
});

export const authRouter = router({
  requestCode: publicProcedure
    .input(z.object({ phone: z.string().min(5).max(30) }))
    .mutation(({ ctx, input }) => requestCode(ctx.deps, input.phone, ctx.app)),

  verifyCode: publicProcedure
    .input(z.object({ phone: z.string().min(5).max(30), code: z.string().regex(/^\d{4,8}$/, 'Код — это цифры') }))
    .mutation(async ({ ctx, input }) => {
      const r = await verifyCode(ctx.deps, input.phone, input.code, ctx.app, ctx.userAgent);
      if (r.kind === 'totp') return { user: null, totpChallenge: r.challenge };
      ctx.setSessionCookie(r.token, r.expiresAt);
      return { user: r.user, totpChallenge: null };
    }),

  /** Второй шаг входа в кабинет: код из приложения-аутентификатора. */
  verifyTotp: publicProcedure
    .input(z.object({ challenge: z.string().min(10).max(100), code: totpCode }))
    .mutation(async ({ ctx, input }) => {
      const r = await verifyTotpLogin(ctx.deps, input.challenge, input.code, ctx.userAgent);
      ctx.setSessionCookie(r.token, r.expiresAt);
      return { user: r.user };
    }),

  totpBegin: staffOnly.mutation(({ ctx }) => beginTotpSetup(ctx.deps, ctx.user.id)),

  totpConfirm: staffOnly.input(z.object({ code: totpCode })).mutation(async ({ ctx, input }) => {
    await confirmTotpSetup(ctx.deps, ctx.user.id, input.code);
    return { ok: true };
  }),

  totpDisable: staffOnly.input(z.object({ code: totpCode })).mutation(async ({ ctx, input }) => {
    await disableTotp(ctx.deps, ctx.user.id, input.code);
    return { ok: true };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionId) await logout(ctx.deps, ctx.sessionId);
    ctx.clearSessionCookie();
    return { ok: true };
  }),

  session: publicProcedure.query(({ ctx }) => ({
    user: ctx.user,
    /** Наставнику нужно подключить двухфакторную защиту, прежде чем работать в кабинете. */
    totpSetupRequired: !!ctx.user && ctx.user.role !== 'student' && ctx.deps.config.staffTotpRequired && !ctx.user.totpEnabled,
  })),

  invite: publicProcedure
    .input(z.object({ token: z.string().min(10).max(100) }))
    .query(({ ctx, input }) => inviteInfo(ctx.deps, input.token)),
});
