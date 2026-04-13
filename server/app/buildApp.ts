import Fastify, { type FastifyInstance } from 'fastify';

import { CodexSessionController } from '../modules/session/application/session-service.js';
import {
  registerAppContext,
  type SessionControllerLike,
} from './plugins/core/appContext.js';
import { registerCors } from './plugins/core/cors.js';
import { registerErrorHandler } from './plugins/core/errorHandler.js';
import { healthRoutes } from './plugins/routes/healthRoutes.js';
import { modelRoutes } from './plugins/routes/modelRoutes.js';
import { sessionRoutes } from './plugins/routes/sessionRoutes.js';

const defaultAppServerPort = Number(process.env.CODEX_APP_SERVER_PORT ?? '4179');

export type BuildAppOptions = {
  rootDir?: string;
  appServerPort?: number;
  sessionController?: SessionControllerLike;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024,
  });

  const session =
    options.sessionController ??
    new CodexSessionController({
      rootDir: options.rootDir ?? process.cwd(),
      appServerPort: options.appServerPort ?? defaultAppServerPort,
    });

  registerAppContext(app, { session });

  registerErrorHandler(app);
  registerCors(app);
  void app.register(healthRoutes);
  void app.register(modelRoutes);
  void app.register(sessionRoutes);

  app.addHook('onReady', async () => {
    session.start();
  });

  app.addHook('onClose', async () => {
    session.stop();
  });

  return app;
}
