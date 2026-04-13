import type { FastifyPluginAsync } from 'fastify';

import type {
  SessionImportModelRequest,
  SessionImportModelResponse,
} from '../../../../src/shared/codex-session-types.js';
import { modelImportBodySchema } from '../transport/schema.js';

export const modelRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: SessionImportModelRequest }>(
    '/api/models/import',
    { schema: { body: modelImportBodySchema } },
    async (request, reply) => {
      const result = (await app.appContext.session.importModel(
        request.body,
      )) as SessionImportModelResponse;
      void reply.code(201).send(result);
    },
  );

  app.get('/api/models/:modelId/file', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const file = await app.appContext.session.readModelFile(modelId);

    if (!file) {
      void reply.code(404).send({ error: 'Model not found' });
      return;
    }

    void reply
      .code(200)
      .header('Content-Type', 'model/stl')
      .header('Content-Length', String(file.length))
      .send(file);
  });
};
