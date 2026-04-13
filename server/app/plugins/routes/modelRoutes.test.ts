import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../buildApp.js';

function createSessionStub() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    submitMessage: vi.fn(),
    submitDecision: vi.fn(),
    generateModel: vi.fn(),
    interruptTurn: vi.fn(),
    switchModel: vi.fn(),
    clearSession: vi.fn(),
    importModel: vi.fn(async () => ({
      modelId: 'model_001',
      modelLabel: 'part.stl',
    })),
    readModelFile: vi.fn(async (modelId: string) =>
      modelId === 'model_001'
        ? Buffer.from('solid demo\nendsolid demo\n', 'utf8')
        : null,
    ),
  };
}

describe('modelRoutes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports models via POST /api/models/import', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/models/import',
      payload: {
        sessionId: 'sess_main',
        fileName: 'part.stl',
        fileContentBase64: 'c29saWQgZGVtbwo=',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      modelId: 'model_001',
      modelLabel: 'part.stl',
    });

    await app.close();
  });

  it('rejects invalid POST /api/models/import payloads', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/models/import',
      payload: {
        sessionId: 'sess_main',
        fileName: 'part.stl',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(session.importModel).not.toHaveBeenCalled();

    await app.close();
  });

  it('downloads model bytes via GET /api/models/:modelId/file', async () => {
    const session = createSessionStub();
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/models/model_001/file',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('model/stl');
    expect(response.body).toContain('solid demo');

    await app.close();
  });

  it('returns 404 when the model id is unknown', async () => {
    const session = createSessionStub();
    session.readModelFile = vi.fn(async () => null);
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/models/model_999/file',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Model not found' });

    await app.close();
  });

  it('returns 500 when reading the model file throws', async () => {
    const session = createSessionStub();
    session.readModelFile = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const app = buildApp({ sessionController: session });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/models/model_001/file',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'permission denied' });

    await app.close();
  });
});
