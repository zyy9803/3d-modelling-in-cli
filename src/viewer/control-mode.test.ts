import { MOUSE } from 'three';
import { describe, expect, it } from 'vitest';

import { getMouseBindings } from './control-mode';

describe('getMouseBindings', () => {
  it('maps the left mouse button to rotate in rotate mode', () => {
    expect(getMouseBindings('rotate').LEFT).toBe(MOUSE.ROTATE);
  });

  it('maps the left mouse button to pan in pan mode', () => {
    expect(getMouseBindings('pan').LEFT).toBe(MOUSE.PAN);
  });
});
