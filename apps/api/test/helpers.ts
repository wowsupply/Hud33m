import { createAiService, type AiEngine } from '@hud/ai';
import { createDb, users } from '@hud/db';
import { afterAll, beforeEach } from 'vitest';
import { loadConfig } from '../src/config';
import type { Deps } from '../src/deps';
import { ConsoleSms } from '../src/lib/sms';
import { appRouter } from '../src/routers';
import { sessionFromToken } from '../src/services/auth';
import { FoodCache } from '../src/services/foods';
import type { AppKind, Ctx } from '../src/trpc';
import { TEST_DB_URL } from './env';

export class TestClock {
  current = new Date('2026-11-18T09:00:00Z'); // 12:00 по Москве, среда
  set(iso: string) {
    this.current = new Date(iso);
  }
  now = () => this.current;
}

/** Общие зависимости для тестов: настоящая PostgreSQL, фиктивные часы и SMS. */
export function useTestDeps(opts: { llm?: AiEngine | null; env?: Record<string, string> } = {}) {
  const handle = createDb(TEST_DB_URL, { max: 4 });
  const clock = new TestClock();
  const sms = new ConsoleSms();
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB_URL, DEV_OTP_CODE: '111111', ...opts.env });
  const deps: Deps = {
    db: handle.db,
    config,
    ai: createAiService({ llm: opts.llm ?? null }),
    sms,
    foods: new FoodCache(handle.db),
    now: clock.now,
  };

  beforeEach(async () => {
    clock.set('2026-11-18T09:00:00Z');
    sms.sent.length = 0;
    await handle.sql.unsafe(
      'truncate users, programs, otp_codes, ai_requests, audit_log restart identity cascade',
    );
  });
  afterAll(async () => {
    await handle.close();
  });

  return { deps, clock, sms, handle };
}

export interface TestClient {
  call: ReturnType<typeof appRouter.createCaller>;
  token: string | null;
}

/** tRPC-вызовы от имени пользователя (по токену сессии). */
export async function client(deps: Deps, app: AppKind, token: string | null = null): Promise<TestClient> {
  const holder: TestClient = { call: null as never, token };
  const session = token ? await sessionFromToken(deps, token) : null;
  const ctx: Ctx = {
    deps,
    app,
    user: session?.user ?? null,
    sessionId: session?.sessionId ?? null,
    userAgent: 'vitest',
    setSessionCookie: (t) => {
      holder.token = t;
    },
    clearSessionCookie: () => {
      holder.token = null;
    },
  };
  holder.call = appRouter.createCaller(ctx);
  return holder;
}

export async function login(deps: Deps, phone: string, app: AppKind): Promise<TestClient> {
  const anon = await client(deps, app);
  await anon.call.auth.requestCode({ phone });
  await anon.call.auth.verifyCode({ phone, code: '111111' });
  return client(deps, app, anon.token);
}

export async function createStaff(deps: Deps, phone: string, role: 'admin' | 'mentor' = 'admin', firstName = 'Анна') {
  const [u] = await deps.db.insert(users).values({ phone, firstName, lastName: 'Наставник', role }).returning();
  return u!;
}

/** Админ создаёт ученицу, ученица входит и принимает согласия. */
export async function onboardStudent(
  deps: Deps,
  admin: TestClient,
  phone = '+79990000001',
  opts: { questionnaire?: boolean; startsOn?: string; endsOn?: string } = {},
) {
  const { studentId, inviteUrl } = await admin.call.admin.students.create({
    firstName: 'Мария',
    lastName: 'Иванова',
    phone,
    timezone: 'Europe/Moscow',
    programId: null,
    cohortId: null,
    startsOn: opts.startsOn ?? '2026-11-01',
    endsOn: opts.endsOn ?? '2026-12-31',
    mentorId: null,
  });
  const student = await login(deps, phone, 'student');
  await student.call.me.acceptConsents({ types: ['personal_data', 'health_data', 'ai_processing'] });
  if (opts.questionnaire !== false) {
    await student.call.me.submitQuestionnaire({
      weightKg: 85,
      targetWeightKg: 68,
      heightCm: 165,
      birthDate: '1991-05-10',
      activityLevel: 'low',
      sex: 'female',
      pregnancyOrLactation: false,
      medicalConditions: false,
      edHistory: null,
    });
  }
  return { studentId, inviteUrl, student: await client(deps, 'student', student.token) };
}
