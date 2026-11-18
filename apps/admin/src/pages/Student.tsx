import {
  ACTIVITY_INFO,
  addDays,
  AI_DISCLAIMER,
  computeTargets,
  ageFromBirthDate,
  ENROLLMENT_STATUS_LABELS,
  formatDateRu,
  formatPhone,
  formatWeekRu,
  MEAL_TYPE_LABELS,
  WEEKDAY_SHORT,
  weekStartOf,
  weekdayOf,
  type CommentTarget,
} from '@hud/shared';
import {
  Badge,
  Button,
  Card,
  cn,
  DayTotals,
  EmptyState,
  errorMessage,
  Field,
  fmt0,
  fmt1,
  Input,
  PageLoader,
  signed1,
  Switch,
  Textarea,
  todayLocal,
  toast,
} from '@hud/ui';
import { WeeklyReportBody, WeightChart } from '@hud/ui/charts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTRPC, type RouterOutputs } from '../lib/trpc';
import { TIMEZONES } from './Students';

type Card_ = RouterOutputs['admin']['students']['get'];
type Thread = RouterOutputs['admin']['students']['threads'][number];

const TABS = [
  ['overview', 'Обзор'],
  ['diary', 'Дневник'],
  ['reports', 'Отчёты'],
  ['emotions', 'Эмоции'],
  ['targets', 'Цели'],
  ['access', 'Доступ'],
  ['comments', 'Общение'],
  ['profile', 'Профиль'],
] as const;

