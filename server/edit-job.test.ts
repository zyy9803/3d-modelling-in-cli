import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createEditJobFactory } from './edit-job.js';
import { createModelRegistry } from './model-registry.js';

describe('createEditJobFactory', () => {
  it('creates a job workspace and writes a structured context file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-edit-job-'));
    const modelsRoot = join(root, 'models');
    const jobsRoot = join(root, 'jobs');
    const registry = createModelRegistry(modelsRoot);
    const imported = registry.registerImportedModel({
      sourceFileName: 'part.stl',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
    });

    const factory = createEditJobFactory({
      jobsRoot,
      registry,
    });

    const job = await factory.createJob({
      activeModelId: imported.modelId,
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+X',
        viewportSize: [1280, 720],
      },
      userInstruction: 'raise the selected surface by 2mm',
    });

    expect(job.jobId).toBe('job_001');
    expect(job.workspacePath).toBe(join(jobsRoot, 'job_001'));
    expect(job.contextPath).toBe(join(jobsRoot, 'job_001', 'context.json'));
    expect(job.scriptPath).toBe(join(jobsRoot, 'job_001', 'edit.py'));
    expect(job.resultPath).toBe(join(jobsRoot, 'job_001', 'result.json'));
    expect(job.baseModel).toEqual(imported);
    expect(job.outputModel).toEqual({
      modelId: 'model_002',
      parentModelId: 'model_001',
      sourceFileName: 'part-edited.stl',
      storagePath: join(modelsRoot, 'model_002_from_model_001.stl'),
      sourceJobId: 'job_001',
      createdAt: expect.any(String),
    });

    const context = JSON.parse(await readFile(job.contextPath, 'utf8')) as Record<string, unknown>;
    expect(context).toEqual({
      jobId: 'job_001',
      baseModelId: 'model_001',
      activeModelId: 'model_001',
      baseModelPath: join(modelsRoot, 'model_001_original.stl'),
      outputModelPath: join(modelsRoot, 'model_002_from_model_001.stl'),
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+X',
        viewportSize: [1280, 720],
      },
      userInstruction: 'raise the selected surface by 2mm',
    });
  });

  it('rejects jobs for unknown active models', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-edit-job-'));
    const registry = createModelRegistry(join(root, 'models'));
    const factory = createEditJobFactory({
      jobsRoot: join(root, 'jobs'),
      registry,
    });

    await expect(
      factory.createJob({
        activeModelId: 'model_999',
        selectionContext: {
          mode: 'box',
          triangleIds: [],
          components: [],
        },
        viewContext: {
          cameraPosition: [1, 2, 3],
          target: [0, 0, 0],
          up: [0, 1, 0],
          fov: 50,
          viewDirection: [0, 0, -1],
          dominantOrientation: '+X',
          viewportSize: [1280, 720],
        },
        userInstruction: 'noop',
      }),
    ).rejects.toThrow('Unknown active model: model_999');
  });
});
