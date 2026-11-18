import { Badge, Button, Card, errorMessage, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getPushState, subscribeToPush, unsubscribeFromPush, type PushState } from '../lib/push';
import { useTRPC } from '../lib/trpc';

/** Уведомления на телефон (Web Push) и бот в мессенджере. */
export function ChannelsCard() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const channels = useQuery(trpc.me.channels.queryOptions());
  const [state, setState] = useState<PushState | null>(null);
  const refresh = () => getPushState().then(setState).catch(() => setState('unsupported'));
  useEffect(() => {
    void refresh();
  }, []);

  const subscribe = useMutation(trpc.me.subscribePush.mutationOptions());
  const unsubscribe = useMutation(trpc.me.unsubscribePush.mutationOptions());
  const link = useMutation(trpc.me.linkMessenger.mutationOptions({ onError: (e) => toast(errorMessage(e), 'error') }));
  const unlink = useMutation(
    trpc.me.unlinkMessenger.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.me.channels.queryKey() }) }),
  );

  const enablePush = async () => {
    try {
      const key = channels.data?.push.publicKey;
      if (!key) throw new Error('Push-уведомления пока не настроены на сервере');
      await subscribe.mutateAsync(await subscribeToPush(key));
      toast('Уведомления включены', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
    await refresh();
    await qc.invalidateQueries({ queryKey: trpc.me.channels.queryKey() });
  };
  const disablePush = async () => {
    const endpoint = await unsubscribeFromPush();
    if (endpoint) await unsubscribe.mutateAsync({ endpoint });
    await refresh();
  };

  const pushConfigured = !!channels.data?.push.publicKey;
  const messengers = channels.data?.messengers ?? [];

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-stone-800">Уведомления на телефон</span>
          {state === 'enabled' ? (
            <Badge tone="brand">включены</Badge>
          ) : state === 'denied' ? (
            <Badge tone="warm">запрещены</Badge>
          ) : null}
        </div>
        {!pushConfigured ? (
          <p className="mt-1 text-xs text-stone-500">Пока недоступны — сервер ещё не настроен.</p>
        ) : state === 'needs-install' ? (
          <p className="mt-1 text-xs text-stone-500">
            На iPhone уведомления работают, когда приложение открыто с экрана «Домой».{' '}
            <Link to="/install" className="text-brand-700 underline">
              Как установить
            </Link>
          </p>
        ) : state === 'denied' ? (
          <p className="mt-1 text-xs text-stone-500">Разрешите уведомления для этого сайта в настройках телефона или браузера.</p>
        ) : state === 'unsupported' ? (
          <p className="mt-1 text-xs text-stone-500">Этот браузер не поддерживает уведомления. Подключите бота в мессенджере ниже.</p>
        ) : state === 'enabled' ? (
          <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={disablePush}>
            Выключить на этом устройстве
          </Button>
        ) : (
          <Button size="sm" className="mt-2" onClick={enablePush} loading={subscribe.isPending}>
            Включить уведомления
          </Button>
        )}
      </div>

      {messengers.length > 0 && (
        <div className="border-t border-stone-100 pt-3">
          <div className="text-[15px] text-stone-800">Напоминания в мессенджере</div>
          <p className="mt-0.5 text-xs text-stone-500">Бот будет присылать напоминания и сообщать о комментариях наставника.</p>
          <div className="mt-2 flex flex-col gap-2">
            {messengers.map((m) => (
              <div key={m.channel} className="flex items-center justify-between gap-3">
                <span className="text-sm text-stone-700">{m.title}</span>
                {m.linked ? (
                  <Button size="sm" variant="ghost" onClick={() => unlink.mutate({ channel: m.channel })}>
                    Отключить
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={link.isPending && link.variables?.channel === m.channel}
                    onClick={async () => {
                      const { url } = await link.mutateAsync({ channel: m.channel });
                      window.location.href = url;
                    }}
                  >
                    Подключить
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Подсказка на главном экране: включить уведомления (один раз, можно скрыть). */
export function PushPrompt() {
  const trpc = useTRPC();
  const channels = useQuery(trpc.me.channels.queryOptions());
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('hud:push-prompt-hidden') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    void getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);
  const anyMessenger = channels.data?.messengers.some((m) => m.linked);
  if (hidden || !channels.data?.push.publicKey || anyMessenger || !(state === 'available' || state === 'needs-install')) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem('hud:push-prompt-hidden', '1');
    } catch {
      /* без хранилища — просто скрываем до перезагрузки */
    }
  };
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
      <div className="flex-1 text-sm text-brand-900">
        {state === 'needs-install'
          ? 'Чтобы получать напоминания о взвешивании, установите приложение на экран «Домой».'
          : 'Включите напоминания о взвешивании и комментариях наставника.'}
        <div className="mt-1.5">
          <Link to={state === 'needs-install' ? '/install' : '/profile'} className="font-medium text-brand-700 underline">
            {state === 'needs-install' ? 'Как установить' : 'Включить в профиле'}
          </Link>
        </div>
      </div>
      <button type="button" onClick={hide} className="text-brand-700/60" aria-label="Скрыть подсказку">
        ✕
      </button>
    </div>
  );
}
