import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'server/index.ts'], {
    cwd: root,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'inherit',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500).unref();
}
for (const child of children) {
  child.on('exit', (code) => stop(code ?? 0));
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
