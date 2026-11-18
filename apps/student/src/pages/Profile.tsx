import { formatDateRu, formatPhone } from '@hud/shared';
import type { NotificationSettingsInput } from '@hud/shared/schemas';
import { Button, Card, downloadJson, errorMessage, fmt0, Input, PageLoader, SectionTitle, Switch, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader, useMe } from '../components/AppShell';
import { ChannelsCard } from '../components/ChannelsCard';
import { useTRPC } from '../lib/trpc';

export function ProfilePage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const settings = useQuery(trpc.me.settings.queryOptions());
  const [ns, setNs] = useState<NotificationSettingsInput | null>(null);

  useEffect(() => {
    if (settings.data) {
      const { userId: _u, updatedAt: _t, ...rest } = settings.data.notifications;
      setNs(rest);
    }
  }, [settings.data]);

  const saveSettings = useMutation(
    trpc.me.updateSettings.mutationOptions({
      onSuccess: () => toast('Настройки сохранены', 'success'),
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );
  const accept = useMutation(trpc.me.acceptConsents.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.me.get.queryKey() }) }));
  const revoke = useMutation(trpc.me.revokeConsent.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.me.get.queryKey() }) }));
  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        qc.clear();
        navigate('/login', { replace: true });
      },
    }),
  );
  const exporting = useMutation({
    mutationFn: () => qc.fetchQuery(trpc.me.exportData.queryOptions()),
    onSuccess: (data) => downloadJson(`dnevnik-${new Date().toISOString().slice(0, 10)}.json`, data),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const access = me.access!;
  const t = me.targets;
  const update = (patch: Partial<NotificationSettingsInput>) => {
    if (!ns) return;
    const next = { ...ns, ...patch };
    setNs(next);
    saveSettings.mutate({ notifications: next });
  };

  return (
    <div className="pb-6">
      <PageHeader title={`${me.user.firstName} ${me.user.lastName}`.trim()} subtitle={formatPhone(me.user.phone)} />
      <div className="px-4">
        <Card>
          <div className="text-sm text-stone-500">{access.programName ?? 'Программа'}</div>
          <div className="mt-0.5 font-medium text-stone-900">
            {access.startsOn && access.endsOn ? `${formatDateRu(access.startsOn)} — ${formatDateRu(access.endsOn, { withYear: true })}` : '—'}
          </div>
          {access.status === 'active' && access.daysLeft != null && <div className="text-sm text-stone-500">Осталось дней: {access.daysLeft}</div>}
        </Card>

        <SectionTitle>Мои ориентиры</SectionTitle>
        <Card>
          {t ? (
            <>
              <div className="text-xl font-semibold text-stone-900">{fmt0(t.kcal)} ккал в день</div>
              <div className="text-sm text-stone-600">
                Белки {t.proteinG} г · Жиры {t.fatG} г · Углеводы {t.carbsG} г
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {t.source === 'mentor' ? 'Согласовано с наставником' : 'Рассчитано по анкете'}
                {t.comment ? ` · ${t.comment}` : ''}
              </div>
            </>
          ) : (
            <p className="text-sm text-stone-500">Ориентиры появятся после анкеты.</p>
          )}
        </Card>

        <SectionTitle>Куда присылать уведомления</SectionTitle>
        <ChannelsCard />

        <SectionTitle>Напоминания</SectionTitle>
        <Card>
          {!ns ? (
            <PageLoader />
          ) : (
            <div className="flex flex-col gap-3">
              <Switch checked={ns.weighInEnabled} onChange={(v) => update({ weighInEnabled: v })} label="Утреннее взвешивание" />
              {ns.weighInEnabled && (
                <Input type="time" value={ns.weighInTime} onChange={(e) => update({ weighInTime: e.target.value })} className="w-32" />
              )}
              <Switch checked={ns.diaryEnabled} onChange={(v) => update({ diaryEnabled: v })} label="Напомнить заполнить дневник" />
              {ns.diaryEnabled && <Input type="time" value={ns.diaryTime} onChange={(e) => update({ diaryTime: e.target.value })} className="w-32" />}
              <Switch checked={ns.commentsEnabled} onChange={(v) => update({ commentsEnabled: v })} label="Комментарии наставника" />
              <Switch checked={ns.reportsEnabled} onChange={(v) => update({ reportsEnabled: v })} label="Недельный отчёт" />
              <Switch checked={ns.accessEnabled} onChange={(v) => update({ accessEnabled: v })} label="Окончание доступа" />
              <p className="text-xs text-stone-500">
                Чтобы напоминания приходили на телефон, <Link to="/install" className="text-brand-700 underline">установите приложение на экран</Link>.
              </p>
            </div>
          )}
        </Card>

        <SectionTitle>Согласия</SectionTitle>
        <Card className="flex flex-col gap-3">
          <Switch
            checked={!!me.consents?.ai_processing.accepted}
            onChange={(v) => (v ? accept.mutate({ types: ['ai_processing'] }) : revoke.mutate({ type: 'ai_processing' }))}
            label="Анализ записей с помощью ИИ"
          />
          <Switch
            checked={!!me.consents?.marketing.accepted}
            onChange={(v) => (v ? accept.mutate({ types: ['marketing'] }) : revoke.mutate({ type: 'marketing' }))}
            label="Новости о программах и предложениях"
          />
          <p className="text-xs text-stone-500">Без согласия на ИИ калорийность считается по базе продуктов, а итоги — по шаблону.</p>
        </Card>

        <SectionTitle>Данные</SectionTitle>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => exporting.mutate()} loading={exporting.isPending}>
            Скачать мои данные
          </Button>
          <Link to="/install" className="block">
            <Button variant="secondary" className="w-full">
              Как установить приложение
            </Button>
          </Link>
          <Button variant="danger" onClick={() => logout.mutate()} loading={logout.isPending}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
