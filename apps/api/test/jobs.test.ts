import { notifications } from '@hud/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { runTick } from '../src/jobs';
import { createStaff, login, onboardStudent, useTestDeps } from './helpers';

const { deps, clock } = useTestDeps();

async function setup(endsOn = '2026-12-31') {
  await createStaff(deps, '+79991112233');
  const admin = await login(deps, '+79991112233', 'admin');
  return onboardStudent(deps, admin, '+79990000001', { endsOn });
}

const notificationsOf = (userId: string) =>
  deps.db.select().from(notifications).where(eq(notifications.userId, userId));

describe('фоновые задачи', () => {
  it('напоминание о взвешивании — по местному времени и один раз', async () => {
    const { studentId, student } = await setup();
    await student.call.diary.deleteWeight({ date: '2026-11-18' });
    await student.call.diary.deleteWeight({ date: '2026-11-19' });

    clock.set('2026-11-19T04:59:00Z'); // 07:59 МСК
    await runTick(deps);
    expect((await notificationsOf(studentId)).filter((n) => n.type === 'weigh_in_reminder')).toHaveLength(0);

    clock.set('2026-11-19T05:01:00Z'); // 08:01 МСК
    await runTick(deps);
    await runTick(deps);
    expect((await notificationsOf(studentId)).filter((n) => n.type === 'weigh_in_reminder')).toHaveLength(1);
  });

  it('не напоминает, если вес уже внесён, и уважает настройки', async () => {
    const { studentId, student } = await setup();
    clock.set('2026-11-19T04:00:00Z');
    const s = await student.call.me.settings();
    await student.call.me.updateSettings({ notifications: { ...s.notifications, diaryEnabled: false } });
    clock.set('2026-11-19T04:30:00Z');
    await student.call.diary.saveWeight({ date: '2026-11-19', weightKg: 84.5 });
    clock.set('2026-11-19T17:30:00Z'); // 20:30 МСК
    await runTick(deps);
    const types = (await notificationsOf(studentId)).map((n) => n.type);
    expect(types).not.toContain('weigh_in_reminder');
    expect(types).not.toContain('diary_reminder');
  });

  it('уведомляет об окончании и завершает доступ', async () => {
    const { studentId, student } = await setup('2026-11-20');
    await runTick(deps);
    expect((await notificationsOf(studentId)).map((n) => n.type)).toContain('access_ending');

    clock.set('2026-11-21T09:00:00Z');
    const r = await runTick(deps);
    expect(r.expired).toBe(1);
    expect((await notificationsOf(studentId)).map((n) => n.type)).toContain('access_ended');
    expect((await student.call.me.get()).access?.status).toBe('ended');
  });

  it('формирует недельный отчёт утром понедельника', async () => {
    const { studentId, student } = await setup();
    const item = { name: 'Гречка', foodId: null, grams: 200, per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 }, valueSource: 'manual' as const, isEstimated: false, quantityText: null };
    await student.call.diary.createMeal({ diaryDate: '2026-11-18', time: '13:00', mealType: 'lunch', description: '', rawInput: null, inputMethod: 'manual', items: [item], isOvereating: false, note: null, aiRequestId: null });

    clock.set('2026-11-23T03:00:00Z'); // пн 06:00 МСК — ещё рано
    expect((await runTick(deps)).weeklyReports).toBe(0);
    clock.set('2026-11-23T04:30:00Z'); // пн 07:30 МСК
    expect((await runTick(deps)).weeklyReports).toBe(1);
    expect((await runTick(deps)).weeklyReports).toBe(0);
    const n = (await notificationsOf(studentId)).find((x) => x.type === 'weekly_report_ready');
    expect(n?.link).toBe('/reports/2026-11-16');
  });
});
