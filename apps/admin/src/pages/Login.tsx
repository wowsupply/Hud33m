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
  const [sent, setSent] = useState(false);
  const request = useMutation(trpc.auth.requestCode.mutationOptions({ onSuccess: () => setSent(true), onError: (e) => toast(errorMessage(e), 'error') }));
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
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-stone-200">
        <img src="/icon.svg" alt="" className="mb-4 h-12 w-12 rounded-xl" />
        <h1 className="text-xl font-semibold text-stone-900">Кабинет наставника</h1>
        <p className="mb-6 mt-1 text-sm text-stone-500">Вход по номеру телефона</p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (sent) verify.mutate({ phone, code });
            else request.mutate({ phone });
          }}
        >
          <Field label="Телефон">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} placeholder="+7 999 123-45-67" autoFocus />
          </Field>
          {sent && (
            <Field label="Код из SMS">
              <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} autoFocus />
            </Field>
          )}
          <Button type="submit" size="lg" loading={request.isPending || verify.isPending}>
            {sent ? 'Войти' : 'Получить код'}
          </Button>
          {sent && (
            <button type="button" className="text-sm text-stone-500" onClick={() => setSent(false)}>
              Изменить номер
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
