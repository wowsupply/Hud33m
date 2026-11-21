# Запуск проекта на своём компьютере (Windows)

Инструкция для Windows 10/11. На macOS и Linux шаги те же, отличаются только установщики.

## 1. Установить программы (один раз)

| Что | Где взять | Проверка в терминале |
|---|---|---|
| Git | https://git-scm.com/download/win | `git --version` |
| Node.js 22 LTS | https://nodejs.org (версия 22.x, установщик .msi) | `node -v` → v22… |
| pnpm | в терминале: `corepack enable` (входит в Node.js) | `pnpm -v` |
| PostgreSQL 16 | https://www.postgresql.org/download/windows/ — при установке задайте пароль `postgres` для пользователя `postgres`, порт 5432 | `psql --version` |
| Claude Code | https://claude.com/claude-code (или приложение Claude для компьютера) | `claude --version` |

Вместо установки PostgreSQL можно поставить Docker Desktop и поднять базу одной командой (см. шаг 3).

Терминал — «PowerShell» или «Терминал Windows». Если `corepack enable` ругается на права,
запустите терминал от имени администратора.

## 2. Скачать проект

```powershell
cd $HOME\Documents
git clone -b claude/app-planning-discussion-7d615f https://github.com/wowsupply/Hud33m.git
cd Hud33m
pnpm install
```

## 3. База данных

Вариант А — установленный PostgreSQL: создайте базу `hud`:

```powershell
psql -U postgres -c "CREATE DATABASE hud;"
```

Вариант Б — Docker Desktop:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

## 4. Настройки и первый запуск

```powershell
copy .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm create-admin --phone "+79990000000" --name "Анна"
pnpm dev
```

Откроются:
- приложение ученицы — http://localhost:5173
- кабинет наставника — http://localhost:5174 (телефон администратора, код входа `111111` из `.env`)

Остановить — `Ctrl+C` в терминале.

## 5. Проверки

```powershell
pnpm typecheck
pnpm test
```

Тестам нужна запущенная PostgreSQL с паролем `postgres` (база `hud_test` создаётся сама).

## 6. Работа с Claude с телефона

В папке проекта запустите Claude Code в режиме удалённого управления:

```powershell
claude remote-control
```

или откройте папку проекта в приложении Claude для компьютера. Сессия появится в приложении Claude
на телефоне — оттуда можно смотреть за работой и писать сообщения, а всё выполняется на компьютере.
Компьютер должен быть включён и не уходить в сон, пока идёт работа.

Контекст проекта для Claude — в файле `CLAUDE.md` в корне репозитория.
