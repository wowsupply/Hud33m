import type { ParsedItem, UnitKey } from './types';

/**
 * Разбор количества и единиц измерения в свободном русском тексте.
 * Используется локальным движком (без ИИ) и как запасной путь, если модель недоступна.
 */

export const GENERIC_UNIT_GRAMS: Record<UnitKey, number> = {
  piece: 100,
  slice: 30,
  glass: 250,
  cup: 200,
  tbsp: 15,
  tsp: 5,
  bowl: 250,
  portion: 200,
  handful: 30,
  wineglass: 150,
  bottle: 500,
};

export const UNIT_LABELS: Record<UnitKey, string> = {
  piece: 'шт',
  slice: 'кусок',
  glass: 'стакан',
  cup: 'чашка',
  tbsp: 'ст. л.',
  tsp: 'ч. л.',
  bowl: 'тарелка',
  portion: 'порция',
  handful: 'горсть',
  wineglass: 'бокал',
  bottle: 'бутылка',
};

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, одну: 1,
  два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  пол: 0.5, половина: 0.5, половину: 0.5, половинка: 0.5, половинку: 0.5,
  полтора: 1.5, полторы: 1.5,
  пара: 2, пару: 2, парочка: 2, парочку: 2, несколько: 2,
};

// Порядок важен: чайная ложка раньше обычной ложки.
const UNIT_PATTERNS: Array<[UnitKey, string]> = [
  ['tsp', 'чайн(?:ая|ые|ых|ую)\\s+ложк(?:а|и|у)|чайн(?:ых)?\\s+ложек|ч\\.\\s?л\\.?'],
  ['tbsp', '(?:столов(?:ая|ые|ых|ую)\\s+)?ложк(?:а|и|у)|ложек|ложечк(?:а|и|у)|ст\\.\\s?л\\.?'],
  ['slice', 'кус(?:ок|ка|ков|очек|очка|очков|очки)|ломт(?:ик|ика|иков|ики)|дольк(?:а|и|у)|долек'],
  ['glass', 'стакан(?:а|ов)?'],
  ['cup', 'чашк(?:а|и|у)|чашек|кружк(?:а|и|у)|кружек'],
  ['bowl', 'тарелк(?:а|и|у)|тарелок|миск(?:а|и|у)'],
  ['portion', 'порци(?:я|и|ю|й)'],
  ['handful', 'горст(?:ь|и|ей)|горсточк(?:а|у)'],
  ['wineglass', 'бокал(?:а|ов)?'],
  ['bottle', 'бутылк(?:а|и|у)|бутылок|банк(?:а|и|у)|банок'],
  ['piece', 'штук(?:а|и|у)?|шт\\.?'],
];

const NUMBER_RE = `(\\d+(?:[.,]\\d+)?|\\d+\\/\\d+|${Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;

const MASS_RE = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(кг|килограмм(?:а|ов)?|граммов|грамма|грамм|гр|г|миллилитров|миллилитра|мл|литра|литров|литр|л)(?![а-я])`,
);

function parseNumber(token: string): number | null {
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token]!;
  if (token.includes('/')) {
    const [a, b] = token.split('/').map(Number);
    return a && b ? a / b : null;
  }
  const n = Number(token.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Нормализация с сохранением десятичных дробей и сокращений вида «ст. л.». */
function normalizeQuantityText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-zа-я0-9.%\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanQuery(s: string): string {
  return s
    .replace(/(?:^|\s)\.+|\.+(?=\s|$)/g, ' ')
    .trim()
    .replace(/^(?:и|с|со|из|на|еще|ещё|потом|плюс)\s+/g, '')
    .replace(/\s+(?:и|с|со)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Разбирает один фрагмент вида «2 куска хлеба», «30 г сыра», «кофе с молоком». */
export function parseChunk(chunk: string): ParsedItem | null {
  let text = normalizeQuantityText(chunk);
  if (!text) return null;

  let grams: number | null = null;
  let count: number | null = null;
  let unit: UnitKey | null = null;
  let quantityText: string | null = null;

  const mass = MASS_RE.exec(text);
  if (mass) {
    const value = parseNumber(mass[1]!) ?? 0;
    const u = mass[2]!;
    const [label, factor] = u.startsWith('кг') || u.startsWith('килограмм')
      ? ['кг', 1000]
      : u.startsWith('мл') || u.startsWith('миллилитр')
        ? ['мл', 1]
        : u === 'л' || u.startsWith('литр')
          ? ['л', 1000]
          : ['г', 1];
    grams = round(value * factor);
    quantityText = `${mass[1]!.replace('.', ',')} ${label}`;
    text = (text.slice(0, mass.index) + ' ' + text.slice(mass.index + mass[0].length)).trim();
  }

  if (grams == null) {
    // «полстакана», «полчашки»
    const half = /(?:^|\s)пол(стакана|чашки|кружки|тарелки|порции|ложки|бутылки|банки|бокала)(?=\s|$)/.exec(text);
    if (half) {
      const word = half[1]!;
      for (const [key, pattern] of UNIT_PATTERNS) {
        if (new RegExp(`^(?:${pattern})$`).test(word)) {
          unit = key;
          break;
        }
      }
      count = 0.5;
      quantityText = `1/2 ${unit ? UNIT_LABELS[unit] : ''}`.trim();
      text = (text.slice(0, half.index) + ' ' + text.slice(half.index + half[0].length)).trim();
    }
  }

  if (grams == null && unit == null) {
    for (const [key, pattern] of UNIT_PATTERNS) {
      const re = new RegExp(`(?:^|\\s)(?:${NUMBER_RE}\\s+)?(${pattern})(?=\\s|$)`);
      const m = re.exec(text);
      if (m) {
        unit = key;
        count = m[1] ? parseNumber(m[1]) : 1;
        quantityText = `${count != null ? String(count).replace('.', ',') : '1'} ${UNIT_LABELS[key]}`;
        text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
        break;
      }
    }
  }

  if (grams == null && unit == null) {
    const m = new RegExp(`(?:^|\\s)${NUMBER_RE}(?=\\s|$)`).exec(text);
    if (m) {
      count = parseNumber(m[1]!);
      if (count != null) quantityText = `${String(count).replace('.', ',')} шт`;
      text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
    }
  }

  const query = cleanQuery(text);
  if (!query) return null;

  return {
    name: capitalize(query),
    query,
    grams,
    gramsEstimated: grams == null,
    count,
    unit,
    quantityText,
    estimatedPer100: null,
  };
}

/** Делит описание приёма пищи на фрагменты и разбирает каждый. */
export function parseMealText(text: string): ParsedItem[] {
  return text
    .split(/(?<!\d),|,(?!\d)|[;\n]+|\s\+\s|\s+а также\s+|\s+и\s+/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .map(parseChunk)
    .filter((x): x is ParsedItem => x !== null);
}
