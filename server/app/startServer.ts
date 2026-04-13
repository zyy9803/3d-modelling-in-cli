import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildAppOptions } from './buildApp.js';

const httpPort = Number(process.env.PORT ?? '4178');

export async function startServer(
  listenPort: number = httpPort,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = buildApp(options);

  await app.listen({
    host: '127.0.0.1',
    port: listenPort,
  });

  console.log(`Codex session server listening on http://127.0.0.1:${listenPort}`);
  console.log(
    `Session debug log: ${process.cwd()}/artifacts/logs/session-debug.log`,
  );

  attachShutdownHandlers(app);

  return app;
}

function attachShutdownHandlers(app: FastifyInstance): void {
  const shutdown = async (): Promise<void> => {
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
    await app.close();
  };

  const handleSigint = (): void => {
    void shutdown();
  };

  const handleSigterm = (): void => {
    void shutdown();
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);
}
