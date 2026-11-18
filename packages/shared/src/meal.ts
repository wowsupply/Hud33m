export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const ZERO_NUTRIENTS: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Пищевая ценность порции по значениям на 100 г. */
export function nutrientsForGrams(per100: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  return {
    kcal: round1(per100.kcal * k),
    protein: round1(per100.protein * k),
    fat: round1(per100.fat * k),
    carbs: round1(per100.carbs * k),
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const total = list.reduce(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carbs: acc.carbs + n.carbs,
    }),
    { ...ZERO_NUTRIENTS },
  );
  return {
    kcal: round1(total.kcal),
    protein: round1(total.protein),
    fat: round1(total.fat),
    carbs: round1(total.carbs),
  };
}

export interface ItemLike {
  grams: number;
  per100: Nutrients;
}

export function mealTotals(items: ItemLike[]): Nutrients {
  return sumNutrients(items.map((i) => nutrientsForGrams(i.per100, i.grams)));
}
