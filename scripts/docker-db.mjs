import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const backupDir = join(root, 'backups');
const command = process.argv[2];
const input = process.argv[3];

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`Не удалось запустить Docker: ${result.error.message}`);
    process.exit(1);
  }
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result.status ?? 1;
}

function backups() {
  mkdirSync(backupDir, { recursive: true });
  return readdirSync(backupDir)
    .filter((name) => name.endsWith('.dump'))
    .map((name) => ({ name, mtime: statSync(join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

if (command === 'backup') {
  run(['compose', 'run', '--rm', 'backup']);
  process.exit(0);
}

if (command === 'list') {
  const rows = backups();
  if (!rows.length) console.log('В папке backups пока нет резервных копий.');
  else for (const row of rows) console.log(row.name);
  process.exit(0);
}

if (command === 'restore') {
  const rows = backups();
  let selected = input;
  if (!selected || selected === 'latest') selected = rows[0]?.name;
  if (!selected) {
    console.error('Нет резервных копий для восстановления.');
    process.exit(2);
  }
  if (basename(selected) !== selected || !/^[A-Za-z0-9._-]+\.dump$/.test(selected)) {
    console.error('Укажите имя .dump файла из папки backups без пути.');
    process.exit(2);
  }
  if (!existsSync(join(backupDir, selected))) {
    console.error(`Файл backups/${selected} не найден.`);
    process.exit(2);
  }

  console.log('[restore] Останавливаю приложение, чтобы оно не писало в БД во время восстановления...');
  run(['compose', 'stop', 'app']);
  const status = run(
    ['compose', 'run', '--rm', '-e', `BACKUP_FILE=${selected}`, 'restore'],
    { allowFailure: true },
  );
  if (status !== 0) {
    console.error('[restore] Восстановление завершилось ошибкой. Контейнер app оставлен остановленным.');
    process.exit(status);
  }
  console.log('[restore] Запускаю приложение обратно...');
  run(['compose', 'up', '-d', 'app']);
  process.exit(0);
}

console.log(`Использование:
  node scripts/docker-db.mjs backup
  node scripts/docker-db.mjs list
  node scripts/docker-db.mjs restore [latest|имя.dump]`);
process.exit(command ? 2 : 0);
