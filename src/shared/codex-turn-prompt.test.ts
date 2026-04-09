import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from './codex-turn-prompt';

describe('buildCodexTurnPrompt', () => {
  it('serializes the turn in a deterministic, phase-3A-only payload', () => {
    const prompt = buildCodexTurnPrompt({
      activeModelId: 'model-42',
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
      userText: 'Inspect the selected ribs.',
    });

    expect(prompt).toBe(
      [
        'Phase 3A conversation only.',
        'No STL or mesh edit has been executed.',
        'Active model ID: model-42',
        '',
        'Selection context:',
        '{',
        '  "components": [',
        '    {',
        '      "area": 2.5,',
        '      "avgNormal": [',
        '        0,',
        '        0,',
        '        1',
        '      ],',
        '      "bboxMax": [',
        '        1,',
        '        1,',
        '        1',
        '      ],',
        '      "bboxMin": [',
        '        -1,',
        '        -1,',
        '        -1',
        '      ],',
        '      "centroid": [',
        '        0,',
        '        1,',
        '        2',
        '      ],',
        '      "id": "sel_0",',
        '      "triangleIds": [',
        '        7,',
        '        9',
        '      ]',
        '    }',
        '  ],',
        '  "model": {',
        '    "fileName": "part.stl",',
        '    "id": "model-42"',
        '  },',
        '  "selection": {',
        '    "mode": "click",',
        '    "triangleIds": [',
        '      7,',
        '      9',
        '    ]',
        '  },',
        '  "version": 1',
        '}',
        '',
        'View context:',
        '{',
        '  "cameraPosition": [',
        '    1,',
        '    2,',
        '    3',
        '  ],',
        '  "dominantOrientation": "+X",',
        '  "fov": 50,',
        '  "target": [',
        '    0,',
        '    0,',
        '    0',
        '  ],',
        '  "up": [',
        '    0,',
        '    1,',
        '    0',
        '  ],',
        '  "viewDirection": [',
        '    0,',
        '    0,',
        '    -1',
        '  ],',
        '  "viewportSize": [',
        '    1280,',
        '    720',
        '  ]',
        '}',
        '',
        'User text:',
        'Inspect the selected ribs.',
      ].join('\n'),
    );
  });

  it('keeps prompt output stable when object keys arrive in a different order', () => {
    const promptA = buildCodexTurnPrompt({
      activeModelId: 'model-42',
      selectionContext: {
        version: 1,
        model: {
          id: 'model-42',
          fileName: 'part.stl',
        },
        selection: {
          mode: 'click',
          triangleIds: [1, 2],
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
      userText: 'Hello',
    });

    const promptB = buildCodexTurnPrompt({
      activeModelId: 'model-42',
      selectionContext: {
        components: [],
        selection: {
          triangleIds: [1, 2],
          mode: 'click',
        },
        model: {
          fileName: 'part.stl',
          id: 'model-42',
        },
        version: 1,
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
      userText: 'Hello',
    });

    expect(promptB).toBe(promptA);
  });
});
