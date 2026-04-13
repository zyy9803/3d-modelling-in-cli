import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from './buildApp.js';

function createSessionStub() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getSnapshot: vi.fn(() => ({
      connectionStatus: 'connected',
      connectionMessage: 'ready',
      sessionStatus: 'idle',
      activeModelId: null,
      modelLabel: null,
      draft: {
        status: 'empty',
        jobId: null,
        baseModelId: null,
        scriptPath: null,
        message: null,
      },
    })),
    subscribe: vi.fn(() => () => {}),
    submitMessage: vi.fn(),
    submitDecision: vi.fn(),
    generateModel: vi.fn(),
    interruptTurn: vi.fn(),
    switchModel: vi.fn(),
    clearSession: vi.fn(),
    importModel: vi.fn(),
    readModelFile: vi.fn(),
  };
}

describe('buildApp', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('serves health and manages session lifecycle', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(session.start).toHaveBeenCalledTimes(1);

    await app.close();

    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it('applies CORS headers to health responses', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    await app.close();
  });

  it('applies CORS headers to session event streams', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();
    await app.listen({ host: '127.0.0.1', port: 0 });

    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected Fastify server to listen on a TCP port.');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/session/events`, {
      headers: {
        origin: 'http://localhost:5174',
        accept: 'text/event-stream',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5174',
    );

    await response.body?.cancel();
    await app.close();
  });
});
