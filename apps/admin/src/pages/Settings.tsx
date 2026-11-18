import { Badge, Button, Card, errorMessage, Field, Input, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageTitle } from '../components/Shell';
import { useTRPC } from '../lib/trpc';

export function SettingsPage() {
  const trpc = useTRPC();
  const session = useQuery(trpc.auth.session.queryOptions());
  const required = session.data?.totpSetupRequired;
  return (
    <div className="max-w-2xl">
      <PageTitle title="Настройки" subtitle="Защита входа и уведомления" />
      {required && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          В кабинете видны данные учениц о здоровье, поэтому вход защищён вторым фактором. Подключите его, чтобы продолжить работу.
        </div>
      )}
      <div className="flex flex-col gap-4">
        <TotpCard enabled={!!session.data?.user?.totpEnabled} required={!!required} />
        {!required && <MessengersCard />}
      </div>
    </div>
  );
}

function TotpCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 }).then(setQr);
  }, [setup]);
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const begin = useMutation(trpc.auth.totpBegin.mutationOptions({ onSuccess: setSetup, onError }));
  const confirm = useMutation(
    trpc.auth.totpConfirm.mutationOptions({
      onSuccess: async () => {
        toast('Двухфакторная защита подключена', 'success');
        setSetup(null);
        setCode('');
        await qc.invalidateQueries();
        if (required) navigate('/', { replace: true });
      },
      onError,
    }),
  );
  const disable = useMutation(
    trpc.auth.totpDisable.mutationOptions({
      onSuccess: async () => {
        toast('Двухфакторная защита отключена');
        setCode('');
        await qc.invalidateQueries();
      },
      onError,
    }),
  );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Двухфакторная защита</h3>
        {enabled ? <Badge tone="brand">подключена</Badge> : <Badge tone="warm">не подключена</Badge>}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        Кроме кода из SMS при входе нужен код из приложения-аутентификатора на телефоне (Яндекс Ключ, Google Authenticator и другие).
      </p>
      {!enabled && !setup && (
        <Button className="mt-3" onClick={() => begin.mutate()} loading={begin.isPending}>
          Подключить
        </Button>
      )}
      {setup && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
          {qr ? <img src={qr} alt="QR-код для приложения-аутентификатора" className="h-[220px] w-[220px] rounded-xl ring-1 ring-stone-200" /> : <div className="h-[220px] w-[220px]" />}
          <div className="flex flex-col gap-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-stone-700">
              <li>Откройте приложение-аутентификатор и отсканируйте QR-код.</li>
              <li>Или введите ключ вручную: <span className="break-all font-mono text-stone-900">{setup.secret}</span></li>
              <li>Введите 6 цифр, которые покажет приложение.</li>
            </ol>
            <Field label="Код из приложения">
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-40" />
            </Field>
            <Button className="self-start" disabled={code.length !== 6} loading={confirm.isPending} onClick={() => confirm.mutate({ code })}>
              Подтвердить
            </Button>
          </div>
        </div>
      )}
      {enabled && !required && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Чтобы отключить, введите код из приложения">
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-40" />
          </Field>
          <Button variant="danger" disabled={code.length !== 6} loading={disable.isPending} onClick={() => disable.mutate({ code })}>
            Отключить
          </Button>
        </div>
      )}
    </Card>
  );
}

function MessengersCard() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const channels = useQuery(trpc.me.channels.queryOptions());
  const link = useMutation(trpc.me.linkMessenger.mutationOptions({ onError: (e) => toast(errorMessage(e), 'error') }));
  const unlink = useMutation(trpc.me.unlinkMessenger.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.me.channels.queryKey() }) }));
  const list = channels.data?.messengers ?? [];
  return (
    <Card>
      <h3 className="font-semibold">Уведомления в мессенджере</h3>
      <p className="mt-1 text-sm text-stone-600">Ответы учениц и тревожные сигналы будут приходить в бота.</p>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-stone-400">Боты не настроены на сервере (см. docs/DEPLOY.md).</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {list.map((m) => (
            <div key={m.channel} className="flex items-center justify-between">
              <span>
                {m.title} {m.linked && <Badge tone="brand">подключён</Badge>}
              </span>
              {m.linked ? (
                <Button size="sm" variant="ghost" onClick={() => unlink.mutate({ channel: m.channel })}>
                  Отключить
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const { url } = await link.mutateAsync({ channel: m.channel });
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  Подключить
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
