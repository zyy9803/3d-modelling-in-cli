import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from '../../../src/shared/codex-turn-prompt.js';

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
        scriptPath: 'artifacts/jobs/job_001/edit.py',
      },
    });

    expect(prompt).toBe([
      'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows.',
      'This is a draft-only turn. You must first inspect and globally parse the active STL, then reason about selection context, and create or update a Python draft script for a possible mesh edit when appropriate.',
      'Do not run the draft script, do not write result.json, and do not generate or overwrite any STL files in this turn.',
      'editJob.jobId: job_001',
      'editJob.workspacePath: artifacts/jobs/job_001',
      'editJob.contextPath: artifacts/jobs/job_001/context.json',
      'editJob.baseModelPath: artifacts/models/model_001_original.stl',
      'editJob.scriptPath: artifacts/jobs/job_001/edit.py',
      'If editJob paths are provided, read editJob.contextPath and inspect editJob.baseModelPath directly before making geometry claims or proposing edits.',
      'Read-only shell commands and one-off local Python inspection scripts are allowed in this turn only for STL parsing and geometry inspection. Do not install packages, do not modify the base STL, and do not write output STL files during inspection.',
      'Do not browse the internet or attempt network access. If exact external dimensions are required and are not already in the prompt or context, ask the user to provide them explicitly.',
      'Any draft script that you write must run with the local default Python interpreter using the standard library only. Do not depend on numpy, trimesh, scipy, pandas, shapely, mapbox_earcut, numpy-stl, or any other third-party package.',
      'If you cannot complete a reliable draft from the provided context alone, respond with a concise clarification request instead of continuing to explore.',
      'If the request is still exploratory or ambiguous, continue the discussion instead of forcing a draft.',
      'Use the model and selection context as the primary source of truth for geometry-focused requests.',
      'Selected triangles are provided below. Treat the request as scoped to that selection unless the user says otherwise.',
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
      'This is a draft-only turn. You must first inspect and globally parse the active STL, then reason about selection context, and create or update a Python draft script for a possible mesh edit when appropriate.',
      'Do not run the draft script, do not write result.json, and do not generate or overwrite any STL files in this turn.',
      'If editJob paths are provided, read editJob.contextPath and inspect editJob.baseModelPath directly before making geometry claims or proposing edits.',
      'Read-only shell commands and one-off local Python inspection scripts are allowed in this turn only for STL parsing and geometry inspection. Do not install packages, do not modify the base STL, and do not write output STL files during inspection.',
      'Do not browse the internet or attempt network access. If exact external dimensions are required and are not already in the prompt or context, ask the user to provide them explicitly.',
      'Any draft script that you write must run with the local default Python interpreter using the standard library only. Do not depend on numpy, trimesh, scipy, pandas, shapely, mapbox_earcut, numpy-stl, or any other third-party package.',
      'If you cannot complete a reliable draft from the provided context alone, respond with a concise clarification request instead of continuing to explore.',
      'If the request is still exploratory or ambiguous, continue the discussion instead of forcing a draft.',
      'Use the model and selection context as the primary source of truth for geometry-focused requests.',
      'No triangles are selected in this turn. Treat the request as applying to the whole STL unless the user says otherwise.',
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
