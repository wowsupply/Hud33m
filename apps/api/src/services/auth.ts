import { invites, loginChallenges, otpCodes, sessions, users } from '@hud/db';
import { normalizePhone, type Role } from '@hud/shared';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Deps } from '../deps';
import { hmac, randomDigits, randomToken, safeEqual, sha256 } from '../lib/crypto';
import { open, seal } from '../lib/secretbox';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import type { AppKind, SessionUser } from '../trpc';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_MS = 60_000;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 90 * 24 * 3600_000;
const SESSION_TOUCH_MS = 24 * 3600_000;

export function roleAllowedInApp(role: Role, app: AppKind): boolean {
  return app === 'admin' ? role === 'admin' || role === 'mentor' : role === 'student';
}

function badPhone(): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Проверьте номер телефона' });
}

const codeHash = (deps: Deps, phone: string, code: string) => hmac(deps.config.APP_SECRET, `${phone}:${code}`);

/**
 * Отправляет код входа. Ответ одинаковый для существующих и несуществующих номеров,
 * чтобы по форме входа нельзя было узнать, кто участвует в программе.
 */
export async function requestCode(deps: Deps, phoneRaw: string, app: AppKind): Promise<{ resendInSec: number }> {
  const phone = normalizePhone(phoneRaw) ?? badPhone();
  const now = deps.now();

  const [last] = await deps.db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(eq(otpCodes.phone, phone))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_MS) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Новый код можно запросить через минуту' });
  }
  const [hourly] = await deps.db
    .select({ n: count() })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, new Date(now.getTime() - 3600_000))));
  if ((hourly?.n ?? 0) >= OTP_MAX_PER_HOUR) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Слишком много попыток. Попробуйте через час' });
  }

  const devCode = !deps.config.isProd ? deps.config.DEV_OTP_CODE : undefined;
  const code = devCode ?? randomDigits(6);
  await deps.db.insert(otpCodes).values({
    phone,
    codeHash: codeHash(deps, phone, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
  });

  const [user] = await deps.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (user && !user.isBlocked && roleAllowedInApp(user.role, app)) {
    await deps.sms.send(phone, `Код для входа: ${code}. Никому его не сообщайте.`);
  }
  return { resendInSec: OTP_RESEND_MS / 1000 };
}

export async function verifyCode(
  deps: Deps,
  phoneRaw: string,
  code: string,
  app: AppKind,
  userAgent: string | null,
): Promise<
  { kind: 'session'; token: string; expiresAt: Date; user: SessionUser } | { kind: 'totp'; challenge: string }
> {
  const phone = normalizePhone(phoneRaw) ?? badPhone();
  const now = deps.now();

  const [otp] = await deps.db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!otp) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Код устарел. Запросите новый' });
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Слишком много попыток. Запросите новый код' });
  }
  if (!safeEqual(otp.codeHash, codeHash(deps, phone, code.trim()))) {
    await deps.db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный код' });
  }
  await deps.db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, otp.id));

  const [user] = await deps.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (!user || user.isBlocked || !roleAllowedInApp(user.role, app)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Этот номер не зарегистрирован. Обратитесь к наставнику',
    });
  }

  // Двухфакторная защита: для наставников с подключённым TOTP — второй шаг.
  if (user.totpEnabledAt && user.role !== 'student') {
    const challenge = randomToken();
    await deps.db.insert(loginChallenges).values({
      tokenHash: sha256(challenge),
      userId: user.id,
      expiresAt: new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS),
    });
    return { kind: 'totp', challenge };
  }

  return { kind: 'session', ...(await createSession(deps, user, userAgent)) };
}

export const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000;

async function createSession(deps: Deps, user: typeof users.$inferSelect, userAgent: string | null) {
  const now = deps.now();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await deps.db.insert(sessions).values({ userId: user.id, tokenHash: sha256(token), userAgent, expiresAt });
  await deps.db.update(users).set({ lastLoginAt: now, lastSeenAt: now }).where(eq(users.id, user.id));
  await deps.db
    .update(invites)
    .set({ usedAt: now })
    .where(and(eq(invites.userId, user.id), isNull(invites.usedAt)));
  return { token, expiresAt, user: toSessionUser(user) };
}

