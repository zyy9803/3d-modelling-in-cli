import type { ServerResponse } from 'node:http';

import type { SessionStreamEvent } from '../../../../src/shared/codex-session-types.js';
import type { CodexSessionController } from '../../../modules/session/application/session-service.js';

import { writeCorsHeaders } from './cors.js';

export function startEventStream(
  session: Pick<CodexSessionController, 'subscribe'>,
  response: ServerResponse,
): void {
  writeCorsHeaders(response);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const unsubscribe = session.subscribe((event) => {
    writeStreamEvent(response, event);
  });

  response.on('close', () => {
    unsubscribe();
  });
}

export function writeStreamEvent(
  response: ServerResponse,
  event: SessionStreamEvent,
): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
