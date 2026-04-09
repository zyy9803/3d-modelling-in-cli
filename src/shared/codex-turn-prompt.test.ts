import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from './codex-turn-prompt';

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
    });

    expect(prompt).toBe([
      'Phase 3A conversation only. Do not claim that any STL or mesh edit has been executed.',
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
      'Phase 3A conversation only. Do not claim that any STL or mesh edit has been executed.',
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
