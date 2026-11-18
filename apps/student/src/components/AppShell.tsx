import { CONSENT_DOCS, CONSENT_TYPES, formatDateRu } from '@hud/shared';
import { cn, EmptyState, isUnauthorized, PageLoader } from '@hud/ui';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

export type Me = RouterOutputs['me']['get'];
const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe вне AppShell');
  return me;
}

const FREE_PATHS = ['/consents', '/onboarding'];

export function AppShell() {
  const trpc = useTRPC();
  const location = useLocation();
  const me = useQuery(trpc.me.get.queryOptions());

  if (me.isPending) return <PageLoader />;
  if (me.error) {
    if (isUnauthorized(me.error)) return <Navigate to="/login" replace />;
    return (
      <EmptyState
        title="Не удалось загрузить данные"
        text="Проверьте подключение к интернету и попробуйте ещё раз."
        action={
          <button className="text-brand-700 underline" onClick={() => me.refetch()}>
            Повторить
          </button>
        }
      />
    );
  }

  const data = me.data;
  if (data.user.role !== 'student') return <EmptyState title="Это приложение для учениц" text="Для наставника — веб-кабинет." />;
  const access = data.access!;
  if (!access.canRead) return <AccessClosed />;

  const needConsents = CONSENT_TYPES.some((t) => CONSENT_DOCS[t].required && !data.consents?.[t].accepted);
  if (needConsents && location.pathname !== '/consents') return <Navigate to="/consents" replace />;
  if (!needConsents && !data.onboarded && !FREE_PATHS.includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />;
  }
  const bare = FREE_PATHS.includes(location.pathname);

  return (
    <MeContext.Provider value={data}>
      <div className={cn('mx-auto min-h-dvh max-w-xl', !bare && 'pb-24')}>
        {!bare && <AccessBanner />}
        <Outlet />
      </div>
      {!bare && <BottomNav />}
    </MeContext.Provider>
  );
}

function AccessBanner() {
  const { access } = useMe();
  if (!access || access.status === 'active') {
    if (access && access.daysLeft != null && access.daysLeft <= 3) {
      return (
        <Banner>
          Доступ действует до {formatDateRu(access.endsOn!)}. Чтобы продлить, напишите наставнику.
        </Banner>
      );
    }
    return null;
  }
  const text =
    access.status === 'not_started'
      ? `Доступ откроется ${formatDateRu(access.startsOn!)}. Пока можно осмотреться.`
      : access.status === 'paused'
        ? 'Доступ приостановлен. Записи доступны для просмотра.'
        : 'Программа завершена. Ваши записи сохранены и доступны для просмотра. Чтобы продолжить, напишите наставнику.';
  return <Banner>{text}</Banner>;
}

function Banner({ children }: { children: ReactNode }) {
  return <div className="mx-4 mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{children}</div>;
}

function AccessClosed() {
  return (
    <div className="mx-auto max-w-md px-6 pt-24 text-center">
      <h1 className="text-xl font-semibold text-stone-900">Доступ к приложению закрыт</h1>
      <p className="mt-3 text-stone-600">Чтобы продолжить работу, свяжитесь с наставником.</p>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Сегодня', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { to: '/weight', label: 'Вес', icon: 'M4 18l5-6 4 3 7-9M15 6h5v5' },
  { to: '/reports', label: 'Отчёты', icon: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3' },
  { to: '/feedback', label: 'Общение', icon: 'M4 5h16v11H8l-4 4z' },
  { to: '/profile', label: 'Профиль', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
];

function BottomNav() {
  const trpc = useTRPC();
  const unread = useQuery({ ...trpc.comms.unread.queryOptions(), refetchInterval: 60_000 });
  const badge = (unread.data?.comments ?? 0) + (unread.data?.notifications ?? 0);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                isActive ? 'text-brand-700' : 'text-stone-500',
              )
            }
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            {item.label}
            {item.to === '/feedback' && badge > 0 && (
              <span className="absolute right-[calc(50%-20px)] top-1 min-w-4 rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-5">
      <div className="flex min-w-0 items-start gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <NavLink to={to} className="-ml-1 mt-1 rounded-full p-1 text-stone-500 hover:bg-stone-100" aria-label="Назад">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </NavLink>
  );
}
