import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  GIZMO_AXIS_CONFIGS,
  GIZMO_FACE_CONFIGS,
  ORIENTATION_KEYS,
  getClosestOrientationKey,
  getOrientationDirection,
} from "../../../src/components/viewer/core/orientationGizmo";

describe('orientation gizmo config', () => {
  it('exports one face config for each standard orientation', () => {
    expect(GIZMO_FACE_CONFIGS.map((config) => config.key)).toEqual(ORIENTATION_KEYS);
  });

  it('keeps each face positioned on its matching world axis', () => {
    const positiveX = GIZMO_FACE_CONFIGS.find((config) => config.key === '+X');
    const negativeZ = GIZMO_FACE_CONFIGS.find((config) => config.key === '-Z');

    expect(positiveX?.position).toEqual([1, 0, 0]);
    expect(negativeZ?.position).toEqual([0, 0, -1]);
  });

  it('keeps xyz axis markers aligned with positive world directions', () => {
    expect(GIZMO_AXIS_CONFIGS).toEqual([
      { key: 'X', direction: [1, 0, 0], color: 0xf2b36c },
      { key: 'Y', direction: [0, 1, 0], color: 0x83d99a },
      { key: 'Z', direction: [0, 0, 1], color: 0x8fd0ff },
    ]);
  });
});

describe('orientation helpers', () => {
  it('returns the unit vector for +X', () => {
    expect(getOrientationDirection('+X')).toEqual(new Vector3(1, 0, 0));
  });

  it('returns the unit vector for -Y', () => {
    expect(getOrientationDirection('-Y')).toEqual(new Vector3(0, -1, 0));
  });

  it('returns the unit vector for +Z', () => {
    expect(getOrientationDirection('+Z')).toEqual(new Vector3(0, 0, 1));
  });

  it('finds the closest standard orientation for a direction vector', () => {
    expect(getClosestOrientationKey(new Vector3(0.9, 0.2, 0.1))).toBe('+X');
    expect(getClosestOrientationKey(new Vector3(0.1, -0.8, 0.1))).toBe('-Y');
  });
});
