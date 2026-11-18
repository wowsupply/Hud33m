import { addDays, ENROLLMENT_STATUS_LABELS, formatDateRu, formatPhone } from '@hud/shared';
import { Badge, Button, Card, EmptyState, errorMessage, Field, Input, PageLoader, Sheet, todayLocal, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageTitle, useStaff } from '../components/Shell';
import { useTRPC } from '../lib/trpc';

const ACCESS_LABELS: Record<string, { label: string; tone: 'brand' | 'warm' | 'neutral' | 'info' }> = {
  active: { label: 'Активна', tone: 'brand' },
  not_started: { label: 'Ещё не началось', tone: 'info' },
  paused: { label: 'Пауза', tone: 'warm' },
  ended: { label: 'Завершён', tone: 'neutral' },
};

export const TIMEZONES = [
  ['Europe/Kaliningrad', 'Калининград (МСК−1)'],
  ['Europe/Moscow', 'Москва (МСК)'],
  ['Europe/Samara', 'Самара (МСК+1)'],
  ['Asia/Yekaterinburg', 'Екатеринбург (МСК+2)'],
  ['Asia/Omsk', 'Омск (МСК+3)'],
  ['Asia/Novosibirsk', 'Новосибирск (МСК+4)'],
  ['Asia/Krasnoyarsk', 'Красноярск (МСК+4)'],
  ['Asia/Irkutsk', 'Иркутск (МСК+5)'],
  ['Asia/Yakutsk', 'Якутск (МСК+6)'],
  ['Asia/Vladivostok', 'Владивосток (МСК+7)'],
  ['Asia/Magadan', 'Магадан (МСК+8)'],
  ['Asia/Kamchatka', 'Камчатка (МСК+9)'],
] as const;

