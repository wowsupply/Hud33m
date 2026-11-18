import {
  defaultMealTypeForHour,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  mealTotals,
  nutrientsForGrams,
  type InputMethod,
  type MealType,
  type Nutrients,
  type ValueSource,
} from '@hud/shared';
import {
  Badge,
  Button,
  Card,
  Chip,
  cn,
  errorMessage,
  fmt0,
  Input,
  PageLoader,
  Sheet,
  Switch,
  Textarea,
  nowTimeLocal,
  todayLocal,
  toast,
} from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BackLink, PageHeader } from '../components/AppShell';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

export interface EditItem {
  key: string;
  name: string;
  foodId: string | null;
  grams: number;
  quantityText: string | null;
  per100: Nutrients;
  valueSource: ValueSource;
  isEstimated: boolean;
  needsReview: boolean;
}

interface NoteState {
  situationTags: string[];
  situationText: string;
  emotionsBefore: string[];
  emotionsAfter: string[];
  comment: string;
}

const EMPTY_NOTE: NoteState = { situationTags: [], situationText: '', emotionsBefore: [], emotionsAfter: [], comment: '' };
let keySeq = 0;
const newKey = () => `i${++keySeq}`;

export function MealEditorPage() {
  const { id } = useParams();
  const trpc = useTRPC();
  const existing = useQuery({ ...trpc.diary.getMeal.queryOptions({ id: id ?? '' }), enabled: !!id });
  if (id && existing.isPending) return <PageLoader />;
  return <MealEditor meal={existing.data ?? null} />;
}

