import { DICTIONARY_KINDS, type DictionaryKind } from '@hud/shared';
import { Button, Card, cn, errorMessage, Field, fmt0, Input, PageLoader, Sheet, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageTitle, useStaff } from '../components/Shell';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

const KIND_LABELS: Record<DictionaryKind, string> = {
  emotion_before: 'Эмоции до еды',
  emotion_after: 'Эмоции после еды',
  situation: 'Ситуации',
};

export function ReferencePage() {
  const [tab, setTab] = useState<'dict' | 'foods'>('dict');
  return (
    <div>
      <PageTitle title="Справочники" subtitle="Списки эмоций и ситуаций, база продуктов" />
      <div className="mb-4 flex gap-1">
        {(
          [
            ['dict', 'Эмоции и ситуации'],
            ['foods', 'База продуктов'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-xl px-4 py-2 text-sm', tab === k ? 'bg-brand-50 font-medium text-brand-800' : 'text-stone-600')}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'dict' ? <Dictionaries /> : <Foods />}
    </div>
  );
}

function Dictionaries() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const staff = useStaff();
  const items = useQuery(trpc.admin.reference.dictionaries.queryOptions());
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.reference.dictionaries.queryKey() });
  const add = useMutation(trpc.admin.reference.addDictionaryItem.mutationOptions({ onSuccess: invalidate, onError: (e) => toast(errorMessage(e), 'error') }));
  const toggle = useMutation(trpc.admin.reference.setDictionaryItemActive.mutationOptions({ onSuccess: invalidate }));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (items.isPending) return <PageLoader />;
  const isAdmin = staff.role === 'admin';
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {DICTIONARY_KINDS.map((kind) => (
        <Card key={kind}>
          <h3 className="mb-3 font-semibold">{KIND_LABELS[kind]}</h3>
          <div className="flex flex-wrap gap-2">
            {items.data
              ?.filter((i) => i.kind === kind)
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  disabled={!isAdmin}
                  title={isAdmin ? (i.isActive ? 'Скрыть из списка' : 'Вернуть в список') : undefined}
                  onClick={() => toggle.mutate({ id: i.id, isActive: !i.isActive })}
                  className={cn('rounded-full px-3 py-1 text-sm ring-1', i.isActive ? 'bg-white ring-stone-200' : 'bg-stone-100 text-stone-400 line-through ring-stone-100')}
                >
                  {i.label}
                </button>
              ))}
          </div>
          {isAdmin && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (drafts[kind]?.trim()) add.mutate({ kind, label: drafts[kind]! });
                setDrafts({ ...drafts, [kind]: '' });
              }}
            >
              <Input value={drafts[kind] ?? ''} onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })} placeholder="Новый вариант" />
              <Button type="submit" size="sm">
                Добавить
              </Button>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}

type Food = RouterOutputs['admin']['reference']['searchFoods'][number];

function Foods() {
  const trpc = useTRPC();
  const staff = useStaff();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const foods = useQuery(trpc.admin.reference.searchFoods.queryOptions({ q: debounced }));
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Поиск продукта" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        {staff.role === 'admin' && <Button onClick={() => setEditing('new')}>+ Продукт</Button>}
      </div>
      <p className="mb-3 text-sm text-stone-500">
        Значения на 100 г готового продукта. Стартовая база — ориентировочные справочные данные, их нужно проверить перед запуском.
      </p>
      {foods.isPending ? (
        <PageLoader />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Продукт</th>
                <th className="px-4 py-2.5 font-medium">Категория</th>
                <th className="px-4 py-2.5 text-right font-medium">Ккал</th>
                <th className="px-4 py-2.5 text-right font-medium">Б</th>
                <th className="px-4 py-2.5 text-right font-medium">Ж</th>
                <th className="px-4 py-2.5 text-right font-medium">У</th>
                <th className="px-4 py-2.5 text-right font-medium">Порция</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {foods.data?.map((f) => (
                <tr key={f.id} className={cn('cursor-pointer hover:bg-stone-50', !f.isActive && 'opacity-50')} onClick={() => staff.role === 'admin' && setEditing(f)}>
                  <td className="px-4 py-2">
                    {f.name}
                    {f.synonyms.length > 0 && <div className="text-xs text-stone-400">{f.synonyms.slice(0, 4).join(', ')}</div>}
                  </td>
                  <td className="px-4 py-2 text-stone-600">{f.category}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt0(f.kcal)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.protein}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.fat}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.carbs}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt0(f.defaultGrams)} г</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <FoodEditor food={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function FoodEditor({ food, onClose }: { food: Food | 'new' | null; onClose: () => void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const blank = { name: '', synonyms: '', category: 'другое', kcal: '', protein: '', fat: '', carbs: '', defaultGrams: '100', isActive: true };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (food && food !== 'new') {
      setF({
        name: food.name,
        synonyms: food.synonyms.join(', '),
        category: food.category,
        kcal: String(food.kcal),
        protein: String(food.protein),
        fat: String(food.fat),
        carbs: String(food.carbs),
        defaultGrams: String(food.defaultGrams),
        isActive: food.isActive,
      });
    } else setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food]);
  const save = useMutation(
    trpc.admin.reference.saveFood.mutationOptions({
      onSuccess: async () => {
        toast('Продукт сохранён', 'success');
        await qc.invalidateQueries({ queryKey: trpc.admin.reference.searchFoods.queryKey() });
        onClose();
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const n = (s: string) => Number(s.replace(',', '.')) || 0;
  return (
    <Sheet open={food !== null} onClose={onClose} title={food === 'new' ? 'Новый продукт' : 'Продукт'}>
      <div className="flex flex-col gap-3">
        <Field label="Название">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Синонимы (через запятую)" hint="Как продукт называют в разговоре: «гречка», «гречневая каша».">
          <Input value={f.synonyms} onChange={(e) => setF({ ...f, synonyms: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Категория">
            <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          </Field>
          <Field label="Типичная порция, г">
            <Input inputMode="decimal" value={f.defaultGrams} onChange={(e) => setF({ ...f, defaultGrams: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => (
            <Field key={k} label={{ kcal: 'Ккал', protein: 'Белки', fat: 'Жиры', carbs: 'Углев.' }[k]}>
              <Input inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="accent-brand-600" />
          Показывать в поиске
        </label>
        <Button
          loading={save.isPending}
          disabled={!f.name.trim()}
          onClick={() =>
            save.mutate({
              id: food && food !== 'new' ? food.id : null,
              name: f.name,
              synonyms: f.synonyms.split(',').map((s) => s.trim()).filter(Boolean),
              category: f.category || 'другое',
              per100: { kcal: n(f.kcal), protein: n(f.protein), fat: n(f.fat), carbs: n(f.carbs) },
              defaultGrams: n(f.defaultGrams) || 100,
              isActive: f.isActive,
            })
          }
        >
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}
