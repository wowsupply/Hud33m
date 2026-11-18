import cookie from '@fastify/cookie';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { mentorAssignments } from '@hud/db';
import { MESSENGER_CHANNELS, type MessengerChannel } from '@hud/shared';
import { eq } from 'drizzle-orm';
import type { Deps } from './deps';
import type { AppEvent } from './lib/events';
import { appRouter, type AppRouter } from './routers';
import { sessionFromToken } from './services/auth';
import { handleMessengerUpdate } from './services/messengers';
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

  registerEventStream(app, deps);
  registerBotWebhooks(app, deps);

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

type App = FastifyInstance;

/**
 * Живые обновления (Server-Sent Events). Кабинет и приложение получают короткие сигналы «данные изменились»
 * и сами перезапрашивают нужные экраны. Наставник получает события только по своим ученицам.
 */
function registerEventStream(app: App, deps: Deps) {
  app.get<{ Querystring: { app?: string } }>('/api/events', async (req, reply) => {
    const kind: AppKind = req.query.app === 'admin' ? 'admin' : 'student';
    const token = req.cookies[cookieName(kind)];
    const session = token ? await sessionFromToken(deps, token) : null;
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const user = session.user;
    const isStaff = user.role !== 'student';
    if (isStaff && deps.config.staffTotpRequired && !user.totpEnabled) return reply.code(403).send({ error: 'totp_required' });

    let visible: Set<string> | null = null;
    const refreshVisible = async () => {
      if (user.role !== 'mentor') return;
      const rows = await deps.db
        .select({ id: mentorAssignments.studentId })
        .from(mentorAssignments)
        .where(eq(mentorAssignments.mentorId, user.id));
      visible = new Set(rows.map((r) => r.id));
    };
    await refreshVisible();

    const allowed = (e: AppEvent) => {
      if (e.userId === user.id) return true;
      if (!e.studentId) return false;
      if (!isStaff) return e.studentId === user.id;
      return user.role === 'admin' || !!visible?.has(e.studentId);
    };

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.write('retry: 5000\n\n');
    const unsubscribe = deps.events.subscribe((e) => {
      if (allowed(e)) raw.write(`event: change\ndata: ${JSON.stringify({ kind: e.kind, studentId: e.studentId ?? null })}\n\n`);
    });
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), 25_000);
    const visibleTimer = setInterval(() => void refreshVisible().catch(() => {}), 60_000);
    req.raw.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
      clearInterval(visibleTimer);
    });
  });
}

/** Вебхуки ботов: /api/bots/telegram и /api/bots/max. Секрет проверяется по заголовку. */
function registerBotWebhooks(app: App, deps: Deps) {
  app.post<{ Params: { channel: string } }>('/api/bots/:channel', async (req, reply) => {
    const channel = req.params.channel as MessengerChannel;
    const adapter = MESSENGER_CHANNELS.includes(channel) ? deps.messengers.get(channel) : undefined;
    if (!adapter) return reply.code(404).send({ ok: false });
    if (!adapter.verify(req.headers)) return reply.code(401).send({ ok: false });
    const update = adapter.parseUpdate(req.body);
    if (update) {
      try {
        await handleMessengerUpdate(deps, channel, update);
      } catch (e) {
        req.log.error({ err: e }, 'messenger update failed');
      }
    }
    return { ok: true };
  });
}
