import { describe, expect, it } from 'vitest';
import { bestFoodMatch, searchFoods, stemRu } from './food-match';

const foods = [
  { id: '1', name: 'Яйцо куриное', synonyms: ['яйцо', 'яйца', 'варёное яйцо'] },
  { id: '2', name: 'Хлеб пшеничный (батон)', synonyms: ['хлеб', 'белый хлеб', 'батон'] },
  { id: '3', name: 'Сыр твёрдый', synonyms: ['сыр', 'российский сыр'] },
  { id: '4', name: 'Кофе с молоком', synonyms: ['кофе с молоком без сахара'] },
  { id: '5', name: 'Кофе чёрный', synonyms: ['кофе', 'американо', 'эспрессо'] },
  { id: '6', name: 'Куриная грудка отварная', synonyms: ['куриная грудка', 'курица отварная'] },
  { id: '7', name: 'Куриная грудка запечённая', synonyms: ['куриная грудка жареная'] },
  { id: '8', name: 'Молоко 2,5%', synonyms: ['молоко'] },
];

describe('food matching', () => {
  it('стемминг', () => {
    expect(stemRu('яйца')).toBe(stemRu('яйцо'));
    expect(stemRu('хлеба')).toBe('хлеб');
    expect(stemRu('сыра')).toBe('сыр');
  });

  it('находит продукты по разговорным формам', () => {
    expect(bestFoodMatch('яйца', foods)?.food.id).toBe('1');
    expect(bestFoodMatch('хлеба', foods)?.food.id).toBe('2');
    expect(bestFoodMatch('сыра', foods)?.food.id).toBe('3');
    expect(bestFoodMatch('кофе с молоком', foods)?.food.id).toBe('4');
    expect(bestFoodMatch('кофе', foods)?.food.id).toBe('5');
    expect(bestFoodMatch('отварная куриная грудка', foods)?.food.id).toBe('6');
    expect(bestFoodMatch('ёжики в тумане', foods)).toBeNull();
  });

  it('поиск возвращает отсортированный список', () => {
    const res = searchFoods('куриная грудка', foods);
    expect(res[0]?.food.id).toBe('6');
    expect(res.map((r) => r.food.id)).toContain('7');
  });
});
