import { ACTIVITY_INFO, type ActivityLevel, type Sex } from './constants';

/**
 * Расчёты стартовых показателей.
 *
 * Формулы и ограничения — предложение, которое должен утвердить специалист заказчицы
 * (см. docs/OPEN_QUESTIONS.md). Все коэффициенты вынесены в TargetsConfig, чтобы менять их
 * без переписывания кода.
 */

export interface TargetsConfig {
  /** Дефицит по умолчанию (доля от TDEE). */
  defaultDeficit: number;
  /** Максимально допустимый дефицит. */
  maxDeficit: number;
  /** Нижняя граница калорийности, ккал. */
  minKcal: number;
  /** Не опускать цель ниже базового обмена. */
  floorAtBmr: boolean;
  /** Белок, г на кг расчётного веса. */
  proteinPerKg: number;
  /** Жиры, г на кг расчётного веса. */
  fatPerKg: number;
  /** Если углеводов получается меньше — помечаем расчёт для проверки наставником. */
  minCarbsG: number;
}

export const DEFAULT_TARGETS_CONFIG: TargetsConfig = {
  defaultDeficit: 0.2,
  maxDeficit: 0.3,
  minKcal: 1200,
  floorAtBmr: true,
  proteinPerKg: 1.4,
  fatPerKg: 0.9,
  minCarbsG: 50,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obesity';

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: 'ниже нормы',
  normal: 'норма',
  overweight: 'избыточная масса тела',
  obesity: 'ожирение',
};

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obesity';
}

/** Возраст в полных годах на дату `today` (обе даты — YYYY-MM-DD). */
export function ageFromBirthDate(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Базовый обмен по формуле Миффлина — Сан Жеора (ккал/сутки, без округления). */
export function calcBmr(p: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function calcTdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_INFO[activity].factor;
}

export interface TargetsInput {
  sex: Sex;
  weightKg: number;
  targetWeightKg: number;
  heightCm: number;
  ageYears: number;
  activityLevel: ActivityLevel;
  pregnancyOrLactation?: boolean;
  medicalConditions?: boolean;
  edHistory?: boolean;
  /** Запрошенный дефицит (например, наставником). Ограничивается maxDeficit. */
  deficit?: number;
}

export interface MacroPercents {
  protein: number;
  fat: number;
  carbs: number;
}

export interface TargetsResult {
  bmi: number;
  bmiCategory: BmiCategory;
  targetBmi: number;
  bmr: number;
  tdee: number;
  mode: 'deficit' | 'maintenance';
  /** Фактический дефицит после всех ограничений, доля 0..1. */
  deficitPct: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  percents: MacroPercents;
  /** Расчёт требует проверки наставником. */
  requiresReview: boolean;
  /** Пояснения к расчёту — показываются ученице и наставнику. */
  notes: string[];
  flooredBy: 'bmr' | 'min_kcal' | null;
}

export function macroPercentsFromGrams(p: { protein: number; fat: number; carbs: number }): MacroPercents {
  const pk = p.protein * 4;
  const fk = p.fat * 9;
  const ck = p.carbs * 4;
  const total = pk + fk + ck;
  if (total <= 0) return { protein: 0, fat: 0, carbs: 0 };
  const protein = Math.round((pk / total) * 100);
  const fat = Math.round((fk / total) * 100);
  return { protein, fat, carbs: Math.max(0, 100 - protein - fat) };
}

export function computeTargets(input: TargetsInput, config: TargetsConfig = DEFAULT_TARGETS_CONFIG): TargetsResult {
  const bmi = calcBmi(input.weightKg, input.heightCm);
  const targetBmi = calcBmi(input.targetWeightKg, input.heightCm);
  const bmrRaw = calcBmr(input);
  const tdeeRaw = calcTdee(bmrRaw, input.activityLevel);
  const bmr = Math.round(bmrRaw);
  const tdee = Math.round(tdeeRaw);

  const notes: string[] = [];
  let requiresReview = false;
  let maintenance = false;

  if (input.ageYears < 18) {
    maintenance = true;
    requiresReview = true;
    notes.push('Возраст младше 18 лет — цели определяет наставник.');
  }
  if (bmi < 18.5) {
    maintenance = true;
    requiresReview = true;
    notes.push('ИМТ ниже 18,5 — снижение веса не рекомендуется, расчёт сделан на поддержание.');
  } else if (targetBmi < 18.5) {
    requiresReview = true;
    notes.push('Желаемый вес соответствует ИМТ ниже 18,5 — цель стоит обсудить с наставником.');
  }
  if (input.pregnancyOrLactation) {
    maintenance = true;
    requiresReview = true;
    notes.push('Беременность или грудное вскармливание — дефицит калорий не назначается.');
  }
  if (input.medicalConditions) {
    maintenance = true;
    requiresReview = true;
    notes.push('Отмечены заболевания, при которых питание нужно согласовать с врачом.');
  }
  if (input.edHistory) {
    maintenance = true;
    requiresReview = true;
    notes.push('Цели устанавливает наставник вместе со специалистом.');
  }
  if (input.targetWeightKg >= input.weightKg) {
    if (!maintenance) notes.push('Желаемый вес не ниже текущего — расчёт сделан на поддержание веса.');
    maintenance = true;
    if (input.targetWeightKg > input.weightKg) requiresReview = true;
  }

  const requested = Math.min(Math.max(input.deficit ?? config.defaultDeficit, 0), config.maxDeficit);
  const deficit = maintenance ? 0 : requested;

  let kcal = tdeeRaw * (1 - deficit);
  let flooredBy: TargetsResult['flooredBy'] = null;
  if (!maintenance) {
    if (config.floorAtBmr && kcal < bmrRaw) {
      kcal = bmrRaw;
      flooredBy = 'bmr';
    }
    if (kcal < config.minKcal) {
      kcal = config.minKcal;
      flooredBy = 'min_kcal';
    }
    // Ограничения не должны превращать дефицит в профицит.
    kcal = Math.min(kcal, tdeeRaw);
  }
  kcal = Math.round(kcal / 10) * 10;
  if (!maintenance) kcal = Math.min(kcal, Math.floor(tdeeRaw / 10) * 10);
  if (flooredBy === 'bmr') {
    notes.push('Калорийность ограничена снизу базовым обменом.');
  } else if (flooredBy === 'min_kcal') {
    notes.push(`Калорийность ограничена снизу значением ${config.minKcal} ккал.`);
  }

  const refWeight = Math.min(input.weightKg, input.targetWeightKg);
  const proteinG = Math.round(refWeight * config.proteinPerKg);
  const fatG = Math.round(refWeight * config.fatPerKg);
  let carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  if (carbsG < config.minCarbsG) {
    requiresReview = true;
    notes.push('При такой калорийности получается мало углеводов — распределение БЖУ стоит проверить.');
    carbsG = Math.max(carbsG, 0);
  }

  const deficitPct = tdeeRaw > 0 ? Math.max(0, Math.round((1 - kcal / tdeeRaw) * 100) / 100) : 0;

  return {
    bmi,
    bmiCategory: bmiCategory(bmi),
    targetBmi,
    bmr,
    tdee,
    mode: maintenance ? 'maintenance' : 'deficit',
    deficitPct,
    kcal,
    proteinG,
    fatG,
    carbsG,
    percents: macroPercentsFromGrams({ protein: proteinG, fat: fatG, carbs: carbsG }),
    requiresReview,
    notes,
    flooredBy,
  };
}
