import type { Role } from '@hud/shared';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Deps } from './deps';
import { getAccessState, type AccessState } from './services/access';
import { hasRequiredConsents } from './services/consents';

export type AppKind = 'student' | 'admin';

export interface SessionUser {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string;
  timezone: string;
  onboardedAt: Date | null;
}

export interface Ctx {
  deps: Deps;
  app: AppKind;
  user: SessionUser | null;
  sessionId: string | null;
  userAgent: string | null;
  setSessionCookie: (token: string, expiresAt: Date) => void;
  clearSessionCookie: () => void;
}

const t = initTRPC.context<Ctx>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message:
        error.cause instanceof ZodError ? 'Проверьте правильность заполнения полей' : shape.message,
      data: {
        ...shape.data,
        zodIssues: error.cause instanceof ZodError ? error.cause.issues : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Войдите в приложение' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Ученица: чтение своих данных (с учётом политики после окончания доступа). */
export const studentProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== 'student') throw new TRPCError({ code: 'FORBIDDEN', message: 'Раздел для учениц' });
  const access = await getAccessState(ctx.deps, ctx.user);
  if (!access.canRead) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Доступ к приложению завершён', cause: { access } });
  }
  return next({ ctx: { ...ctx, access } });
});

/** Ученица: изменение дневника — нужен активный доступ и обязательные согласия. */
export const studentWriteProcedure = studentProcedure.use(async ({ ctx, next }) => {
  const access: AccessState = ctx.access;
  if (!access.canWrite) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        access.status === 'not_started'
          ? `Доступ откроется ${access.startsOn}`
          : access.status === 'paused'
            ? 'Доступ приостановлен — дневник доступен только для просмотра'
            : 'Доступ завершён — дневник доступен только для просмотра',
    });
  }
  if (!(await hasRequiredConsents(ctx.deps.db, ctx.user.id))) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Нужно принять обязательные согласия' });
  }
  return next();
});

export const staffProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'mentor') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Раздел для наставников' });
  }
  return next();
});

export const adminProcedure = staffProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Только для администратора' });
  return next();
});
