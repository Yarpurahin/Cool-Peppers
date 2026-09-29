import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  ['--experimental-strip-types', '--test', 'tests/api/*.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, PGLITE_CHECK: '1' },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
