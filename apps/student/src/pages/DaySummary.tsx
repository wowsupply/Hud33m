import { AI_DISCLAIMER, formatDateRu, MEAL_TYPE_LABELS } from '@hud/shared';
import { Card, DayTotals, EmptyState, errorMessage, fmt0, MacroShare, PageLoader, todayLocal } from '@hud/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { BackLink, PageHeader } from '../components/AppShell';
import { useTRPC } from '../lib/trpc';

export function DaySummaryPage() {
  const { date = todayLocal() } = useParams();
  const trpc = useTRPC();
  const summary = useQuery({ ...trpc.insights.daySummary.queryOptions({ date }), staleTime: 0 });
  const back = date === todayLocal() ? '/' : `/day/${date}`;

  return (
    <div>
      <PageHeader title="Итоги дня" subtitle={formatDateRu(date, { withWeekday: true })} back={<BackLink to={back} />} />
      {summary.isPending ? (
        <div className="px-4">
          <PageLoader />
          <p className="text-center text-sm text-stone-500">Готовим итоги…</p>
        </div>
      ) : summary.error || !summary.data ? (
        <EmptyState title="Не удалось сформировать итоги" text={summary.error ? errorMessage(summary.error) : undefined} />
      ) : (
        <div className="flex flex-col gap-3 px-4">
          <Card>
            <DayTotals facts={summary.data.facts} />
          </Card>

          <Card>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-stone-500">Съедено</div>
                <div className="text-lg font-semibold">{fmt0(summary.data.facts.kcal)}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Ориентир</div>
                <div className="text-lg font-semibold">{fmt0(summary.data.facts.targets?.kcal)}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Разница</div>
                <div className="text-lg font-semibold">
                  {summary.data.facts.diffKcal == null ? '—' : `${summary.data.facts.diffKcal > 0 ? '+' : ''}${fmt0(summary.data.facts.diffKcal)}`}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs text-stone-500">Доля белков, жиров и углеводов</div>
              <MacroShare percents={summary.data.facts.percents} />
            </div>
            <div className="mt-4 flex flex-col gap-1 text-sm text-stone-600">
              <span>Приёмов пищи: {summary.data.facts.mealsCount}</span>
              <span>
                Эпизоды переедания: {summary.data.facts.episodes.length ? summary.data.facts.episodes.map((e) => `${MEAL_TYPE_LABELS[e.mealType].toLowerCase()} ${e.time}`).join(', ') : 'нет'}
              </span>
            </div>
          </Card>

          <Card className="bg-brand-50/60 ring-brand-100">
            <div className="mb-2 text-sm font-semibold text-brand-800">Наблюдение дня</div>
            <p className="text-[15px] leading-relaxed text-stone-800">{summary.data.text}</p>
            {summary.data.question && (
              <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[15px] italic text-stone-700">{summary.data.question}</p>
            )}
            <p className="mt-3 text-xs text-stone-500">{AI_DISCLAIMER}</p>
          </Card>

          <Link to={back} className="py-2 text-center text-brand-700">
            Вернуться к дневнику
          </Link>
        </div>
      )}
    </div>
  );
}
