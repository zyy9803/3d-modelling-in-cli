import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { CodexSessionController } from './codex-session.js';
import { createRequestListener } from './routes.js';

const httpPort = Number(process.env.PORT ?? '4178');
const appServerPort = Number(process.env.CODEX_APP_SERVER_PORT ?? '4179');

export function createServer(): http.Server {
  const session = new CodexSessionController({
    rootDir: process.cwd(),
    appServerPort,
  });

  session.start();

  const requestListener = createRequestListener(session);
  const server = http.createServer((request, response) => {
    void requestListener(request, response).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown server error';
      response.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      response.end(JSON.stringify({ error: message }));
    });
  });

  server.on('close', () => {
    session.stop();
  });

  return server;
}

export async function startServer(listenPort: number = httpPort): Promise<http.Server> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    const onError = (error: Error): void => {
      server.off('listening', onListening);
      server.close(() => reject(error));
    };

    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(listenPort, '127.0.0.1');
  });

  console.log(`Codex session server listening on http://127.0.0.1:${listenPort}`);
  return server;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  void startServer();
}
