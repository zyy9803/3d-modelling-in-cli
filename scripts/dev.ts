import concurrently from 'concurrently';

import { createPnpmRunCommand, runCommand } from './shared/processRunner.js';

async function main(): Promise<void> {
  await runCommand(createPnpmRunCommand('dev:preflight'));
  const { result } = concurrently(
    [
      { command: 'pnpm run dev:client', name: 'client' },
      { command: 'pnpm run dev:server', name: 'server' },
    ],
    {
      prefix: 'name',
      prefixColors: ['cyan', 'magenta'],
      killOthersOn: ['failure'],
    },
  );

  await result;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
});
