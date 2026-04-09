import { Vector3 } from 'three';

export const ORIENTATION_KEYS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const;
export type OrientationKey = (typeof ORIENTATION_KEYS)[number];

export function getOrientationDirection(key: OrientationKey): Vector3 {
  switch (key) {
    case '+X':
      return new Vector3(1, 0, 0);
    case '-X':
      return new Vector3(-1, 0, 0);
    case '+Y':
      return new Vector3(0, 1, 0);
    case '-Y':
      return new Vector3(0, -1, 0);
    case '+Z':
      return new Vector3(0, 0, 1);
    case '-Z':
      return new Vector3(0, 0, -1);
  }
}
