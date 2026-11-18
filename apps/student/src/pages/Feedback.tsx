import { Button, Card, cn, EmptyState, errorMessage, PageLoader, Textarea, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

const dt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function FeedbackPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'comments' | 'notifications'>('comments');
  const threads = useQuery(trpc.comms.threads.queryOptions());
  const notifications = useQuery(trpc.comms.notifications.queryOptions());

  const markComments = useMutation(trpc.comms.markRead.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.comms.unread.queryKey() }) }));
  const markNotifications = useMutation(
    trpc.comms.markNotificationsRead.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.comms.unread.queryKey() }) }),
  );

  useEffect(() => {
    if (tab === 'comments' && threads.data?.some((t) => t.unread > 0)) markComments.mutate({});
    if (tab === 'notifications' && notifications.data?.some((n) => !n.readAt)) markNotifications.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, threads.data, notifications.data]);

  return (
    <div>
      <PageHeader title="Общение" subtitle="Комментарии наставника и уведомления" />
      <div className="mx-4 mb-3 flex rounded-xl bg-stone-100 p-1">
        {(
          [
            ['comments', 'Комментарии'],
            ['notifications', 'Уведомления'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn('flex-1 rounded-lg py-2 text-sm', tab === key ? 'bg-white font-medium shadow-sm' : 'text-stone-600')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 px-4">
        {tab === 'comments' ? (
          threads.isPending ? (
            <PageLoader />
          ) : !threads.data?.length ? (
            <EmptyState title="Комментариев пока нет" text="Здесь появится обратная связь наставника по вашим записям." />
          ) : (
            threads.data.map((t) => <Thread key={`${t.targetType}:${t.targetId}`} thread={t} />)
          )
        ) : notifications.isPending ? (
          <PageLoader />
        ) : !notifications.data?.length ? (
          <EmptyState title="Уведомлений нет" />
        ) : (
          notifications.data.map((n) => (
            <Card key={n.id} className={cn(!n.readAt && 'ring-brand-200')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-stone-900">{n.title}</div>
                  {n.body && <p className="mt-0.5 text-sm text-stone-600">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-stone-400">{dt.format(new Date(n.createdAt))}</span>
              </div>
              {n.link && (
                <Link to={n.link} className="mt-2 inline-block text-sm text-brand-700">
                  Открыть →
                </Link>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Thread({ thread }: { thread: RouterOutputs['comms']['threads'][number] }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [open, setOpen] = useState(false);
  const lastStaff = [...thread.comments].reverse().find((c) => c.author.isStaff);
  const send = useMutation(
    trpc.comms.reply.mutationOptions({
      onSuccess: async () => {
        setReply('');
        setOpen(false);
        await qc.invalidateQueries({ queryKey: trpc.comms.threads.queryKey() });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  return (
    <Card>
      <Link to={thread.link} className="text-sm font-medium text-brand-700">
        {thread.title} →
      </Link>
      <div className="mt-3 flex flex-col gap-2">
        {thread.comments.map((c) => (
          <div
            key={c.id}
            className={cn(
              'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[15px]',
              c.author.isStaff ? 'self-start bg-brand-50 text-stone-800' : 'self-end bg-stone-100 text-stone-800',
            )}
          >
            <div className="whitespace-pre-line">{c.body}</div>
            <div className="mt-1 text-[11px] text-stone-400">
              {c.author.isStaff ? c.author.name : 'Вы'} · {dt.format(new Date(c.createdAt))}
            </div>
          </div>
        ))}
      </div>
      {lastStaff &&
        (open ? (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea rows={2} placeholder="Ваш ответ" value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" disabled={!reply.trim()} loading={send.isPending} onClick={() => send.mutate({ parentId: lastStaff.id, body: reply })}>
                Отправить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" className="mt-3 text-sm text-brand-700" onClick={() => setOpen(true)}>
            Ответить
          </button>
        ))}
    </Card>
  );
}
