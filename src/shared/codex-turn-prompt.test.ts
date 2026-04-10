import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from './codex-turn-prompt.js';

describe('buildCodexTurnPrompt', () => {
  it('formats the summary payload from the session request', () => {
    const prompt = buildCodexTurnPrompt({
      sessionId: 'session-1',
      activeModelId: 'model-42',
      message: {
        role: 'user',
        text: 'Inspect the selected ribs.',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [7, 9],
        components: [
          {
            id: 'sel_0',
            triangleIds: [7, 9],
            centroid: [0, 1, 2],
            bboxMin: [-1, -1, -1],
            bboxMax: [1, 1, 1],
            avgNormal: [0, 0, 1],
            area: 2.5,
          },
        ],
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
      editJob: {
        jobId: 'job_001',
        workspacePath: 'artifacts/jobs/job_001',
        contextPath: 'artifacts/jobs/job_001/context.json',
        baseModelPath: 'artifacts/models/model_001_original.stl',
        outputModelPath: 'artifacts/models/model_002_from_model_001.stl',
      },
    });

    expect(prompt).toBe([
      'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows.',
      'You can inspect meshes, reason about selection context, and generate new STL models when an edit job is provided.',
      'Only use the edit job workspace when you decide to perform an actual mesh edit in this turn. For analysis, clarification, or discussion-only turns, do not create model artifacts.',
      'editJob.jobId: job_001',
      'editJob.workspacePath: artifacts/jobs/job_001',
      'editJob.contextPath: artifacts/jobs/job_001/context.json',
      'editJob.baseModelPath: artifacts/models/model_001_original.stl',
      'editJob.outputModelPath: artifacts/models/model_002_from_model_001.stl',
      'Use the model and selection context as the primary source of truth for geometry-focused requests.',
      'activeModelId: model-42',
      'triangleCount: 2',
      'componentCount: 1',
      'dominantOrientation: +X',
      'viewContext: {"cameraPosition":[1,2,3],"target":[0,0,0],"up":[0,1,0],"fov":50,"viewDirection":[0,0,-1],"dominantOrientation":"+X","viewportSize":[1280,720]}',
      'selectionContext: {"mode":"click","triangleIds":[7,9],"components":[{"id":"sel_0","triangleIds":[7,9],"centroid":[0,1,2],"bboxMin":[-1,-1,-1],"bboxMax":[1,1,1],"avgNormal":[0,0,1],"area":2.5}]}',
      'userInstruction: Inspect the selected ribs.',
    ].join('\n'));
  });

  it('keeps the output stable with null model ids and empty selections', () => {
    const prompt = buildCodexTurnPrompt({
      sessionId: 'session-2',
      activeModelId: null,
      message: {
        role: 'user',
        text: 'Hello',
      },
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
    });

    expect(prompt).toBe([
      'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows.',
      'You can inspect meshes, reason about selection context, and generate new STL models when an edit job is provided.',
      'Only use the edit job workspace when you decide to perform an actual mesh edit in this turn. For analysis, clarification, or discussion-only turns, do not create model artifacts.',
      'Use the model and selection context as the primary source of truth for geometry-focused requests.',
      'activeModelId: null',
      'triangleCount: 0',
      'componentCount: 0',
      'dominantOrientation: +X',
      'viewContext: {"cameraPosition":[1,2,3],"target":[0,0,0],"up":[0,1,0],"fov":50,"viewDirection":[0,0,-1],"dominantOrientation":"+X","viewportSize":[1280,720]}',
      'selectionContext: {"mode":"box","triangleIds":[],"components":[]}',
      'userInstruction: Hello',
    ].join('\n'));
  });
});