function MealEditor({ meal }: { meal: RouterOutputs['diary']['getMeal'] | null }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialDate = meal?.diaryDate ?? params.get('date') ?? todayLocal();

  const [date] = useState(initialDate);
  const [time, setTime] = useState(meal?.time ?? nowTimeLocal());
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? defaultMealTypeForHour(new Date().getHours()));
  const [text, setText] = useState(meal?.rawInput ?? '');
  const [items, setItems] = useState<EditItem[]>(
    () =>
      meal?.items.map((i) => ({
        key: newKey(),
        name: i.name,
        foodId: i.foodId,
        grams: i.grams,
        quantityText: i.quantityText,
        per100: i.per100,
        valueSource: i.valueSource,
        isEstimated: i.isEstimated,
        needsReview: false,
      })) ?? [],
  );
  const [inputMethod, setInputMethod] = useState<InputMethod>((meal?.inputMethod as InputMethod) ?? 'text');
  const [aiRequestId, setAiRequestId] = useState<string | null>(null);
  const [isOvereating, setIsOvereating] = useState(meal?.isOvereating ?? false);
  const [note, setNote] = useState<NoteState>(
    meal?.note
      ? {
          situationTags: meal.note.situationTags,
          situationText: meal.note.situationText ?? '',
          emotionsBefore: meal.note.emotionsBefore,
          emotionsAfter: meal.note.emotionsAfter,
          comment: meal.note.comment ?? '',
        }
      : EMPTY_NOTE,
  );
  const [searchFor, setSearchFor] = useState<string | 'new' | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);

  const totals = useMemo(() => mealTotals(items), [items]);
  const unresolved = items.some((i) => i.needsReview);

  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.diary.pathKey() });

  const parse = useMutation(
    trpc.diary.parseMeal.mutationOptions({
      onSuccess: (r) => {
        setItems(r.items.map((i) => ({ ...i, key: newKey() })));
        setAiRequestId(r.aiRequestId);
        setInputMethod('text');
        setEngine(r.engine);
        if (r.items.length === 0) toast('Не удалось распознать продукты. Попробуйте описать иначе или добавьте вручную.');
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );

  const payload = () => ({
    diaryDate: date,
    time,
    mealType,
    description: '',
    rawInput: text.trim() || null,
    inputMethod,
    items: items.map((i) => ({
      name: i.name,
      foodId: i.foodId,
      grams: i.grams,
      per100: i.per100,
      valueSource: i.valueSource,
      isEstimated: i.isEstimated,
      quantityText: i.quantityText,
    })),
    isOvereating,
    note: isOvereating
      ? {
          situationTags: note.situationTags,
          situationText: note.situationText.trim() || null,
          emotionsBefore: note.emotionsBefore,
          emotionsAfter: note.emotionsAfter,
          comment: note.comment.trim() || null,
        }
      : null,
  });

  const done = async () => {
    await invalidate();
    navigate(date === todayLocal() ? '/' : `/day/${date}`, { replace: true });
  };
  const create = useMutation(trpc.diary.createMeal.mutationOptions({ onSuccess: done, onError: (e) => toast(errorMessage(e), 'error') }));
  const update = useMutation(trpc.diary.updateMeal.mutationOptions({ onSuccess: done, onError: (e) => toast(errorMessage(e), 'error') }));
  const remove = useMutation(trpc.diary.deleteMeal.mutationOptions({ onSuccess: done, onError: (e) => toast(errorMessage(e), 'error') }));

  const save = () => {
    if (meal) update.mutate({ ...payload(), id: meal.id });
    else create.mutate({ ...payload(), aiRequestId });
  };

  const patchItem = (key: string, patch: Partial<EditItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <div className="pb-6">
      <PageHeader title={meal ? 'Приём пищи' : 'Новый приём пищи'} back={<BackLink to={date === todayLocal() ? '/' : `/day/${date}`} />} />

      <div className="flex flex-col gap-4 px-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {MEAL_TYPES.map((t) => (
            <Chip key={t} selected={mealType === t} onClick={() => setMealType(t)}>
              {MEAL_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm text-stone-600">
          Время
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
        </label>

        <Card>
          <label htmlFor="meal-text" className="mb-2 block text-sm font-medium text-stone-700">
            Что вы ели?
          </label>
          <Textarea
            id="meal-text"
            rows={3}
            placeholder="Например: два яйца, кусок хлеба, 30 г сыра, кофе с молоком"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-stone-500">Можно надиктовать голосом — значок микрофона на клавиатуре.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => parse.mutate({ text })} loading={parse.isPending} disabled={text.trim().length < 2}>
              Рассчитать
            </Button>
            <Button variant="secondary" onClick={() => setRecentOpen(true)}>
              Повторить прошлый
            </Button>
            <Button variant="ghost" onClick={() => setSearchFor('new')}>
              + Продукт вручную
            </Button>
          </div>
        </Card>

        {items.length > 0 && (
          <Card className="p-0">
            <div className="divide-y divide-stone-100">
              {items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  onGrams={(grams) => patchItem(item.key, { grams, isEstimated: false })}
                  onReplace={() => setSearchFor(item.key)}
                  onRemove={() => setItems((l) => l.filter((i) => i.key !== item.key))}
                  onManual={(per100) => patchItem(item.key, { per100, valueSource: 'manual', needsReview: false })}
                />
              ))}
            </div>
            <div className="flex items-center justify-between rounded-b-2xl bg-stone-50 px-4 py-3">
              <span className="text-sm text-stone-600">
                Б {fmt0(totals.protein)} · Ж {fmt0(totals.fat)} · У {fmt0(totals.carbs)} г
              </span>
              <span className="font-semibold text-stone-900">{fmt0(totals.kcal)} ккал</span>
            </div>
          </Card>
        )}
        {items.some((i) => i.isEstimated) && (
          <p className="-mt-2 px-1 text-xs text-stone-500">
            ≈ — приблизительная оценка. Поправьте граммы, если знаете точнее.
            {engine === 'local' && ' Расчёт выполнен по базе продуктов.'}
          </p>
        )}

        <Card>
          <Switch checked={isOvereating} onChange={setIsOvereating} label="Было переедание / лишняя еда" />
          {isOvereating && <OvereatingForm note={note} onChange={setNote} />}
        </Card>

        <Button size="lg" onClick={save} loading={create.isPending || update.isPending} disabled={items.length === 0 || unresolved}>
          {unresolved ? 'Выберите продукты, отмеченные «?»' : 'Сохранить'}
        </Button>
        {meal && (
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Удалить этот приём пищи?')) remove.mutate({ id: meal.id });
            }}
            loading={remove.isPending}
          >
            Удалить запись
          </Button>
        )}
      </div>

      <FoodSearchSheet
        open={searchFor !== null}
        onClose={() => setSearchFor(null)}
        onPick={(food) => {
          const per100 = { kcal: food.kcal, protein: food.protein, fat: food.fat, carbs: food.carbs };
          if (searchFor === 'new') {
            setItems((l) => [
              ...l,
              { key: newKey(), name: food.name, foodId: food.id, grams: food.defaultGrams, quantityText: null, per100, valueSource: 'db', isEstimated: false, needsReview: false },
            ]);
            if (items.length === 0) setInputMethod('manual');
          } else if (searchFor) {
            patchItem(searchFor, { name: food.name, foodId: food.id, per100, valueSource: 'db', needsReview: false });
          }
          setSearchFor(null);
        }}
      />
      <RecentMealsSheet
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        onPick={(m) => {
          setItems(m.items.map((i) => ({ key: newKey(), name: i.name, foodId: i.foodId, grams: i.grams, quantityText: i.quantityText, per100: i.per100, valueSource: i.valueSource, isEstimated: i.isEstimated, needsReview: false })));
          setText(m.rawInput ?? m.description);
          setInputMethod('repeat');
          setAiRequestId(null);
          setRecentOpen(false);
        }}
      />
    </div>
  );
}

