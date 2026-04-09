import { MOUSE } from 'three';
import { describe, expect, it } from 'vitest';

import { getDefaultMouseBindings } from './control-mode';

describe('getDefaultMouseBindings', () => {
  it('binds the left mouse button to rotate', () => {
    expect(getDefaultMouseBindings().LEFT).toBe(MOUSE.ROTATE);
  });

  it('binds the middle mouse button to pan', () => {
    expect(getDefaultMouseBindings().MIDDLE).toBe(MOUSE.PAN);
  });

  it('disables the right mouse button binding', () => {
    expect(getDefaultMouseBindings().RIGHT).toBeNull();
  });
});