/** Второй шаг входа: код из приложения-аутентификатора. */
export async function verifyTotpLogin(deps: Deps, challenge: string, code: string, userAgent: string | null) {
  const now = deps.now();
  const [row] = await deps.db
    .select({ c: loginChallenges, u: users })
    .from(loginChallenges)
    .innerJoin(users, eq(users.id, loginChallenges.userId))
    .where(and(eq(loginChallenges.tokenHash, sha256(challenge)), isNull(loginChallenges.usedAt), gt(loginChallenges.expiresAt, now)));
  if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Время входа истекло. Начните заново' });
  if (row.c.attempts >= OTP_MAX_ATTEMPTS) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Слишком много попыток. Начните вход заново' });
  }
  const secret = row.u.totpSecretEnc ? open(deps.config.APP_SECRET, row.u.totpSecretEnc) : null;
  const counter = secret ? verifyTotp(secret, code, now.getTime(), row.u.totpLastCounter) : null;
  if (counter == null) {
    await deps.db.update(loginChallenges).set({ attempts: row.c.attempts + 1 }).where(eq(loginChallenges.id, row.c.id));
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный код из приложения' });
  }
  await deps.db.update(loginChallenges).set({ usedAt: now }).where(eq(loginChallenges.id, row.c.id));
  await deps.db.update(users).set({ totpLastCounter: counter }).where(eq(users.id, row.u.id));
  return createSession(deps, row.u, userAgent);
}

/** Начало подключения TOTP: новый секрет (ещё не активен до подтверждения кодом). */
export async function beginTotpSetup(deps: Deps, userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const [u] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new TRPCError({ code: 'NOT_FOUND' });
  const secret = generateTotpSecret();
  await deps.db.update(users).set({ totpPendingSecretEnc: seal(deps.config.APP_SECRET, secret) }).where(eq(users.id, userId));
  return { secret, otpauthUrl: otpauthUrl(secret, u.phone, 'Дневник питания — кабинет') };
}

export async function confirmTotpSetup(deps: Deps, userId: string, code: string): Promise<void> {
  const [u] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!u?.totpPendingSecretEnc) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Сначала начните подключение' });
  const secret = open(deps.config.APP_SECRET, u.totpPendingSecretEnc);
  const counter = verifyTotp(secret, code, deps.now().getTime());
  if (counter == null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный код. Проверьте время на телефоне и попробуйте ещё раз' });
  await deps.db
    .update(users)
    .set({ totpSecretEnc: u.totpPendingSecretEnc, totpPendingSecretEnc: null, totpEnabledAt: deps.now(), totpLastCounter: counter })
    .where(eq(users.id, userId));
}

export async function disableTotp(deps: Deps, userId: string, code: string): Promise<void> {
  if (deps.config.staffTotpRequired) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Двухфакторная защита обязательна — отключить её нельзя' });
  }
  const [u] = await deps.db.select().from(users).where(eq(users.id, userId));
  const secret = u?.totpSecretEnc ? open(deps.config.APP_SECRET, u.totpSecretEnc) : null;
  if (!secret || verifyTotp(secret, code, deps.now().getTime(), u!.totpLastCounter) == null) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный код из приложения' });
  }
  await deps.db
    .update(users)
    .set({ totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastCounter: null })
    .where(eq(users.id, userId));
}

export function toSessionUser(u: typeof users.$inferSelect): SessionUser {
  return {
    id: u.id,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    timezone: u.timezone,
    onboardedAt: u.onboardedAt,
    totpEnabled: !!u.totpEnabledAt,
  };
}

export async function sessionFromToken(
  deps: Deps,
  token: string,
): Promise<{ sessionId: string; user: SessionUser; refreshedExpiresAt: Date | null } | null> {
  const now = deps.now();
  const [row] = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.isBlocked) return null;

  let refreshedExpiresAt: Date | null = null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
    refreshedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await deps.db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: refreshedExpiresAt })
      .where(eq(sessions.id, row.session.id));
    await deps.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.user.id));
  }
  return { sessionId: row.session.id, user: toSessionUser(row.user), refreshedExpiresAt };
}

export async function logout(deps: Deps, sessionId: string): Promise<void> {
  await deps.db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function logoutEverywhere(deps: Deps, userId: string): Promise<void> {
  await deps.db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Данные для страницы приглашения: имя и телефон для автозаполнения формы входа. */
export async function inviteInfo(deps: Deps, token: string): Promise<{ firstName: string; phone: string } | null> {
  const [row] = await deps.db
    .select({ firstName: users.firstName, phone: users.phone, expiresAt: invites.expiresAt })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.userId))
    .where(eq(invites.token, token))
    .limit(1);
  if (!row || row.expiresAt < deps.now()) return null;
  return { firstName: row.firstName, phone: row.phone };
}

export async function createInvite(deps: Deps, userId: string, createdById: string | null): Promise<string> {
  const token = randomToken(18);
  await deps.db.insert(invites).values({
    token,
    userId,
    createdById,
    expiresAt: new Date(deps.now().getTime() + 30 * 24 * 3600_000),
  });
  return `${deps.config.PUBLIC_STUDENT_URL.replace(/\/$/, '')}/invite/${token}`;
}
