# Docker-развёртывание и резервные копии

## Состав

`compose.yaml` поднимает:

- `app` — production-сборку React + Node/Express API;
- `postgres` — PostgreSQL 17 с постоянным Docker volume;
- `backup` — одноразовый сервис `pg_dump`, запускается только вручную;
- `restore` — одноразовый сервис `pg_restore`, запускается только вручную.

`backup` и `restore` находятся в Compose profile `tools`, поэтому обычный `docker compose up -d` их не запускает.

## Первый запуск

```powershell
Copy-Item .env.example .env
# Изменить POSTGRES_PASSWORD и при необходимости ADMIN_*
docker compose up -d --build
docker compose ps
```

Приложение доступно на `http://127.0.0.1:3001`. В контейнере `app` перед стартом сервера автоматически выполняются миграции и seed. Повторный запуск безопасен: уже применённые миграции и существующие исходные сценарии не перезаписываются.

## Где лежит база

Данные PostgreSQL находятся в volume `cool_peppers_postgres`. Пересборка `app`, обновление образов и `docker compose down` volume не удаляют.

Удаляет данные только явная команда с `-v`:

```powershell
docker compose down -v
```

## Создание резервной копии

```powershell
docker compose run --rm backup
```

Файл создаётся на хосте в `./backups`, а не внутри volume:

```text
backups/arena_20260928T120000Z.dump
backups/arena_20260928T120000Z.dump.sha256
```

Формат `custom` выбран специально для `pg_restore`: он компактный и позволяет корректно выполнить `--clean --if-exists` при восстановлении.

Можно задать имя вручную:

```powershell
$env:BACKUP_NAME = "before-release.dump"
docker compose run --rm backup
Remove-Item Env:BACKUP_NAME
```

Существующий файл не перезаписывается. Для осознанной замены задайте `BACKUP_OVERWRITE=true`.

При установленном Node.js те же операции доступны через:

```powershell
npm run docker:backup
npm run docker:backups
```

## Восстановление

Восстановление выполняется одной транзакцией и заменяет текущую схему и данные базы. Сначала остановите приложение:

```powershell
docker compose stop app
$env:BACKUP_FILE = "before-release.dump"
docker compose run --rm restore
docker compose up -d app
Remove-Item Env:BACKUP_FILE
```

Перед `pg_restore` сервис проверяет `.sha256`, если checksum находится рядом с dump.

Рекомендуемая команда при установленном Node.js:

```powershell
npm run docker:restore -- latest
```

Она:

1. выбирает последний dump;
2. останавливает `app`;
3. запускает restore;
4. запускает `app` обратно только после успешного восстановления.

Можно выбрать конкретный файл:

```powershell
npm run docker:restore -- before-release.dump
```

Если `pg_restore` завершится ошибкой, `app` останется остановленным. Это сделано намеренно, чтобы приложение не писало в частично восстановленную БД.

## Перенос базы на другой компьютер

1. Скопируйте `.dump` и соответствующий `.sha256` из `backups/`.
2. На другом компьютере запустите `docker compose up -d postgres`.
3. Положите оба файла в `backups/` нового проекта.
4. Выполните восстановление.
5. Запустите `app`.

Таким образом для переноса данных Docker volume экспортировать не требуется.

## Доступ через pgAdmin / psql

Основной compose не публикует PostgreSQL наружу. Для временного доступа с хоста:

```powershell
docker compose -f compose.yaml -f compose.db-port.yaml up -d
```

По умолчанию БД появится на `127.0.0.1:5432`. Другой порт задаётся в `.env` через `POSTGRES_PORT`.

## Полезные команды

```powershell
# Запустить / пересобрать
docker compose up -d --build

# Состояние
docker compose ps

# Логи приложения и БД
docker compose logs -f app postgres

# Перезапустить только приложение
docker compose restart app

# Остановить, сохранив БД
docker compose down

# Создать бэкап
docker compose run --rm backup

# Показать файлы бэкапов при наличии Node.js
npm run docker:backups
```
