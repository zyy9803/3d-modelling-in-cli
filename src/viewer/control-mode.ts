import { MOUSE } from 'three';

export function getDefaultMouseBindings() {
  return {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.PAN,
    RIGHT: null,
  };
}
