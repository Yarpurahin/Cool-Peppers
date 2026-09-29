import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, PGLITE_UI: '1' },
});
child.on('exit', (code) => process.exit(code ?? 1));
