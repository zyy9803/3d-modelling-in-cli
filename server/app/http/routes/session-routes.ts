import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  SessionDecisionRequest,
  SessionGenerateModelRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
} from '../../../../src/shared/codex-session-types.js';
import type { CodexSessionController } from '../../../modules/session/application/session-service.js';

import { readJsonBody, writeJson } from '../transport/json.js';
import { startEventStream } from '../transport/sse.js';

type SessionRouteController = Pick<
  CodexSessionController,
  | 'getSnapshot'
  | 'subscribe'
  | 'submitMessage'
  | 'submitDecision'
  | 'generateModel'
  | 'interruptTurn'
  | 'switchModel'
  | 'clearSession'
>;

export async function handleSessionRoute(
  session: SessionRouteController,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/api/status' && request.method === 'GET') {
    writeJson(response, 200, session.getSnapshot());
    return true;
  }

  if (url.pathname === '/api/session/stream' && request.method === 'GET') {
    startEventStream(session, response);
    return true;
  }

  if (url.pathname === '/api/session/message' && request.method === 'POST') {
    const payload = await readJsonBody<SessionMessageRequest>(request);
    writeJson(response, 202, await session.submitMessage(payload));
    return true;
  }

  if (url.pathname === '/api/session/decision' && request.method === 'POST') {
    const payload = await readJsonBody<SessionDecisionRequest>(request);
    writeJson(response, 202, await session.submitDecision(payload));
    return true;
  }

  if (url.pathname === '/api/session/model-generate' && request.method === 'POST') {
    const payload = await readJsonBody<SessionGenerateModelRequest>(request);
    writeJson(response, 202, await session.generateModel(payload));
    return true;
  }

  if (url.pathname === '/api/session/interrupt' && request.method === 'POST') {
    const payload = await readJsonBody<SessionInterruptRequest>(request);
    writeJson(response, 202, await session.interruptTurn(payload));
    return true;
  }

  if (url.pathname === '/api/session/model-switch' && request.method === 'POST') {
    const payload = await readJsonBody<SessionModelSwitchRequest>(request);
    writeJson(response, 202, await session.switchModel(payload));
    return true;
  }

  if (url.pathname === '/api/session/clear' && request.method === 'POST') {
    writeJson(response, 202, await session.clearSession());
    return true;
  }

  return false;
}
