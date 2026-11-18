/**
 * Нечёткое сопоставление названий продуктов на русском языке.
 * Работает в памяти: база продуктов небольшая (тысячи записей), а так поиск одинаково
 * работает на сервере, в тестах и при необходимости на клиенте.
 */

const STOPWORDS = new Set([
  'с', 'со', 'и', 'в', 'во', 'на', 'из', 'без', 'для', 'по', 'от', 'до', 'под', 'за',
  'немного', 'чуть', 'чуть-чуть', 'примерно', 'около', 'где-то',
]);

// Окончания отсортированы по убыванию длины.
const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ова', 'ева',
  'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ов', 'ев', 'ах', 'ях',
  'ам', 'ям', 'ом', 'ем', 'ую', 'юю', 'у', 'ю', 'а', 'я', 'ы', 'и', 'е', 'о', 'ь', 'й',
];

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9%\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Очень лёгкий стеммер: отрезает типичные окончания, оставляя основу не короче 3 букв. */
export function stemRu(word: string): string {
  if (word.length <= 3) return word;
  for (const e of ENDINGS) {
    if (word.endsWith(e) && word.length - e.length >= 3) {
      return word.slice(0, -e.length);
    }
  }
  return word;
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(stemRu);
}

/** 1 — точное совпадение основ, 0.8 — одна основа начинается с другой, 0 — нет совпадения. */
function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  return min >= 4 && (a.startsWith(b) || b.startsWith(a)) ? 0.8 : 0;
}

/** Коэффициент Дайса по основам слов + небольшой бонус за совпадение первого слова. */
export function similarity(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = tokenize(candidate);
  if (q.length === 0 || c.length === 0) return 0;
  let inter = 0;
  const used = new Set<number>();
  for (const qt of q) {
    let bestIdx = -1;
    let best = 0;
    c.forEach((ct, i) => {
      if (used.has(i)) return;
      const s = tokenScore(qt, ct);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      inter += best;
    }
  }
  let score = (2 * inter) / (q.length + c.length);
  if (inter > 0 && tokenScore(q[0]!, c[0]!) > 0) score += 0.05;
  return Math.min(1, score);
}

export interface MatchableFood {
  id: string;
  name: string;
  synonyms: string[];
}

export interface FoodMatch<T extends MatchableFood> {
  food: T;
  score: number;
}

export function scoreFood(query: string, food: MatchableFood): number {
  let best = similarity(query, food.name);
  for (const syn of food.synonyms) {
    const s = similarity(query, syn);
    if (s > best) best = s;
  }
  return best;
}

export function searchFoods<T extends MatchableFood>(query: string, foods: T[], limit = 10): FoodMatch<T>[] {
  const results: FoodMatch<T>[] = [];
  for (const food of foods) {
    const score = scoreFood(query, food);
    if (score > 0) results.push({ food, score });
  }
  results.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return results.slice(0, limit);
}

/** Минимальный балл, при котором продукт подставляется автоматически. */
export const AUTO_MATCH_THRESHOLD = 0.5;

export function bestFoodMatch<T extends MatchableFood>(query: string, foods: T[]): FoodMatch<T> | null {
  const [top] = searchFoods(query, foods, 1);
  return top && top.score >= AUTO_MATCH_THRESHOLD ? top : null;
}
