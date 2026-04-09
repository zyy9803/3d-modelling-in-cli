import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from './codex-turn-prompt';

describe('buildCodexTurnPrompt', () => {
  it('formats a summary-style prompt for a codex turn', () => {
    const prompt = buildCodexTurnPrompt({
      sessionId: 'session-1',
      activeModelId: 'model-42',
      message: {
        role: 'user',
        text: 'Inspect the selected ribs.',
      },
      selectionContext: {
        version: 1,
        model: {
          id: 'model-42',
          fileName: 'part.stl',
        },
        selection: {
          mode: 'click',
          triangleIds: [7, 9],
        },
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
      'Phase 3A conversation only.',
      'No STL or mesh edit has been executed.',
      'Active model ID: model-42',
      '',
      'User message:',
      'Inspect the selected ribs.',
      '',
      'Selection summary:',
      '- Model: part.stl (model-42)',
      '- Selection mode: click',
      '- Triangle IDs: 7, 9',
      '- Components: 1',
      '  - Component 1: sel_0',
      '    - Triangle IDs: 7, 9',
      '    - Centroid: [0, 1, 2]',
      '    - Bounding box: [-1, -1, -1] -> [1, 1, 1]',
      '    - Average normal: [0, 0, 1]',
      '    - Area: 2.5',
      '',
      'View summary:',
      '- Camera position: [1, 2, 3]',
      '- Target: [0, 0, 0]',
      '- Up: [0, 1, 0]',
      '- FOV: 50',
      '- View direction: [0, 0, -1]',
      '- Dominant orientation: +X',
      '- Viewport size: 1280 x 720',
    ].join('\n'));
  });

  it('stays deterministic when the request object keys are reordered', () => {
    const promptA = buildCodexTurnPrompt({
      sessionId: 'session-1',
      activeModelId: null,
      message: {
        role: 'user',
        text: 'Hello',
      },
      selectionContext: {
        version: 1,
        model: {
          id: 'model-42',
          fileName: 'part.stl',
        },
        selection: {
          mode: 'box',
          triangleIds: [],
        },
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

    const promptB = buildCodexTurnPrompt({
      message: {
        text: 'Hello',
        role: 'user',
      },
      viewContext: {
        viewportSize: [1280, 720],
        dominantOrientation: '+X',
        viewDirection: [0, 0, -1],
        fov: 50,
        up: [0, 1, 0],
        target: [0, 0, 0],
        cameraPosition: [1, 2, 3],
      },
      selectionContext: {
        components: [],
        selection: {
          triangleIds: [],
          mode: 'box',
        },
        model: {
          fileName: 'part.stl',
          id: 'model-42',
        },
        version: 1,
      },
      activeModelId: null,
      sessionId: 'session-1',
    });

    expect(promptB).toBe(promptA);
  });
});
