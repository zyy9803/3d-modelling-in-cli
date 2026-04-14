import { createPnpmRunCommand, runCommand } from './shared/processRunner.js';

async function main(): Promise<void> {
  await runCommand(createPnpmRunCommand('build:client'));
  await runCommand(createPnpmRunCommand('build:server'));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
});
