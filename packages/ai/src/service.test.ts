import { buildDayFacts, buildWeekFacts } from '@hud/shared';
import { describe, expect, it } from 'vitest';
import { checkDaySummary } from './guardrails';
import { createAiService } from './service';
import { templateDaySummary, templateWeeklyReport } from './templates';
import { TEST_FOODS } from './test-foods';
import type { AiEngine } from './types';

const facts = buildDayFacts({
  date: '2026-11-18',
  meals: [
    { mealType: 'breakfast', time: '08:10', kcal: 420, protein: 25, fat: 18, carbs: 40, isOvereating: false, note: null },
    {
      mealType: 'dinner',
      time: '21:40',
      kcal: 1100,
      protein: 30,
      fat: 55,
      carbs: 110,
      isOvereating: true,
      note: {
        situationTags: ['тяжёлый рабочий день'],
        situationText: 'задержалась на работе',
        emotionsBefore: ['усталость', 'тревога'],
        emotionsAfter: ['чувство вины'],
        comment: null,
      },
    },
  ],
  targets: { kcal: 1700, proteinG: 95, fatG: 61, carbsG: 193 },
  weightKg: 84.6,
  previousWeightKg: 85,
});

function fakeEngine(over: Partial<AiEngine>): AiEngine {
  return {
    name: 'fake',
    parseMeal: async () => ({ value: [], model: 'fake-1' }),
    writeDaySummary: async () => ({ value: { text: 'ok', question: null }, model: 'fake-1' }),
    writeWeeklyReport: async () => ({
      value: { summary: 'ok', positives: [], observations: [], patterns: [], questions: [] },
      model: 'fake-1',
    }),
    ...over,
  };
}

describe('guardrails', () => {
  it('шаблонный текст проходит собственную проверку', () => {
    expect(checkDaySummary(templateDaySummary(facts), facts)).toEqual([]);
  });

  it('ловит выдуманные эмоции, оценки и числа', () => {
    const v = checkDaySummary(
      { text: 'Сегодня был срыв из-за одиночества, вы съели 2500 ккал.', question: null },
      facts,
    );
    expect(v).toContain('forbidden:срыв');
    expect(v).toContain('invented_emotion:одиночество');
    expect(v).toContain('unknown_number:2500');
  });

  it('разрешает эмоции, которые указала ученица', () => {
    const v = checkDaySummary(
      { text: 'Вечером, около 21:40, отмечен эпизод переедания. Перед ним вы указали усталость и тревогу.', question: null },
      facts,
    );
    expect(v).toEqual([]);
  });
});

describe('createAiService', () => {
  it('без модели работает локально', async () => {
    const ai = createAiService({ llm: null });
    const r = await ai.parseMeal('два яйца, кофе', TEST_FOODS, { allowLlm: true });
    expect(r.items).toHaveLength(2);
    expect(r.meta.engine).toBe('local');
  });

  it('при плохом ответе модели переходит на шаблон', async () => {
    let calls = 0;
    const ai = createAiService({
      llm: fakeEngine({
        writeDaySummary: async () => {
          calls++;
          return { value: { text: 'Вы должны были остановиться — это провал.', question: null }, model: 'fake-1' };
        },
      }),
    });
    const r = await ai.daySummary(facts, { allowLlm: true });
    expect(calls).toBe(2);
    expect(r.meta.engine).toBe('local');
    expect(r.meta.fallbackUsed).toBe(true);
    expect(r.value.text).toContain('Эмоции до еды: усталость, тревога.');
  });

  it('уважает отсутствие согласия на ИИ', async () => {
    let called = false;
    const ai = createAiService({
      llm: fakeEngine({
        writeDaySummary: async () => {
          called = true;
          return { value: { text: 'ok', question: null }, model: 'x' };
        },
      }),
    });
    const r = await ai.daySummary(facts, { allowLlm: false });
    expect(called).toBe(false);
    expect(r.meta.engine).toBe('local');
    expect(r.meta.fallbackUsed).toBe(false);
  });

  it('принимает корректный ответ модели', async () => {
    const ai = createAiService({
      llm: fakeEngine({
        writeDaySummary: async () => ({
          value: { text: 'Записано 2 приёма пищи. Вечером отмечен эпизод переедания после тяжёлого рабочего дня.', question: 'Что могло бы помочь вечером?' },
          model: 'fake-1',
        }),
      }),
    });
    const r = await ai.daySummary(facts, { allowLlm: true });
    expect(r.meta.engine).toBe('fake');
  });

  it('при ошибке модели в разборе еды использует правила', async () => {
    const ai = createAiService({
      llm: fakeEngine({
        parseMeal: async () => {
          throw new Error('timeout');
        },
      }),
    });
    const r = await ai.parseMeal('стакан кефира', TEST_FOODS, { allowLlm: true });
    expect(r.items[0]?.name).toBe('Кефир 2,5%');
    expect(r.meta.fallbackUsed).toBe(true);
  });

  it('шаблон недельного отчёта проходит проверку', async () => {
    const week = buildWeekFacts({ weekStart: '2026-11-16', days: [facts], weights: [{ date: '2026-11-18', weightKg: 84.6 }], targetWeightKg: 68 });
    const t = templateWeeklyReport(week);
    expect(t.observations[0]).toBe('Вес внесён один раз: 84,6 кг.');
    const ai = createAiService({ llm: null });
    const r = await ai.weeklyReport(week, { allowLlm: true });
    expect(r.meta.success).toBe(true);
  });
});
