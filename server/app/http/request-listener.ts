import type { IncomingMessage, ServerResponse } from 'node:http';

import type { CodexSessionController } from '../../modules/session/application/session-service.js';

import { handleModelRoute } from './routes/model-routes.js';
import { handleSessionRoute } from './routes/session-routes.js';
import { writeCorsHeaders } from './transport/cors.js';
import { writeJson } from './transport/json.js';

export function createRequestListener(session: CodexSessionController) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    console.log(`[session-route] ${request.method ?? 'UNKNOWN'} ${url.pathname}`);

    if (request.method === 'OPTIONS') {
      writeCorsHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (await handleSessionRoute(session, request, response, url)) {
      return;
    }

    if (await handleModelRoute(session, request, response, url)) {
      return;
    }

    writeJson(response, 404, { error: 'Not found' });
  };
}
