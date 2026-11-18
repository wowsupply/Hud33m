import { users } from '@hud/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { base32Encode, hotp, totpCounter, verifyTotp } from '../src/lib/totp';
import { client, createStaff, useTestDeps } from './helpers';

describe('TOTP (RFC 6238)', () => {
  it('совпадает с эталонными значениями RFC', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(hotp(secret, totpCounter(59_000), 8)).toBe('94287082');
    expect(hotp(secret, totpCounter(1_111_111_109_000), 8)).toBe('07081804');
    expect(hotp(secret, totpCounter(2_000_000_000_000), 8)).toBe('69279037');
  });

  it('проверяет код с допуском ±30 секунд и запрещает повтор', () => {
    const b32 = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1_111_111_109_000;
    const code = hotp(Buffer.from('12345678901234567890'), totpCounter(now));
    expect(verifyTotp(b32, code, now)).toBe(totpCounter(now));
    expect(verifyTotp(b32, code, now + 30_000)).toBe(totpCounter(now));
    expect(verifyTotp(b32, code, now + 90_000)).toBeNull();
    expect(verifyTotp(b32, code, now, totpCounter(now))).toBeNull();
  });
});

const codeFor = (secretB32: string, nowMs: number) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secretB32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return hotp(Buffer.from(out), totpCounter(nowMs));
};

describe('двухфакторный вход в кабинет', () => {
  const { deps, clock } = useTestDeps();

  async function loginStep1(phone: string) {
    const anon = await client(deps, 'admin');
    await anon.call.auth.requestCode({ phone });
    const r = await anon.call.auth.verifyCode({ phone, code: '111111' });
    return { anon, r };
  }

  it('подключение и вход в два шага', async () => {
    await createStaff(deps, '+79991112233');
    const { anon, r } = await loginStep1('+79991112233');
    expect(r.totpChallenge).toBeNull();
    const admin = await client(deps, 'admin', anon.token);

    const setup = await admin.call.auth.totpBegin();
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await expect(admin.call.auth.totpConfirm({ code: '000000' })).rejects.toThrow(/Неверный код/);
    await admin.call.auth.totpConfirm({ code: codeFor(setup.secret, clock.now().getTime()) });
    const [u] = await deps.db.select().from(users).where(eq(users.phone, '+79991112233'));
    expect(u?.totpEnabledAt).not.toBeNull();
    expect(u?.totpSecretEnc).not.toContain(setup.secret);

    clock.set('2026-11-18T09:05:00Z');
    const second = await loginStep1('+79991112233');
    expect(second.anon.token).toBeNull();
    expect(second.r.totpChallenge).toBeTruthy();
    await expect(second.anon.call.auth.verifyTotp({ challenge: second.r.totpChallenge!, code: '123456' })).rejects.toThrow(/Неверный код/);
    const code = codeFor(setup.secret, clock.now().getTime());
    await second.anon.call.auth.verifyTotp({ challenge: second.r.totpChallenge!, code });
    expect(second.anon.token).toBeTruthy();
    const session = await (await client(deps, 'admin', second.anon.token)).call.auth.session();
    expect(session.user?.totpEnabled).toBe(true);

    // Тот же код нельзя использовать повторно.
    clock.set('2026-11-18T09:05:10Z');
    const third = await (async () => {
      const a = await client(deps, 'admin');
      clock.set('2026-11-18T09:06:20Z');
      await a.call.auth.requestCode({ phone: '+79991112233' });
      const res = await a.call.auth.verifyCode({ phone: '+79991112233', code: '111111' });
      return { a, res };
    })();
    await expect(third.a.call.auth.verifyTotp({ challenge: third.res.totpChallenge!, code: codeFor(setup.secret, Date.parse('2026-11-18T09:05:00Z')) })).rejects.toThrow();
  });
});

describe('обязательная двухфакторная защита', () => {
  const { deps, clock } = useTestDeps({ env: { STAFF_TOTP_REQUIRED: 'true' } });

  it('кабинет недоступен, пока защита не подключена', async () => {
    await createStaff(deps, '+79991112233');
    const anon = await client(deps, 'admin');
    await anon.call.auth.requestCode({ phone: '+79991112233' });
    await anon.call.auth.verifyCode({ phone: '+79991112233', code: '111111' });
    const admin = await client(deps, 'admin', anon.token);
    expect((await admin.call.auth.session()).totpSetupRequired).toBe(true);
    await expect(admin.call.admin.attention()).rejects.toThrow(/двухфакторную/);

    const setup = await admin.call.auth.totpBegin();
    await admin.call.auth.totpConfirm({ code: codeFor(setup.secret, clock.now().getTime()) });
    const after = await client(deps, 'admin', anon.token);
    expect((await after.call.auth.session()).totpSetupRequired).toBe(false);
    await expect(after.call.admin.attention()).resolves.toBeTruthy();
    await expect(after.call.auth.totpDisable({ code: '000000' })).rejects.toThrow(/обязательна/);
  });
});
