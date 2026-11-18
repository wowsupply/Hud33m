import {
  addDays,
  formatDateRu,
  MEAL_TYPE_LABELS,
  WEEKDAY_SHORT,
  weekStartOf,
  weekdayOf,
} from '@hud/shared';
import {
  Badge,
  Button,
  Card,
  cn,
  DayTotals,
  EmptyState,
  errorMessage,
  fmt0,
  fmt1,
  Input,
  PageLoader,
  signed1,
  todayLocal,
  toast,
} from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

type DayView = RouterOutputs['diary']['day'];

export function TodayPage() {
  const params = useParams();
  const today = todayLocal();
  const date = params.date ?? today;
  const trpc = useTRPC();
  const navigate = useNavigate();
  const day = useQuery(trpc.diary.day.queryOptions({ date }));

  const title = date === today ? 'Сегодня' : date === addDays(today, -1) ? 'Вчера' : formatDateRu(date);

  return (
    <div>
      <header className="flex items-center justify-between px-4 pb-1 pt-5">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
          <p className="text-sm text-stone-500">{formatDateRu(date, { withWeekday: true })}</p>
        </div>
        <div className="flex gap-1">
          <IconButton label="Предыдущий день" onClick={() => navigate(`/day/${addDays(date, -1)}`)} d="M15 5l-7 7 7 7" />
          <IconButton
            label="Следующий день"
            disabled={date >= today}
            onClick={() => navigate(addDays(date, 1) === today ? '/' : `/day/${addDays(date, 1)}`)}
            d="M9 5l7 7-7 7"
          />
        </div>
      </header>
      <WeekStrip date={date} today={today} />

      {day.isPending ? (
        <PageLoader />
      ) : day.error ? (
        <EmptyState title="Не удалось загрузить день" text={errorMessage(day.error)} />
      ) : (
        <DayContent day={day.data} />
      )}
    </div>
  );
}

function IconButton({ label, onClick, d, disabled }: { label: string; onClick: () => void; d: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d={d} />
      </svg>
    </button>
  );
}

function WeekStrip({ date, today }: { date: string; today: string }) {
  const trpc = useTRPC();
  const start = weekStartOf(date);
  const end = addDays(start, 6);
  const cal = useQuery(trpc.diary.calendar.queryOptions({ from: start, to: end }));
  return (
    <div className="mx-4 mt-2 grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const info = cal.data?.meals.find((m) => m.date === d);
        const future = d > today;
        return (
          <Link
            key={d}
            to={d === today ? '/' : `/day/${d}`}
            aria-disabled={future}
            onClick={(e) => future && e.preventDefault()}
            className={cn(
              'flex flex-col items-center rounded-xl py-1.5 text-xs',
              d === date ? 'bg-brand-600 text-white' : 'text-stone-600',
              future && 'opacity-40',
            )}
          >
            <span>{WEEKDAY_SHORT[weekdayOf(d) - 1]}</span>
            <span className="text-base font-semibold">{Number(d.slice(8))}</span>
            <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', info ? (d === date ? 'bg-white' : 'bg-brand-400') : 'bg-transparent')} />
          </Link>
        );
      })}
    </div>
  );
}

function DayContent({ day }: { day: DayView }) {
  const navigate = useNavigate();
  const sorted = day.meals;
  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      <WeightCard day={day} />

      <Card>
        <DayTotals facts={day.facts} />
        <Link
          to={`/day/${day.date}/summary`}
          className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-3.5 py-2.5 text-[15px] font-medium text-brand-800"
        >
          Итоги дня
          <span aria-hidden>→</span>
        </Link>
      </Card>

      <div className="mt-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Приёмы пищи</h2>
        {day.dayCommentsCount > 0 && (
          <Link to="/feedback">
            <Badge tone="brand">Комментарий наставника</Badge>
          </Link>
        )}
      </div>

      {sorted.length === 0 ? (
        <Card className="text-center text-sm text-stone-500">Записей пока нет</Card>
      ) : (
        sorted.map((m) => (
          <Card key={m.id} className="cursor-pointer active:bg-stone-50" onClick={() => navigate(`/meal/${m.id}`)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{MEAL_TYPE_LABELS[m.mealType]}</span>
                  <span className="text-sm text-stone-500">{m.time}</span>
                  {m.isOvereating && <Badge tone="warm">переедание</Badge>}
                  {m.commentsCount > 0 && <Badge tone="brand">💬 {m.commentsCount}</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-stone-600">{m.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums text-stone-900">{fmt0(m.kcal)}</div>
                <div className="text-xs text-stone-500">ккал</div>
              </div>
            </div>
          </Card>
        ))
      )}

      {day.canWrite && (
        <Button size="lg" className="mt-2" onClick={() => navigate(`/meal/new?date=${day.date}`)}>
          + Добавить приём пищи
        </Button>
      )}
    </div>
  );
}

function WeightCard({ day }: { day: DayView }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const save = useMutation(
    trpc.diary.saveWeight.mutationOptions({
      onSuccess: async () => {
        setEditing(false);
        await qc.invalidateQueries({ queryKey: trpc.diary.pathKey() });
        toast('Вес сохранён', 'success');
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const weight = day.weight?.weightKg ?? null;
  const delta = day.facts.weightDeltaKg;
  const kg = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && kg >= 30 && kg <= 350;

  if (weight != null && !editing) {
    return (
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-xs text-stone-500">Утренний вес</div>
          <div className="text-2xl font-semibold text-stone-900">
            {fmt1(weight)} <span className="text-base font-normal text-stone-500">кг</span>
          </div>
          {delta != null && <div className="text-sm text-stone-500">{signed1(delta)} кг к прошлому взвешиванию</div>}
        </div>
        {day.canWrite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue(String(weight).replace('.', ','));
              setEditing(true);
            }}
          >
            Изменить
          </Button>
        )}
      </Card>
    );
  }
  if (!day.canWrite) {
    return <Card className="text-sm text-stone-500">Вес в этот день не вносился</Card>;
  }
  return (
    <Card>
      <div className="mb-2 text-sm font-medium text-stone-700">Утренний вес</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate({ date: day.date, weightKg: kg });
        }}
      >
        <Input inputMode="decimal" placeholder="кг, например 72,4" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" disabled={!valid} loading={save.isPending}>
          Сохранить
        </Button>
      </form>
    </Card>
  );
}
