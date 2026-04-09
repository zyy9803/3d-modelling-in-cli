import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { getClosestOrientationKey, getOrientationDirection, renderOrientationGizmo } from './orientation-gizmo';

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

  it('renders buttons for all six axes', () => {
    const root = document.createElement('div');

    renderOrientationGizmo(root, '+X', () => undefined);

    expect(root.querySelectorAll('[data-orientation]').length).toBe(6);
    expect(root.querySelector('[data-orientation="+X"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.textContent).toContain('-Z');
  });

  it('finds the closest standard orientation for a direction vector', () => {
    expect(getClosestOrientationKey(new Vector3(0.9, 0.2, 0.1))).toBe('+X');
    expect(getClosestOrientationKey(new Vector3(0.1, -0.8, 0.1))).toBe('-Y');
  });
});
