import { cn, EmptyState, isUnauthorized, PageLoader } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router';
import { useTRPC, type RouterOutputs } from '../lib/trpc';

type SessionUser = NonNullable<RouterOutputs['auth']['session']['user']>;
const UserContext = createContext<SessionUser | null>(null);
export const useStaff = () => useContext(UserContext)!;

const NAV = [
  { to: '/', label: 'Требуют внимания', end: true },
  { to: '/students', label: 'Ученицы' },
  { to: '/programs', label: 'Программы' },
  { to: '/reference', label: 'Справочники' },
];

export function Shell() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useQuery(trpc.auth.session.queryOptions());
  const unread = useQuery({ ...trpc.comms.unread.queryOptions(), refetchInterval: 60_000, enabled: !!session.data?.user });
  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        qc.clear();
        navigate('/login', { replace: true });
      },
    }),
  );

  if (session.isPending) return <PageLoader />;
  if (session.error && !isUnauthorized(session.error)) return <EmptyState title="Нет связи с сервером" />;
  const user = session.data?.user;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'student') return <EmptyState title="Кабинет только для наставников" />;

  return (
    <UserContext.Provider value={user}>
      <div className="min-h-dvh lg:flex">
        <aside className="border-b border-stone-200 bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <div className="leading-tight">
                <div className="font-semibold text-stone-900">Кабинет</div>
                <div className="text-xs text-stone-500">наставника</div>
              </div>
            </div>
            <button className="rounded-lg p-2 text-stone-600 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Меню">
              ☰
            </button>
          </div>
          <nav className={cn('flex-col gap-1 px-3 pb-4 lg:flex', menuOpen ? 'flex' : 'hidden')}>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn('rounded-xl px-3 py-2 text-[15px]', isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-stone-600 hover:bg-stone-50')
                }
              >
                {n.label}
                {n.to === '/' && (unread.data?.notifications ?? 0) > 0 && (
                  <span className="ml-2 rounded-full bg-brand-600 px-1.5 text-xs text-white">{unread.data?.notifications}</span>
                )}
              </NavLink>
            ))}
            <div className="mt-4 border-t border-stone-100 px-3 pt-4 text-sm">
              <div className="font-medium text-stone-800">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-stone-500">{user.role === 'admin' ? 'Администратор' : 'Наставник'}</div>
              <button className="mt-2 text-stone-500 hover:text-stone-800" onClick={() => logout.mutate()}>
                Выйти
              </button>
            </div>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </UserContext.Provider>
  );
}

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-stone-500">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