const dt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function StudentPage() {
  const { id = '', tab = 'overview' } = useParams();
  const trpc = useTRPC();
  const card = useQuery(trpc.admin.students.get.queryOptions({ studentId: id }));
  if (card.isPending) return <PageLoader />;
  if (card.error) return <EmptyState title="Нет доступа к ученице" text={errorMessage(card.error)} />;
  const c = card.data;
  const enrollment = c.enrollments[0];

  return (
    <div>
      <Link to="/students" className="text-sm text-stone-500 hover:text-stone-800">
        ← Все ученицы
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            {c.student.firstName} {c.student.lastName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
            <span>{formatPhone(c.student.phone)}</span>
            {enrollment && (
              <>
                <span>{enrollment.programName ?? 'Без программы'}</span>
                <span>
                  {formatDateRu(enrollment.startsOn)} — {formatDateRu(enrollment.endsOn)}
                </span>
                <Badge tone={enrollment.status === 'active' ? 'brand' : 'neutral'}>{ENROLLMENT_STATUS_LABELS[enrollment.status]}</Badge>
              </>
            )}
            {c.student.lastSeenAt && <span>была в приложении {dt.format(new Date(c.student.lastSeenAt))}</span>}
          </div>
        </div>
      </div>
      <div className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 lg:mx-0 lg:px-0">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            to={`/students/${id}/${key}`}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-[15px]',
              tab === key ? 'border-brand-600 font-medium text-brand-800' : 'border-transparent text-stone-500 hover:text-stone-800',
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab card={c} />}
      {tab === 'diary' && <DiaryTab studentId={id} />}
      {tab === 'reports' && <ReportsTab studentId={id} />}
      {tab === 'emotions' && <EmotionsTab studentId={id} />}
      {tab === 'targets' && <TargetsTab card={c} />}
      {tab === 'access' && <AccessTab card={c} />}
      {tab === 'comments' && <CommentsTab studentId={id} />}
      {tab === 'profile' && <ProfileTab card={c} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-[15px] text-stone-900">{value}</div>
    </div>
  );
}

function OverviewTab({ card }: { card: Card_ }) {
  const trpc = useTRPC();
  const id = card.student.id;
  const weights = useQuery(trpc.admin.students.weights.queryOptions({ studentId: id }));
  const today = todayLocal();
  const from = addDays(today, -13);
  const cal = useQuery(trpc.admin.students.calendar.queryOptions({ studentId: id, from, to: today }));
  const q = card.questionnaire;
  const t = card.targets;
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <h3 className="mb-2 font-semibold">Вес</h3>
        {weights.data?.entries.length ? (
          <WeightChart entries={weights.data.entries} targetWeightKg={weights.data.targetWeightKg} />
        ) : (
          <p className="text-sm text-stone-500">Взвешиваний пока нет.</p>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Стартовые данные</h3>
        {q ? (
          <div className="grid grid-cols-2 gap-3">
            <Info label="Вес на старте" value={`${fmt1(q.weightKg)} кг`} />
            <Info label="Желаемый вес" value={`${fmt1(q.targetWeightKg)} кг`} />
            <Info label="Рост" value={`${fmt0(q.heightCm)} см`} />
            <Info label="Возраст" value={ageFromBirthDate(q.birthDate, today)} />
            <Info label="Активность" value={ACTIVITY_INFO[q.activityLevel].label} />
            <Info label="Последний вес" value={card.lastWeight ? `${fmt1(card.lastWeight.weightKg)} кг` : '—'} />
            <Info label="Цель, ккал" value={t ? fmt0(t.kcal) : '—'} />
            <Info label="Б / Ж / У" value={t ? `${t.proteinG} / ${t.fatG} / ${t.carbsG}` : '—'} />
          </div>
        ) : (
          <p className="text-sm text-stone-500">Анкета ещё не заполнена.</p>
        )}
        {q && (q.pregnancyOrLactation || q.medicalConditions || q.edHistory) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {q.pregnancyOrLactation && <Badge tone="warm">беременность / ГВ</Badge>}
            {q.medicalConditions && <Badge tone="warm">заболевания</Badge>}
            {q.edHistory && <Badge tone="warm">опыт РПП</Badge>}
          </div>
        )}
        {t?.requiresReview && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Расчёт целей требует вашей проверки — см. вкладку «Цели».</p>}
      </Card>
      <Card className="xl:col-span-3">
        <h3 className="mb-3 font-semibold">Последние 14 дней</h3>
        <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
          {days.map((d) => {
            const m = cal.data?.meals.find((x) => x.date === d);
            const w = cal.data?.weights.find((x) => x.date === d);
            return (
              <Link key={d} to={`/students/${id}/diary?date=${d}`} className={cn('rounded-xl p-2 text-center ring-1', m ? 'bg-white ring-stone-200' : 'bg-stone-50 ring-stone-100')}>
                <div className="text-[11px] text-stone-500">
                  {WEEKDAY_SHORT[weekdayOf(d) - 1]} {Number(d.slice(8))}
                </div>
                <div className="text-sm font-semibold">{m ? fmt0(m.kcal) : '—'}</div>
                <div className="text-[11px] text-stone-500">{m ? `${m.mealsCount} пр.` : ''}</div>
                {m && m.episodes > 0 && <div className="mt-0.5 text-[11px] text-amber-700">переед. {m.episodes}</div>}
                {w && <div className="text-[11px] text-brand-700">{fmt1(w.weightKg)}</div>}
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function useThreads(studentId: string) {
  const trpc = useTRPC();
  const threads = useQuery({ ...trpc.admin.students.threads.queryOptions({ studentId }), refetchInterval: 30_000 });
  const byTarget = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const t of threads.data ?? []) map.set(`${t.targetType}:${t.targetId}`, t);
    return map;
  }, [threads.data]);
  return { threads, byTarget };
}

function CommentBox({ studentId, targetType, targetId, thread, compact }: { studentId: string; targetType: CommentTarget; targetId: string; thread?: Thread; compact?: boolean }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const send = useMutation(
    trpc.admin.students.comment.mutationOptions({
      onSuccess: async () => {
        setBody('');
        setOpen(false);
        await qc.invalidateQueries({ queryKey: trpc.admin.pathKey() });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  return (
    <div className={cn(!compact && 'mt-3')}>
      {thread && (
        <div className="mb-2 flex flex-col gap-1.5">
          {thread.comments.map((c) => (
            <div key={c.id} className={cn('rounded-xl px-3 py-2 text-sm', c.author.isStaff ? 'bg-brand-50' : 'bg-stone-100')}>
              <span className="font-medium">{c.author.isStaff ? c.author.name : 'Ученица'}:</span> <span className="whitespace-pre-line">{c.body}</span>
              <span className="ml-2 text-[11px] text-stone-400">{dt.format(new Date(c.createdAt))}</span>
            </div>
          ))}
        </div>
      )}
      {open ? (
        <div className="flex flex-col gap-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ваш комментарий" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" disabled={!body.trim()} loading={send.isPending} onClick={() => send.mutate({ studentId, targetType, targetId, parentId: null, body })}>
              Отправить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => setOpen(true)}>
          {thread ? 'Добавить комментарий' : 'Комментировать'}
        </button>
      )}
    </div>
  );
}

function DiaryTab({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const date = params.get('date') ?? today;
  const setDate = (d: string) => setParams({ date: d });
  const day = useQuery({ ...trpc.admin.students.day.queryOptions({ studentId, date }), refetchInterval: 30_000 });
  const { byTarget } = useThreads(studentId);
  const gen = useMutation(
    trpc.admin.students.generateDaySummary.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.students.day.queryKey({ studentId, date }) }),
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))}>
          ←
        </Button>
        <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
        <Button variant="secondary" size="sm" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
          →
        </Button>
        <span className="ml-2 text-stone-600">{formatDateRu(date, { withWeekday: true })}</span>
      </div>
      {day.isPending ? (
        <PageLoader />
      ) : !day.data ? null : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-3 xl:col-span-2">
            {day.data.meals.length === 0 && <Card className="text-sm text-stone-500">В этот день приёмов пищи не записано.</Card>}
            {day.data.meals.map((m) => (
              <Card key={m.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{MEAL_TYPE_LABELS[m.mealType]}</span>
                    <span className="text-sm text-stone-500">{m.time}</span>
                    {m.isOvereating && <Badge tone="warm">переедание</Badge>}
                    {m.inputMethod === 'repeat' && <Badge>повтор</Badge>}
                  </div>
                  <span className="font-semibold">{fmt0(m.kcal)} ккал</span>
                </div>
                {m.rawInput && <p className="mt-1 text-sm italic text-stone-500">«{m.rawInput}»</p>}
                <table className="mt-2 w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {m.items.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5 pr-2">
                          {i.name}
                          {i.valueSource === 'ai' && <span className="ml-1 text-xs text-amber-700">(оценка ИИ)</span>}
                          {i.valueSource === 'manual' && <span className="ml-1 text-xs text-stone-500">(вручную)</span>}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-stone-600">
                          {i.isEstimated ? '≈' : ''}
                          {fmt0(i.grams)} г
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right text-stone-600">
                          {fmt0(i.kcal)} ккал · Б{fmt0(i.protein)} Ж{fmt0(i.fat)} У{fmt0(i.carbs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {m.note && (
                  <div className="mt-3 grid gap-2 rounded-xl bg-amber-50/60 p-3 text-sm sm:grid-cols-2">
                    <Info label="Ситуация" value={[...m.note.situationTags, m.note.situationText].filter(Boolean).join(' · ') || '—'} />
                    <Info label="Эмоции до" value={m.note.emotionsBefore.join(', ') || '—'} />
                    <Info label="Эмоции после" value={m.note.emotionsAfter.join(', ') || '—'} />
                    <Info label="Комментарий" value={m.note.comment || '—'} />
                  </div>
                )}
                <CommentBox studentId={studentId} targetType="meal" targetId={m.id} thread={byTarget.get(`meal:${m.id}`)} />
              </Card>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Итоги дня</h3>
                {day.data.weight && <span className="text-sm text-stone-600">вес {fmt1(day.data.weight.weightKg)} кг</span>}
              </div>
              <DayTotals facts={day.data.facts} />
            </Card>
            <Card>
              <h3 className="mb-2 font-semibold">Резюме дня</h3>
              {day.data.summary ? (
                <>
                  <p className="text-[15px] leading-relaxed text-stone-800">{day.data.summary.text}</p>
                  {day.data.summary.question && <p className="mt-2 text-sm italic text-stone-600">{day.data.summary.question}</p>}
                  <p className="mt-2 text-xs text-stone-400">
                    {day.data.summary.engine === 'local' ? 'шаблон' : `ИИ: ${day.data.summary.engine}`} · {AI_DISCLAIMER}
                  </p>
                </>
              ) : (
                <Button size="sm" variant="secondary" loading={gen.isPending} onClick={() => gen.mutate({ studentId, date })} disabled={!day.data.facts.hasEntries}>
                  Сформировать резюме
                </Button>
              )}
            </Card>
            <Card>
              <h3 className="mb-1 font-semibold">Комментарий ко дню</h3>
              <CommentBox studentId={studentId} targetType="day" targetId={date} thread={byTarget.get(`day:${date}`)} compact />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportsTab({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const weeks = useQuery(trpc.admin.students.weeks.queryOptions({ studentId }));
  const [params, setParams] = useSearchParams();
  const selected = params.get('week') ?? weeks.data?.find((w) => !w.isCurrent)?.weekStart ?? weeks.data?.[0]?.weekStart;
  if (weeks.isPending) return <PageLoader />;
  if (!weeks.data?.length || !selected) return <EmptyState title="Отчётов пока нет" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
        {weeks.data.map((w) => (
          <button
            key={w.weekStart}
            type="button"
            onClick={() => setParams({ week: w.weekStart })}
            className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm', selected === w.weekStart ? 'bg-brand-50 font-medium text-brand-800' : 'text-stone-600 hover:bg-stone-50')}
          >
            {formatWeekRu(w.weekStart)} {w.isCurrent && <span className="text-xs text-amber-700">· идёт</span>}
          </button>
        ))}
      </div>
      <WeekReport studentId={studentId} weekStart={selected} />
    </div>
  );
}

function WeekReport({ studentId, weekStart }: { studentId: string; weekStart: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const report = useQuery(trpc.admin.students.weeklyReport.queryOptions({ studentId, weekStart }));
  const [comment, setComment] = useState('');
  useEffect(() => setComment(report.data?.mentorComment ?? ''), [report.data?.mentorComment]);
  const save = useMutation(
    trpc.admin.students.setWeeklyComment.mutationOptions({
      onSuccess: async () => {
        toast('Комментарий сохранён — ученица увидит его в отчёте', 'success');
        await qc.invalidateQueries({ queryKey: trpc.admin.students.weeklyReport.queryKey({ studentId, weekStart }) });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  if (report.isPending) return <PageLoader />;
  if (!report.data) return null;
  return (
    <div className="flex flex-col gap-4">
      {report.data.isFinal && (
        <Card>
          <h3 className="mb-2 font-semibold">Общий комментарий к неделе</h3>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что отметить, что обсудить на следующей неделе" />
          <Button size="sm" className="mt-2" loading={save.isPending} onClick={() => save.mutate({ studentId, weekStart, comment })}>
            Сохранить
          </Button>
        </Card>
      )}
      <WeeklyReportBody facts={report.data.facts} text={report.data.text} isFinal={report.data.isFinal} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmotionsTab({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const episodes = useQuery(trpc.admin.students.episodes.queryOptions({ studentId }));
  if (episodes.isPending) return <PageLoader />;
  if (!episodes.data?.length) return <EmptyState title="Эпизодов переедания не отмечено" />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Когда</th>
            <th className="px-4 py-3 font-medium">Ситуация</th>
            <th className="px-4 py-3 font-medium">Эмоции до</th>
            <th className="px-4 py-3 font-medium">Эмоции после</th>
            <th className="px-4 py-3 font-medium">Комментарий</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {episodes.data.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="px-4 py-3">
                <Link to={`/students/${studentId}/diary?date=${e.diaryDate}`} className="font-medium hover:text-brand-700">
                  {formatDateRu(e.diaryDate)}, {e.time}
                </Link>
                <div className="text-xs text-stone-500">
                  {MEAL_TYPE_LABELS[e.mealType]} · {fmt0(e.kcal)} ккал
                </div>
              </td>
              <td className="px-4 py-3">{[...(e.note?.situationTags ?? []), e.note?.situationText].filter(Boolean).join(' · ') || '—'}</td>
              <td className="px-4 py-3">{e.note?.emotionsBefore.join(', ') || '—'}</td>
              <td className="px-4 py-3">{e.note?.emotionsAfter.join(', ') || '—'}</td>
              <td className="px-4 py-3">{e.note?.comment || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TargetsTab({ card }: { card: Card_ }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const studentId = card.student.id;
  const t = card.targets;
  const q = card.questionnaire;
  const [form, setForm] = useState({ kcal: String(t?.kcal ?? ''), proteinG: String(t?.proteinG ?? ''), fatG: String(t?.fatG ?? ''), carbsG: String(t?.carbsG ?? ''), comment: '' });
  const [deficit, setDeficit] = useState(20);
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.students.get.queryKey({ studentId }) });
  const save = useMutation(
    trpc.admin.students.setTargets.mutationOptions({
      onSuccess: async () => {
        toast('Цели сохранены', 'success');
        await invalidate();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const recalc = useMutation(
    trpc.admin.students.recalculateTargets.mutationOptions({
      onSuccess: async (r) => {
        toast(`Пересчитано: ${r.kcal} ккал`, 'success');
        setForm({ kcal: String(r.kcal), proteinG: String(r.proteinG), fatG: String(r.fatG), carbsG: String(r.carbsG), comment: '' });
        await invalidate();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const preview = useMemo(() => {
    if (!q) return null;
    return computeTargets({
      sex: q.sex,
      weightKg: card.lastWeight?.weightKg ?? q.weightKg,
      targetWeightKg: q.targetWeightKg,
      heightCm: q.heightCm,
      ageYears: ageFromBirthDate(q.birthDate, todayLocal()),
      activityLevel: q.activityLevel,
      pregnancyOrLactation: q.pregnancyOrLactation,
      medicalConditions: q.medicalConditions,
      edHistory: q.edHistory ?? false,
      deficit: deficit / 100,
    });
  }, [q, card.lastWeight, deficit]);
  const n = (s: string) => Number(s) || 0;
  const formKcalFromMacros = n(form.proteinG) * 4 + n(form.fatG) * 9 + n(form.carbsG) * 4;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-semibold">Текущие цели</h3>
        {t ? (
          <>
            <div className="text-2xl font-semibold">{fmt0(t.kcal)} ккал</div>
            <div className="text-stone-600">
              Б {t.proteinG} г · Ж {t.fatG} г · У {t.carbsG} г
            </div>
            <div className="mt-1 text-sm text-stone-500">
              {t.source === 'mentor' ? 'установлены наставником' : 'рассчитаны автоматически'} · {dt.format(new Date(t.createdAt))}
            </div>
            {t.notes.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {t.notes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-stone-500">Цели появятся после анкеты.</p>
        )}
        {preview && (
          <div className="mt-5 border-t border-stone-100 pt-4">
            <h4 className="mb-2 text-sm font-semibold">Пересчёт по последнему весу</h4>
            <label className="flex items-center gap-3 text-sm">
              Дефицит {deficit}%
              <input type="range" min={0} max={30} step={5} value={deficit} onChange={(e) => setDeficit(Number(e.target.value))} className="flex-1 accent-brand-600" />
            </label>
            <p className="mt-2 text-sm text-stone-700">
              {preview.kcal} ккал · Б {preview.proteinG} · Ж {preview.fatG} · У {preview.carbsG} (BMR {preview.bmr}, TDEE {preview.tdee}
              {preview.flooredBy ? ', ограничено снизу' : ''})
            </p>
            <Button size="sm" variant="secondary" className="mt-2" loading={recalc.isPending} onClick={() => recalc.mutate({ studentId, deficit: deficit / 100 })}>
              Применить пересчёт
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Установить вручную</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Калории, ккал">
            <Input inputMode="numeric" value={form.kcal} onChange={(e) => setForm({ ...form, kcal: e.target.value })} />
          </Field>
          <Field label="Белки, г">
            <Input inputMode="numeric" value={form.proteinG} onChange={(e) => setForm({ ...form, proteinG: e.target.value })} />
          </Field>
          <Field label="Жиры, г">
            <Input inputMode="numeric" value={form.fatG} onChange={(e) => setForm({ ...form, fatG: e.target.value })} />
          </Field>
          <Field label="Углеводы, г">
            <Input inputMode="numeric" value={form.carbsG} onChange={(e) => setForm({ ...form, carbsG: e.target.value })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-stone-500">По БЖУ получается {fmt0(formKcalFromMacros)} ккал.</p>
        <Field label="Комментарий для ученицы" className="mt-3">
          <Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Например: согласовано на консультации" />
        </Field>
        <Button
          className="mt-3"
          loading={save.isPending}
          onClick={() => save.mutate({ studentId, kcal: n(form.kcal), proteinG: n(form.proteinG), fatG: n(form.fatG), carbsG: n(form.carbsG), comment: form.comment || null })}
        >
          Сохранить цели
        </Button>
      </Card>
      {card.targetsHistory.length > 1 && (
        <Card className="xl:col-span-2">
          <h3 className="mb-2 font-semibold">История целей</h3>
          <div className="divide-y divide-stone-100 text-sm">
            {card.targetsHistory.map((h) => (
              <div key={h.id} className="flex justify-between py-2">
                <span>{dt.format(new Date(h.createdAt))}</span>
                <span>
                  {h.kcal} ккал · {h.proteinG}/{h.fatG}/{h.carbsG} · {h.source === 'mentor' ? 'наставник' : 'авто'}
                  {h.comment ? ` · ${h.comment}` : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  created: 'Создан доступ',
  extend: 'Продлён',
  pause: 'Приостановлен',
  resume: 'Возобновлён',
  close: 'Закрыт',
  expired: 'Завершён автоматически',
};

function AccessTab({ card }: { card: Card_ }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const e = card.enrollments[0];
  const [endsOn, setEndsOn] = useState(e ? addDays(e.endsOn, 30) : todayLocal());
  const done = async () => {
    toast('Готово', 'success');
    await qc.invalidateQueries({ queryKey: trpc.admin.pathKey() });
  };
  const onError = (err: unknown) => toast(errorMessage(err), 'error');
  const extend = useMutation(trpc.admin.enrollments.extend.mutationOptions({ onSuccess: done, onError }));
  const pause = useMutation(trpc.admin.enrollments.pause.mutationOptions({ onSuccess: done, onError }));
  const resume = useMutation(trpc.admin.enrollments.resume.mutationOptions({ onSuccess: done, onError }));
  const close = useMutation(trpc.admin.enrollments.close.mutationOptions({ onSuccess: done, onError }));
  const renew = useMutation(trpc.admin.enrollments.renew.mutationOptions({ onSuccess: done, onError }));
  if (!e) return <EmptyState title="Доступ не назначен" />;
  const ended = e.status === 'expired' || e.status === 'closed';
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-semibold">Текущий доступ</h3>
        <div className="grid grid-cols-2 gap-3">
          <Info label="Программа" value={e.programName ?? '—'} />
          <Info label="Поток" value={e.cohortName ?? '—'} />
          <Info label="Начало" value={formatDateRu(e.startsOn, { withYear: true })} />
          <Info label="Окончание" value={formatDateRu(e.endsOn, { withYear: true })} />
          <Info label="Статус" value={ENROLLMENT_STATUS_LABELS[e.status]} />
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-2">
          <Field label={ended ? 'Новый доступ до' : 'Продлить до'}>
            <Input type="date" value={endsOn} onChange={(ev) => setEndsOn(ev.target.value)} />
          </Field>
          {ended ? (
            <Button loading={renew.isPending} onClick={() => renew.mutate({ enrollmentId: e.id, startsOn: todayLocal(), endsOn, programId: e.programId, cohortId: e.cohortId })}>
              Открыть доступ
            </Button>
          ) : (
            <Button loading={extend.isPending} onClick={() => extend.mutate({ enrollmentId: e.id, endsOn })}>
              Продлить
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {e.status === 'active' && (
            <Button variant="secondary" loading={pause.isPending} onClick={() => pause.mutate({ enrollmentId: e.id })}>
              Приостановить
            </Button>
          )}
          {e.status === 'paused' && (
            <Button variant="secondary" loading={resume.isPending} onClick={() => resume.mutate({ enrollmentId: e.id })}>
              Возобновить
            </Button>
          )}
          {!ended && (
            <Button variant="danger" loading={close.isPending} onClick={() => confirm('Закрыть доступ? Ученица сможет только просматривать записи.') && close.mutate({ enrollmentId: e.id })}>
              Закрыть доступ
            </Button>
          )}
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">История</h3>
        <div className="divide-y divide-stone-100 text-sm">
          {card.enrollments.flatMap((en) =>
            en.events.map((ev) => (
              <div key={ev.id} className="flex justify-between gap-3 py-2">
                <span>
                  {ACTION_LABELS[ev.action] ?? ev.action}
                  {typeof ev.payload.endsOn === 'string' && ` до ${formatDateRu(ev.payload.endsOn)}`}
                </span>
                <span className="text-stone-500">
                  {dt.format(new Date(ev.createdAt))}
                  {ev.actorName ? ` · ${ev.actorName}` : ''}
                </span>
              </div>
            )),
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CommentsTab({ studentId }: { studentId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { threads } = useThreads(studentId);
  const markRead = useMutation(trpc.admin.students.markCommentsRead.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.pathKey() }) }));
  useEffect(() => {
    if (threads.data?.some((t) => t.unread > 0)) markRead.mutate({ studentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.data]);
  const today = todayLocal();
  if (threads.isPending) return <PageLoader />;
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <Card>
        <h3 className="mb-1 font-semibold">Написать комментарий к сегодняшнему дню</h3>
        <CommentBox studentId={studentId} targetType="day" targetId={today} compact />
      </Card>
      {!threads.data?.length ? (
        <EmptyState title="Переписки пока нет" text="Комментарии к приёмам пищи, дням и неделям появятся здесь." />
      ) : (
        threads.data.map((t) => (
          <Card key={`${t.targetType}:${t.targetId}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{t.title}</span>
              {t.unread > 0 && <Badge tone="brand">новое</Badge>}
            </div>
            <ThreadReply studentId={studentId} thread={t} />
          </Card>
        ))
      )}
    </div>
  );
}

function ThreadReply({ studentId, thread }: { studentId: string; thread: Thread }) {
  return <CommentBox studentId={studentId} targetType={thread.targetType} targetId={thread.targetId} thread={thread} compact />;
}

// ---------------------------------------------------------------------------

function ProfileTab({ card }: { card: Card_ }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const s = card.student;
  const [f, setF] = useState({ firstName: s.firstName, lastName: s.lastName, phone: s.phone, timezone: s.timezone, isBlocked: s.isBlocked });
  const [invite, setInvite] = useState<string | null>(null);
  const save = useMutation(
    trpc.admin.students.update.mutationOptions({
      onSuccess: async () => {
        toast('Сохранено', 'success');
        await qc.invalidateQueries({ queryKey: trpc.admin.pathKey() });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const regen = useMutation(trpc.admin.students.regenerateInvite.mutationOptions({ onSuccess: (r) => setInvite(r.inviteUrl), onError: (e) => toast(errorMessage(e), 'error') }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-semibold">Данные</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Имя">
            <Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          </Field>
          <Field label="Фамилия">
            <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          </Field>
          <Field label="Телефон">
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Часовой пояс">
            <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {TIMEZONES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Switch checked={f.isBlocked} onChange={(v) => setF({ ...f, isBlocked: v })} label="Заблокировать вход" />
        </div>
        <Button className="mt-3" loading={save.isPending} onClick={() => save.mutate({ id: s.id, ...f })}>
          Сохранить
        </Button>
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Приглашение</h3>
        <p className="text-sm text-stone-600">
          {card.invite?.usedAt
            ? `Ученица вошла в приложение ${dt.format(new Date(card.invite.usedAt))}.`
            : card.invite
              ? 'Ученица ещё не входила по приглашению.'
              : 'Приглашение не создавалось.'}
        </p>
        <p className="mt-1 text-sm text-stone-500">Анкета: {s.onboardedAt ? `заполнена ${dt.format(new Date(s.onboardedAt))}` : 'не заполнена'}</p>
        <Button variant="secondary" className="mt-3" loading={regen.isPending} onClick={() => regen.mutate({ studentId: s.id })}>
          Новая ссылка-приглашение
        </Button>
        {invite && (
          <div className="mt-3">
            <div className="break-all rounded-xl bg-stone-50 p-3 font-mono text-sm">{invite}</div>
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                await navigator.clipboard.writeText(invite);
                toast('Ссылка скопирована', 'success');
              }}
            >
              Скопировать
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
