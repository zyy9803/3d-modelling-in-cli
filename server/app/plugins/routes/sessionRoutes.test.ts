import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../buildApp.js';

function createSessionStub() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getSnapshot: vi.fn(() => ({
      connectionStatus: 'connected',
      connectionMessage: 'ready',
      sessionStatus: 'idle',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
      draft: {
        status: 'empty',
        jobId: null,
        baseModelId: null,
        scriptPath: null,
        message: null,
      },
    })),
    subscribe: vi.fn(() => () => {}),
    submitMessage: vi.fn(async () => ({ accepted: true })),
    submitDecision: vi.fn(async () => ({ accepted: true })),
    generateModel: vi.fn(async () => ({ accepted: true })),
    interruptTurn: vi.fn(async () => ({ accepted: true })),
    switchModel: vi.fn(async () => ({ accepted: true })),
    clearSession: vi.fn(async () => ({ accepted: true })),
    importModel: vi.fn(),
    readModelFile: vi.fn(),
  };
}

describe('sessionRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the session snapshot from GET /api/session', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/session',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connectionStatus: 'connected',
      activeModelId: 'model_001',
    });

    await app.close();
  });

  it('forwards POST /api/session/message payloads to the controller', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const payload = {
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: { role: 'user', text: 'raise the selected patch by 2mm' },
      selectionContext: { mode: 'click', triangleIds: [1], components: [] },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [800, 600],
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/session/message',
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(session.submitMessage).toHaveBeenCalledWith(payload);

    await app.close();
  });

  it('rejects invalid POST /api/session/message payloads', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/session/message',
      payload: {
        message: { role: 'user', text: 'hello' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(session.submitMessage).not.toHaveBeenCalled();

    await app.close();
  });
});
