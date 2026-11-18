import { bestFoodMatch, type Nutrients } from '@hud/shared';
import { GENERIC_UNIT_GRAMS, UNIT_LABELS } from './quantity';
import type { DraftItem, FoodRecord, ParsedItem } from './types';

const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Если у ИИ есть своя оценка, продукт из базы берём только при уверенном совпадении. */
const MATCH_THRESHOLD_WITH_ESTIMATE = 0.6;

function per100Of(food: FoodRecord): Nutrients {
  return { kcal: food.kcal, protein: food.protein, fat: food.fat, carbs: food.carbs };
}

export function resolveGrams(item: ParsedItem, food: FoodRecord | null): { grams: number; estimated: boolean } {
  if (item.grams != null && item.grams > 0) {
    return { grams: item.grams, estimated: item.gramsEstimated };
  }
  const count = item.count ?? 1;
  if (item.unit) {
    const unitGrams =
      food?.portions[item.unit] ??
      (item.unit === 'piece' ? food?.defaultGrams : undefined) ??
      GENERIC_UNIT_GRAMS[item.unit];
    return { grams: Math.round(count * unitGrams), estimated: true };
  }
  if (item.count != null) {
    const piece = food?.portions.piece ?? food?.defaultGrams ?? 100;
    return { grams: Math.round(count * piece), estimated: true };
  }
  return { grams: food?.defaultGrams ?? 100, estimated: true };
}

/** Второй шаг конвейера: сопоставляем разобранные продукты с базой и считаем граммовки. */
export function resolveItems(parsed: ParsedItem[], foods: FoodRecord[]): DraftItem[] {
  return parsed.map((item) => {
    const match = bestFoodMatch(item.query || item.name, foods);
    const useDb =
      match !== null && (item.estimatedPer100 === null || match.score >= MATCH_THRESHOLD_WITH_ESTIMATE);
    const food = useDb ? match!.food : null;
    const { grams, estimated } = resolveGrams(item, food);

    let quantityText = item.quantityText;
    if (!quantityText && item.unit) quantityText = `${item.count ?? 1} ${UNIT_LABELS[item.unit]}`;

    if (food) {
      return {
        name: food.name,
        foodId: food.id,
        grams,
        quantityText,
        per100: per100Of(food),
        valueSource: 'db',
        isEstimated: estimated,
        needsReview: false,
        matchScore: Math.round(match!.score * 100) / 100,
      };
    }
    if (item.estimatedPer100) {
      return {
        name: item.name,
        foodId: null,
        grams,
        quantityText,
        per100: item.estimatedPer100,
        valueSource: 'ai',
        isEstimated: true,
        needsReview: false,
        matchScore: null,
      };
    }
    return {
      name: item.name,
      foodId: null,
      grams,
      quantityText,
      per100: ZERO,
      valueSource: 'manual',
      isEstimated: true,
      needsReview: true,
      matchScore: null,
    };
  });
}
