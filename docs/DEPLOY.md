# Развёртывание

Схема: одна виртуальная машина в российском облаке (Yandex Cloud, Selectel, VK Cloud, Timeweb Cloud),
Docker Compose, Caddy с автоматическими TLS-сертификатами. Для продакшена базу лучше взять
управляемую (с автоматическими бэкапами и восстановлением на момент времени).

## 1. Что нужно заранее

- ВМ: 2–4 vCPU, 4–8 ГБ RAM, Ubuntu 24.04, Docker с плагином compose.
- Два домена (или поддомена), направленных на IP машины, например:
  - `app.example.ru` — приложение учениц;
  - `admin.example.ru` — кабинет наставника.
- SMS-провайдер (для кодов входа) и, при необходимости, ключи ИИ-провайдера.

## 2. Настройка

```bash
git clone <репозиторий> hud && cd hud
cp .env.example .env
```

В `.env` для продакшена:

```env
NODE_ENV=production
APP_SECRET=<длинная случайная строка: openssl rand -hex 32>
PUBLIC_STUDENT_URL=https://app.example.ru
PUBLIC_ADMIN_URL=https://admin.example.ru
SMS_PROVIDER=smsru
SMSRU_API_ID=<ключ>
AI_PROVIDER=local            # или gigachat / yandexgpt после выбора провайдера
TRUST_PROXY=true
# DEV_OTP_CODE в продакшене задавать нельзя — сервер не запустится
```

Переменные для docker compose (можно в том же `.env` или в окружении):

```env
POSTGRES_PASSWORD=<пароль базы>
STUDENT_DOMAIN=app.example.ru
ADMIN_DOMAIN=admin.example.ru
```

## 3. Запуск

```bash
docker compose up -d --build
```

Сервис `migrate` применяет миграции и заполняет справочники при каждом запуске (идемпотентно),
после него стартуют `api`, `worker` (напоминания, сроки доступа, недельные отчёты) и `web` (Caddy).

Первый администратор (владелец проекта):

```bash
docker compose run --rm api node --import tsx src/scripts/create-admin.ts --phone "+79991234567" --name "Имя" --last "Фамилия"
```

Дальше вход в кабинет — по номеру телефона и коду из SMS.

## 4. Обновление

```bash
git pull && docker compose up -d --build
```

## 5. Бэкапы

- Управляемая PostgreSQL: включить ежедневные бэкапы и восстановление на момент времени, хранение 30 дней.
- Своя PostgreSQL из compose: ежедневный `pg_dump` в объектное хранилище, например:
  ```bash
  docker compose exec -T db pg_dump -U postgres hud | gzip > hud-$(date +%F).sql.gz
  ```
- Раз в квартал — проверять восстановление на тестовой машине.

## 6. ИИ-провайдеры

- **GigaChat**: серверы используют сертификаты НУЦ Минцифры. Скачайте корневой сертификат
  «Russian Trusted Root CA», положите в контейнер и задайте `NODE_EXTRA_CA_CERTS=/путь/к/сертификату.pem`.
  Нужны `GIGACHAT_AUTH_KEY` (ключ авторизации из личного кабинета) и `GIGACHAT_SCOPE`
  (`GIGACHAT_API_PERS` для физлиц, `GIGACHAT_API_B2B`/`GIGACHAT_API_CORP` для юрлиц).
- **YandexGPT**: `YANDEX_API_KEY` (API-ключ сервисного аккаунта с ролью `ai.languageModels.user`)
  и `YANDEX_FOLDER_ID`.

Адаптеры написаны по документации и проверены на имитации ответов. Перед запуском их нужно проверить
на реальных ключах. Если модель недоступна или её ответ не проходит проверку, приложение
автоматически переходит на правила и шаблоны — дневник продолжает работать.

## 7. Юридическое (до запуска)

- Уведомление Роскомнадзора об обработке персональных данных (вероятно, со сведениями о здоровье).
- Тексты политики и согласий от юриста — заменить черновики в `packages/shared/src/constants.ts`
  (`CONSENT_DOCS`), увеличив `version`.
- Хостинг и база — только в РФ.
