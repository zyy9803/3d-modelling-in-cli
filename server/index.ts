import http from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  buildPlaceholderPrompt,
  createBootstrapEvent,
  createPlaceholderSessionRequest,
} from './codex-session-scaffold.js';

const port = Number(process.env.PORT ?? '4178');

export function createServer(): http.Server {
  const placeholderRequest = createPlaceholderSessionRequest();
  const placeholderPrompt = buildPlaceholderPrompt(placeholderRequest);
  const bootstrapEvent = createBootstrapEvent();

  return http.createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end([
      'Codex server scaffold',
      `Event type: ${bootstrapEvent.type}`,
      `Prompt length: ${placeholderPrompt.length}`,
    ].join('\n'));
  });
}

export async function startServer(listenPort: number = port): Promise<http.Server> {
  const server = createServer();

  await new Promise<void>((resolve) => {
    server.listen(listenPort, () => resolve());
  });

  console.log(`Codex server scaffold listening on http://localhost:${listenPort}`);
  return server;
}

const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMainModule) {
  void startServer();
}
