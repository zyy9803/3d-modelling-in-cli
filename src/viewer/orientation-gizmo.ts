import { Matrix4, Quaternion, Vector3 } from 'three';

export const ORIENTATION_KEYS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const;
export type OrientationKey = (typeof ORIENTATION_KEYS)[number];

export type OrientationGizmoState = {
  visible: boolean;
  activeKey: OrientationKey | null;
  cubeTransform: string;
};

const IDENTITY_CUBE_TRANSFORM = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';

const AXES = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
] as const;

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

export function getClosestOrientationKey(direction: Vector3): OrientationKey {
  const normalized = direction.clone().normalize();
  let closestKey: OrientationKey = '+X';
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

export function buildOrientationTransform(cameraQuaternion: Quaternion): string {
  const matrix = new Matrix4().makeRotationFromQuaternion(cameraQuaternion.clone().invert());
  const elements = matrix.elements.map((value) => epsilon(value));

  return `matrix3d(${[
    elements[0],
    elements[1],
    elements[2],
    elements[3],
    -elements[4],
    -elements[5],
    -elements[6],
    -elements[7],
    elements[8],
    elements[9],
    elements[10],
    elements[11],
    elements[12],
    elements[13],
    elements[14],
    elements[15],
  ].join(',')})`;
}

export function renderOrientationGizmo(
  root: HTMLElement,
  state: OrientationGizmoState,
  onSelect: (key: OrientationKey) => void,
): void {
  root.innerHTML = '';

  if (!state.visible) {
    return;
  }

  const gizmo = document.createElement('div');
  gizmo.className = 'orientation-gizmo';

  const scene = document.createElement('div');
  scene.className = 'orientation-gizmo__scene';

  const axes = document.createElement('div');
  axes.className = 'orientation-gizmo__axes';
  axes.style.setProperty('--orientation-cube-transform', state.cubeTransform || IDENTITY_CUBE_TRANSFORM);

  for (const axis of AXES) {
    const marker = document.createElement('div');
    marker.className = `orientation-gizmo__axis orientation-gizmo__axis--${axis.axis}`;
    marker.textContent = axis.label;
    axes.append(marker);
  }

  const cube = document.createElement('div');
  cube.className = 'orientation-gizmo__cube';
  cube.style.setProperty('--orientation-cube-transform', state.cubeTransform || IDENTITY_CUBE_TRANSFORM);

  for (const key of ORIENTATION_KEYS) {
    const face = document.createElement('button');
    face.type = 'button';
    face.className = `orientation-gizmo__face orientation-gizmo__face--${toFaceClassName(key)}`;
    face.dataset.orientationFace = key;
    face.setAttribute('aria-pressed', String(state.activeKey === key));
    face.textContent = key;
    face.addEventListener('click', () => onSelect(key));
    cube.append(face);
  }

  scene.append(axes);
  scene.append(cube);
  gizmo.append(scene);
  root.append(gizmo);
}

function toFaceClassName(key: OrientationKey): string {
  return key.replace('+', 'pos-').replace('-', 'neg-').toLowerCase();
}

function epsilon(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10));
}
