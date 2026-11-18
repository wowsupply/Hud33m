import { describe, expect, it } from 'vitest';
import { buildDayFacts, buildWeekFacts, type MealForStats } from './stats';

const targets = { kcal: 1700, proteinG: 95, fatG: 61, carbsG: 193 };

const meal = (over: Partial<MealForStats>): MealForStats => ({
  mealType: 'lunch',
  time: '13:00',
  kcal: 500,
  protein: 30,
  fat: 15,
  carbs: 60,
  isOvereating: false,
  note: null,
  ...over,
});

describe('buildDayFacts', () => {
  it('считает итоги и эпизоды', () => {
    const f = buildDayFacts({
      date: '2026-11-18',
      meals: [
        meal({ mealType: 'breakfast', time: '08:00', kcal: 400 }),
        meal({
          mealType: 'dinner',
          time: '21:30',
          kcal: 1100,
          isOvereating: true,
          note: {
            situationTags: ['тяжёлый рабочий день'],
            situationText: '  ',
            emotionsBefore: ['усталость', 'тревога'],
            emotionsAfter: ['чувство вины'],
            comment: null,
          },
        }),
      ],
      targets,
      weightKg: 84.6,
      previousWeightKg: 85,
    });
    expect(f.kcal).toBe(1500);
    expect(f.diffKcal).toBe(-200);
    expect(f.mealsCount).toBe(2);
    expect(f.weightDeltaKg).toBe(-0.4);
    expect(f.episodes).toHaveLength(1);
    expect(f.episodes[0]?.dayPart).toBe('night');
    expect(f.episodes[0]?.situationText).toBeNull();
  });

  it('день без записей', () => {
    const f = buildDayFacts({ date: '2026-11-18', meals: [], targets, weightKg: null, previousWeightKg: null });
    expect(f.hasEntries).toBe(false);
    expect(f.diffKcal).toBeNull();
  });
});

describe('buildWeekFacts', () => {
  it('собирает недельную статистику', () => {
    const ep = (date: string, time: string) =>
      buildDayFacts({
        date,
        meals: [
          meal({ kcal: 1000 }),
          meal({ kcal: 500 }),
          meal({
            time,
            kcal: 800,
            isOvereating: true,
            note: {
              situationTags: ['тяжёлый рабочий день'],
              situationText: null,
              emotionsBefore: ['усталость'],
              emotionsAfter: ['чувство вины'],
              comment: null,
            },
          }),
        ],
        targets,
        weightKg: null,
        previousWeightKg: null,
      });
    const days = [
      ep('2026-11-16', '20:00'),
      buildDayFacts({ date: '2026-11-17', meals: [meal({ kcal: 1600 })], targets, weightKg: null, previousWeightKg: null }),
      ep('2026-11-18', '19:30'),
    ];
    const f = buildWeekFacts({
      weekStart: '2026-11-16',
      days,
      weights: [
        { date: '2026-11-16', weightKg: 85 },
        { date: '2026-11-20', weightKg: 84.3 },
      ],
      targetWeightKg: 68,
    });
    expect(f.weight.changeKg).toBe(-0.7);
    expect(f.weight.toGoalKg).toBe(16.3);
    expect(f.nutrition.daysWithEntries).toBe(3);
    expect(f.nutrition.fullDays).toBe(2);
    expect(f.nutrition.daysOverTarget).toBe(2);
    expect(f.behavior.episodesCount).toBe(2);
    expect(f.behavior.byDayPart.find((d) => d.part === 'evening')?.count).toBe(2);
    expect(f.behavior.topEmotionsBefore[0]).toEqual({ label: 'усталость', count: 2 });
    expect(f.behavior.combos).toEqual([{ situation: 'тяжёлый рабочий день', emotion: 'усталость', count: 2 }]);
  });

  it('без взвешиваний — явные null', () => {
    const f = buildWeekFacts({ weekStart: '2026-11-16', days: [], weights: [], targetWeightKg: 68 });
    expect(f.weight.start).toBeNull();
    expect(f.weight.changeKg).toBeNull();
    expect(f.nutrition.avgKcal).toBeNull();
  });
});
