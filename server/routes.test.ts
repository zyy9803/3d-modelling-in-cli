import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CodexSessionController } from './codex-session.js';
import type { ModelStorage } from './model-storage.js';
import { createModelRegistry } from './model-registry.js';
import { createRequestListener } from './routes.js';

function createMockResponse() {
  const headers = new Map<string, string>();
  let statusCode: number | null = null;
  let body: Buffer | string | null = null;

  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    writeHead(code: number, responseHeaders?: Record<string, string>) {
      statusCode = code;
      if (responseHeaders) {
        for (const [name, value] of Object.entries(responseHeaders)) {
          headers.set(name.toLowerCase(), value);
        }
      }
    },
    end(chunk?: Buffer | string) {
      body = chunk ?? null;
    },
  };
}

describe('createRequestListener', () => {
  it('serves generated STL bytes by model id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-routes-'));
    const registry = createModelRegistry(join(root, 'models'));
    const controller = new CodexSessionController({
      rootDir: root,
      appServerPort: 4179,
      sessionId: 'sess_main',
      modelRegistry: registry,
    });
    const model = registry.registerImportedModel({ sourceFileName: 'part.stl' });
    await mkdir(join(root, 'models'), { recursive: true });
    await writeFile(model.storagePath, 'solid demo\nendsolid demo\n', 'utf8');

    const listener = createRequestListener(controller);

    const response = createMockResponse();
    await listener(
      {
        method: 'GET',
        url: `/api/models/${model.modelId}`,
      } as unknown as Parameters<typeof listener>[0],
      response as unknown as Parameters<typeof listener>[1],
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers.get('content-type')).toBe('model/stl');
    expect(response.body).toEqual(Buffer.from('solid demo\nendsolid demo\n', 'utf8'));
  });

  it('returns 404 json when the model id is unknown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-routes-missing-'));
    const controller = new CodexSessionController({
      rootDir: root,
      appServerPort: 4179,
      sessionId: 'sess_main',
      modelRegistry: createModelRegistry(join(root, 'models')),
    });
    const listener = createRequestListener(controller);

    const response = createMockResponse();
    await listener(
      {
        method: 'GET',
        url: '/api/models/model_999',
      } as unknown as Parameters<typeof listener>[0],
      response as unknown as Parameters<typeof listener>[1],
    );

    expect(response.statusCode).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(String(response.body))).toEqual({ error: 'Model not found' });
  });

  it('returns 404 json when the model exists but the STL file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-routes-missing-file-'));
    const registry = createModelRegistry(join(root, 'models'));
    const controller = new CodexSessionController({
      rootDir: root,
      appServerPort: 4179,
      sessionId: 'sess_main',
      modelRegistry: registry,
    });
    const model = registry.registerImportedModel({ sourceFileName: 'part.stl' });
    const listener = createRequestListener(controller);

    const response = createMockResponse();
    await listener(
      {
        method: 'GET',
        url: `/api/models/${model.modelId}`,
      } as unknown as Parameters<typeof listener>[0],
      response as unknown as Parameters<typeof listener>[1],
    );

    expect(response.statusCode).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(String(response.body))).toEqual({ error: 'Model file not found' });
  });

  it('returns 500 json when reading the model file fails unexpectedly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-routes-read-error-'));
    const registry = createModelRegistry(join(root, 'models'));
    const model = registry.registerImportedModel({ sourceFileName: 'part.stl' });
    const modelStorage: ModelStorage = {
      modelsRoot: join(root, 'models'),
      async readModelFile(): Promise<Buffer> {
        const error = new Error('permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      },
      async outputModelExists(): Promise<boolean> {
        return false;
      },
      async validateGeneratedModel() {
        return { ok: false as const, message: 'unused' };
      },
    };
    const controller = new CodexSessionController({
      rootDir: root,
      appServerPort: 4179,
      sessionId: 'sess_main',
      modelRegistry: registry,
      modelStorage,
    });
    const listener = createRequestListener(controller);

    const response = createMockResponse();
    await listener(
      {
        method: 'GET',
        url: `/api/models/${model.modelId}`,
      } as unknown as Parameters<typeof listener>[0],
      response as unknown as Parameters<typeof listener>[1],
    );

    expect(response.statusCode).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(String(response.body))).toEqual({ error: 'Failed to read model file' });
  });
});
