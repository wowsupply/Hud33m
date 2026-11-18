import { addDays, formatDateRu } from '@hud/shared';
import { Button, Card, EmptyState, errorMessage, fmt1, Input, PageLoader, signed1, todayLocal, toast } from '@hud/ui';
import { WeightChart } from '@hud/ui/charts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMe, PageHeader } from '../components/AppShell';
import { useTRPC } from '../lib/trpc';

const RANGES = [
  { label: 'Месяц', days: 30 },
  { label: '3 месяца', days: 90 },
  { label: 'Всё время', days: null },
] as const;

export function WeightPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const me = useMe();
  const today = todayLocal();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [value, setValue] = useState('');
  const history = useQuery(trpc.diary.weightHistory.queryOptions({ from: range.days ? addDays(today, -range.days) : undefined }));

  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.diary.pathKey() });
  const save = useMutation(
    trpc.diary.saveWeight.mutationOptions({
      onSuccess: async () => {
        setValue('');
        await invalidate();
        toast('Вес сохранён', 'success');
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const remove = useMutation(trpc.diary.deleteWeight.mutationOptions({ onSuccess: invalidate, onError: (e) => toast(errorMessage(e), 'error') }));

  const entries = history.data?.entries ?? [];
  const last = entries[entries.length - 1];
  const first = entries[0];
  const target = history.data?.targetWeightKg ?? null;
  const kg = Number(value.replace(',', '.'));
  const canWrite = me.access?.canWrite;

  return (
    <div>
      <PageHeader title="Вес" />
      <div className="flex flex-col gap-3 px-4">
        {canWrite && (
          <Card>
            <div className="mb-2 text-sm font-medium text-stone-700">Вес сегодня, {formatDateRu(today)}</div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate({ date: today, weightKg: kg });
              }}
            >
              <Input inputMode="decimal" placeholder="кг" value={value} onChange={(e) => setValue(e.target.value)} />
              <Button type="submit" loading={save.isPending} disabled={!(kg >= 30 && kg <= 350)}>
                Сохранить
              </Button>
            </form>
          </Card>
        )}

        {history.isPending ? (
          <PageLoader />
        ) : entries.length === 0 ? (
          <EmptyState title="Пока нет взвешиваний" text="Внесите вес утром — здесь появится график." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Card className="p-3">
                <div className="text-xs text-stone-500">Сейчас</div>
                <div className="text-lg font-semibold">{fmt1(last?.weightKg)} кг</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-stone-500">За период</div>
                <div className="text-lg font-semibold">{first && last ? `${signed1(Math.round((last.weightKg - first.weightKg) * 10) / 10)} кг` : '—'}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-stone-500">До цели</div>
                <div className="text-lg font-semibold">{target && last ? `${fmt1(Math.max(0, Math.round((last.weightKg - target) * 10) / 10))} кг` : '—'}</div>
              </Card>
            </div>
            <Card>
              <div className="mb-2 flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRange(r)}
                    className={`rounded-lg px-3 py-1 text-sm ${range.label === r.label ? 'bg-brand-100 text-brand-800' : 'text-stone-500'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <WeightChart entries={entries} targetWeightKg={target} />
            </Card>
            <Card className="p-0">
              <div className="divide-y divide-stone-100">
                {[...entries].reverse().map((e, i, arr) => {
                  const prev = arr[i + 1];
                  return (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-stone-600">{formatDateRu(e.date)}</span>
                      <span className="flex items-center gap-3">
                        {prev && <span className="text-xs text-stone-400">{signed1(Math.round((e.weightKg - prev.weightKg) * 10) / 10)}</span>}
                        <span className="font-medium tabular-nums">{fmt1(e.weightKg)} кг</span>
                        {canWrite && (
                          <button
                            type="button"
                            className="text-stone-400 hover:text-rose-600"
                            aria-label="Удалить"
                            onClick={() => confirm('Удалить это взвешивание?') && remove.mutate({ date: e.date })}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
