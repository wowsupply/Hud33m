import { describe, expect, it } from 'vitest';
import { createStaff, login, onboardStudent, useTestDeps } from './helpers';

const { deps, clock } = useTestDeps();

describe('кабинет наставника', () => {
  it('наставник видит только своих учениц', async () => {
    await createStaff(deps, '+79991112233', 'admin');
    await createStaff(deps, '+79991112244', 'mentor', 'Ирина');
    await createStaff(deps, '+79991112255', 'mentor', 'Елена');
    const admin = await login(deps, '+79991112233', 'admin');
    const mentorA = await login(deps, '+79991112244', 'admin');
    const mentorB = await login(deps, '+79991112255', 'admin');

    const a = await onboardStudent(deps, mentorA, '+79990000001');
    await onboardStudent(deps, mentorB, '+79990000002');

    expect((await mentorA.call.admin.students.list({})).map((s) => s.phone)).toEqual(['+79990000001']);
    expect((await admin.call.admin.students.list({}))).toHaveLength(2);
    await expect(mentorB.call.admin.students.get({ studentId: a.studentId })).rejects.toThrow(/другим наставником/);
    await expect(mentorB.call.admin.students.day({ studentId: a.studentId, date: '2026-11-18' })).rejects.toThrow();
    await expect(mentorA.call.admin.programs.create({ name: 'X', kind: 'marathon', defaultDurationDays: 30 })).rejects.toThrow(
      /администратора/,
    );
  });

  it('карточка, цели, доступ, история', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    const program = await admin.call.admin.programs.create({ name: 'Марафон «Лёгкость»', kind: 'marathon', defaultDurationDays: 28 });
    const cohort = await admin.call.admin.programs.createCohort({ programId: program.id, name: 'Ноябрь', startsOn: '2026-11-01', endsOn: '2026-11-28' });
    const { studentId } = await admin.call.admin.students.create({
      firstName: 'Мария', lastName: 'Иванова', phone: '+79990000001', timezone: 'Asia/Yekaterinburg',
      programId: program.id, cohortId: cohort.id, startsOn: '2026-11-01', endsOn: '2026-11-28', mentorId: null,
    });

    const list = await admin.call.admin.students.list({ programId: program.id });
    expect(list[0]?.enrollment?.programName).toBe('Марафон «Лёгкость»');
    expect(list[0]?.enrollment?.daysLeft).toBe(10);
    expect(await admin.call.admin.students.list({ endingWithinDays: 7 })).toHaveLength(0);

    const card = await admin.call.admin.students.get({ studentId });
    const enrollmentId = card.enrollments[0]!.id;
    expect(card.invite?.usedAt).toBeNull();

    await admin.call.admin.enrollments.pause({ enrollmentId });
    expect((await admin.call.admin.students.list({}))[0]?.enrollment?.accessStatus).toBe('paused');
    await admin.call.admin.enrollments.resume({ enrollmentId });
    await admin.call.admin.enrollments.extend({ enrollmentId, endsOn: '2026-12-26' });
    const after = await admin.call.admin.students.get({ studentId });
    expect(after.enrollments[0]?.endsOn).toBe('2026-12-26');
    expect(after.enrollments[0]?.events.map((e) => e.action)).toEqual(['extend', 'resume', 'pause', 'created']);

    await admin.call.admin.students.setTargets({ studentId, kcal: 1600, proteinG: 100, fatG: 55, carbsG: 175, comment: 'Согласовано' });
    expect((await admin.call.admin.students.get({ studentId })).targets?.source).toBe('mentor');
  });

  it('ручные цели наставника не перезаписываются анкетой', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    const { studentId, student } = await onboardStudent(deps, admin);
    await admin.call.admin.students.setTargets({ studentId, kcal: 1600, proteinG: 100, fatG: 55, carbsG: 175, comment: null });
    const r = await student.call.me.submitQuestionnaire({
      weightKg: 84, targetWeightKg: 68, heightCm: 165, birthDate: '1991-05-10', activityLevel: 'medium',
      sex: 'female', pregnancyOrLactation: false, medicalConditions: false, edHistory: null,
    });
    expect(r.applied).toBe(false);
    expect((await student.call.me.get()).targets?.kcal).toBe(1600);

    const recalculated = await admin.call.admin.students.recalculateTargets({ studentId, deficit: 0.15 });
    expect(recalculated.mode).toBe('deficit');
  });

  it('«Требуют внимания»: эпизоды, неактивные, окончание доступа', async () => {
    await createStaff(deps, '+79991112233');
    const admin = await login(deps, '+79991112233', 'admin');
    const a = await onboardStudent(deps, admin, '+79990000001', { endsOn: '2026-11-22' });
    await onboardStudent(deps, admin, '+79990000002');

    const item = { name: 'Торт', foodId: null, grams: 300, per100: { kcal: 350, protein: 4.7, fat: 20, carbs: 47.5 }, valueSource: 'manual' as const, isEstimated: false, quantityText: null };
    const { id: mealId } = await a.student.call.diary.createMeal({
      diaryDate: '2026-11-18', time: '22:00', mealType: 'extra', description: '', rawInput: null, inputMethod: 'manual',
      items: [item], isOvereating: true, note: { situationTags: ['скука'], situationText: null, emotionsBefore: ['скука'], emotionsAfter: [], comment: null }, aiRequestId: null,
    });

    let att = await admin.call.admin.attention();
    expect(att.episodes.map((e) => e.id)).toEqual([mealId]);
    expect(att.ending.map((e) => e.daysLeft)).toEqual([4]);
    expect(att.inactive).toHaveLength(1);

    await admin.call.admin.students.comment({ studentId: a.studentId, targetType: 'meal', targetId: mealId, parentId: null, body: 'Давайте обсудим вечер' });
    att = await admin.call.admin.attention();
    expect(att.episodes).toHaveLength(0);

    clock.set('2026-11-19T09:00:00Z');
    const day = await admin.call.admin.students.day({ studentId: a.studentId, date: '2026-11-18' });
    expect(day.meals[0]?.commentsCount).toBe(1);
    expect(day.summary).toBeNull();
    const generated = await admin.call.admin.students.generateDaySummary({ studentId: a.studentId, date: '2026-11-18' });
    expect(generated?.text).toContain('скука');
  });
});
