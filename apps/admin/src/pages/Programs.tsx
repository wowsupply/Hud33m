import { PROGRAM_KIND_LABELS, PROGRAM_KINDS, formatDateRu, type ProgramKind } from '@hud/shared';
import { Badge, Button, Card, EmptyState, errorMessage, Field, Input, PageLoader, Sheet, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageTitle, useStaff } from '../components/Shell';
import { useTRPC } from '../lib/trpc';

export function ProgramsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const staff = useStaff();
  const programs = useQuery(trpc.admin.programs.list.queryOptions());
  const [createOpen, setCreateOpen] = useState(false);
  const [cohortFor, setCohortFor] = useState<string | null>(null);
  const isAdmin = staff.role === 'admin';
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.programs.list.queryKey() });
  const archive = useMutation(trpc.admin.programs.update.mutationOptions({ onSuccess: invalidate, onError: (e) => toast(errorMessage(e), 'error') }));

  return (
    <div>
      <PageTitle title="Программы и потоки" action={isAdmin && <Button onClick={() => setCreateOpen(true)}>+ Программа</Button>} />
      {programs.isPending ? (
        <PageLoader />
      ) : !programs.data?.length ? (
        <Card>
          <EmptyState title="Программ пока нет" text="Создайте марафон или индивидуальное сопровождение, чтобы назначать их ученицам." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {programs.data.map((p) => (
            <Card key={p.id} className={p.isArchived ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-stone-900">{p.name}</h3>
                  <div className="text-sm text-stone-500">
                    {PROGRAM_KIND_LABELS[p.kind]} · {p.defaultDurationDays} дн.
                  </div>
                </div>
                {p.isArchived && <Badge>в архиве</Badge>}
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Потоки</div>
                {p.cohorts.length === 0 ? (
                  <p className="text-sm text-stone-400">Нет потоков</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {p.cohorts.map((c) => (
                      <li key={c.id} className="flex justify-between">
                        <span>{c.name}</span>
                        <span className="text-stone-500">
                          {c.startsOn ? formatDateRu(c.startsOn) : '—'} — {c.endsOn ? formatDateRu(c.endsOn) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setCohortFor(p.id)}>
                    + Поток
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: p.id, name: p.name, defaultDurationDays: p.defaultDurationDays, isArchived: !p.isArchived })}>
                    {p.isArchived ? 'Вернуть из архива' : 'В архив'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <CreateProgram open={createOpen} onClose={() => setCreateOpen(false)} onDone={invalidate} />
      <CreateCohort programId={cohortFor} onClose={() => setCohortFor(null)} onDone={invalidate} />
    </div>
  );
}

function CreateProgram({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const trpc = useTRPC();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProgramKind>('marathon');
  const [days, setDays] = useState('30');
  const create = useMutation(
    trpc.admin.programs.create.mutationOptions({
      onSuccess: () => {
        setName('');
        onDone();
        onClose();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  return (
    <Sheet open={open} onClose={onClose} title="Новая программа">
      <div className="flex flex-col gap-3">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Марафон «Лёгкость»" />
        </Field>
        <Field label="Тип">
          <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5" value={kind} onChange={(e) => setKind(e.target.value as ProgramKind)}>
            {PROGRAM_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROGRAM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Длительность по умолчанию, дней">
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate({ name, kind, defaultDurationDays: Number(days) || 30 })}>
          Создать
        </Button>
      </div>
    </Sheet>
  );
}

function CreateCohort({ programId, onClose, onDone }: { programId: string | null; onClose: () => void; onDone: () => void }) {
  const trpc = useTRPC();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const create = useMutation(
    trpc.admin.programs.createCohort.mutationOptions({
      onSuccess: () => {
        setName('');
        onDone();
        onClose();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  return (
    <Sheet open={!!programId} onClose={onClose} title="Новый поток">
      <div className="flex flex-col gap-3">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Поток декабрь 2026" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Окончание">
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <Button
          loading={create.isPending}
          disabled={!name.trim()}
          onClick={() => create.mutate({ programId: programId!, name, startsOn: startsOn || null, endsOn: endsOn || null })}
        >
          Создать
        </Button>
      </div>
    </Sheet>
  );
}
