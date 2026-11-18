import { describe, expect, it } from 'vitest';
import { parseChunk, parseMealText } from './quantity';
import { resolveItems } from './resolve';
import { TEST_FOODS } from './test-foods';

describe('parseChunk', () => {
  it('граммы', () => {
    expect(parseChunk('30 граммов сыра')).toMatchObject({ query: 'сыра', grams: 30, gramsEstimated: false });
    expect(parseChunk('сыр 30г')).toMatchObject({ query: 'сыр', grams: 30 });
    expect(parseChunk('0,5 л кефира')).toMatchObject({ grams: 500, quantityText: '0,5 л' });
    expect(parseChunk('200 мл молока')).toMatchObject({ grams: 200, query: 'молока' });
  });

  it('штуки и единицы', () => {
    expect(parseChunk('Два яйца')).toMatchObject({ query: 'яйца', count: 2, unit: null });
    expect(parseChunk('кусок хлеба')).toMatchObject({ query: 'хлеба', count: 1, unit: 'slice' });
    expect(parseChunk('2 куска хлеба')).toMatchObject({ count: 2, unit: 'slice' });
    expect(parseChunk('стакан кефира')).toMatchObject({ unit: 'glass', query: 'кефира' });
    expect(parseChunk('полстакана молока')).toMatchObject({ unit: 'glass', count: 0.5 });
    expect(parseChunk('чайная ложка сахара')).toMatchObject({ unit: 'tsp', query: 'сахара' });
    expect(parseChunk('ложка сметаны')).toMatchObject({ unit: 'tbsp' });
    expect(parseChunk('тарелка борща')).toMatchObject({ unit: 'bowl', query: 'борща' });
    expect(parseChunk('кофе с молоком')).toMatchObject({ query: 'кофе с молоком', count: null, unit: null });
  });
});

describe('локальный конвейер разбора', () => {
  it('пример из ТЗ', () => {
    const items = resolveItems(parseMealText('Два яйца, кусок хлеба, 30 граммов сыра, кофе с молоком'), TEST_FOODS);
    expect(items.map((i) => i.name)).toEqual([
      'Яйцо куриное варёное',
      'Хлеб пшеничный (батон)',
      'Сыр твёрдый',
      'Кофе с молоком',
    ]);
    expect(items[0]).toMatchObject({ grams: 110, isEstimated: true, valueSource: 'db' });
    expect(items[1]).toMatchObject({ grams: 30, isEstimated: true });
    expect(items[2]).toMatchObject({ grams: 30, isEstimated: false });
    expect(items.every((i) => !i.needsReview)).toBe(true);
  });

  it('разные формулировки', () => {
    const items = resolveItems(
      parseMealText('тарелка борща со сметаной; гречка 150 г и куриная грудка, яблоко\nчай'),
      TEST_FOODS,
    );
    expect(items.map((i) => i.name)).toEqual([
      'Борщ',
      'Гречка отварная',
      'Куриная грудка отварная',
      'Яблоко',
      'Чай без сахара',
    ]);
    expect(items[0]?.grams).toBe(300);
    expect(items[1]?.grams).toBe(150);
  });

  it('неизвестный продукт требует выбора', () => {
    const items = resolveItems(parseMealText('что-то непонятное из пекарни'), TEST_FOODS);
    expect(items[0]).toMatchObject({ needsReview: true, valueSource: 'manual' });
  });
});
