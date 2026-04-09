import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { fitCameraToBounds, DEFAULT_CAMERA_DIRECTION, type CameraFitResult } from './camera-fit';
import { getMouseBindings, type ControlMode } from './control-mode';
import { getClosestOrientationKey, getOrientationDirection, type OrientationKey } from './orientation-gizmo';

type ViewportOptions = {
  onOrientationChange?: (key: OrientationKey) => void;
};

type CameraTween = {
  startedAt: number;
  duration: number;
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
};

export class StlViewport {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.01, 2000);
  private readonly loader = new STLLoader();
  private renderer: WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private container: HTMLElement | null = null;
  private mesh: Mesh | null = null;
  private currentFit: CameraFitResult | null = null;
  private mode: ControlMode = 'rotate';
  private resizeObserver: ResizeObserver | null = null;
  private tween: CameraTween | null = null;

  constructor(private readonly options: ViewportOptions = {}) {
    this.scene.background = new Color(0x11161d);
    this.camera.position.copy(DEFAULT_CAMERA_DIRECTION.clone().multiplyScalar(5));

    const ambientLight = new AmbientLight(0xffffff, 1.8);
    const keyLight = new DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(8, 12, 10);

    const fillLight = new DirectionalLight(0x7aa2c0, 1.2);
    fillLight.position.set(-6, 5, -8);

    this.scene.add(ambientLight, keyLight, fillLight);
  }

  mount(container: HTMLElement): void {
    this.container = container;

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'viewport-canvas';
    container.append(renderer.domElement);
    this.renderer = renderer;

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    this.controls = controls;
    this.setMode(this.mode);
    controls.addEventListener('change', this.handleControlsChange);

    this.resize();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', this.resize);
    }

    this.renderLoop();
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    if (!this.controls) {
      return;
    }

    const bindings = getMouseBindings(mode);
    this.controls.mouseButtons.LEFT = bindings.LEFT;
    this.controls.mouseButtons.MIDDLE = bindings.MIDDLE;
    this.controls.mouseButtons.RIGHT = bindings.RIGHT;
  }

  async loadFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const geometry = this.loader.parse(arrayBuffer);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    this.disposeMesh();

    const material = new MeshStandardMaterial({
      color: 0x8ea7bc,
      metalness: 0.04,
      roughness: 0.72,
    });

    const mesh = new Mesh(geometry, material);
    this.scene.add(mesh);
    this.mesh = mesh;

    const bounds = geometry.boundingBox?.clone() ?? new Box3().setFromObject(mesh);
    this.currentFit = fitCameraToBounds(bounds, this.camera.fov, 1.35);
    this.camera.near = this.currentFit.near;
    this.camera.far = this.currentFit.far;
    this.camera.updateProjectionMatrix();

    this.orientToDirection(DEFAULT_CAMERA_DIRECTION, false);
  }

  resetView(): void {
    this.orientToDirection(DEFAULT_CAMERA_DIRECTION, true);
  }

  orientTo(key: OrientationKey): void {
    this.orientToDirection(getOrientationDirection(key), true);
  }

  private orientToDirection(direction: Vector3, animated: boolean): void {
    if (!this.currentFit || !this.controls) {
      return;
    }

    const normalized = direction.clone().normalize();
    const toTarget = this.currentFit.center.clone();
    const toPosition = toTarget.clone().add(normalized.multiplyScalar(this.currentFit.distance));

    if (!animated) {
      this.controls.target.copy(toTarget);
      this.camera.position.copy(toPosition);
      this.controls.update();
      this.emitOrientation();
      this.renderOnce();
      return;
    }

    this.tween = {
      startedAt: performance.now(),
      duration: 240,
      fromPosition: this.camera.position.clone(),
      toPosition,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
  }

  private renderLoop = (): void => {
    if (!this.renderer || !this.controls) {
      return;
    }

    if (this.tween) {
      const elapsed = performance.now() - this.tween.startedAt;
      const progress = Math.min(elapsed / this.tween.duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);

      this.camera.position.lerpVectors(this.tween.fromPosition, this.tween.toPosition, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);

      if (progress >= 1) {
        this.tween = null;
        this.emitOrientation();
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    window.requestAnimationFrame(this.renderLoop);
  };

  private emitOrientation(): void {
    if (!this.controls || !this.currentFit) {
      return;
    }

    const direction = this.camera.position.clone().sub(this.controls.target);
    this.options.onOrientationChange?.(getClosestOrientationKey(direction));
  }

  private handleControlsChange = (): void => {
    this.emitOrientation();
  };

  private renderOnce(): void {
    if (!this.renderer) {
      return;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private resize = (): void => {
    if (!this.container || !this.renderer) {
      return;
    }

    const width = this.container.clientWidth || this.container.getBoundingClientRect().width || 1;
    const height = this.container.clientHeight || this.container.getBoundingClientRect().height || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private disposeMesh(): void {
    if (!this.mesh) {
      return;
    }

    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(this.mesh.material);
    }
    this.mesh = null;
  }
}

function disposeMaterial(material: Material): void {
  material.dispose();
}
