import type { DayFacts } from '@hud/shared';
import { fmt0 } from './utils';

/** Кольцо калорий: съедено / ориентир. Превышение показывается нейтрально, без красного. */
export function KcalRing({ kcal, target, size = 132 }: { kcal: number; target: number | null; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = target ? Math.min(kcal / target, 1) : 0;
  const over = target != null && kcal > target;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece9e4" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--color-brand-700)' : 'var(--color-brand-500)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold leading-none text-stone-900">{fmt0(kcal)}</span>
        <span className="mt-1 text-xs text-stone-500">{target ? `из ${fmt0(target)} ккал` : 'ккал'}</span>
      </div>
    </div>
  );
}

const MACROS = [
  { key: 'protein', label: 'Белки', color: 'var(--color-protein)' },
  { key: 'fat', label: 'Жиры', color: 'var(--color-fat)' },
  { key: 'carbs', label: 'Углеводы', color: 'var(--color-carbs)' },
] as const;

export function MacroBars({
  protein,
  fat,
  carbs,
  targets,
}: {
  protein: number;
  fat: number;
  carbs: number;
  targets: { proteinG: number; fatG: number; carbsG: number } | null;
}) {
  const values = { protein, fat, carbs };
  const t = targets ? { protein: targets.proteinG, fat: targets.fatG, carbs: targets.carbsG } : null;
  return (
    <div className="flex flex-col gap-2.5">
      {MACROS.map((m) => {
        const v = values[m.key];
        const target = t?.[m.key] ?? null;
        const ratio = target ? Math.min(v / target, 1) : 0;
        return (
          <div key={m.key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-stone-600">{m.label}</span>
              <span className="tabular-nums text-stone-800">
                {fmt0(v)}
                {target ? <span className="text-stone-400"> / {target} г</span> : ' г'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: m.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MacroShare({ percents }: { percents: { protein: number; fat: number; carbs: number } }) {
  const total = percents.protein + percents.fat + percents.carbs;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
        {total > 0 &&
          MACROS.map((m) => (
            <div key={m.key} style={{ width: `${percents[m.key]}%`, background: m.color }} title={`${m.label}: ${percents[m.key]}%`} />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        {MACROS.map((m) => (
          <span key={m.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.label} {percents[m.key]}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** Разница факта и ориентира — нейтральной формулировкой. */
export function kcalDiffText(diff: number | null): string | null {
  if (diff == null) return null;
  if (Math.abs(diff) < 50) return 'В пределах ориентира';
  return diff > 0 ? `На ${fmt0(diff)} ккал больше ориентира` : `Ещё ${fmt0(-diff)} ккал до ориентира`;
}

export function DayTotals({ facts }: { facts: DayFacts }) {
  return (
    <div className="flex items-center gap-5">
      <KcalRing kcal={facts.kcal} target={facts.targets?.kcal ?? null} />
      <div className="min-w-0 flex-1">
        <MacroBars protein={facts.proteinG} fat={facts.fatG} carbs={facts.carbsG} targets={facts.targets} />
        {facts.hasEntries && kcalDiffText(facts.diffKcal) && (
          <p className="mt-3 text-xs text-stone-500">{kcalDiffText(facts.diffKcal)}</p>
        )}
      </div>
    </div>
  );
}

