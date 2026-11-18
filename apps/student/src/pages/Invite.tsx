import { APP_NAME } from '@hud/shared';
import { Button, PageLoader } from '@hud/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { useTRPC } from '../lib/trpc';
import { isStandalone } from '../lib/platform';
import { InstallSteps } from './Install';

export function InvitePage() {
  const { token = '' } = useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invite = useQuery(trpc.auth.invite.queryOptions({ token }));

  if (invite.isPending) return <PageLoader />;
  const info = invite.data;
  const login = () => navigate(`/login${info ? `?phone=${encodeURIComponent(info.phone)}` : ''}`);

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <img src="/icons/icon.svg" alt="" className="mb-5 h-14 w-14 rounded-2xl" />
      <h1 className="text-2xl font-semibold text-stone-900">
        {info ? `Здравствуйте, ${info.firstName}!` : 'Добро пожаловать!'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
        {info
          ? `Это ${APP_NAME.toLowerCase()} вашей программы. Здесь вы будете отмечать вес, питание и самочувствие, а наставник — видеть вашу динамику и давать обратную связь.`
          : 'Ссылка-приглашение устарела. Попросите наставника прислать новую или войдите по номеру телефона.'}
      </p>

      {!isStandalone() && (
        <>
          <h2 className="mb-3 mt-6 font-semibold text-stone-900">1. Установите приложение на телефон</h2>
          <InstallSteps />
          <h2 className="mb-3 mt-6 font-semibold text-stone-900">2. Войдите по номеру телефона</h2>
        </>
      )}
      <Button size="lg" onClick={login} className="mt-2">
        Войти
      </Button>
    </div>
  );
}
