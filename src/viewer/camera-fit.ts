import { Box3, Vector3 } from 'three';

export const DEFAULT_CAMERA_DIRECTION = new Vector3(1, 1, 1).normalize();

export type CameraFitResult = {
  center: Vector3;
  distance: number;
  near: number;
  far: number;
};

export function fitCameraToBounds(bounds: Box3, fovDegrees: number, padding = 1.2): CameraFitResult {
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.length() * 0.5, 1);
  const halfFovRadians = (fovDegrees * Math.PI) / 360;
  const distance = Math.max(radius / Math.sin(halfFovRadians), 1) * padding;

  return {
    center,
    distance,
    near: Math.max(distance / 100, 0.01),
    far: Math.max(distance * 10, 10),
  };
}
