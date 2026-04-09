import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { GIZMO_CAMERA_DISTANCE, getGizmoCameraPosition } from './orientation-gizmo-overlay';

describe('getGizmoCameraPosition', () => {
  it('normalizes the main view direction to a fixed gizmo camera distance', () => {
    const position = getGizmoCameraPosition(new Vector3(4, 0, 0));

    expect(position).toEqual(new Vector3(GIZMO_CAMERA_DISTANCE, 0, 0));
  });

  it('falls back to a stable isometric vector when the direction is zero', () => {
    const position = getGizmoCameraPosition(new Vector3(0, 0, 0));

    expect(position.length()).toBeCloseTo(GIZMO_CAMERA_DISTANCE);
  });
});
