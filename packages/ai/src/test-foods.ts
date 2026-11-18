import { SEED_FOODS } from '@hud/db/seed-foods';
import type { FoodRecord } from './types';

export const TEST_FOODS: FoodRecord[] = SEED_FOODS.map((f, i) => ({ id: `f${i}`, ...f }));
