import { plural, type DayFacts, type WeekFacts } from '@hud/shared';
import type { DaySummaryText, WeeklyReportText } from './types';

/**
 * Шаблонные тексты без ИИ. Используются, если у ученицы нет согласия на ИИ-анализ,
 * если модель недоступна или если её ответ не прошёл проверку.
 */

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];
const list = (xs: string[]) => xs.join(', ');
const fmtKg = (n: number) => String(Math.abs(n)).replace('.', ',');
const fmtNum = (n: number | null) => (n == null ? '—' : String(Math.round(n)));

const DAY_QUESTIONS = [
  'Что сегодня помогло вам питаться в комфортном ритме?',
  'Что из сегодняшнего дня хотелось бы повторить завтра?',
  'Как вы чувствовали себя между приёмами пищи?',
  'Что сегодня было для вас приятным?',
];

function pick<T>(xs: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return xs[h % xs.length]!;
}

export function templateDaySummary(f: DayFacts): DaySummaryText {
  if (!f.hasEntries) {
    return {
      text:
        'За этот день записей о питании нет, поэтому сделать выводы не получится.' +
        (f.weightKg != null ? ` Вес внесён: ${fmtKg(f.weightKg)} кг.` : ''),
      question: null,
    };
  }

  const parts: string[] = [];
  const meals = `${f.mealsCount} ${plural(f.mealsCount, ['приём', 'приёма', 'приёмов'])} пищи`;
  parts.push(
    f.targets
      ? `Записано ${meals}, всего около ${f.kcal} ккал при ориентире ${f.targets.kcal} ккал.`
      : `Записано ${meals}, всего около ${f.kcal} ккал.`,
  );

  if (f.episodes.length === 0) {
    parts.push('Эпизодов переедания не отмечено.');
    return { text: parts.join(' '), question: pick(DAY_QUESTIONS, f.date) };
  }

  const when = f.episodes.map((e) => `${e.mealTypeLabel.toLowerCase()} в ${e.time}`);
  parts.push(
    f.episodes.length === 1
      ? `Отмечен эпизод переедания: ${when[0]}.`
      : `Отмечено ${f.episodes.length} ${plural(f.episodes.length, ['эпизод', 'эпизода', 'эпизодов'])} переедания: ${list(when)}.`,
  );

  const situations = uniq(f.episodes.flatMap((e) => e.situations));
  const before = uniq(f.episodes.flatMap((e) => e.emotionsBefore));
  const after = uniq(f.episodes.flatMap((e) => e.emotionsAfter));

  if (situations.length) parts.push(`Обстоятельства: ${list(situations)}.`);
  parts.push(before.length ? `Эмоции до еды: ${list(before)}.` : 'Эмоции до еды не указаны.');
  if (after.length) parts.push(`После еды: ${list(after)}.`);
  if (situations.length || before.length) {
    parts.push('Эти обстоятельства могут быть связаны с изменением пищевого поведения.');
  }

  return {
    text: parts.join(' '),
    question: 'Что могло бы поддержать вас в похожей ситуации в следующий раз?',
  };
}

