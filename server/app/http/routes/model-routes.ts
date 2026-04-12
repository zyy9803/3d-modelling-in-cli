import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  SessionImportModelRequest,
  SessionImportModelResponse,
} from '../../../../src/shared/codex-session-types.js';
import type { CodexSessionController } from '../../../modules/session/application/session-service.js';

import { writeCorsHeaders } from '../transport/cors.js';
import { readJsonBody, writeJson } from '../transport/json.js';

type ModelRouteController = Pick<
  CodexSessionController,
  'importModel' | 'readModelFile'
>;

export async function handleModelRoute(
  session: ModelRouteController,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/api/models/import' && request.method === 'POST') {
    const payload = await readJsonBody<SessionImportModelRequest>(request);
    writeJson(
      response,
      201,
      (await session.importModel(payload)) as SessionImportModelResponse,
    );
    return true;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/models/')) {
    const modelId = url.pathname.slice('/api/models/'.length);
    try {
      const file = await session.readModelFile(modelId);
      if (!file) {
        writeJson(response, 404, { error: 'Model not found' });
        return true;
      }

      writeCorsHeaders(response);
      response.writeHead(200, {
        'Content-Type': 'model/stl',
        'Content-Length': String(file.length),
      });
      response.end(file);
      return true;
    } catch (error) {
      if (isMissingFileError(error)) {
        writeJson(response, 404, { error: 'Model file not found' });
        return true;
      }

      writeJson(response, 500, { error: 'Failed to read model file' });
      return true;
    }
  }

  return false;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as NodeJS.ErrnoException).code === 'string' &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
