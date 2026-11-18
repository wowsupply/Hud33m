import type { FoodRecord } from '@hud/ai';
import { foods, type Db } from '@hud/db';
import { searchFoods } from '@hud/shared';
import { eq } from 'drizzle-orm';

/** База продуктов в памяти: небольшая, читается часто, меняется редко. */
export class FoodCache {
  private cache: { at: number; list: FoodRecord[] } | null = null;

  constructor(
    private readonly db: Db,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  async all(): Promise<FoodRecord[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.list;
    const rows = await this.db.select().from(foods).where(eq(foods.isActive, true));
    const list: FoodRecord[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      synonyms: r.synonyms,
      kcal: r.kcal,
      protein: r.protein,
      fat: r.fat,
      carbs: r.carbs,
      defaultGrams: r.defaultGrams,
      portions: r.portions,
    }));
    this.cache = { at: Date.now(), list };
    return list;
  }

  invalidate(): void {
    this.cache = null;
  }

  async search(query: string, limit = 15): Promise<FoodRecord[]> {
    const list = await this.all();
    return searchFoods(query, list, limit).map((m) => m.food);
  }
}
