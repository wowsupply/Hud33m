import cookie from '@fastify/cookie';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { Deps } from './deps';
import { appRouter, type AppRouter } from './routers';
import { sessionFromToken } from './services/auth';
import type { AppKind, Ctx } from './trpc';

/** Разные cookie для приложения ученицы и кабинета: в разработке оба работают на localhost. */
export const cookieName = (app: AppKind) => (app === 'admin' ? 'hud_admin_sid' : 'hud_sid');

export function appKindFromRequest(req: FastifyRequest): AppKind {
  return req.headers['x-hud-app'] === 'admin' ? 'admin' : 'student';
}

export async function createContext(deps: Deps, req: FastifyRequest, res: FastifyReply): Promise<Ctx> {
  const app = appKindFromRequest(req);
  const name = cookieName(app);
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: deps.config.isProd,
  };
  const setSessionCookie = (token: string, expiresAt: Date) => {
    res.setCookie(name, token, { ...cookieOpts, expires: expiresAt });
  };
  const clearSessionCookie = () => res.clearCookie(name, cookieOpts);

  const token = req.cookies[name];
  const session = token ? await sessionFromToken(deps, token) : null;
  if (session?.refreshedExpiresAt && token) setSessionCookie(token, session.refreshedExpiresAt);
  if (token && !session) clearSessionCookie();

  return {
    deps,
    app,
    user: session?.user ?? null,
    sessionId: session?.sessionId ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
    setSessionCookie,
    clearSessionCookie,
  };
}

export async function buildServer(deps: Deps) {
  const app = Fastify({
    logger: deps.config.NODE_ENV === 'test' ? false : { level: deps.config.isProd ? 'info' : 'debug', redact: ['req.headers.cookie'] },
    trustProxy: deps.config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });
  await app.register(cookie);

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(fastifyTRPCPlugin, {
    prefix: '/api/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: ({ req, res }) => createContext(deps, req, res),
      onError({ error, path }) {
        if (error.code === 'INTERNAL_SERVER_ERROR') app.log.error({ err: error, path }, 'tRPC error');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  return app;
}