export function StudentsPage() {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const [programId, setProgramId] = useState('');
  const [accessStatus, setAccessStatus] = useState('');
  const [ending, setEnding] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const programs = useQuery(trpc.admin.programs.list.queryOptions());
  const list = useQuery(
    trpc.admin.students.list.queryOptions({
      search: search || undefined,
      programId: programId || undefined,
      accessStatus: (accessStatus || undefined) as 'active' | undefined,
      endingWithinDays: ending ? 7 : undefined,
    }),
  );

  return (
    <div>
      <PageTitle title="Ученицы" action={<Button onClick={() => setCreateOpen(true)}>+ Добавить ученицу</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Поиск по имени или телефону" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="rounded-xl border border-stone-200 bg-white px-3 py-2" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="">Все программы</option>
          {programs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-stone-200 bg-white px-3 py-2" value={accessStatus} onChange={(e) => setAccessStatus(e.target.value)}>
          <option value="">Любой статус</option>
          {Object.entries(ACCESS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-2 text-sm text-stone-600">
          <input type="checkbox" checked={ending} onChange={(e) => setEnding(e.target.checked)} className="accent-brand-600" />
          Доступ заканчивается за 7 дней
        </label>
      </div>

      {list.isPending ? (
        <PageLoader />
      ) : !list.data?.length ? (
        <Card>
          <EmptyState title="Учениц не найдено" text="Добавьте ученицу — она получит ссылку-приглашение." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Ученица</th>
                <th className="px-4 py-3 font-medium">Программа</th>
                <th className="px-4 py-3 font-medium">Доступ</th>
                <th className="px-4 py-3 font-medium">Последняя запись</th>
                <th className="px-4 py-3 font-medium">Эпизоды (нед.)</th>
                <th className="px-4 py-3 font-medium">Новое</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.data.map((s) => {
                const acc = s.enrollment ? ACCESS_LABELS[s.enrollment.accessStatus] : null;
                return (
                  <tr key={s.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link to={`/students/${s.id}`} className="font-medium text-stone-900 hover:text-brand-700">
                        {s.lastName} {s.firstName}
                      </Link>
                      <div className="text-xs text-stone-500">{formatPhone(s.phone)}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {s.enrollment?.programName ?? '—'}
                      {s.enrollment?.cohortName && <div className="text-xs text-stone-500">{s.enrollment.cohortName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {acc && <Badge tone={acc.tone}>{acc.label}</Badge>}
                      {s.enrollment && <div className="mt-1 text-xs text-stone-500">до {formatDateRu(s.enrollment.endsOn)}</div>}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {!s.onboarded ? (
                        <span className="text-stone-400">{s.lastLoginAt ? 'анкета не заполнена' : 'ещё не входила'}</span>
                      ) : s.lastEntryDate ? (
                        <>
                          {formatDateRu(s.lastEntryDate)}
                          {s.daysWithoutEntries != null && s.daysWithoutEntries >= 2 && <div className="text-xs text-amber-700">{s.daysWithoutEntries} дн. без записей</div>}
                        </>
                      ) : (
                        <span className="text-stone-400">нет записей</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{s.episodesThisWeek || <span className="text-stone-300">0</span>}</td>
                    <td className="px-4 py-3">{s.unreadReplies > 0 && <Badge tone="brand">{s.unreadReplies} ответ</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <CreateStudentSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateStudentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const staff = useStaff();
  const programs = useQuery(trpc.admin.programs.list.queryOptions());
  const mentors = useQuery({ ...trpc.admin.reference.mentors.queryOptions(), enabled: staff.role === 'admin' });
  const today = todayLocal();
  const empty = { firstName: '', lastName: '', phone: '', timezone: 'Europe/Moscow', programId: '', cohortId: '', startsOn: today, endsOn: addDays(today, 30), mentorId: '' };
  const [f, setF] = useState(empty);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const program = programs.data?.find((p) => p.id === f.programId);

  const create = useMutation(
    trpc.admin.students.create.mutationOptions({
      onSuccess: async (r) => {
        setInviteUrl(r.inviteUrl);
        await qc.invalidateQueries({ queryKey: trpc.admin.pathKey() });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const close = () => {
    setF(empty);
    setInviteUrl(null);
    onClose();
  };
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  return (
    <Sheet open={open} onClose={close} title={inviteUrl ? 'Ученица добавлена' : 'Новая ученица'} wide>
      {inviteUrl ? (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] text-stone-700">
            Отправьте ученице ссылку-приглашение в мессенджере, где вы общаетесь. По ней она установит приложение и войдёт по номеру телефона.
          </p>
          <div className="break-all rounded-xl bg-stone-50 p-3 font-mono text-sm">{inviteUrl}</div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                toast('Ссылка скопирована', 'success');
              }}
            >
              Скопировать ссылку
            </Button>
            <Button variant="secondary" onClick={close}>
              Готово
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              ...f,
              programId: f.programId || null,
              cohortId: f.cohortId || null,
              mentorId: f.mentorId || null,
            });
          }}
        >
          <Field label="Имя">
            <Input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} required />
          </Field>
          <Field label="Фамилия">
            <Input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </Field>
          <Field label="Телефон">
            <Input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+7 999 123-45-67" required />
          </Field>
          <Field label="Часовой пояс">
            <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5" value={f.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {TIMEZONES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Программа">
            <select
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
              value={f.programId}
              onChange={(e) => {
                const p = programs.data?.find((x) => x.id === e.target.value);
                set({ programId: e.target.value, cohortId: '', endsOn: p ? addDays(f.startsOn, p.defaultDurationDays - 1) : f.endsOn });
              }}
            >
              <option value="">Без программы</option>
              {programs.data?.filter((p) => !p.isArchived).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Поток">
            <select
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
              value={f.cohortId}
              disabled={!program?.cohorts.length}
              onChange={(e) => {
                const c = program?.cohorts.find((x) => x.id === e.target.value);
                set({ cohortId: e.target.value, ...(c?.startsOn ? { startsOn: c.startsOn } : {}), ...(c?.endsOn ? { endsOn: c.endsOn } : {}) });
              }}
            >
              <option value="">—</option>
              {program?.cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Доступ с">
            <Input type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} required />
          </Field>
          <Field label="Доступ по">
            <Input type="date" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} required />
          </Field>
          {staff.role === 'admin' && (mentors.data?.length ?? 0) > 1 && (
            <Field label="Наставник" className="sm:col-span-2">
              <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5" value={f.mentorId} onChange={(e) => set({ mentorId: e.target.value })}>
                <option value="">Я</option>
                {mentors.data?.filter((m) => m.id !== staff.id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              Добавить и получить ссылку
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export { ACCESS_LABELS, ENROLLMENT_STATUS_LABELS };
