import {
  DAY_PART_LABELS,
  DAY_PARTS,
  FULL_DAY_MIN_MEALS,
  MEAL_TYPE_LABELS,
  OVER_TARGET_TOLERANCE,
  dayPartOfHour,
  type DayPart,
  type MealType,
} from './constants';
import { WEEKDAY_NAMES, addDays, weekdayOf, type DateStr } from './dates';
import { macroPercentsFromGrams, type MacroPercents } from './nutrition';

/**
 * Факты дня и недели считаются кодом. ИИ получает только эти факты и пишет по ним текст,
 * поэтому цифры в итогах и отчётах всегда точные.
 */

export interface OvereatingNoteData {
  situationTags: string[];
  situationText: string | null;
  emotionsBefore: string[];
  emotionsAfter: string[];
  comment: string | null;
}

export interface MealForStats {
  mealType: MealType;
  /** Местное время HH:MM */
  time: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  isOvereating: boolean;
  note: OvereatingNoteData | null;
}

export interface TargetsForStats {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface EpisodeFacts {
  mealType: MealType;
  mealTypeLabel: string;
  time: string;
  dayPart: DayPart;
  dayPartLabel: string;
  situations: string[];
  situationText: string | null;
  emotionsBefore: string[];
  emotionsAfter: string[];
  comment: string | null;
}

export interface DayFacts {
  date: DateStr;
  hasEntries: boolean;
  mealsCount: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  percents: MacroPercents;
  targets: TargetsForStats | null;
  diffKcal: number | null;
  weightKg: number | null;
  weightDeltaKg: number | null;
  episodes: EpisodeFacts[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildDayFacts(p: {
  date: DateStr;
  meals: MealForStats[];
  targets: TargetsForStats | null;
  weightKg: number | null;
  previousWeightKg: number | null;
}): DayFacts {
  const meals = [...p.meals].sort((a, b) => a.time.localeCompare(b.time));
  const kcal = Math.round(meals.reduce((s, m) => s + m.kcal, 0));
  const proteinG = round1(meals.reduce((s, m) => s + m.protein, 0));
  const fatG = round1(meals.reduce((s, m) => s + m.fat, 0));
  const carbsG = round1(meals.reduce((s, m) => s + m.carbs, 0));

  const episodes: EpisodeFacts[] = meals
    .filter((m) => m.isOvereating)
    .map((m) => {
      const hour = Number(m.time.slice(0, 2));
      const part = dayPartOfHour(hour);
      return {
        mealType: m.mealType,
        mealTypeLabel: MEAL_TYPE_LABELS[m.mealType],
        time: m.time,
        dayPart: part,
        dayPartLabel: DAY_PART_LABELS[part],
        situations: m.note?.situationTags ?? [],
        situationText: m.note?.situationText?.trim() || null,
        emotionsBefore: m.note?.emotionsBefore ?? [],
        emotionsAfter: m.note?.emotionsAfter ?? [],
        comment: m.note?.comment?.trim() || null,
      };
    });

  return {
    date: p.date,
    hasEntries: meals.length > 0,
    mealsCount: meals.length,
    kcal,
    proteinG,
    fatG,
    carbsG,
    percents: macroPercentsFromGrams({ protein: proteinG, fat: fatG, carbs: carbsG }),
    targets: p.targets,
    diffKcal: p.targets && meals.length > 0 ? kcal - p.targets.kcal : null,
    weightKg: p.weightKg,
    weightDeltaKg:
      p.weightKg != null && p.previousWeightKg != null ? round1(p.weightKg - p.previousWeightKg) : null,
    episodes,
  };
}

export interface CountItem {
  label: string;
  count: number;
}

export interface WeekFacts {
  weekStart: DateStr;
  weekEnd: DateStr;
  weight: {
    start: number | null;
    startDate: DateStr | null;
    end: number | null;
    endDate: DateStr | null;
    changeKg: number | null;
    entriesCount: number;
    targetWeightKg: number | null;
    toGoalKg: number | null;
  };
  nutrition: {
    daysWithEntries: number;
    fullDays: number;
    avgKcal: number | null;
    avgDiffKcal: number | null;
    avgProteinG: number | null;
    avgFatG: number | null;
    avgCarbsG: number | null;
    daysOverTarget: number;
    targetKcal: number | null;
  };
  behavior: {
    episodesCount: number;
    byWeekday: Array<{ weekday: number; label: string; count: number }>;
    byDayPart: Array<{ part: DayPart; label: string; count: number }>;
    topSituations: CountItem[];
    topEmotionsBefore: CountItem[];
    topEmotionsAfter: CountItem[];
    combos: Array<{ situation: string; emotion: string; count: number }>;
  };
  days: Array<{
    date: DateStr;
    kcal: number;
    targetKcal: number | null;
    mealsCount: number;
    episodes: number;
    weightKg: number | null;
  }>;
}

function topCounts(values: string[], limit = 5): CountItem[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
    .slice(0, limit);
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function buildWeekFacts(p: {
  weekStart: DateStr;
  /** Факты по каждому дню недели (дни без записей тоже допустимы). */
  days: DayFacts[];
  /** Взвешивания внутри недели. */
  weights: Array<{ date: DateStr; weightKg: number }>;
  targetWeightKg: number | null;
  overTargetTolerance?: number;
}): WeekFacts {
  const weekEnd = addDays(p.weekStart, 6);
  const tolerance = p.overTargetTolerance ?? OVER_TARGET_TOLERANCE;
  const inWeek = (d: DateStr) => d >= p.weekStart && d <= weekEnd;

  const weights = p.weights.filter((w) => inWeek(w.date)).sort((a, b) => a.date.localeCompare(b.date));
  const first = weights[0] ?? null;
  const last = weights.length > 1 ? weights[weights.length - 1]! : null;
  const latestWeight = last?.weightKg ?? first?.weightKg ?? null;

  const days = p.days.filter((d) => inWeek(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  const withEntries = days.filter((d) => d.hasEntries);
  const withTargets = withEntries.filter((d) => d.targets);
  const lastTargets = [...days].reverse().find((d) => d.targets)?.targets ?? null;

  const episodes = days.flatMap((d) => d.episodes.map((e) => ({ ...e, date: d.date })));

  const byWeekday = Array.from({ length: 7 }, (_, i) => ({
    weekday: i + 1,
    label: WEEKDAY_NAMES[i]!,
    count: episodes.filter((e) => weekdayOf(e.date) === i + 1).length,
  }));
  const byDayPart = DAY_PARTS.map((part) => ({
    part,
    label: DAY_PART_LABELS[part],
    count: episodes.filter((e) => e.dayPart === part).length,
  }));

  const comboMap = new Map<string, { situation: string; emotion: string; count: number }>();
  for (const e of episodes) {
    for (const s of e.situations) {
      for (const em of e.emotionsBefore) {
        const situation = s.trim().toLowerCase();
        const emotion = em.trim().toLowerCase();
        const key = `${situation}|${emotion}`;
        const cur = comboMap.get(key) ?? { situation, emotion, count: 0 };
        cur.count += 1;
        comboMap.set(key, cur);
      }
    }
  }

  const round = (n: number | null) => (n == null ? null : Math.round(n));
  const r1 = (n: number | null) => (n == null ? null : round1(n));

  return {
    weekStart: p.weekStart,
    weekEnd,
    weight: {
      start: first?.weightKg ?? null,
      startDate: first?.date ?? null,
      end: last?.weightKg ?? null,
      endDate: last?.date ?? null,
      changeKg: first && last ? round1(last.weightKg - first.weightKg) : null,
      entriesCount: weights.length,
      targetWeightKg: p.targetWeightKg,
      toGoalKg:
        latestWeight != null && p.targetWeightKg != null ? round1(latestWeight - p.targetWeightKg) : null,
    },
    nutrition: {
      daysWithEntries: withEntries.length,
      fullDays: withEntries.filter((d) => d.mealsCount >= FULL_DAY_MIN_MEALS).length,
      avgKcal: round(avg(withEntries.map((d) => d.kcal))),
      avgDiffKcal: round(avg(withTargets.map((d) => d.kcal - d.targets!.kcal))),
      avgProteinG: r1(avg(withEntries.map((d) => d.proteinG))),
      avgFatG: r1(avg(withEntries.map((d) => d.fatG))),
      avgCarbsG: r1(avg(withEntries.map((d) => d.carbsG))),
      daysOverTarget: withTargets.filter((d) => d.kcal > d.targets!.kcal * (1 + tolerance)).length,
      targetKcal: lastTargets?.kcal ?? null,
    },
    behavior: {
      episodesCount: episodes.length,
      byWeekday,
      byDayPart,
      topSituations: topCounts(episodes.flatMap((e) => e.situations)),
      topEmotionsBefore: topCounts(episodes.flatMap((e) => e.emotionsBefore)),
      topEmotionsAfter: topCounts(episodes.flatMap((e) => e.emotionsAfter)),
      combos: [...comboMap.values()]
        .filter((c) => c.count >= 2)
        .sort((a, b) => b.count - a.count),
    },
    days: days.map((d) => ({
      date: d.date,
      kcal: d.kcal,
      targetKcal: d.targets?.kcal ?? null,
      mealsCount: d.mealsCount,
      episodes: d.episodes.length,
      weightKg: d.weightKg,
    })),
  };
}
