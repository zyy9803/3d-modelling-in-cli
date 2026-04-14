import { ensurePortsAvailable } from './shared/devPortCleanup.js';

const defaultDevPorts = [4178, 5173, 5174];

async function main(): Promise<void> {
  const releasedProcessIds = await ensurePortsAvailable({
    ports: defaultDevPorts,
  });

  if (releasedProcessIds.length > 0) {
    console.log(`Released dev ports by stopping processes: ${releasedProcessIds.join(', ')}`);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to clear dev ports: ${message}`);
  process.exitCode = 1;
});