function ItemRow({
  item,
  onGrams,
  onReplace,
  onRemove,
  onManual,
}: {
  item: EditItem;
  onGrams: (g: number) => void;
  onReplace: () => void;
  onRemove: () => void;
  onManual: (per100: Nutrients) => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const n = nutrientsForGrams(item.per100, item.grams);
  const step = item.grams >= 100 ? 10 : 5;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onReplace} className="min-w-0 text-left">
          <div className={cn('font-medium', item.needsReview ? 'text-amber-800' : 'text-stone-900')}>
            {item.needsReview && '? '}
            {item.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            {item.quantityText && <span>{item.quantityText}</span>}
            {item.valueSource === 'db' && <span>из базы продуктов</span>}
            {item.valueSource === 'ai' && <Badge tone="warm">оценка ИИ</Badge>}
            {item.valueSource === 'manual' && !item.needsReview && <span>введено вручную</span>}
            {item.needsReview && <span className="text-amber-700">не нашли в базе — нажмите, чтобы выбрать</span>}
          </div>
        </button>
        <button type="button" onClick={onRemove} className="rounded-full p-1 text-stone-400 hover:bg-stone-100" aria-label="Удалить продукт">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <StepButton label="Меньше" onClick={() => onGrams(Math.max(0, item.grams - step))}>
            −
          </StepButton>
          <Input
            inputMode="numeric"
            value={String(Math.round(item.grams))}
            onChange={(e) => onGrams(Number(e.target.value.replace(/\D/g, '')) || 0)}
            className="w-20 py-1.5 text-center"
            aria-label="Граммы"
          />
          <StepButton label="Больше" onClick={() => onGrams(item.grams + step)}>
            +
          </StepButton>
          <span className="ml-1 text-sm text-stone-500">{item.isEstimated ? '≈ г' : 'г'}</span>
        </div>
        <div className="text-right">
          <div className="font-medium tabular-nums text-stone-900">
            {item.isEstimated || item.valueSource === 'ai' ? '≈ ' : ''}
            {fmt0(n.kcal)} ккал
          </div>
          <div className="text-xs text-stone-500">
            Б {fmt0(n.protein)} · Ж {fmt0(n.fat)} · У {fmt0(n.carbs)}
          </div>
        </div>
      </div>
      {item.needsReview && (
        <button type="button" className="mt-2 text-sm text-brand-700" onClick={() => setManualOpen((v) => !v)}>
          Ввести калорийность вручную
        </button>
      )}
      {manualOpen && <ManualNutrients onSave={(p) => { onManual(p); setManualOpen(false); }} />}
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-9 w-9 rounded-lg bg-stone-100 text-lg text-stone-700 active:bg-stone-200">
      {children}
    </button>
  );
}

function ManualNutrients({ onSave }: { onSave: (p: Nutrients) => void }) {
  const [v, setV] = useState({ kcal: '', protein: '', fat: '', carbs: '' });
  const parsed = Object.fromEntries(Object.entries(v).map(([k, s]) => [k, Number(s.replace(',', '.')) || 0])) as unknown as Nutrients;
  return (
    <div className="mt-2 rounded-xl bg-stone-50 p-3">
      <p className="mb-2 text-xs text-stone-500">На 100 г продукта (можно посмотреть на упаковке)</p>
      <div className="grid grid-cols-4 gap-2">
        {(['kcal', 'protein', 'fat', 'carbs'] as const).map((k) => (
          <label key={k} className="text-xs text-stone-600">
            {{ kcal: 'Ккал', protein: 'Белки', fat: 'Жиры', carbs: 'Углев.' }[k]}
            <Input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="mt-1 px-2 py-1.5" />
          </label>
        ))}
      </div>
      <Button size="sm" className="mt-2" disabled={!v.kcal} onClick={() => onSave(parsed)}>
        Применить
      </Button>
    </div>
  );
}

type FoodHit = RouterOutputs['diary']['searchFoods'][number];

function FoodSearchSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: FoodHit) => void }) {
  const trpc = useTRPC();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  const res = useQuery({ ...trpc.diary.searchFoods.queryOptions({ q: debounced }), enabled: open && debounced.length > 0 });
  return (
    <Sheet open={open} onClose={onClose} title="Выбор продукта">
      <Input placeholder="Например, гречка" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 flex max-h-[55vh] flex-col divide-y divide-stone-100 overflow-y-auto">
        {res.data?.map((f) => (
          <button key={f.id} type="button" onClick={() => onPick(f)} className="flex items-center justify-between gap-3 py-2.5 text-left">
            <span className="text-[15px] text-stone-800">{f.name}</span>
            <span className="shrink-0 text-xs text-stone-500">{fmt0(f.kcal)} ккал/100 г</span>
          </button>
        ))}
        {debounced && res.data?.length === 0 && <p className="py-4 text-center text-sm text-stone-500">Ничего не нашли — попробуйте другое название</p>}
      </div>
    </Sheet>
  );
}

function RecentMealsSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: RouterOutputs['diary']['recentMeals'][number]) => void;
}) {
  const trpc = useTRPC();
  const recent = useQuery({ ...trpc.diary.recentMeals.queryOptions(), enabled: open });
  return (
    <Sheet open={open} onClose={onClose} title="Повторить прошлый приём">
      {recent.isPending ? (
        <PageLoader />
      ) : recent.data?.length ? (
        <div className="flex flex-col divide-y divide-stone-100">
          {recent.data.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick(m)} className="py-3 text-left">
              <div className="text-sm text-stone-500">{MEAL_TYPE_LABELS[m.mealType]}</div>
              <div className="line-clamp-2 text-[15px] text-stone-800">{m.description}</div>
              <div className="text-xs text-stone-500">{fmt0(m.kcal)} ккал</div>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-stone-500">Пока нет прошлых записей</p>
      )}
    </Sheet>
  );
}

function OvereatingForm({ note, onChange }: { note: NoteState; onChange: (n: NoteState) => void }) {
  const trpc = useTRPC();
  const dict = useQuery(trpc.diary.dictionaries.queryOptions());
  if (!dict.data) return <PageLoader />;
  const d = dict.data;
  return (
    <div className="mt-4 flex flex-col gap-5 border-t border-stone-100 pt-4">
      <p className="text-sm text-stone-500">Хотите отметить, что было до и после? Это поможет заметить закономерности. Все поля — по желанию.</p>
      <ChipGroup
        title="Ситуация — что происходило перед этим"
        options={[...d.situations, ...d.custom.situations]}
        value={note.situationTags}
        onChange={(v) => onChange({ ...note, situationTags: v })}
      />
      <Textarea
        rows={2}
        placeholder="Опишите своими словами, если хочется"
        value={note.situationText}
        onChange={(e) => onChange({ ...note, situationText: e.target.value })}
      />
      <ChipGroup
        title="Эмоции до еды"
        options={[...d.emotionsBefore, ...d.custom.emotionsBefore]}
        value={note.emotionsBefore}
        onChange={(v) => onChange({ ...note, emotionsBefore: v })}
      />
      <ChipGroup
        title="Эмоции после еды"
        options={[...d.emotionsAfter, ...d.custom.emotionsAfter]}
        value={note.emotionsAfter}
        onChange={(v) => onChange({ ...note, emotionsAfter: v })}
      />
      <div>
        <div className="mb-2 text-sm font-medium text-stone-700">Комментарий</div>
        <Textarea rows={2} value={note.comment} onChange={(e) => onChange({ ...note, comment: e.target.value })} />
      </div>
    </div>
  );
}

function ChipGroup({ title, options, value, onChange }: { title: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const all = [...new Set([...options, ...value])];
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-stone-700">{title}</div>
      <div className="flex flex-wrap gap-2">
        {all.map((o) => (
          <Chip key={o} selected={value.includes(o)} onClick={() => toggle(o)}>
            {o}
          </Chip>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-full px-3.5 py-1.5 text-sm text-brand-700 border border-dashed border-brand-300">
            + своё
          </button>
        )}
      </div>
      {adding && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = custom.trim().toLowerCase();
            if (v && !value.includes(v)) onChange([...value, v]);
            setCustom('');
            setAdding(false);
          }}
        >
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Свой вариант" autoFocus maxLength={60} />
          <Button type="submit" size="sm">
            Добавить
          </Button>
        </form>
      )}
    </div>
  );
}
