import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  buildOrientationTransform,
  getClosestOrientationKey,
  getOrientationDirection,
  renderOrientationGizmo,
} from './orientation-gizmo';

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

  it('maps camera rotation into a CSS matrix transform', () => {
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const transform = buildOrientationTransform(quaternion);

    expect(transform.startsWith('matrix3d(')).toBe(true);
    expect(transform).not.toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('keeps the anchor class and renders six clickable faces when visible', () => {
    const root = document.createElement('div');
    root.className = 'orientation-anchor';

    renderOrientationGizmo(
      root,
      {
        visible: true,
        activeKey: '+X',
        cubeTransform: 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)',
      },
      () => undefined,
    );

    expect(root.classList.contains('orientation-anchor')).toBe(true);
    expect(root.querySelectorAll('[data-orientation-face]').length).toBe(6);
    expect(root.querySelector('[data-orientation-face="+X"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.orientation-gizmo__cube')?.getAttribute('style')).toContain('matrix3d');
  });

  it('renders nothing while hidden', () => {
    const root = document.createElement('div');

    renderOrientationGizmo(
      root,
      {
        visible: false,
        activeKey: null,
        cubeTransform: '',
      },
      () => undefined,
    );

    expect(root.querySelector('.orientation-gizmo')).toBeNull();
  });

  it('finds the closest standard orientation for a direction vector', () => {
    expect(getClosestOrientationKey(new Vector3(0.9, 0.2, 0.1))).toBe('+X');
    expect(getClosestOrientationKey(new Vector3(0.1, -0.8, 0.1))).toBe('-Y');
  });
});
