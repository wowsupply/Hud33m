import { Card } from '@hud/ui';
import { Link } from 'react-router';
import { isAndroid, isIos, isStandalone } from '../lib/platform';

export function InstallSteps() {
  const ios = isIos();
  const android = isAndroid();
  return (
    <div className="flex flex-col gap-3">
      {(ios || !android) && (
        <Card>
          <h3 className="font-semibold text-stone-900">iPhone</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-stone-700">
            <li>Откройте эту страницу в Safari.</li>
            <li>
              Нажмите кнопку «Поделиться» <span aria-hidden>⬆︎</span> внизу экрана.
            </li>
            <li>Выберите «На экран „Домой“» и нажмите «Добавить».</li>
            <li>Откройте приложение с иконки на экране и войдите.</li>
          </ol>
          <p className="mt-2 text-xs text-stone-500">
            Напоминания на iPhone приходят, только если приложение открыто с экрана «Домой» (iOS 16.4 и новее).
          </p>
        </Card>
      )}
      {(android || !ios) && (
        <Card>
          <h3 className="font-semibold text-stone-900">Android</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-stone-700">
            <li>Откройте эту страницу в Chrome или Яндекс Браузере.</li>
            <li>Нажмите меню ⋮ в правом верхнем углу.</li>
            <li>Выберите «Установить приложение» или «Добавить на главный экран».</li>
            <li>Откройте приложение с иконки и войдите.</li>
          </ol>
        </Card>
      )}
    </div>
  );
}

export function InstallPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-semibold text-stone-900">Как установить приложение</h1>
      <p className="mt-2 text-stone-600">
        {isStandalone()
          ? 'Приложение уже установлено на этом устройстве.'
          : 'Приложение не нужно скачивать из магазина — его можно поставить на экран телефона прямо из браузера.'}
      </p>
      <div className="mt-5">
        <InstallSteps />
      </div>
      <Link to="/" className="mt-6 block text-center text-brand-700">
        Вернуться в приложение
      </Link>
    </div>
  );
}
