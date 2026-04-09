import { MOUSE } from 'three';

export type ControlMode = 'rotate' | 'pan';

export function getMouseBindings(mode: ControlMode) {
  return {
    LEFT: mode === 'rotate' ? MOUSE.ROTATE : MOUSE.PAN,
    MIDDLE: MOUSE.PAN,
    RIGHT: null,
  };
}
