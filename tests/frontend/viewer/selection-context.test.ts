import { describe, expect, it } from 'vitest';

import { createSelectionContext } from "../../../src/lib/viewer/selection-context";

describe('createSelectionContext', () => {
  it('builds the exported context payload', () => {
    const context = createSelectionContext({
      fileName: 'part.stl',
      view: {
        cameraPosition: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+X',
        viewportSize: [1280, 720],
      },
      selection: {
        mode: 'click',
        triangleIds: [7],
      },
      components: [
        {
          id: 'sel_0',
          triangleIds: [7],
          centroid: [0, 0, 0],
          bboxMin: [-1, -1, -1],
          bboxMax: [1, 1, 1],
          avgNormal: [0, 0, 1],
          area: 2,
        },
      ],
    });

    expect(context).toEqual({
      version: 1,
      model: {
        file: 'part.stl',
      },
      view: {
        cameraPosition: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+X',
        viewportSize: [1280, 720],
      },
      selection: {
        mode: 'click',
        triangleIds: [7],
      },
      components: [
        {
          id: 'sel_0',
          triangleIds: [7],
          centroid: [0, 0, 0],
          bboxMin: [-1, -1, -1],
          bboxMax: [1, 1, 1],
          avgNormal: [0, 0, 1],
          area: 2,
        },
      ],
    });
  });
});
