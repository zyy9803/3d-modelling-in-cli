import type { FastifyPluginAsync } from 'fastify';

import type {
  SessionDecisionRequest,
  SessionGenerateModelRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../../../../src/shared/codex-session-types.js';
import {
  sessionClearBodySchema,
  sessionDecisionBodySchema,
  sessionGenerateModelBodySchema,
  sessionInterruptBodySchema,
  sessionMessageBodySchema,
  sessionModelSwitchBodySchema,
} from '../transport/schema.js';
import { openSse, writeSseEvent } from '../transport/sseReply.js';

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/session', async () => app.appContext.session.getSnapshot());

  app.get('/api/session/events', async (_request, reply) => {
    openSse(reply);

    const unsubscribe = app.appContext.session.subscribe((event) => {
      if (!writeSseEvent(reply, event as SessionStreamEvent)) {
        unsubscribe();
      }
    });

    reply.raw.on('close', () => {
      unsubscribe();
    });
    reply.raw.on('error', () => {
      unsubscribe();
    });
  });

  app.post<{ Body: SessionMessageRequest }>(
    '/api/session/message',
    { schema: { body: sessionMessageBodySchema } },
    async (request, reply) => {
      const result = await app.appContext.session.submitMessage(request.body);
      void reply.code(202).send(result);
    },
  );

  app.post<{ Body: SessionDecisionRequest }>(
    '/api/session/decision',
    { schema: { body: sessionDecisionBodySchema } },
    async (request, reply) => {
      const result = await app.appContext.session.submitDecision(request.body);
      void reply.code(202).send(result);
    },
  );

  app.post<{ Body: SessionGenerateModelRequest }>(
    '/api/session/model/generate',
    { schema: { body: sessionGenerateModelBodySchema } },
    async (request, reply) => {
      const result = await app.appContext.session.generateModel(request.body);
      void reply.code(202).send(result);
    },
  );

  app.post<{ Body: SessionInterruptRequest }>(
    '/api/session/interrupt',
    { schema: { body: sessionInterruptBodySchema } },
    async (request, reply) => {
      const result = await app.appContext.session.interruptTurn(request.body);
      void reply.code(202).send(result);
    },
  );

  app.post<{ Body: SessionModelSwitchRequest }>(
    '/api/session/model/switch',
    { schema: { body: sessionModelSwitchBodySchema } },
    async (request, reply) => {
      const result = await app.appContext.session.switchModel(request.body);
      void reply.code(202).send(result);
    },
  );

  app.post(
    '/api/session/clear',
    { schema: { body: sessionClearBodySchema } },
    async (_request, reply) => {
      const result = await app.appContext.session.clearSession();
      void reply.code(202).send(result);
    },
  );
};
