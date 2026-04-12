import {
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

import {
  GIZMO_AXIS_CONFIGS,
  GIZMO_FACE_CONFIGS,
  getClosestOrientationKey,
  type OrientationKey,
} from "./orientation-gizmo";

const FACE_SIZE = 0.92;
const FACE_DISTANCE = 0.52;
const AXIS_LENGTH = 1.55;
const AXIS_OFFSET = 0.06;
const FALLBACK_GIZMO_DIRECTION = new Vector3(1, 1, 1).normalize();

export const GIZMO_CAMERA_DISTANCE = 4.2;

export class OrientationGizmoOverlay {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 20);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly faceMeshes: Mesh[] = [];
  private readonly disposeTargets: Array<{ dispose: () => void }> = [];
  private readonly rootGroup = new Group();
  private renderer: WebGLRenderer | null = null;
  private host: HTMLElement | null = null;
  private activeKey: OrientationKey | null = null;

  constructor(private readonly onSelect: (key: OrientationKey) => void) {
    this.scene.background = null;
    this.scene.add(this.rootGroup);
    this.buildCubeFaces();
    this.buildCubeFrame();
    this.buildAxes();
  }

  mount(host: HTMLElement): void {
    this.host = host;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    renderer.domElement.className = "orientation-gizmo-canvas";
    renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    host.append(renderer.domElement);
    this.renderer = renderer;

    this.resize();
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    if (!this.host) {
      return;
    }

    this.host.classList.toggle("is-hidden", !visible);
  }

  resize(): void {
    if (!this.host || !this.renderer) {
      return;
    }

    const width = this.host.clientWidth || this.host.getBoundingClientRect().width || 1;
    const height = this.host.clientHeight || this.host.getBoundingClientRect().height || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  syncFromCamera(viewDirection: Vector3): void {
    if (!this.renderer || !this.host || this.host.classList.contains("is-hidden")) {
      return;
    }

    this.camera.position.copy(getGizmoCameraPosition(viewDirection));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.updateActiveFace(getClosestOrientationKey(viewDirection));
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }

    for (const target of this.disposeTargets) {
      if ("dispose" in target && typeof target.dispose === "function") {
        target.dispose();
      }
    }

    this.disposeTargets.length = 0;
    this.faceMeshes.length = 0;
    this.host = null;
  }

  private buildCubeFaces(): void {
    const geometry = new PlaneGeometry(FACE_SIZE, FACE_SIZE);
    this.disposeTargets.push(geometry);

    for (const config of GIZMO_FACE_CONFIGS) {
      const texture = createFaceTexture(config.key, config.color);
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
      });
      const face = new Mesh(geometry, material);

      face.position.set(
        config.position[0] * FACE_DISTANCE,
        config.position[1] * FACE_DISTANCE,
        config.position[2] * FACE_DISTANCE,
      );
      face.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      face.userData.orientationKey = config.key;

      this.faceMeshes.push(face);
      this.rootGroup.add(face);
      this.disposeTargets.push(material, texture);
    }
  }

  private buildCubeFrame(): void {
    const geometry = new EdgesGeometry(new BoxGeometry(1, 1, 1));
    const material = new LineBasicMaterial({
      color: 0xb6cadb,
      transparent: true,
      opacity: 0.75,
    });
    const frame = new LineSegments(geometry, material);

    this.rootGroup.add(frame);
    this.disposeTargets.push(geometry, material);
  }

  private buildAxes(): void {
    for (const config of GIZMO_AXIS_CONFIGS) {
      const direction = new Vector3(...config.direction).normalize();
      const points = [
        direction.clone().multiplyScalar(AXIS_OFFSET),
        direction.clone().multiplyScalar(AXIS_LENGTH),
      ];
      const geometry = new BufferGeometry().setFromPoints(points);
      const material = new LineBasicMaterial({
        color: new Color(config.color),
      });
      const line = new Line(geometry, material);

      line.userData.axisKey = config.key;
      this.rootGroup.add(line);
      this.disposeTargets.push(geometry, material);

      const labelTexture = createAxisLabelTexture(config.key, config.color);
      const labelMaterial = new SpriteMaterial({
        map: labelTexture,
        transparent: true,
      });
      const label = new Sprite(labelMaterial);
      label.position.copy(direction.multiplyScalar(AXIS_LENGTH + 0.18));
      label.scale.setScalar(0.28);
      this.rootGroup.add(label);
      this.disposeTargets.push(labelMaterial, labelTexture);
    }
  }

  private updateActiveFace(activeKey: OrientationKey): void {
    if (this.activeKey === activeKey) {
      return;
    }

    this.activeKey = activeKey;

    for (const face of this.faceMeshes) {
      const material = face.material;
      if (!(material instanceof MeshBasicMaterial)) {
        continue;
      }

      const isActive = face.userData.orientationKey === activeKey;
      material.opacity = isActive ? 1 : 0.92;
      material.color.setHex(isActive ? 0xffffff : 0xe7eef5);
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.renderer) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return;
    }

    this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(this.faceMeshes, false)[0];
    const key = hit?.object.userData.orientationKey as OrientationKey | undefined;
    if (!key) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.onSelect(key);
  };
}

export function getGizmoCameraPosition(viewDirection: Vector3): Vector3 {
  const direction =
    viewDirection.lengthSq() > 0
      ? viewDirection.clone().normalize()
      : FALLBACK_GIZMO_DIRECTION.clone();
  return direction.multiplyScalar(GIZMO_CAMERA_DISTANCE);
}

function createFaceTexture(label: OrientationKey, color: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for orientation gizmo");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#10161d";
  roundRect(context, 8, 8, 176, 176, 28);
  context.fill();

  context.lineWidth = 6;
  context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  roundRect(context, 8, 8, 176, 176, 28);
  context.stroke();

  context.fillStyle = "#eff7ff";
  context.font = '700 54px "Segoe UI", "PingFang SC", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 96, 98);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createAxisLabelTexture(label: string, color: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create axis label texture");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.font = '700 54px "Segoe UI", "PingFang SC", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 48, 50);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
