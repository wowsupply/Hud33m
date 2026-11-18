import { describe, expect, it } from 'vitest';
import { client, createStaff, login, useTestDeps } from './helpers';

const { deps, clock, sms } = useTestDeps();

describe('вход по коду', () => {
  it('администратор входит в кабинет, но не в приложение ученицы', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '8 (999) 111-22-33', 'admin');
    expect(admin.token).toBeTruthy();
    const session = await admin.call.auth.session();
    expect(session.user?.role).toBe('admin');
    expect(sms.sent).toHaveLength(1);

    clock.set('2026-11-18T09:05:00Z');
    const anon = await client(deps, 'student');
    await anon.call.auth.requestCode({ phone: '+79991112233' });
    expect(sms.sent).toHaveLength(1); // в приложение ученицы SMS не отправляется
    await expect(anon.call.auth.verifyCode({ phone: '+79991112233', code: '111111' })).rejects.toThrow(
      /не зарегистрирован/,
    );
  });

  it('одинаковый ответ для неизвестного номера и без SMS', async () => {
    const anon = await client(deps, 'student');
    const r = await anon.call.auth.requestCode({ phone: '+79995550000' });
    expect(r.resendInSec).toBe(60);
    expect(sms.sent).toHaveLength(0);
  });

  it('ограничивает частоту запросов и число попыток', async () => {
    await createStaff(deps, '+79991112233');
    const anon = await client(deps, 'admin');
    await anon.call.auth.requestCode({ phone: '+79991112233' });
    await expect(anon.call.auth.requestCode({ phone: '+79991112233' })).rejects.toThrow(/через минуту/);
    for (let i = 0; i < 5; i++) {
      await expect(anon.call.auth.verifyCode({ phone: '+79991112233', code: '000000' })).rejects.toThrow(/Неверный код/);
    }
    await expect(anon.call.auth.verifyCode({ phone: '+79991112233', code: '111111' })).rejects.toThrow(/Слишком много/);
  });

  it('код истекает через 10 минут', async () => {
    await createStaff(deps, '+79991112233');
    const anon = await client(deps, 'admin');
    await anon.call.auth.requestCode({ phone: '+79991112233' });
    clock.set('2026-11-18T09:11:00Z');
    await expect(anon.call.auth.verifyCode({ phone: '+79991112233', code: '111111' })).rejects.toThrow(/устарел/);
  });

  it('выход завершает сессию', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    const token = admin.token;
    await admin.call.auth.logout();
    const again = await client(deps, 'admin', token);
    expect((await again.call.auth.session()).user).toBeNull();
  });
});
