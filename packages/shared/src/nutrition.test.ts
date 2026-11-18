import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, calcBmi, computeTargets, macroPercentsFromGrams } from './nutrition';

const base = {
  sex: 'female' as const,
  weightKg: 85,
  targetWeightKg: 68,
  heightCm: 165,
  ageYears: 35,
  activityLevel: 'low' as const,
};

describe('computeTargets', () => {
  it('считает пример из плана', () => {
    const r = computeTargets(base);
    expect(r.bmi).toBe(31.2);
    expect(r.bmiCategory).toBe('obesity');
    expect(r.bmr).toBe(1545);
    expect(r.tdee).toBe(2125);
    expect(r.mode).toBe('deficit');
    expect(r.kcal).toBe(1700);
    expect(r.proteinG).toBe(95);
    expect(r.fatG).toBe(61);
    expect(r.carbsG).toBe(193);
    expect(r.requiresReview).toBe(false);
    expect(r.deficitPct).toBe(0.2);
  });

  it('не опускает калорийность ниже базового обмена при дефиците 30 %', () => {
    const r = computeTargets({ ...base, deficit: 0.3 });
    expect(r.kcal).toBe(1550);
    expect(r.flooredBy).toBe('bmr');
  });

  it('ограничивает дефицит максимумом', () => {
    const r = computeTargets({ ...base, activityLevel: 'high', deficit: 0.5 }, {
      defaultDeficit: 0.2,
      maxDeficit: 0.3,
      minKcal: 1200,
      floorAtBmr: false,
      proteinPerKg: 1.4,
      fatPerKg: 0.9,
      minCarbsG: 50,
    });
    expect(r.deficitPct).toBe(0.3);
  });

  it('при беременности/ГВ дефицит не назначается', () => {
    const r = computeTargets({ ...base, pregnancyOrLactation: true });
    expect(r.mode).toBe('maintenance');
    expect(r.kcal).toBe(2120);
    expect(r.requiresReview).toBe(true);
  });

  it('при ИМТ ниже 18,5 — поддержание и проверка наставником', () => {
    const r = computeTargets({ ...base, weightKg: 48, targetWeightKg: 45 });
    expect(r.bmi).toBeLessThan(18.5);
    expect(r.mode).toBe('maintenance');
    expect(r.requiresReview).toBe(true);
  });

  it('помечает желаемый вес с ИМТ ниже 18,5', () => {
    const r = computeTargets({ ...base, targetWeightKg: 48 });
    expect(r.mode).toBe('deficit');
    expect(r.requiresReview).toBe(true);
  });

  it('желаемый вес выше текущего — поддержание', () => {
    const r = computeTargets({ ...base, targetWeightKg: 90 });
    expect(r.mode).toBe('maintenance');
    expect(r.deficitPct).toBe(0);
  });

  it('не делает профицит из нижней границы', () => {
    const r = computeTargets({
      sex: 'female',
      weightKg: 52,
      targetWeightKg: 49,
      heightCm: 150,
      ageYears: 70,
      activityLevel: 'minimal',
    });
    expect(r.kcal).toBeLessThanOrEqual(r.tdee);
  });
});

describe('helpers', () => {
  it('ИМТ', () => expect(calcBmi(70, 170)).toBe(24.2));
  it('возраст', () => {
    expect(ageFromBirthDate('1990-11-19', '2026-11-18')).toBe(35);
    expect(ageFromBirthDate('1990-11-18', '2026-11-18')).toBe(36);
  });
  it('доли БЖУ в сумме 100', () => {
    const p = macroPercentsFromGrams({ protein: 95, fat: 61, carbs: 193 });
    expect(p.protein + p.fat + p.carbs).toBe(100);
  });
});
