# Арена переговоров

**Арена** — веб-тренажёр переговоров с разветвлёнными сценариями, системой результатов, геймификацией и административным визуальным конструктором сценариев (Maker).

Текущая версия проекта: **0.4.0**.

Корневой `README.md` является **главной документацией проекта**. Более узкие технические материалы находятся в [`docs/`](docs/) и используются как справочники по отдельным подсистемам.

## Содержание

- [О проекте](#о-проекте)
- [Основные возможности](#основные-возможности)
- [Роли](#роли)
- [Технологический стек](#технологический-стек)
- [Архитектура](#архитектура)
- [Структура проекта](#структура-проекта)
- [Быстрый запуск через Docker](#быстрый-запуск-через-docker)
- [Локальный запуск](#локальный-запуск)
- [Переменные окружения](#переменные-окружения)
- [Как пользоваться проектом](#как-пользоваться-проектом)
- [Maker и сценарии](#maker-и-сценарии)
- [Penalty-модель](#penalty-модель)
- [JSON-формат сценария](#json-формат-сценария)
- [Версионирование сценариев](#версионирование-сценариев)
- [База данных](#база-данных)
- [API и авторизация](#api-и-авторизация)
- [Геймификация](#геймификация)
- [Тесты](#тесты)
- [Backup и restore](#backup-и-restore)
- [Типовые проблемы](#типовые-проблемы)
- [Правила разработки](#правила-разработки)
- [Дополнительная документация](#дополнительная-документация)

---

## О проекте

«Арена переговоров» предназначена для тренировки рабочих переговоров в безопасной среде. Пользователь выбирает сценарий, проходит ветвящийся диалог, видит последствия своих решений и получает разбор результата.

Сценарии детерминированы: текущая версия не использует генеративную AI-модель для свободных ответов. Поля `intent` и `examples` уже предусмотрены в структуре сценария и оставляют возможность подключить AI-интерпретацию позже.

Типовой пользовательский цикл:

```text
Каталог
  ↓
Карточка сценария
  ↓
Создание или продолжение попытки
  ↓
Реплика → реакция → следующая реплика
  ↓
Обычный финал или penalty-финал
  ↓
Результат и разбор
  ↓
XP / навыки / достижения / история
```

Seed проекта содержит два опубликованных сценария:

1. **«Переговоры об условиях работы»**;
2. **«Срыв срока: сохранение зарплаты и условий»**.

---

## Основные возможности

### Для пользователя

- регистрация и авторизация;
- каталог опубликованных сценариев;
- фильтрация сценариев;
- прохождение разветвлённых переговорных тренировок;
- продолжение незавершённой попытки;
- просмотр результата и разбора выбранных реакций;
- история попыток;
- XP, уровни, навыки и достижения;
- мастерство по сценариям;
- отзывы после прохождения;
- профиль пользователя.

### Для администратора

- создание сценария с нуля;
- копирование существующего сценария;
- визуальное редактирование графа в Maker;
- настройка персонажей и этапов;
- создание реплик, реакций и финалов;
- настройка `penalty` для каждой реакции;
- настройка досрочного завершения по накопленным ошибкам;
- анализ достижимого диапазона penalty;
- тестовое прохождение черновика без создания реальной попытки;
- публикация новой неизменяемой версии;
- архивирование сценариев;
- просмотр отзывов и обращений;
- управление достижениями.

Главный администратор также может управлять административными аккаунтами.

---

## Роли

### `user`

Обычный пользователь. Имеет доступ к каталогу, прохождению сценариев, профилю, истории и геймификации.

### `admin`

Администратор. Имеет доступ к административной панели и Maker.

Права на изменение сценария дополнительно проверяются сервером — одного отображения административного интерфейса недостаточно.

### Super admin

Хранится как `role = 'admin'` плюс флаг `is_super_admin`. Может создавать и изменять другие административные аккаунты.

---

## Технологический стек

### Frontend

- React 19;
- TypeScript;
- React Router;
- Vite;
- React Flow (`@xyflow/react`) для Maker;
- CSS.

### Backend

- Node.js `>= 22.12.0`;
- Express 5;
- Zod;
- `pg`;
- cookie-based серверные сессии.

### Данные и инфраструктура

- PostgreSQL;
- SQL migrations;
- Docker / Docker Compose;
- Playwright;
- PGlite для встроенных API-тестов.

---

## Архитектура

```text
┌──────────────────────────────┐
│ Browser                      │
│ React + React Router         │
└──────────────┬───────────────┘
               │ /api/*
               ▼
┌──────────────────────────────┐
│ Node.js + Express            │
│ auth / scenarios / attempts │
│ editor / reviews / admin    │
└──────────────┬───────────────┘
               │ pg
               ▼
┌──────────────────────────────┐
│ PostgreSQL                   │
│ users / sessions / versions │
│ attempts / rewards / drafts │
└──────────────────────────────┘
```

Браузер **не подключается к PostgreSQL напрямую**. Все операции проходят через HTTP API.

### Основные frontend-части

- `src/app/DataProvider.tsx` — текущий пользователь и общий каталог;
- `src/api/client.ts` — HTTP-клиент;
- `src/features/negotiation/` — прохождение сценариев;
- `src/features/maker/` — визуальный редактор;
- `src/features/gamification/` — XP, навыки и достижения;
- `src/pages/` — страницы;
- `src/routes/` — маршруты и guards.

### Основные backend-части

- `server/app.ts` — Express-приложение и API routes;
- `server/auth.ts` — пароли, cookie и сессии;
- `server/db.ts` — PostgreSQL pool и транзакции;
- `server/store.ts` — попытки и версии сценариев;
- `server/migrate.ts` — миграции;
- `server/seed.ts` — начальные сценарии и bootstrap admin;
- `server/normalize-scenarios.ts` — нормализация поддерживаемых legacy-сценариев.

---

## Структура проекта

```text
Cool-Peppers/
├─ src/
│  ├─ api/                     # frontend API client
│  ├─ app/                     # providers и глобальное состояние
│  ├─ components/              # переиспользуемые компоненты
│  ├─ features/
│  │  ├─ maker/                # редактор сценариев
│  │  ├─ negotiation/          # runtime и UI переговоров
│  │  └─ gamification/         # XP, навыки, достижения
│  ├─ pages/                   # страницы приложения
│  ├─ routes/                  # маршрутизация и guards
│  ├─ styles/                  # общие стили
│  └─ types/                   # типы и validation
├─ server/
│  ├─ migrations/              # SQL migrations
│  ├─ app.ts
│  ├─ auth.ts
│  ├─ db.ts
│  ├─ migrate.ts
│  ├─ seed.ts
│  └─ ...
├─ tests/
│  ├─ unit/
│  ├─ api/
│  └─ *.spec.ts                # Playwright
├─ docs/                       # подробные справочники
├─ docker/                     # entrypoint / backup / restore
├─ compose.yaml
├─ compose.db-port.yaml
├─ Dockerfile
├─ package.json
└─ README.md                   # главная документация
```

---

## Быстрый запуск через Docker

Для первого запуска это рекомендуемый вариант.

### 1. Создать `.env`

PowerShell:

```powershell
Copy-Item .env.example .env
```

Обязательно измените пароль PostgreSQL.

Минимальный пример:

```dotenv
COMPOSE_PROJECT_NAME=cool-peppers

POSTGRES_DB=arena
POSTGRES_USER=arena
POSTGRES_PASSWORD=change_me_strong_password

APP_PORT=3001
APP_ORIGIN=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
COOKIE_SECURE=false

POSTGRES_PORT=5433
DATABASE_URL=postgresql://arena:change_me_strong_password@127.0.0.1:5433/arena
```

Опционально можно создать первого администратора:

```dotenv
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_me_admin
```

### 2. Собрать и запустить

```powershell
docker compose up -d --build
```

Для гарантированной пересборки приложения:

```powershell
docker compose build --no-cache app
docker compose up -d --force-recreate
```

### 3. Проверить состояние

```powershell
docker compose ps
docker compose logs -f app postgres
```

После `healthy` приложение доступно по адресу:

```text
http://127.0.0.1:3001
```

### 4. Остановить

```powershell
docker compose down
```

Не используйте `docker compose down -v`, если нужно сохранить текущую БД: `-v` удаляет PostgreSQL volume.

### Доступ к PostgreSQL с Windows

Основной `compose.yaml` оставляет PostgreSQL во внутренней сети Docker.

Если нужен pgAdmin / psql с хоста:

```powershell
docker compose -f compose.yaml -f compose.db-port.yaml up -d
```

После этого используйте:

```text
Host:     127.0.0.1
Port:     значение POSTGRES_PORT из .env
Database: arena
User:     arena
```

---

## Локальный запуск

Потребуются:

- Node.js `>= 22.12.0`;
- npm;
- PostgreSQL.

### 1. Создать пользователя и базу

Под администратором PostgreSQL:

```sql
CREATE ROLE arena WITH LOGIN PASSWORD 'change_me';
CREATE DATABASE arena OWNER arena;
```

### 2. Создать `.env`

```powershell
Copy-Item .env.example .env
```

Для локального PostgreSQL на стандартном порту:

```dotenv
DATABASE_URL=postgresql://arena:change_me@127.0.0.1:5432/arena
```

### 3. Установить зависимости

```powershell
npm ci
```

### 4. Применить миграции и seed

```powershell
npm run db:setup
```

Команда выполняет:

```text
db:migrate
  ↓
db:seed
  ↓
db:normalize-scenarios
```

### 5. Запустить development mode

```powershell
npm run dev
```

Frontend:

```text
http://127.0.0.1:5173
```

API:

```text
http://127.0.0.1:3001
```

### Production build без Docker

```powershell
npm run build
npm start
```

После сборки один Node-сервер обслуживает API и SPA на порту `3001`.

---

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | фиксированное имя Docker Compose project |
| `POSTGRES_DB` | имя базы |
| `POSTGRES_USER` | пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | пароль PostgreSQL |
| `POSTGRES_PORT` | порт БД на хосте при использовании `compose.db-port.yaml` |
| `DATABASE_URL` | подключение Node, запущенного вне Docker |
| `APP_PORT` | опубликованный порт приложения |
| `APP_ORIGIN` | разрешённые Origin для изменяющих запросов |
| `COOKIE_SECURE` | secure-флаг auth cookie |
| `ADMIN_NAME` | имя bootstrap admin |
| `ADMIN_EMAIL` | email bootstrap admin |
| `ADMIN_PASSWORD` | пароль bootstrap admin |
| `VITE_SITE_URL` | публичный canonical URL для production |

`ADMIN_*` необязательны, но если используется одна из трёх переменных, должны быть заданы все три.

Реальные пароли хранятся только в `.env`. Не добавляйте `.env` в Git.

---

## Как пользоваться проектом

### Пользователь

1. Зарегистрируйтесь или войдите.
2. Откройте каталог `/scenarios`.
3. Выберите сценарий.
4. Запустите тренировку.
5. Выбирайте реакции на реплики.
6. После финала просмотрите результат и разбор.
7. При необходимости оставьте отзыв.
8. В `/profile` доступны история, навыки, достижения и прогресс.

### Администратор

Административная панель:

```text
/admin
```

Управление сценариями:

```text
/admin/scenarios
```

Основной процесс:

1. создать пустой сценарий или копию;
2. открыть Maker;
3. настроить основную информацию;
4. добавить персонажей и этапы;
5. собрать граф реплик и финалов;
6. настроить реакции и penalty;
7. проверить граф;
8. протестировать черновик;
9. сохранить;
10. опубликовать.

---

## Maker и сценарии

Maker — визуальный конструктор сценариев.

Основные сущности:

- **реплика** — узел диалога;
- **реакция** — вариант ответа пользователя;
- **финал** — завершение ветки;
- **персонаж** — участник переговоров;
- **этап** — логический блок сценария.

Реакция содержит:

```ts
type Penalty = 0 | 1 | 2;

interface Reaction {
  id: string;
  intent: string;
  label: string;
  examples: string[];

  nextNodeId?: string;
  endingId?: string;

  penalty: Penalty;
  feedback: string;
}
```

В левой панели Maker реплики и финалы можно сворачивать независимо. Поиск работает по репликам. Свойства выбранного элемента редактируются в Inspector.

### Сохранение

Черновик можно сохранить даже при незавершённом графе. Это позволяет работать поэтапно.

### Проверка

Перед публикацией выполняется строгая структурная проверка:

- ссылки на существующие узлы;
- уникальность ID;
- достижимость;
- корректность персонажей и этапов;
- наличие финалов;
- ошибки penalty-конфигурации;
- недопустимые циклы.

### Тестирование

Кнопка тестирования запускает текущий черновик внутри Maker без создания пользовательской попытки и статистики.

### Публикация

Публикация создаёт новую неизменяемую версию. Уже начатые пользовательские попытки остаются привязаны к своей версии.

Подробнее: [`docs/MAKER.md`](docs/MAKER.md).

---

## Penalty-модель

Оценка реакции хранится в одном поле:

```ts
type Penalty = 0 | 1 | 2;
```

Интерпретация:

- `0` — **уместная**;
- `1` — **сомнительная**;
- `2` — **нежелательная**.

Дополнительных параллельных полей качества ответа нет.

### Досрочное завершение

Сценарий может включить общий негативный финал:

```ts
penalty: {
  enabled: true,
  threshold: 5,
  failureEndingId: 'end-penalty'
}
```

После реакции:

1. её penalty прибавляется к накопленной сумме;
2. если у реакции задан явный `endingId`, используется он;
3. иначе проверяется общий penalty threshold;
4. если threshold достигнут, выполняется `failureEndingId`;
5. иначе переход выполняется по `nextNodeId`.

Явный сюжетный финал реакции имеет приоритет над общим penalty-финалом.

### Анализ порога

Maker анализирует только реально достижимые состояния графа и определяет максимально возможный накопленный penalty.

На этой основе интерфейс предлагает варианты:

- **Строго**;
- **Рекомендуемый**;
- **Мягко**;
- ручное значение.

Если выбранный threshold больше максимально достижимого penalty, публикация блокируется как логически некорректная.

Если одна нежелательная реакция может сразу закончить сценарий, Maker показывает предупреждение, но не блокирует публикацию — это может быть намеренным решением автора.

Подробнее: [`docs/SCENARIO_JSON_FORMAT.md`](docs/SCENARIO_JSON_FORMAT.md).

---

## JSON-формат сценария

Переносимый файл использует оболочку `arena-scenario`.

Пример:

```json
{
  "format": "arena-scenario",
  "formatVersion": 2,
  "definition": {
    "schemaVersion": 3
  }
}
```

Канонический граф использует `schemaVersion: 3`.

В `docs/` находятся:

- [`SCENARIO_JSON_FORMAT.md`](docs/SCENARIO_JSON_FORMAT.md) — описание формата;
- [`arena-scenario.schema.json`](docs/arena-scenario.schema.json) — JSON Schema;
- [`arena-scenario-template.json`](docs/arena-scenario-template.json) — шаблон.

Maker поддерживает импорт совместимых legacy-форматов через compatibility layer.

---

## Версионирование сценариев

Необходимо различать три значения:

- `schemaVersion` — версия структуры сценария;
- `metadata.version` — номер опубликованной версии;
- `revision` — версия текущего draft.

Опубликованные snapshots неизменяемы.

Когда пользователь начинает попытку, она связывается с конкретной опубликованной версией. Поэтому последующее изменение сценария не ломает старую историю.

Seed идемпотентен: если опубликованная версия уже соответствует seed-данным, лишняя версия не создаётся.

---

## База данных

Используется PostgreSQL.

Основные группы данных:

- пользователи;
- auth sessions;
- сценарии;
- опубликованные версии;
- drafts Maker;
- попытки;
- выбранные реакции;
- отзывы;
- обращения;
- XP / навыки / достижения.

Миграции находятся в:

```text
server/migrations/
```

Команды:

```powershell
npm run db:migrate
npm run db:seed
npm run db:normalize-scenarios
npm run db:setup
```

Не изменяйте уже применённую migration. Для изменения схемы создавайте новый SQL-файл с новым номером.

Подробнее: [`docs/DATABASE.md`](docs/DATABASE.md).

---

## API и авторизация

Frontend работает с backend через `/api/*`.

После входа сервер создаёт cookie:

```text
arena_session
```

Основные свойства:

- `httpOnly`;
- `sameSite=lax`;
- срок действия 7 дней;
- `secure` зависит от `COOKIE_SECURE`.

В БД хранится hash token, а не исходный token.

Для изменяющих запросов сервер проверяет:

- `X-Arena-Request: 1`;
- допустимый `Origin` из `APP_ORIGIN`;
- `Content-Type: application/json`.

Поэтому `403` на `POST`, `PATCH`, `PUT` или `DELETE` часто означает неверный `APP_ORIGIN` или запрос в обход штатного API-клиента.

Подробнее: [`docs/API.md`](docs/API.md).

---

## Геймификация

После завершения попытки рассчитываются:

- XP;
- уровень;
- прогресс навыка;
- мастерство сценария;
- достижения.

Первая попытка и новая концовка дают полную рассчитанную награду. Повтор уже открытой концовки имеет пониженную эффективность, чтобы нельзя было бесконечно получать полную награду одним маршрутом.

Администратор может управлять достижениями в:

```text
/admin/achievements
```

Подробнее: [`docs/GAMIFICATION.md`](docs/GAMIFICATION.md).

---

## Тесты

### TypeScript

```powershell
npm run typecheck
```

### Unit / logic

```powershell
npm run test:logic
```

### API без внешнего PostgreSQL

```powershell
npm run test:api:embedded
```

Используется PGlite.

### API с PostgreSQL

Создайте отдельную тестовую базу:

```sql
CREATE DATABASE arena_test OWNER arena;
```

Затем:

```powershell
$env:TEST_DATABASE_URL = "postgresql://arena:password@127.0.0.1:5432/arena_test"
npm run test:api
```

### UI

```powershell
npm run test:ui
```

### Полный набор

```powershell
npm test
```

### Production build

```powershell
npm run build
```

Перед merge рекомендуется минимум:

```powershell
npm run typecheck
npm run test:logic
npm run test:api:embedded
npm run build
```

---

## Backup и restore

Данные Docker PostgreSQL хранятся в именованном volume:

```text
cool_peppers_postgres
```

Обычный `docker compose down` не удаляет их.

### Создать backup

```powershell
docker compose run --rm backup
```

или:

```powershell
npm run docker:backup
```

Файлы сохраняются в:

```text
backups/
```

### Восстановить

```powershell
npm run docker:restore -- latest
```

или конкретный dump:

```powershell
npm run docker:restore -- arena_YYYYMMDDTHHMMSSZ.dump
```

Подробнее: [`docs/DOCKER.md`](docs/DOCKER.md).

---

## Типовые проблемы

### Docker показывает старую версию

Принудительно пересоберите image:

```powershell
docker compose build --no-cache app
docker compose up -d --force-recreate
```

Если команда выводит только `Started`, но нет этапов `Building`, новый image в этой команде не создавался.

### `port 3001 is already allocated`

Проверьте Docker:

```powershell
docker ps --filter "publish=3001"
```

Если контейнера нет:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen
```

Частая причина — одновременно запущены старый container и локальный Node/Vite-процесс.

### Compose использует другое имя проекта

Чтобы не получать конфликт `cool` / `cool-peppers`, задайте:

```dotenv
COMPOSE_PROJECT_NAME=cool-peppers
```

Не используйте `down -v`, если БД нужно сохранить.

### `POST /api/auth/logout` или другой POST возвращает `403`

Проверьте `APP_ORIGIN`. Если frontend открыт на `5173`, этот origin должен присутствовать:

```dotenv
APP_ORIGIN=http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173
```

После изменения `.env` backend необходимо перезапустить.

### `role "arena" does not exist`

Создайте пользователя и БД либо исправьте `DATABASE_URL`.

```sql
CREATE ROLE arena WITH LOGIN PASSWORD 'password';
CREATE DATABASE arena OWNER arena;
```

### `Applied migration was modified`

Не редактируйте применённый SQL migration. Верните исходный файл и создайте новую migration.

### Старый Maker draft ломает редактор

Maker хранит recovery-state в `sessionStorage`.

DevTools → Application → Session Storage → удалите нужный ключ:

```text
arena:maker:*
```

Серверный сценарий при этом не удаляется.

### Старый JSON сценария

```powershell
npm run db:normalize-scenarios
```

### PostgreSQL port занят

Измените:

```dotenv
POSTGRES_PORT=5436
```

Если Node запускается на Windows через опубликованный Docker port, тот же порт должен использовать `DATABASE_URL`.

---

## Правила разработки

### Перед началом

```powershell
npm ci
npm run typecheck
npm run test:logic
```

### Изменение БД

1. не менять уже применённую migration;
2. создать новый файл в `server/migrations/`;
3. обновить серверную модель;
4. добавить/обновить тест;
5. при необходимости обновить [`docs/DATABASE.md`](docs/DATABASE.md).

### Изменение формата сценария

Если меняется канонический формат:

1. обновить TypeScript types;
2. обновить validation;
3. обновить compatibility layer;
4. обновить импорт/экспорт;
5. обновить JSON Schema;
6. обновить template;
7. добавить unit/API tests;
8. обновить [`docs/SCENARIO_JSON_FORMAT.md`](docs/SCENARIO_JSON_FORMAT.md).

### Изменение Maker

Основные файлы находятся в:

```text
src/features/maker/
```

Ключевая модель:

```text
model/types.ts
model/commands.ts
model/validation.ts
model/penaltyAnalysis.ts
model/scenarioFile.ts
```

### Что не коммитить

- `.env`;
- реальные пароли;
- production backup с персональными данными;
- `node_modules`;
- локальные browser/session данные;
- временные build artifacts.

---

## Полезные npm-команды

```text
npm run dev                  frontend + API
npm run dev:web              только Vite
npm run dev:api              только API
npm run build                typecheck + vite build + prerender
npm run typecheck            TypeScript
npm run test:logic           unit tests
npm run test:api             API tests с PostgreSQL
npm run test:api:embedded    API tests через PGlite
npm run test:ui              Playwright
npm test                     полный набор тестов
npm run db:migrate           migrations
npm run db:seed              seed
npm run db:normalize-scenarios
npm run db:setup             migrate + seed + normalize
npm run docker:backup        backup БД
npm run docker:backups       список backups
npm run docker:restore       restore БД
```

---

## Дополнительная документация

Главная документация находится **в этом README**. В `docs/` оставлены только подробные справочники по подсистемам:

| Документ | Назначение |
| --- | --- |
| [`docs/API.md`](docs/API.md) | HTTP API, авторизация, попытки, editor, reviews и admin endpoints |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL, таблицы, migrations и хранение данных |
| [`docs/DOCKER.md`](docs/DOCKER.md) | Docker Compose, volume, backup и restore |
| [`docs/MAKER.md`](docs/MAKER.md) | устройство визуального конструктора |
| [`docs/NEGOTIATION.md`](docs/NEGOTIATION.md) | runtime переговорного сценария |
| [`docs/SCENARIO_JSON_FORMAT.md`](docs/SCENARIO_JSON_FORMAT.md) | переносимый JSON-формат и penalty |
| [`docs/GAMIFICATION.md`](docs/GAMIFICATION.md) | XP, навыки, достижения и mastery |
| [`docs/arena-scenario.schema.json`](docs/arena-scenario.schema.json) | JSON Schema сценария |
| [`docs/arena-scenario-template.json`](docs/arena-scenario-template.json) | шаблон сценария |

При расхождении документации и реализации источником истины считаются типы, validation и серверная логика проекта.
