import { APP_NAME } from '@hud/shared';
import { Button, Field, Input, errorMessage, toast } from '@hud/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTRPC } from '../lib/trpc';

export function LoginPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get('phone') ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const request = useMutation(
    trpc.auth.requestCode.mutationOptions({
      onSuccess: (r) => {
        setStep('code');
        setResendIn(r.resendInSec);
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const verify = useMutation(
    trpc.auth.verifyCode.mutationOptions({
      onSuccess: () => {
        // Сбрасываем кэш: в нём лежит ответ «не авторизован» с экрана входа.
        qc.clear();
        navigate('/', { replace: true });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/icons/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-semibold text-stone-900">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-stone-500">Вход для участниц программы</p>
      </div>

      {step === 'phone' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate({ phone });
          }}
        >
          <Field label="Номер телефона">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 999 123-45-67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </Field>
          <Button type="submit" size="lg" loading={request.isPending} disabled={phone.replace(/\D/g, '').length < 10}>
            Получить код
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate({ phone, code });
          }}
        >
          <p className="text-sm text-stone-600">
            Если номер {phone} зарегистрирован, на него придёт код. Если кода нет — проверьте номер или напишите наставнику.
          </p>
          <Field label="Код из SMS">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-[0.4em]"
              autoFocus
            />
          </Field>
          <Button type="submit" size="lg" loading={verify.isPending} disabled={code.length < 4}>
            Войти
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-stone-500" onClick={() => setStep('phone')}>
              Изменить номер
            </button>
            <button
              type="button"
              className="text-brand-700 disabled:text-stone-400"
              disabled={resendIn > 0 || request.isPending}
              onClick={() => request.mutate({ phone })}
            >
              {resendIn > 0 ? `Отправить снова через ${resendIn} с` : 'Отправить код снова'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
