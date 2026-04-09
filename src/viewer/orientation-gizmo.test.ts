import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { getOrientationDirection } from './orientation-gizmo';

describe('getOrientationDirection', () => {
  it('returns the unit vector for +X', () => {
    expect(getOrientationDirection('+X')).toEqual(new Vector3(1, 0, 0));
  });

  it('returns the unit vector for -Y', () => {
    expect(getOrientationDirection('-Y')).toEqual(new Vector3(0, -1, 0));
  });

  it('returns the unit vector for +Z', () => {
    expect(getOrientationDirection('+Z')).toEqual(new Vector3(0, 0, 1));
  });
});
