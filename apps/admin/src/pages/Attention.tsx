import { formatDateRu, MEAL_TYPE_LABELS, plural } from '@hud/shared';
import { Card, PageLoader } from '@hud/ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageTitle } from '../components/Shell';
import { useTRPC } from '../lib/trpc';

export function AttentionPage() {
  const trpc = useTRPC();
  const data = useQuery({ ...trpc.admin.attention.queryOptions(), refetchInterval: 30_000 });
  if (data.isPending) return <PageLoader />;
  if (!data.data) return null;
  const a = data.data;
  return (
    <div>
      <PageTitle title="Требуют внимания" subtitle={`Учениц: ${a.totals.students}, активных: ${a.totals.active}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="Новые эпизоды переедания" hint="за 3 дня, без вашего комментария" empty="Новых эпизодов нет" count={a.episodes.length}>
          {a.episodes.map((e) => (
            <Row key={e.id} to={`/students/${e.userId}/diary?date=${e.diaryDate}`} title={e.studentName} meta={`${MEAL_TYPE_LABELS[e.mealType]}, ${formatDateRu(e.diaryDate)}, ${e.localTime}`} />
          ))}
        </Block>
        <Block title="Ответы учениц" empty="Непрочитанных ответов нет" count={a.replies.length}>
          {a.replies.map((r) => (
            <Row key={r.id} to={`/students/${r.id}/comments`} title={r.name} meta={`${r.count} ${plural(r.count, ['новый ответ', 'новых ответа', 'новых ответов'])}`} />
          ))}
        </Block>
        <Block title="Не ведут дневник" hint="2 дня и больше без записей" empty="Все ведут дневник" count={a.inactive.length}>
          {a.inactive.map((s) => (
            <Row
              key={s.id}
              to={`/students/${s.id}`}
              title={s.name}
              meta={s.lastEntryDate ? `последняя запись ${formatDateRu(s.lastEntryDate)} (${s.daysWithoutEntries} ${plural(s.daysWithoutEntries ?? 0, ['день', 'дня', 'дней'])} назад)` : 'записей ещё нет'}
            />
          ))}
        </Block>
        <Block title="Доступ заканчивается" hint="в ближайшие 7 дней" empty="Ни у кого не заканчивается" count={a.ending.length}>
          {a.ending.map((s) => (
            <Row key={s.id} to={`/students/${s.id}/access`} title={s.name} meta={`до ${formatDateRu(s.endsOn)} · осталось ${s.daysLeft} ${plural(s.daysLeft ?? 0, ['день', 'дня', 'дней'])}`} />
          ))}
        </Block>
        <Block title="Ещё не начали" hint="не заполнили анкету" empty="Все начали" count={a.notStarted.length}>
          {a.notStarted.map((s) => (
            <Row key={s.id} to={`/students/${s.id}/profile`} title={s.name} meta={s.lastLoginAt ? 'входила, но не заполнила анкету' : 'ещё не входила в приложение'} />
          ))}
        </Block>
      </div>
    </div>
  );
}

function Block({ title, hint, empty, count, children }: { title: string; hint?: string; empty: string; count: number; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-stone-900">
          {title} {count > 0 && <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-sm text-brand-800">{count}</span>}
        </h2>
        {hint && <span className="text-xs text-stone-500">{hint}</span>}
      </div>
      {count === 0 ? <p className="py-3 text-sm text-stone-400">{empty}</p> : <div className="divide-y divide-stone-100">{children}</div>}
    </Card>
  );
}

function Row({ to, title, meta }: { to: string; title: string; meta: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
      <span className="font-medium">{title}</span>
      <span className="text-right text-sm text-stone-500">{meta}</span>
    </Link>
  );
}