export function templateWeeklyReport(f: WeekFacts): WeeklyReportText {
  const n = f.nutrition;
  const b = f.behavior;
  const w = f.weight;

  const summaryParts = [
    `Дневник заполнен ${n.daysWithEntries} ${plural(n.daysWithEntries, ['день', 'дня', 'дней'])} из 7.`,
  ];
  if (n.daysWithEntries > 0) {
    summaryParts.push(
      b.episodesCount === 0
        ? 'Эпизодов переедания не отмечено.'
        : `Отмечено ${b.episodesCount} ${plural(b.episodesCount, ['эпизод', 'эпизода', 'эпизодов'])} переедания.`,
    );
  }

  const positives: string[] = [];
  if (n.daysWithEntries >= 5) positives.push('Дневник вёлся регулярно — это хорошая основа для наблюдений.');
  if (w.changeKg != null && w.changeKg < 0) positives.push(`Вес снизился на ${fmtKg(w.changeKg)} кг.`);
  if (n.daysWithEntries > 0 && b.episodesCount === 0) positives.push('Эпизодов переедания за неделю не отмечено.');
  if (n.avgDiffKcal != null && n.avgDiffKcal <= 0) positives.push('Средняя калорийность — в пределах ориентира.');

  const observations: string[] = [];
  if (w.start == null) observations.push('Взвешиваний за неделю не было.');
  else if (w.changeKg == null) observations.push(`Вес внесён один раз: ${fmtKg(w.start)} кг.`);
  else {
    const sign = w.changeKg > 0 ? '+' : '−';
    observations.push(
      w.changeKg === 0
        ? `Вес: ${fmtKg(w.start)} → ${fmtKg(w.end!)} кг, без изменений.`
        : `Вес: ${fmtKg(w.start)} → ${fmtKg(w.end!)} кг (${sign}${fmtKg(w.changeKg)} кг).`,
    );
  }
  if (n.daysWithEntries === 0) {
    observations.push('Записей о питании за неделю нет.');
  } else {
    if (n.avgKcal != null) {
      observations.push(
        n.targetKcal != null
          ? `Средняя калорийность — ${n.avgKcal} ккал при ориентире ${n.targetKcal} ккал.`
          : `Средняя калорийность — ${n.avgKcal} ккал.`,
      );
    }
    if (n.avgProteinG != null) {
      observations.push(
        `В среднем за день: белки ${fmtNum(n.avgProteinG)} г, жиры ${fmtNum(n.avgFatG)} г, углеводы ${fmtNum(n.avgCarbsG)} г.`,
      );
    }
    if (n.daysOverTarget > 0) {
      observations.push(
        `${n.daysOverTarget} ${plural(n.daysOverTarget, ['день', 'дня', 'дней'])} с калорийностью выше ориентира.`,
      );
    }
  }

  const patterns: string[] = [];
  if (b.episodesCount > 0) {
    const topPart = [...b.byDayPart].sort((a, c) => c.count - a.count)[0];
    if (topPart && topPart.count >= 2) patterns.push(`Эпизоды чаще случались в это время суток: ${topPart.label} (${topPart.count}).`);
    const topDay = [...b.byWeekday].sort((a, c) => c.count - a.count)[0];
    if (topDay && topDay.count >= 2) patterns.push(`Чаще всего — ${topDay.label} (${topDay.count}).`);
    if (b.topSituations.length) {
      patterns.push(`Перед эпизодами отмечались обстоятельства: ${list(b.topSituations.map((s) => `${s.label} (${s.count})`))}.`);
    }
    if (b.topEmotionsBefore.length) {
      patterns.push(`Эмоции до еды: ${list(b.topEmotionsBefore.map((s) => `${s.label} (${s.count})`))}.`);
    }
    if (b.topEmotionsAfter.length) {
      patterns.push(`Эмоции после еды: ${list(b.topEmotionsAfter.map((s) => `${s.label} (${s.count})`))}.`);
    }
    for (const c of b.combos.slice(0, 2)) {
      patterns.push(`Повторялось сочетание: «${c.situation}» и «${c.emotion}» (${c.count} ${plural(c.count, ['раз', 'раза', 'раз'])}).`);
    }
  }

  const questions: string[] = [];
  if (b.episodesCount > 0) questions.push('Что обычно происходит перед эпизодами и что могло бы помочь в такие моменты?');
  const topSituation = b.topSituations[0];
  if (topSituation) questions.push(`Как можно поддержать себя, когда случается «${topSituation.label}»?`);
  if (n.daysWithEntries > 0 && n.daysWithEntries < 4) questions.push('Что мешало вести дневник в некоторые дни?');
  if (questions.length === 0) questions.push('Что на этой неделе получилось лучше всего?');

  return { summary: summaryParts.join(' '), positives, observations, patterns, questions };
}
