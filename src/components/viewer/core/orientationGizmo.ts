import { Vector3 } from "three";

export const ORIENTATION_KEYS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
export type OrientationKey = (typeof ORIENTATION_KEYS)[number];

export type OrientationFaceConfig = {
  key: OrientationKey;
  position: [number, number, number];
  rotation: [number, number, number];
  color: number;
};

export type OrientationAxisConfig = {
  key: "X" | "Y" | "Z";
  direction: [number, number, number];
  color: number;
};

export const GIZMO_FACE_CONFIGS: OrientationFaceConfig[] = [
  { key: "+X", position: [1, 0, 0], rotation: [0, Math.PI / 2, 0], color: 0x6d9fc2 },
  { key: "-X", position: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0], color: 0x44617a },
  { key: "+Y", position: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0], color: 0x83d99a },
  { key: "-Y", position: [0, -1, 0], rotation: [Math.PI / 2, 0, 0], color: 0x4d855f },
  { key: "+Z", position: [0, 0, 1], rotation: [0, 0, 0], color: 0x8fd0ff },
  { key: "-Z", position: [0, 0, -1], rotation: [0, Math.PI, 0], color: 0x506f87 },
];

export const GIZMO_AXIS_CONFIGS: OrientationAxisConfig[] = [
  { key: "X", direction: [1, 0, 0], color: 0xf2b36c },
  { key: "Y", direction: [0, 1, 0], color: 0x83d99a },
  { key: "Z", direction: [0, 0, 1], color: 0x8fd0ff },
];

const ORIENTATION_DIRECTION_MAP = new Map<OrientationKey, Vector3>(
  GIZMO_FACE_CONFIGS.map((config) => [config.key, new Vector3(...config.position)]),
);

export function getOrientationDirection(key: OrientationKey): Vector3 {
  const direction = ORIENTATION_DIRECTION_MAP.get(key);
  if (!direction) {
    throw new Error(`Unsupported orientation key: ${key}`);
  }

  return direction.clone();
}

export function getClosestOrientationKey(direction: Vector3): OrientationKey {
  const normalized = direction.clone().normalize();
  let closestKey: OrientationKey = "+X";
  let bestDot = -Infinity;

  for (const key of ORIENTATION_KEYS) {
    const dot = normalized.dot(getOrientationDirection(key));
    if (dot > bestDot) {
      bestDot = dot;
      closestKey = key;
    }
  }

  return closestKey;
}
