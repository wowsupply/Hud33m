import { notifications, safetyFlags } from '@hud/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { AiEngine } from '@hud/ai';
import { createStaff, login, onboardStudent, useTestDeps } from './helpers';

let llmCalls = 0;
const llm: AiEngine = {
  name: 'fake',
  parseMeal: async () => ({ value: [], model: 'fake' }),
  writeDaySummary: async () => {
    llmCalls++;
    return { value: { text: 'Записан 1 приём пищи.', question: null }, model: 'fake' };
  },
  writeWeeklyReport: async () => ({ value: { summary: 'ok', positives: [], observations: [], patterns: [], questions: [] }, model: 'fake' }),
};

const { deps, events } = useTestDeps({ llm });

const item = { name: 'Торт', foodId: null, grams: 200, per100: { kcal: 350, protein: 4.7, fat: 20, carbs: 47.5 }, valueSource: 'manual' as const, isEstimated: false, quantityText: null };

async function setup() {
  llmCalls = 0;
  await createStaff(deps, '+79991112233');
  const admin = await login(deps, '+79991112233', 'admin');
  const s = await onboardStudent(deps, admin);
  return { admin, ...s };
}

describe('протокол тревожных сигналов', () => {
  it('сигнал в записи: сообщение ученице, срочное уведомление наставнику, раздел внимания', async () => {
    const { admin, student, studentId } = await setup();
    const r = await student.call.diary.createMeal({
      diaryDate: '2026-11-18', time: '22:30', mealType: 'extra', description: '', rawInput: null, inputMethod: 'manual',
      items: [item], isOvereating: true,
      note: { situationTags: [], situationText: 'Очень плохо, иногда не хочу жить', emotionsBefore: ['грусть'], emotionsAfter: [], comment: null },
      aiRequestId: null,
    });
    expect(r.safety?.level).toBe('high');
    expect(r.safety?.contacts[0]?.phone).toBe('112');

    const [flag] = await deps.db.select().from(safetyFlags).where(eq(safetyFlags.studentId, studentId));
    expect(flag?.matches).toEqual(['не хочу жить']);
    const staffNotifications = await deps.db.select().from(notifications).where(eq(notifications.type, 'safety_alert'));
    expect(staffNotifications).toHaveLength(1);
    expect(staffNotifications[0]?.title).toMatch(/^Срочно/);
    expect(events.published.some((e) => e.kind === 'safety' && e.studentId === studentId)).toBe(true);

    const att = await admin.call.admin.attention();
    expect(att.safety).toHaveLength(1);
    expect(att.safety[0]?.level).toBe('high');

    // Итоги такого дня пишет только шаблон, без языковой модели.
    await student.call.insights.daySummary({ date: '2026-11-18' });
    expect(llmCalls).toBe(0);

    await admin.call.admin.students.reviewSafetyFlag({ studentId, flagId: flag!.id });
    expect((await admin.call.admin.attention()).safety).toHaveLength(0);
  });

  it('ответ ученицы на комментарий тоже проверяется', async () => {
    const { admin, student, studentId } = await setup();
    const { id } = await admin.call.admin.students.comment({ studentId, targetType: 'day', targetId: '2026-11-18', parentId: null, body: 'Как вы?' });
    const r = await student.call.comms.reply({ parentId: id, body: 'После ужина вызвала рвоту' });
    expect(r.safety?.level).toBe('medium');
  });

  it('обычные записи не вызывают сигналов, а ИИ работает как обычно', async () => {
    const { student } = await setup();
    const r = await student.call.diary.createMeal({
      diaryDate: '2026-11-18', time: '13:00', mealType: 'lunch', description: '', rawInput: 'кусок торта', inputMethod: 'text',
      items: [item], isOvereating: true,
      note: { situationTags: ['тяжёлый рабочий день'], situationText: 'Устала, хотелось сладкого', emotionsBefore: ['усталость'], emotionsAfter: [], comment: null },
      aiRequestId: null,
    });
    expect(r.safety).toBeNull();
    await student.call.insights.daySummary({ date: '2026-11-18' });
    expect(llmCalls).toBe(1);
  });
});
