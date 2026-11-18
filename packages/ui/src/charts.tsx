import {
  AI_DISCLAIMER,
  formatDateRu,
  plural,
  WEEKDAY_SHORT,
  weekdayOf,
  type WeekFacts,
} from '@hud/shared';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from './components';
import { cn, fmt0, fmt1, signed1 } from './utils';

/** Графики и отчёты (recharts) — отдельный модуль, чтобы не утяжелять первую загрузку. */

export function WeightChart({
  entries,
  targetWeightKg,
  height = 220,
}: {
  entries: Array<{ date: string; weightKg: number }>;
  targetWeightKg: number | null;
  height?: number;
}) {
  const data = entries.map((e) => ({ ...e, label: formatDateRu(e.date).replace(/ (\S{3})\S*$/, ' $1') }));
  const values = entries.map((e) => e.weightKg);
  if (targetWeightKg) values.push(targetWeightKg);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0ede8" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis domain={[min, max]} tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v: number) => [`${fmt1(v)} кг`, 'Вес']}
            labelStyle={{ color: '#57534e' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }}
          />
          {targetWeightKg && (
            <ReferenceLine
              y={targetWeightKg}
              stroke="var(--color-brand-400)"
              strokeDasharray="5 5"
              label={{ value: `цель ${fmt1(targetWeightKg)}`, position: 'insideTopRight', fontSize: 11, fill: '#52876a' }}
            />
          )}
          <Line type="monotone" dataKey="weightKg" stroke="var(--color-brand-600)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KcalWeekChart({ days }: { days: WeekFacts['days'] }) {
  const target = days.find((d) => d.targetKcal)?.targetKcal ?? null;
  const data = days.map((d) => ({ label: WEEKDAY_SHORT[weekdayOf(d.date) - 1], kcal: d.kcal || null }));
  return (
    <div style={{ height: 170 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f0ede8" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v: number) => [`${fmt0(v)} ккал`, 'Калорийность']} contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4' }} />
          {target && <ReferenceLine y={target} stroke="var(--color-brand-400)" strokeDasharray="5 5" />}
          <Bar dataKey="kcal" fill="var(--color-brand-400)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-stone-900">{value}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-stone-800">{title}</h4>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-snug text-stone-700">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface WeeklyText {
  summary: string;
  positives: string[];
  observations: string[];
  patterns: string[];
  questions: string[];
}

/** Недельный отчёт: цифры (код) + текст (ИИ или шаблон). Общий для ученицы и наставника. */
export function WeeklyReportBody({ facts, text, isFinal }: { facts: WeekFacts; text: WeeklyText; isFinal: boolean }) {
  const w = facts.weight;
  const n = facts.nutrition;
  const b = facts.behavior;
  return (
    <div className="flex flex-col gap-4">
      {!isFinal && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Неделя ещё идёт — это предварительные итоги. Полный отчёт появится в понедельник.
        </p>
      )}

      <Card>
        <p className="text-[15px] leading-relaxed text-stone-800">{text.summary}</p>
        <div className="mt-4 flex flex-col gap-4">
          <List title="Что получилось" items={text.positives} />
          <List title="Наблюдения" items={text.observations} />
          <List title="Повторяющиеся ситуации" items={text.patterns} />
          <List title="Что можно обсудить с наставником" items={text.questions} />
        </div>
        <p className="mt-4 text-xs text-stone-400">{AI_DISCLAIMER}</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-stone-900">Вес</h3>
        {w.start == null ? (
          <p className="text-sm text-stone-500">Взвешиваний за неделю не было.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="В начале" value={`${fmt1(w.start)} кг`} hint={w.startDate ? formatDateRu(w.startDate) : undefined} />
            <Stat label="В конце" value={w.end != null ? `${fmt1(w.end)} кг` : '—'} hint={w.endDate ? formatDateRu(w.endDate) : 'нет данных'} />
            <Stat label="Изменение" value={w.changeKg != null ? `${signed1(w.changeKg)} кг` : '—'} hint={w.toGoalKg != null ? `до цели ${fmt1(Math.max(w.toGoalKg, 0))} кг` : undefined} />
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-stone-900">Питание</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Дней с записями" value={`${n.daysWithEntries} из 7`} hint={`полных: ${n.fullDays}`} />
          <Stat label="Средняя калорийность" value={n.avgKcal != null ? `${fmt0(n.avgKcal)}` : '—'} hint={n.targetKcal ? `ориентир ${fmt0(n.targetKcal)}` : undefined} />
          <Stat
            label="Среднее отклонение"
            value={n.avgDiffKcal != null ? `${n.avgDiffKcal > 0 ? '+' : n.avgDiffKcal < 0 ? '−' : ''}${fmt0(Math.abs(n.avgDiffKcal))}` : '—'}
            hint="ккал в день"
          />
          <Stat label="Дней выше ориентира" value={n.daysOverTarget} />
        </div>
        {n.avgProteinG != null && (
          <p className="mt-3 text-sm text-stone-600">
            В среднем: белки {fmt0(n.avgProteinG)} г · жиры {fmt0(n.avgFatG)} г · углеводы {fmt0(n.avgCarbsG)} г
          </p>
        )}
        {n.daysWithEntries > 0 && (
          <div className="mt-3">
            <KcalWeekChart days={facts.days} />
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-stone-900">Пищевое поведение</h3>
        {b.episodesCount === 0 ? (
          <p className="text-sm text-stone-500">Эпизодов переедания не отмечено.</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm text-stone-700">
            <p>
              Отмечено {b.episodesCount} {plural(b.episodesCount, ['эпизод', 'эпизода', 'эпизодов'])} переедания.
            </p>
            <CountRow title="По времени суток" items={b.byDayPart.filter((d) => d.count).map((d) => ({ label: d.label, count: d.count }))} />
            <CountRow title="По дням" items={b.byWeekday.filter((d) => d.count).map((d) => ({ label: d.label, count: d.count }))} />
            <CountRow title="Ситуации" items={b.topSituations} />
            <CountRow title="Эмоции до еды" items={b.topEmotionsBefore} />
            <CountRow title="Эмоции после еды" items={b.topEmotionsAfter} />
            {b.combos.length > 0 && (
              <CountRow title="Повторяющиеся сочетания" items={b.combos.map((c) => ({ label: `${c.situation} + ${c.emotion}`, count: c.count }))} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function CountRow({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i.label} className={cn('rounded-full bg-stone-100 px-2.5 py-1 text-[13px] text-stone-700')}>
            {i.label} · {i.count}
          </span>
        ))}
      </div>
    </div>
  );
}
