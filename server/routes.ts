import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  SessionImportModelRequest,
  SessionImportModelResponse,
  SessionDecisionRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types.js';

import type { CodexSessionController } from './codex-session.js';

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export function createRequestListener(session: CodexSessionController) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'OPTIONS') {
      writeCorsHeaders(response);
      response.writeHead(204);
      response.end();
      return;
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      writeJson(response, 200, session.getSnapshot());
      return;
    }

    if (url.pathname === '/api/session/stream' && request.method === 'GET') {
      startEventStream(session, response);
      return;
    }

    if (url.pathname === '/api/session/message' && request.method === 'POST') {
      const payload = await readJsonBody<SessionMessageRequest>(request);
      writeJson(response, 202, await session.submitMessage(payload));
      return;
    }

    if (url.pathname === '/api/session/decision' && request.method === 'POST') {
      const payload = await readJsonBody<SessionDecisionRequest>(request);
      writeJson(response, 202, await session.submitDecision(payload));
      return;
    }

    if (url.pathname === '/api/session/interrupt' && request.method === 'POST') {
      const payload = await readJsonBody<SessionInterruptRequest>(request);
      writeJson(response, 202, await session.interruptTurn(payload));
      return;
    }

    if (url.pathname === '/api/session/model-switch' && request.method === 'POST') {
      const payload = await readJsonBody<SessionModelSwitchRequest>(request);
      writeJson(response, 202, await session.switchModel(payload));
      return;
    }

    if (url.pathname === '/api/session/clear' && request.method === 'POST') {
      writeJson(response, 202, await session.clearSession());
      return;
    }

    if (url.pathname === '/api/models/import' && request.method === 'POST') {
      const payload = await readJsonBody<SessionImportModelRequest>(request);
      writeJson(response, 201, await session.importModel(payload) as SessionImportModelResponse);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/models/')) {
      const modelId = url.pathname.slice('/api/models/'.length);
      try {
        const file = await session.readModelFile(modelId);
        if (!file) {
          writeJson(response, 404, { error: 'Model not found' });
          return;
        }

        writeCorsHeaders(response);
        response.writeHead(200, {
          'Content-Type': 'model/stl',
          'Content-Length': String(file.length),
        });
        response.end(file);
        return;
      } catch (error) {
        if (isMissingFileError(error)) {
          writeJson(response, 404, { error: 'Model file not found' });
          return;
        }

        writeJson(response, 500, { error: 'Failed to read model file' });
        return;
      }
    }

    writeJson(response, 404, { error: 'Not found' });
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function startEventStream(session: CodexSessionController, response: ServerResponse): void {
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

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    throw new Error('Request body is required.');
  }

  return JSON.parse(text) as T;
}

function writeStreamEvent(response: ServerResponse, event: SessionStreamEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  writeCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
