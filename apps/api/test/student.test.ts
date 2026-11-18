import { describe, expect, it } from 'vitest';
import { client, createStaff, login, onboardStudent, useTestDeps } from './helpers';

const { deps, clock } = useTestDeps();

async function setup() {
  await createStaff(deps, '+79991112233');
  const admin = await login(deps, '+79991112233', 'admin');
  const s = await onboardStudent(deps, admin);
  return { admin, ...s };
}

describe('путь ученицы', () => {
  it('приглашение → вход → согласия → анкета → цели', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    const { inviteUrl, student } = await onboardStudent(deps, admin, '+79990000001', { questionnaire: false });
    const token = inviteUrl.split('/invite/')[1]!;
    const info = await student.call.auth.invite({ token });
    expect(info).toEqual({ firstName: 'Мария', phone: '+79990000001' });

    let me = await student.call.me.get();
    expect(me.onboarded).toBe(false);
    expect(me.access?.status).toBe('active');
    expect(me.consents?.health_data.accepted).toBe(true);

    const r = await student.call.me.submitQuestionnaire({
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
    expect(r.applied).toBe(true);
    expect(r.result.kcal).toBe(1700);

    const fresh = await client(deps, 'student', student.token);
    me = await fresh.call.me.get();
    expect(me.onboarded).toBe(true);
    expect(me.targets?.kcal).toBe(1700);
    const history = await student.call.diary.weightHistory({});
    expect(history.entries).toEqual([expect.objectContaining({ date: '2026-11-18', weightKg: 85 })]);
  });

  it('без обязательных согласий дневник не ведётся', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    await admin.call.admin.students.create({
      firstName: 'Ольга', lastName: '', phone: '+79990000002', timezone: 'Europe/Moscow',
      programId: null, cohortId: null, startsOn: '2026-11-01', endsOn: '2026-12-31', mentorId: null,
    });
    const student = await login(deps, '+79990000002', 'student');
    await expect(student.call.diary.saveWeight({ date: '2026-11-18', weightKg: 80 })).rejects.toThrow(/согласия/);
    await expect(student.call.me.acceptConsents({ types: ['ai_processing'] })).rejects.toThrow(/Обязательные/);
  });

  it('разбор еды, сохранение приёма с перееданием, итоги дня', async () => {
    const { student } = await setup();
    const parsed = await student.call.diary.parseMeal({ text: 'Два яйца, кусок хлеба, 30 граммов сыра, кофе с молоком' });
    expect(parsed.engine).toBe('local');
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items.every((i) => i.valueSource === 'db' && !i.needsReview)).toBe(true);
    expect(parsed.items[0]?.name).toBe('Яйцо куриное варёное');

    await student.call.diary.createMeal({
      diaryDate: '2026-11-18',
      time: '08:30',
      mealType: 'breakfast',
      description: '',
      rawInput: 'Два яйца, кусок хлеба, 30 граммов сыра, кофе с молоком',
      inputMethod: 'text',
      items: parsed.items.map((i) => ({
        name: i.name, foodId: i.foodId, grams: i.grams, per100: i.per100,
        valueSource: i.valueSource, isEstimated: i.isEstimated, quantityText: i.quantityText,
      })),
      isOvereating: false,
      note: null,
      aiRequestId: parsed.aiRequestId,
    });

    const dinner = await student.call.diary.parseMeal({ text: 'тарелка плова, 2 куска торта' });
    const { id: dinnerId } = await student.call.diary.createMeal({
      diaryDate: '2026-11-18',
      time: '21:15',
      mealType: 'dinner',
      description: '',
      rawInput: null,
      inputMethod: 'text',
      items: dinner.items.map((i) => ({
        name: i.name, foodId: i.foodId, grams: i.grams, per100: i.per100,
        valueSource: i.valueSource, isEstimated: i.isEstimated, quantityText: i.quantityText,
      })),
      isOvereating: true,
      note: {
        situationTags: ['тяжёлый рабочий день'],
        situationText: 'Поздно вернулась домой',
        emotionsBefore: ['усталость', 'тревога'],
        emotionsAfter: ['чувство вины'],
        comment: null,
      },
      aiRequestId: null,
    });

    const day = await student.call.diary.day({ date: '2026-11-18' });
    expect(day.meals).toHaveLength(2);
    expect(day.facts.mealsCount).toBe(2);
    expect(day.facts.episodes).toHaveLength(1);
    expect(day.facts.targets?.kcal).toBe(1700);
    expect(day.meals[1]?.note?.emotionsBefore).toEqual(['усталость', 'тревога']);
    expect(day.summaryReady).toBe(false);

    const summary = await student.call.insights.daySummary({ date: '2026-11-18' });
    expect(summary?.text).toContain('Эмоции до еды: усталость, тревога.');
    expect((await student.call.diary.day({ date: '2026-11-18' })).summaryReady).toBe(true);

    await student.call.diary.deleteMeal({ id: dinnerId });
    expect((await student.call.diary.day({ date: '2026-11-18' })).summaryReady).toBe(false);

    const dict = await student.call.diary.dictionaries();
    expect(dict.emotionsBefore).toContain('тревога');
  });

  it('нельзя записать на будущую дату и править чужие записи', async () => {
    const { admin, student } = await setup();
    const item = { name: 'Яблоко', foodId: null, grams: 180, per100: { kcal: 47, protein: 0.4, fat: 0.4, carbs: 9.8 }, valueSource: 'manual' as const, isEstimated: false, quantityText: null };
    await expect(
      student.call.diary.createMeal({ diaryDate: '2026-11-19', time: '10:00', mealType: 'breakfast', description: '', rawInput: null, inputMethod: 'manual', items: [item], isOvereating: false, note: null, aiRequestId: null }),
    ).rejects.toThrow(/будущую/);

    const { id } = await student.call.diary.createMeal({ diaryDate: '2026-11-18', time: '10:00', mealType: 'breakfast', description: '', rawInput: null, inputMethod: 'manual', items: [item], isOvereating: false, note: null, aiRequestId: null });
    const other = await onboardStudent(deps, admin, '+79990000003');
    await expect(other.student.call.diary.deleteMeal({ id })).rejects.toThrow(/не найдена/);
  });

  it('после окончания доступа — только просмотр', async () => {
    const { student } = await setup();
    await student.call.diary.saveWeight({ date: '2026-11-18', weightKg: 84.6 });
    clock.set('2027-01-02T09:00:00Z');
    const me = await student.call.me.get();
    expect(me.access?.status).toBe('ended');
    expect(me.access?.canRead).toBe(true);
    await expect(student.call.diary.saveWeight({ date: '2027-01-02', weightKg: 84 })).rejects.toThrow(/только для просмотра/);
    const day = await student.call.diary.day({ date: '2026-11-18' });
    expect(day.weight?.weightKg).toBe(84.6);
    expect(day.canWrite).toBe(false);
  });

  it('комментарий наставника → уведомление → ответ ученицы', async () => {
    const { admin, student, studentId } = await setup();
    await student.call.diary.saveWeight({ date: '2026-11-18', weightKg: 84.6 });
    const { id: commentId } = await admin.call.admin.students.comment({
      studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Отличное начало!',
    });
    const unread = await student.call.comms.unread();
    expect(unread).toEqual({ notifications: 1, comments: 1 });

    const threads = await student.call.comms.threads();
    expect(threads[0]?.title).toBe('День, 18 ноября');
    expect(threads[0]?.unread).toBe(1);

    await student.call.comms.reply({ parentId: commentId, body: 'Спасибо!' });
    await student.call.comms.markRead({});
    expect((await student.call.comms.unread()).comments).toBe(0);

    const staffThreads = await admin.call.admin.students.threads({ studentId });
    expect(staffThreads[0]?.comments.map((c) => c.body)).toEqual(['Отличное начало!', 'Спасибо!']);
    expect(staffThreads[0]?.unread).toBe(1);
    const adminUnread = await admin.call.comms.unread();
    expect(adminUnread.notifications).toBe(1);
  });

  it('недельный отчёт: текущая неделя — предварительный, прошлая — сохраняется', async () => {
    const { student } = await setup();
    await student.call.diary.saveWeight({ date: '2026-11-16', weightKg: 85 });
    const item = { name: 'Гречка', foodId: null, grams: 200, per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 }, valueSource: 'manual' as const, isEstimated: false, quantityText: null };
    await student.call.diary.createMeal({ diaryDate: '2026-11-17', time: '13:00', mealType: 'lunch', description: '', rawInput: null, inputMethod: 'manual', items: [item], isOvereating: false, note: null, aiRequestId: null });

    const current = await student.call.insights.weeklyReport({ weekStart: '2026-11-16' });
    expect(current.isFinal).toBe(false);
    expect(current.facts.nutrition.daysWithEntries).toBe(1);

    clock.set('2026-11-24T09:00:00Z');
    const final = await student.call.insights.weeklyReport({ weekStart: '2026-11-16' });
    expect(final.isFinal).toBe(true);
    expect(final.text.observations[0]).toBe('Вес: 85 → 85 кг, без изменений.');
    const weeks = await student.call.insights.weeks();
    expect(weeks[0]).toEqual({ weekStart: '2026-11-23', isCurrent: true, hasReport: false });
    expect(weeks[1]).toEqual({ weekStart: '2026-11-16', isCurrent: false, hasReport: true });
  });
});
