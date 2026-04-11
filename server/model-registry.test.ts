import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createModelRegistry } from './model-registry.js';

describe('createModelRegistry', () => {
  it('registers imported and derived models with stable ids and storage paths', () => {
    const registry = createModelRegistry('C:/repo/artifacts/models');
    const root = resolve('C:/repo/artifacts/models');

    const original = registry.registerImportedModel({
      sourceFileName: 'part.stl',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
    });

    const derived = registry.registerDerivedModel({
      parentModelId: original.modelId,
      sourceFileName: 'part-edited.stl',
      jobId: 'job_001',
      createdAt: new Date('2026-04-10T00:01:00.000Z'),
    });

    expect(original).toEqual({
      modelId: 'model_001',
      parentModelId: null,
      sourceFileName: 'part.stl',
      storagePath: join(root, 'model_001_original.stl'),
      sourceJobId: null,
      createdAt: '2026-04-10T00:00:00.000Z',
    });

    expect(derived).toEqual({
      modelId: 'model_002',
      parentModelId: 'model_001',
      sourceFileName: 'model_002_from_model_001.stl',
      storagePath: join(root, 'model_002_from_model_001.stl'),
      sourceJobId: 'job_001',
      createdAt: '2026-04-10T00:01:00.000Z',
    });

    expect(registry.getModel('model_001')).toEqual(original);
    expect(registry.getModel('model_002')).toEqual(derived);
    expect(registry.listModels()).toEqual([original, derived]);
  });

  it('rejects derived models with an unknown parent id', () => {
    const registry = createModelRegistry('C:/repo/artifacts/models');

    expect(() =>
      registry.registerDerivedModel({
        parentModelId: 'model_999',
        sourceFileName: 'part-edited.stl',
        jobId: 'job_001',
      }),
    ).toThrow('Unknown parent model: model_999');
  });
});
