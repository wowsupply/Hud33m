import type { DayFacts, Nutrients, ValueSource, WeekFacts } from '@hud/shared';

export type UnitKey =
  | 'piece'
  | 'slice'
  | 'glass'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'bowl'
  | 'portion'
  | 'handful'
  | 'wineglass'
  | 'bottle';

export type Portions = Partial<Record<UnitKey, number>>;

/** Результат первого шага: текст разобран на продукты (ИИ или правилами). */
export interface ParsedItem {
  name: string;
  /** Строка для поиска в базе продуктов. */
  query: string;
  /** Масса в граммах, если известна (указана пользователем или оценена ИИ). */
  grams: number | null;
  gramsEstimated: boolean;
  count: number | null;
  unit: UnitKey | null;
  quantityText: string | null;
  /** Оценка ИИ на 100 г — используется, только если продукт не найден в базе. */
  estimatedPer100: Nutrients | null;
}

export interface FoodRecord {
  id: string;
  name: string;
  synonyms: string[];
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  defaultGrams: number;
  portions: Portions;
}

/** Черновик строки приёма пищи, который увидит ученица на экране проверки. */
export interface DraftItem {
  name: string;
  foodId: string | null;
  grams: number;
  quantityText: string | null;
  per100: Nutrients;
  valueSource: ValueSource;
  isEstimated: boolean;
  /** Продукт не найден и оценки нет — ученице нужно выбрать продукт вручную. */
  needsReview: boolean;
  matchScore: number | null;
}

export interface DaySummaryText {
  text: string;
  question: string | null;
}

export interface WeeklyReportText {
  summary: string;
  positives: string[];
  observations: string[];
  patterns: string[];
  questions: string[];
}

export interface EngineResult<T> {
  value: T;
  model: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

/** Движок ИИ: локальные правила или языковая модель. */
export interface AiEngine {
  readonly name: string;
  parseMeal(text: string): Promise<EngineResult<ParsedItem[]>>;
  writeDaySummary(facts: DayFacts): Promise<EngineResult<DaySummaryText>>;
  writeWeeklyReport(facts: WeekFacts): Promise<EngineResult<WeeklyReportText>>;
}

export interface AiCallMeta {
  feature: 'parse_meal' | 'day_summary' | 'weekly_report';
  engine: string;
  model: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  error: string | null;
}
