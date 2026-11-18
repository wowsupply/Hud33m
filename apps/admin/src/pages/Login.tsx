import { Button, Field, Input, errorMessage, toast } from '@hud/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTRPC } from '../lib/trpc';

export function LoginPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [totp, setTotp] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'totp'>('phone');
  const [challenge, setChallenge] = useState<string | null>(null);

  const enter = () => {
    // Сбрасываем кэш: в нём лежит ответ «не авторизован» с экрана входа.
    qc.clear();
    navigate('/', { replace: true });
  };
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const request = useMutation(trpc.auth.requestCode.mutationOptions({ onSuccess: () => setStep('code'), onError }));
  const verify = useMutation(
    trpc.auth.verifyCode.mutationOptions({
      onSuccess: (r) => {
        if (r.totpChallenge) {
          setChallenge(r.totpChallenge);
          setStep('totp');
        } else enter();
      },
      onError,
    }),
  );
  const verifyTotp = useMutation(trpc.auth.verifyTotp.mutationOptions({ onSuccess: enter, onError }));

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-stone-200">
        <img src="/icon.svg" alt="" className="mb-4 h-12 w-12 rounded-xl" />
        <h1 className="text-xl font-semibold text-stone-900">Кабинет наставника</h1>
        <p className="mb-6 mt-1 text-sm text-stone-500">
          {step === 'totp' ? 'Введите код из приложения-аутентификатора' : 'Вход по номеру телефона'}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 'phone') request.mutate({ phone });
            else if (step === 'code') verify.mutate({ phone, code });
            else if (challenge) verifyTotp.mutate({ challenge, code: totp });
          }}
        >
          {step !== 'totp' && (
            <Field label="Телефон">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={step !== 'phone'} placeholder="+7 999 123-45-67" autoFocus />
            </Field>
          )}
          {step === 'code' && (
            <Field label="Код из SMS">
              <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} autoFocus />
            </Field>
          )}
          {step === 'totp' && (
            <Field label="Код из приложения" hint="Яндекс Ключ, Google Authenticator или другое приложение, которое вы подключили.">
              <Input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} maxLength={6} autoFocus />
            </Field>
          )}
          <Button type="submit" size="lg" loading={request.isPending || verify.isPending || verifyTotp.isPending}>
            {step === 'phone' ? 'Получить код' : 'Войти'}
          </Button>
          {step !== 'phone' && (
            <button
              type="button"
              className="text-sm text-stone-500"
              onClick={() => {
                setStep('phone');
                setCode('');
                setTotp('');
              }}
            >
              Начать заново
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
