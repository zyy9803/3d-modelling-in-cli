import { createPnpmExecCommand, runCommand } from './shared/processRunner.js';

async function main(): Promise<void> {
  await runCommand(createPnpmExecCommand(['tsc', '--noEmit']));
  await runCommand(createPnpmExecCommand(['vite', 'build']));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
});
