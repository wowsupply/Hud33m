import { formatWeekRu } from '@hud/shared';
import { Badge, Card, EmptyState, errorMessage, PageLoader } from '@hud/ui';
import { WeeklyReportBody } from '@hud/ui/charts';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { BackLink, PageHeader } from '../components/AppShell';
import { useTRPC } from '../lib/trpc';

export function ReportsPage() {
  const trpc = useTRPC();
  const weeks = useQuery(trpc.insights.weeks.queryOptions());
  return (
    <div>
      <PageHeader title="Отчёты" subtitle="Итоги по неделям" />
      <div className="flex flex-col gap-2 px-4">
        {weeks.isPending ? (
          <PageLoader />
        ) : !weeks.data?.length ? (
          <EmptyState title="Отчётов пока нет" text="Первый отчёт появится после недели ведения дневника." />
        ) : (
          weeks.data.map((w) => (
            <Link key={w.weekStart} to={`/reports/${w.weekStart}`}>
              <Card className="flex items-center justify-between active:bg-stone-50">
                <span className="font-medium text-stone-900">{formatWeekRu(w.weekStart)}</span>
                {w.isCurrent ? <Badge tone="warm">неделя идёт</Badge> : w.hasReport ? <Badge tone="brand">готов</Badge> : <span className="text-stone-400">→</span>}
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function ReportPage() {
  const { weekStart = '' } = useParams();
  const trpc = useTRPC();
  const report = useQuery(trpc.insights.weeklyReport.queryOptions({ weekStart }));
  return (
    <div>
      <PageHeader title="Отчёт за неделю" subtitle={formatWeekRu(weekStart)} back={<BackLink to="/reports" />} />
      <div className="px-4">
        {report.isPending ? (
          <PageLoader />
        ) : report.error ? (
          <EmptyState title="Не удалось загрузить отчёт" text={errorMessage(report.error)} />
        ) : (
          <>
            {report.data.mentorComment && (
              <Card className="mb-4 bg-brand-50/60 ring-brand-100">
                <div className="mb-1 text-sm font-semibold text-brand-800">Комментарий наставника</div>
                <p className="whitespace-pre-line text-[15px] text-stone-800">{report.data.mentorComment}</p>
              </Card>
            )}
            <WeeklyReportBody facts={report.data.facts} text={report.data.text} isFinal={report.data.isFinal} />
          </>
        )}
      </div>
    </div>
  );
}
