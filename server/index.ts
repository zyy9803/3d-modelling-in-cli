import http from 'node:http';

import {
  buildPlaceholderPrompt,
  createBootstrapEvent,
  createPlaceholderSessionRequest,
} from './codex-session-scaffold';

const port = Number(process.env.PORT ?? '4178');
const placeholderRequest = createPlaceholderSessionRequest();
const placeholderPrompt = buildPlaceholderPrompt(placeholderRequest);
const bootstrapEvent = createBootstrapEvent();

const server = http.createServer((_, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end([
    'Codex server scaffold',
    `Event type: ${bootstrapEvent.type}`,
    `Prompt length: ${placeholderPrompt.length}`,
  ].join('\n'));
});

server.listen(port, () => {
  console.log(`Codex server scaffold listening on http://localhost:${port}`);
});
