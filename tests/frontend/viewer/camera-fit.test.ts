import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { fitCameraToBounds } from "../../../src/components/viewer/core/cameraFit";

describe('fitCameraToBounds', () => {
  it('returns the bounds center and a positive camera distance', () => {
    const bounds = new Box3(new Vector3(-5, -2, -1), new Vector3(5, 2, 1));

    const result = fitCameraToBounds(bounds, 50, 1.5);

    expect(result.center.toArray()).toEqual([0, 0, 0]);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.near).toBeGreaterThan(0);
    expect(result.far).toBeGreaterThan(result.near);
  });

  it('falls back to a safe minimum distance for a degenerate bounds', () => {
    const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(0, 0, 0));

    const result = fitCameraToBounds(bounds, 50, 1.25);

    expect(result.center.toArray()).toEqual([0, 0, 0]);
    expect(result.distance).toBeGreaterThanOrEqual(1);
  });
});
