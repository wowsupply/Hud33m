import { normalizeText, type DayFacts, type WeekFacts } from '@hud/shared';
import type { DaySummaryText, WeeklyReportText } from './types';

/**
 * Автоматическая проверка текстов ИИ перед показом ученице:
 * 1) нет эмоций, которых пользователь не указывал;
 * 2) нет оценочных, обвиняющих и медицинских формулировок;
 * 3) нет «выдуманных» чисел (крупные числа должны встречаться в фактах);
 * 4) разумная длина.
 */

const FORBIDDEN: Array<[RegExp, string]> = [
  [/срыв|сорвал/, 'срыв'],
  [/провал/, 'провал'],
  [/виноват/, 'виноват'],
  [/стыд/, 'стыд'],
  [/(?:^|\s)должн[аыо]?(?=\s|$)/, 'должны'],
  [/обязан/, 'обязаны'],
  [/надо было|нельзя было|не стоило/, 'надо было'],
  [/(?:^|\s)плох(?:о|ая|ой|ое|ие)(?=\s|$)/, 'плохо'],
  [/ужасн/, 'ужасно'],
  [/слаб\S* вол/, 'слабая воля'],
  [/обжор/, 'обжорство'],
  [/диагноз/, 'диагноз'],
  [/расстройств/, 'расстройство'],
  [/булими|анорекси|компульсив|депресси/, 'медицинский термин'],
  [/лечени|лекарств|препарат/, 'лечение'],
];

/** Эмоции, которые проверяем: основа слова → метка. */
const EMOTION_LEXICON: Array<{ label: string; stems: string[] }> = [
  { label: 'тревога', stems: ['тревог', 'тревожн'] },
  { label: 'раздражение', stems: ['раздраж'] },
  { label: 'одиночество', stems: ['одиноч', 'одинок'] },
  { label: 'скука', stems: ['скук', 'скучн', 'скучал'] },
  { label: 'усталость', stems: ['устал'] },
  { label: 'грусть', stems: ['груст'] },
  { label: 'стресс', stems: ['стресс'] },
  { label: 'радость', stems: ['радост'] },
  { label: 'спокойствие', stems: ['спокойств'] },
  { label: 'удовлетворение', stems: ['удовлетвор'] },
  { label: 'вина', stems: ['вины', 'вину', 'виной'] },
  { label: 'сожаление', stems: ['сожален', 'сожалел'] },
  { label: 'разочарование', stems: ['разочаров'] },
  { label: 'облегчение', stems: ['облегчени'] },
  { label: 'злость', stems: ['злост', 'злил', 'злюсь'] },
  { label: 'страх', stems: ['страх'] },
  { label: 'обида', stems: ['обид'] },
  { label: 'гнев', stems: ['гнев'] },
  { label: 'апатия', stems: ['апати'] },
  { label: 'печаль', stems: ['печал'] },
  { label: 'голод', stems: ['голод'] },
];

export function mentionedEmotions(text: string): Set<string> {
  const t = ` ${normalizeText(text)} `;
  const found = new Set<string>();
  for (const { label, stems } of EMOTION_LEXICON) {
    if (stems.some((s) => t.includes(s))) found.add(label);
  }
  return found;
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
}

function collectNumbers(value: unknown, out: Set<number>): void {
  if (typeof value === 'number') {
    out.add(Math.abs(value));
    out.add(Math.round(Math.abs(value)));
    out.add(Math.round(Math.abs(value) * 10) / 10);
  } else if (typeof value === 'string') {
    for (const n of numbersIn(value)) out.add(n);
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectNumbers(v, out);
  }
}

export interface GuardrailContext {
  /** Всё, что ученица сама написала или выбрала: эмоции, ситуации, комментарии. */
  userCorpus: string;
  /** Все числа, которые можно упоминать. */
  allowedNumbers: Set<number>;
  maxLength: number;
}

export function checkText(text: string, ctx: GuardrailContext): string[] {
  const violations: string[] = [];
  const norm = ` ${normalizeText(text)} `;

  for (const [re, name] of FORBIDDEN) {
    if (re.test(norm)) violations.push(`forbidden:${name}`);
  }

  const allowedEmotions = mentionedEmotions(ctx.userCorpus);
  for (const emotion of mentionedEmotions(text)) {
    if (!allowedEmotions.has(emotion)) violations.push(`invented_emotion:${emotion}`);
  }

  for (const n of numbersIn(text)) {
    // Небольшие числа (счётчики, «2–4 предложения», дни недели) не проверяем.
    if (n >= 10 && !ctx.allowedNumbers.has(n) && !ctx.allowedNumbers.has(Math.round(n))) {
      violations.push(`unknown_number:${n}`);
    }
  }

  if (text.length > ctx.maxLength) violations.push('too_long');
  if (text.trim().length === 0) violations.push('empty');
  return violations;
}

function dayCorpus(f: DayFacts): string {
  return f.episodes
    .flatMap((e) => [...e.situations, ...e.emotionsBefore, ...e.emotionsAfter, e.situationText ?? '', e.comment ?? ''])
    .join(' \n ');
}

function weekCorpus(f: WeekFacts): string {
  const b = f.behavior;
  return [
    ...b.topSituations.map((x) => x.label),
    ...b.topEmotionsBefore.map((x) => x.label),
    ...b.topEmotionsAfter.map((x) => x.label),
    ...b.combos.flatMap((c) => [c.situation, c.emotion]),
  ].join(' \n ');
}

export function checkDaySummary(value: DaySummaryText, facts: DayFacts): string[] {
  const allowedNumbers = new Set<number>();
  collectNumbers(facts, allowedNumbers);
  const ctx: GuardrailContext = { userCorpus: dayCorpus(facts), allowedNumbers, maxLength: 700 };
  const v = checkText(value.text, ctx);
  if (value.question) v.push(...checkText(value.question, { ...ctx, maxLength: 200 }).map((x) => `question:${x}`));
  return v;
}

export function checkWeeklyReport(value: WeeklyReportText, facts: WeekFacts): string[] {
  const allowedNumbers = new Set<number>();
  collectNumbers(facts, allowedNumbers);
  const ctx: GuardrailContext = { userCorpus: weekCorpus(facts), allowedNumbers, maxLength: 600 };
  const v = checkText(value.summary, ctx);
  for (const s of [...value.positives, ...value.observations, ...value.patterns, ...value.questions]) {
    v.push(...checkText(s, { ...ctx, maxLength: 300 }));
  }
  const total = [value.summary, ...value.positives, ...value.observations, ...value.patterns, ...value.questions].length;
  if (total > 20) v.push('too_many_items');
  return v;
}
