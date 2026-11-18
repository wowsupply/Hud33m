import {
  ACTIVITY_INFO,
  ACTIVITY_LEVELS,
  BMI_CATEGORY_LABELS,
  TARGETS_DISCLAIMER,
  type ActivityLevel,
  type Sex,
} from '@hud/shared';
import { Button, Card, cn, errorMessage, Field, fmt0, fmt1, Input, toast } from '@hud/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

const num = (s: string) => {
  const n = Number(s.replace(',', '.').trim());
  return Number.isFinite(n) && s.trim() !== '' ? n : null;
};

type YesNo = 'yes' | 'no' | 'skip' | null;

export function OnboardingPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [height, setHeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex>('female');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [pregnancy, setPregnancy] = useState<YesNo>(null);
  const [medical, setMedical] = useState<YesNo>(null);
  const [ed, setEd] = useState<YesNo>(null);
  const [result, setResult] = useState<RouterOutputs['me']['submitQuestionnaire'] | null>(null);

  const submit = useMutation(
    trpc.me.submitQuestionnaire.mutationOptions({
      onSuccess: (r) => setResult(r),
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );

  if (result) {
    return (
      <Results
        result={result}
        onDone={async () => {
          await qc.invalidateQueries();
          navigate('/', { replace: true });
        }}
      />
    );
  }

  const w = num(weight);
  const t = num(target);
  const h = num(height);
  const steps: Array<{ title: string; valid: boolean; body: ReactNode }> = [
    {
      title: 'Вес и цель',
      valid: !!w && !!t && w >= 30 && w <= 350 && t >= 30 && t <= 350,
      body: (
        <div className="flex flex-col gap-4">
          <Field label="Текущий вес, кг">
            <Input inputMode="decimal" placeholder="Например, 78,5" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
          </Field>
          <Field label="Желаемый вес, кг">
            <Input inputMode="decimal" placeholder="Например, 65" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </div>
      ),
    },
    {
      title: 'Рост и возраст',
      valid: !!h && h >= 120 && h <= 230 && /^\d{4}-\d{2}-\d{2}$/.test(birthDate),
      body: (
        <div className="flex flex-col gap-4">
          <Field label="Рост, см">
            <Input inputMode="numeric" placeholder="Например, 165" value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
          <Field label="Дата рождения">
            <Input type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
          <Field label="Пол" hint="Нужен для формулы расчёта обмена веществ.">
            <div className="flex gap-2">
              {(['female', 'male'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={cn('flex-1 rounded-xl px-4 py-2.5 ring-1', sex === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-stone-200')}
                >
                  {s === 'female' ? 'Женский' : 'Мужской'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      ),
    },
    {
      title: 'Физическая активность',
      valid: !!activity,
      body: (
        <div className="flex flex-col gap-2">
          {ACTIVITY_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setActivity(level)}
              className={cn(
                'rounded-xl px-4 py-3 text-left ring-1 transition',
                activity === level ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-stone-200',
              )}
            >
              <div className="font-medium text-stone-900">{ACTIVITY_INFO[level].label}</div>
              <div className="text-sm text-stone-500">{ACTIVITY_INFO[level].hint}</div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'Несколько важных вопросов',
      valid: pregnancy !== null && medical !== null,
      body: (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-stone-600">Ответы помогают рассчитать безопасные ориентиры. Их увидит только ваш наставник.</p>
          <Question label="Вы сейчас беременны или кормите грудью?" value={pregnancy} onChange={setPregnancy} />
          <Question label="Есть ли заболевания, при которых питание нужно согласовывать с врачом?" value={medical} onChange={setMedical} />
          <Question label="Был ли у вас опыт расстройства пищевого поведения?" value={ed} onChange={setEd} allowSkip />
        </div>
      ),
    },
  ];
  const current = steps[step]!;
  const last = step === steps.length - 1;

  return (
    <div className="flex min-h-dvh flex-col px-4 py-6">
      <div className="mb-6 flex gap-1.5">
        {steps.map((_, i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand-500' : 'bg-stone-200')} />
        ))}
      </div>
      <p className="text-sm text-stone-500">
        Шаг {step + 1} из {steps.length}
      </p>
      <h1 className="mb-5 text-2xl font-semibold text-stone-900">{current.title}</h1>
      <div className="flex-1">{current.body}</div>
      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Назад
          </Button>
        )}
        <Button
          className="flex-1"
          size="lg"
          disabled={!current.valid}
          loading={submit.isPending}
          onClick={() => {
            if (!last) return setStep(step + 1);
            submit.mutate({
              weightKg: w!,
              targetWeightKg: t!,
              heightCm: h!,
              birthDate,
              activityLevel: activity!,
              sex,
              pregnancyOrLactation: pregnancy === 'yes',
              medicalConditions: medical === 'yes',
              edHistory: ed === 'skip' || ed === null ? null : ed === 'yes',
            });
          }}
        >
          {last ? 'Рассчитать' : 'Далее'}
        </Button>
      </div>
    </div>
  );
}

function Question({ label, value, onChange, allowSkip }: { label: string; value: YesNo; onChange: (v: YesNo) => void; allowSkip?: boolean }) {
  const options: Array<[YesNo, string]> = [
    ['no', 'Нет'],
    ['yes', 'Да'],
    ...(allowSkip ? ([['skip', 'Не хочу отвечать']] as Array<[YesNo, string]>) : []),
  ];
  return (
    <div>
      <p className="mb-2 text-[15px] text-stone-800">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(v)}
            className={cn('rounded-xl px-4 py-2 text-sm ring-1', value === v ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-stone-200')}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Results({ result, onDone }: { result: RouterOutputs['me']['submitQuestionnaire']; onDone: () => void }) {
  const r = result.result;
  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold text-stone-900">Ваши ориентиры</h1>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Индекс массы тела" value={fmt1(r.bmi)} hint={BMI_CATEGORY_LABELS[r.bmiCategory]} />
        <Metric label="Базовый обмен" value={`${fmt0(r.bmr)} ккал`} hint="в покое" />
        <Metric label="Суточная потребность" value={`${fmt0(r.tdee)} ккал`} hint="с учётом активности" />
        <Metric
          label="Ориентир на день"
          value={`${fmt0(r.kcal)} ккал`}
          hint={r.mode === 'deficit' ? `дефицит ${Math.round(r.deficitPct * 100)}%` : 'поддержание веса'}
        />
      </div>
      <Card className="mt-3">
        <div className="text-sm text-stone-500">Белки / жиры / углеводы</div>
        <div className="mt-1 text-lg font-semibold text-stone-900">
          {r.proteinG} / {r.fatG} / {r.carbsG} г
        </div>
        <div className="text-sm text-stone-500">
          {r.percents.protein}% / {r.percents.fat}% / {r.percents.carbs}%
        </div>
      </Card>
      {(r.notes.length > 0 || !result.applied) && (
        <Card className="mt-3 bg-amber-50/60">
          <ul className="flex flex-col gap-1.5 text-sm text-stone-700">
            {!result.applied && <li>Наставник уже установил для вас цели — они сохранятся.</li>}
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {r.requiresReview && <li>Наставник проверит расчёт и при необходимости скорректирует цели.</li>}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs leading-relaxed text-stone-500">{TARGETS_DISCLAIMER}</p>
      <Button size="lg" className="mt-6" onClick={onDone}>
        Начать дневник
      </Button>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900">{value}</div>
      <div className="text-xs text-stone-500">{hint}</div>
    </Card>
  );
}
