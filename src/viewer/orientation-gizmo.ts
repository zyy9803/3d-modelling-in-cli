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

export function renderOrientationGizmo(
  root: HTMLElement,
  activeKey: OrientationKey | null,
  onSelect: (key: OrientationKey) => void,
): void {
  root.innerHTML = '';
  root.className = 'orientation-gizmo';

  for (const key of ORIENTATION_KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'orientation-gizmo__button';
    button.dataset.orientation = key;
    button.setAttribute('aria-pressed', String(activeKey === key));
    button.textContent = key;
    button.addEventListener('click', () => onSelect(key));
    root.append(button);
  }
}
