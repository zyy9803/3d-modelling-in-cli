import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import {
  DEFAULT_CAMERA_DIRECTION,
  fitCameraToBounds,
  type CameraFitResult,
} from "./cameraFit";
import { getDefaultMouseBindings } from "./controlMode";
import { buildTriangleAdjacency, splitSelectionComponents } from "./meshTopology";
import {
  getClosestOrientationKey,
  getOrientationDirection,
  type OrientationKey,
} from "./orientationGizmo";
import { OrientationGizmoOverlay } from "./orientationGizmoOverlay";
import {
  createChatSelectionContext,
  createSelectionContext,
} from "./selectionContext";
import type {
  SelectionComponentPayload,
  SelectionContextPayload,
  SelectionMode,
  ViewContextPayload,
} from "../../../shared/codex-session-types";
import {
  getSelectionModifier,
  type SelectionModifier,
} from "./selectionShortcuts";
import {
  addTriangles,
  clearSelection as clearSelectionSet,
  removeTriangles,
  replaceSelection,
} from "./selectionManager";

const CLICK_MOVE_THRESHOLD = 6;
const SELECTION_FILL_COLOR = 0xf5c66a;
const POSITION_COMPONENTS = 9;
const VECTOR_COMPONENTS = 3;
const DARK_VIEWPORT_BACKGROUND = 0x11161d;
const LIGHT_VIEWPORT_BACKGROUND = 0xf3f6fb;

export type ViewportThemeMode = "light" | "dark";

export type ViewportSelectionSummary = {
  triangleCount: number;
  componentCount: number;
  mode: SelectionMode;
};

type ViewportOptions = {
  onSelectionChange?: (summary: ViewportSelectionSummary) => void;
  initialThemeMode?: ViewportThemeMode;
};

type CameraTween = {
  startedAt: number;
  duration: number;
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
};

type PointerSelectionState = {
  start: Vector2;
  moved: boolean;
  modifier: SelectionModifier;
  allowsBoxSelection: boolean;
};

type BoxSelectionState = PointerSelectionState & {
  current: Vector2;
};

type TriangleRecord = {
  id: number;
  centroid: Vector3;
  normal: Vector3;
  area: number;
  bboxMin: Vector3;
  bboxMax: Vector3;
};

type ViewportSnapshot = {
  fileName: string;
  viewContext: ViewContextPayload;
  selection: SelectionContextPayload;
  components: SelectionComponentPayload[];
};

export class StlViewport {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.01, 2000);
  private readonly loader = new STLLoader();
  private readonly raycaster = new Raycaster();
  private renderer: WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private container: HTMLElement | null = null;
  private mesh: Mesh | null = null;
  private highlightMesh: Mesh | null = null;
  private currentFit: CameraFitResult | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private tween: CameraTween | null = null;
  private selectionBox: HTMLElement | null = null;
  private orientationGizmo: OrientationGizmoOverlay | null = null;
  private pointerSelection: PointerSelectionState | null = null;
  private boxSelection: BoxSelectionState | null = null;
  private triangleRecords: TriangleRecord[] = [];
  private triangleAdjacency = new Map<number, number[]>();
  private selectedTriangles = new Set<number>();
  private selectionComponents: SelectionComponentPayload[] = [];
  private selectionMode: SelectionMode = "click";
  private selectionScreenRect: [number, number, number, number] | undefined;
  private positionArray: ArrayLike<number> | null = null;
  private normalArray: ArrayLike<number> | null = null;
  private loadedFileName: string | null = null;
  private animationFrameId: number | null = null;
  private themeMode: ViewportThemeMode;

  constructor(private readonly options: ViewportOptions = {}) {
    this.themeMode = options.initialThemeMode ?? "dark";
    this.applyThemeMode(this.themeMode);
    this.camera.position.copy(
      DEFAULT_CAMERA_DIRECTION.clone().multiplyScalar(5),
    );

    const ambientLight = new AmbientLight(0xffffff, 1.8);
    const keyLight = new DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(8, 12, 10);

    const fillLight = new DirectionalLight(0x7aa2c0, 1.2);
    fillLight.position.set(-6, 5, -8);

    this.scene.add(ambientLight, keyLight, fillLight);
  }

  setThemeMode(mode: ViewportThemeMode): void {
    if (this.themeMode === mode) {
      return;
    }

    this.themeMode = mode;
    this.applyThemeMode(mode);
  }

  mount(container: HTMLElement, orientationRoot?: HTMLElement): void {
    this.container = container;

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "viewport-canvas";
    renderer.domElement.addEventListener("pointerdown", this.handlePointerDown, {
      capture: true,
    });
    container.append(renderer.domElement);
    this.renderer = renderer;

    const selectionBox = document.createElement("div");
    selectionBox.className = "selection-box is-hidden";
    container.append(selectionBox);
    this.selectionBox = selectionBox;

    if (orientationRoot) {
      this.orientationGizmo = new OrientationGizmoOverlay((key) => {
        this.orientTo(key);
      });
      this.orientationGizmo.mount(orientationRoot);
      this.orientationGizmo.setVisible(false);
    }

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    this.controls = controls;
    this.applyDefaultMouseBindings();
    controls.addEventListener("change", this.handleControlsChange);

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleKeyDown);

    this.resize();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      if (orientationRoot) {
        this.resizeObserver.observe(orientationRoot);
      }
    } else {
      window.addEventListener("resize", this.resize);
    }

    this.emitSelectionChange();
    this.renderLoop();
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.domElement.removeEventListener(
        "pointerdown",
        this.handlePointerDown,
        { capture: true },
      );
    }

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resize", this.resize);

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.controls?.removeEventListener("change", this.handleControlsChange);
    this.controls?.dispose();
    this.controls = null;

    this.selectionBox?.remove();
    this.selectionBox = null;

    this.disposeMesh();
    this.orientationGizmo?.dispose();
    this.orientationGizmo = null;

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }

    this.container = null;
  }

  private applyThemeMode(mode: ViewportThemeMode): void {
    this.scene.background = new Color(
      mode === "dark" ? DARK_VIEWPORT_BACKGROUND : LIGHT_VIEWPORT_BACKGROUND,
    );
  }

  private applyDefaultMouseBindings(): void {
    if (!this.controls) {
      return;
    }

    const bindings = getDefaultMouseBindings();
    this.controls.mouseButtons.LEFT = bindings.LEFT;
    this.controls.mouseButtons.MIDDLE = bindings.MIDDLE;
    this.controls.mouseButtons.RIGHT = bindings.RIGHT;
  }

  async loadFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const geometry = this.loader.parse(arrayBuffer);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const positionAttribute = geometry.getAttribute("position");
    const normalAttribute = geometry.getAttribute("normal");
    if (!positionAttribute) {
      throw new Error("STL geometry has no position attribute");
    }

    this.disposeMesh();

    const material = new MeshStandardMaterial({
      color: 0x8ea7bc,
      metalness: 0.04,
      roughness: 0.72,
    });

    const mesh = new Mesh(geometry, material);
    this.scene.add(mesh);
    this.mesh = mesh;
    this.loadedFileName = file.name;
    this.positionArray = positionAttribute.array;
    this.normalArray = normalAttribute?.array ?? null;
    this.triangleRecords = buildTriangleRecords(this.positionArray);
    this.triangleAdjacency = buildTriangleAdjacency(this.positionArray);
    this.setSelection(clearSelectionSet(), "click");

    const bounds = geometry.boundingBox?.clone() ?? new Box3().setFromObject(mesh);
    this.currentFit = fitCameraToBounds(bounds, this.camera.fov, 1.35);
    this.camera.near = this.currentFit.near;
    this.camera.far = this.currentFit.far;
    this.camera.updateProjectionMatrix();

    this.orientToDirection(DEFAULT_CAMERA_DIRECTION, false);
    this.syncOrientationGizmo();
  }

  resetView(): void {
    this.orientToDirection(DEFAULT_CAMERA_DIRECTION, true);
  }

  orientTo(key: OrientationKey): void {
    this.orientToDirection(getOrientationDirection(key), true);
  }

  clearSelection(): void {
    this.setSelection(clearSelectionSet(), "click");
  }

  exportContext(): ReturnType<typeof createSelectionContext> | null {
    const snapshot = this.buildViewportSnapshot();
    if (!snapshot) {
      return null;
    }

    const payload = createSelectionContext({
      fileName: snapshot.fileName,
      view: snapshot.viewContext,
      selection: snapshot.selection,
      components: snapshot.components,
    });

    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildContextFileName(new Date());
    link.click();
    URL.revokeObjectURL(url);

    return payload;
  }

  buildChatPayload():
    | {
        selectionContext: ReturnType<typeof createChatSelectionContext>;
        viewContext: ViewContextPayload;
      }
    | null {
    const snapshot = this.buildViewportSnapshot();
    if (!snapshot) {
      return null;
    }

    return {
      selectionContext: createChatSelectionContext({
        selection: snapshot.selection,
        components: snapshot.components,
      }),
      viewContext: snapshot.viewContext,
    };
  }

  private buildViewportSnapshot(): ViewportSnapshot | null {
    if (!this.loadedFileName || !this.container || !this.controls) {
      return null;
    }

    const triangleIds = [...this.selectedTriangles].sort((left, right) => left - right);
    const viewToTarget = this.controls.target.clone().sub(this.camera.position);
    const orientationDirection = this.camera.position.clone().sub(this.controls.target);

    return {
      fileName: this.loadedFileName,
      viewContext: {
        cameraPosition: toVectorTuple(this.camera.position),
        target: toVectorTuple(this.controls.target),
        up: toVectorTuple(this.camera.up),
        fov: roundNumber(this.camera.fov),
        viewDirection: toVectorTuple(viewToTarget.normalize()),
        dominantOrientation: getClosestOrientationKey(orientationDirection),
        viewportSize: [
          Math.round(this.container.clientWidth || 0),
          Math.round(this.container.clientHeight || 0),
        ],
      },
      selection: {
        mode: this.selectionMode,
        triangleIds,
        ...(this.selectionScreenRect
          ? { screenRect: this.selectionScreenRect }
          : {}),
        components: [],
      },
      components: this.selectionComponents,
    };
  }

  private orientToDirection(direction: Vector3, animated: boolean): void {
    if (!this.currentFit || !this.controls) {
      return;
    }

    const normalized = direction.clone().normalize();
    const toTarget = this.currentFit.center.clone();
    const toPosition = toTarget
      .clone()
      .add(normalized.multiplyScalar(this.currentFit.distance));

    if (!animated) {
      this.controls.target.copy(toTarget);
      this.camera.position.copy(toPosition);
      this.controls.update();
      this.syncOrientationGizmo();
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

      this.camera.position.lerpVectors(
        this.tween.fromPosition,
        this.tween.toPosition,
        eased,
      );
      this.controls.target.lerpVectors(
        this.tween.fromTarget,
        this.tween.toTarget,
        eased,
      );

      if (progress >= 1) {
        this.tween = null;
        this.syncOrientationGizmo();
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.syncOrientationGizmo();
    this.animationFrameId = window.requestAnimationFrame(this.renderLoop);
  };

  private emitSelectionChange(): void {
    this.options.onSelectionChange?.({
      triangleCount: this.selectedTriangles.size,
      componentCount: this.selectionComponents.length,
      mode: this.selectionMode,
    });
  }

  private handleControlsChange = (): void => {
    this.syncOrientationGizmo();
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.renderer || !this.mesh || event.button !== 0) {
      return;
    }

    const point = this.getViewportPoint(event);
    if (!point) {
      return;
    }

    const modifier = getSelectionModifier(event);
    const allowsBoxSelection = event.shiftKey || event.ctrlKey || event.metaKey;

    this.pointerSelection = {
      start: point,
      moved: false,
      modifier,
      allowsBoxSelection,
    };

    if (allowsBoxSelection) {
      if (this.controls) {
        this.controls.enabled = false;
      }
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.boxSelection) {
      const point = this.getViewportPoint(event);
      if (!point) {
        return;
      }

      this.boxSelection.current = point;
      this.updateSelectionBox(this.boxSelection.start, point);
      return;
    }

    if (!this.pointerSelection) {
      return;
    }

    const point = this.getViewportPoint(event);
    if (!point) {
      return;
    }

    if (point.distanceTo(this.pointerSelection.start) <= CLICK_MOVE_THRESHOLD) {
      return;
    }

    this.pointerSelection.moved = true;

    if (!this.pointerSelection.allowsBoxSelection) {
      return;
    }

    this.boxSelection = {
      ...this.pointerSelection,
      current: point,
    };
    this.updateSelectionBox(this.boxSelection.start, point);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    if (this.boxSelection) {
      const point = this.getViewportPoint(event) ?? this.boxSelection.current;
      this.boxSelection.current = point;
      const rect = toScreenRect(this.boxSelection.start, point);
      const triangleIds = this.collectTrianglesInRect(rect);

      this.commitSelection(triangleIds, this.boxSelection.modifier, "box", rect);
      this.finishBoxSelection();
      return;
    }

    if (!this.pointerSelection) {
      return;
    }

    const point = this.getViewportPoint(event);
    const selection = this.pointerSelection;
    this.pointerSelection = null;

    if (!point) {
      return;
    }

    if (point.distanceTo(selection.start) > CLICK_MOVE_THRESHOLD) {
      selection.moved = true;
    }

    if (selection.moved) {
      if (selection.allowsBoxSelection && this.controls) {
        this.controls.enabled = true;
      }
      return;
    }

    const triangleId = this.pickTriangle(point);
    if (triangleId === null) {
      if (selection.allowsBoxSelection && this.controls) {
        this.controls.enabled = true;
      }
      return;
    }

    this.commitSelection([triangleId], selection.modifier, "click");
    if (selection.allowsBoxSelection && this.controls) {
      this.controls.enabled = true;
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    this.finishBoxSelection();
  };

  private commitSelection(
    triangleIds: Iterable<number>,
    modifier: SelectionModifier,
    mode: SelectionMode,
    screenRect?: [number, number, number, number],
  ): void {
    let nextSelection: Set<number>;
    switch (modifier) {
      case "add":
        nextSelection = addTriangles(this.selectedTriangles, triangleIds);
        break;
      case "subtract":
        nextSelection = removeTriangles(this.selectedTriangles, triangleIds);
        break;
      case "replace":
      default:
        nextSelection = replaceSelection(this.selectedTriangles, triangleIds);
        break;
    }

    this.setSelection(nextSelection, mode, screenRect);
  }

  private setSelection(
    nextSelection: Set<number>,
    mode: SelectionMode,
    screenRect?: [number, number, number, number],
  ): void {
    this.selectedTriangles = nextSelection;
    this.selectionMode = mode;
    this.selectionScreenRect = screenRect;
    this.selectionComponents = buildSelectionComponents(
      this.selectedTriangles,
      this.triangleRecords,
      this.triangleAdjacency,
    );
    this.syncHighlightMesh();
    this.emitSelectionChange();
    this.renderOnce();
  }

  private collectTrianglesInRect(rect: [number, number, number, number]): number[] {
    const selected: number[] = [];

    for (const record of this.triangleRecords) {
      const screenPoint = this.projectPointToViewport(record.centroid);
      if (!screenPoint || !isPointInRect(screenPoint, rect)) {
        continue;
      }

      if (
        !this.isTriangleFacingCamera(record) ||
        !this.isTriangleVisible(record.id, screenPoint)
      ) {
        continue;
      }

      selected.push(record.id);
    }

    return selected.sort((left, right) => left - right);
  }

  private pickTriangle(point: Vector2): number | null {
    if (!this.renderer || !this.mesh) {
      return null;
    }

    this.raycaster.setFromCamera(
      toNdcPoint(point, this.renderer.domElement),
      this.camera,
    );
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];

    return getTriangleId(hit?.faceIndex);
  }

  private isTriangleVisible(triangleId: number, screenPoint: Vector2): boolean {
    if (!this.renderer || !this.mesh) {
      return false;
    }

    this.raycaster.setFromCamera(
      toNdcPoint(screenPoint, this.renderer.domElement),
      this.camera,
    );
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];

    return getTriangleId(hit?.faceIndex) === triangleId;
  }

  private isTriangleFacingCamera(record: TriangleRecord): boolean {
    const toCamera = this.camera.position.clone().sub(record.centroid);
    return record.normal.dot(toCamera) > 0;
  }

  private projectPointToViewport(point: Vector3): Vector2 | null {
    if (!this.renderer) {
      return null;
    }

    const projected = point.clone().project(this.camera);
    if (projected.z < -1 || projected.z > 1) {
      return null;
    }

    const width =
      this.renderer.domElement.clientWidth || this.renderer.domElement.width || 1;
    const height =
      this.renderer.domElement.clientHeight || this.renderer.domElement.height || 1;

    return new Vector2(
      (projected.x * 0.5 + 0.5) * width,
      (1 - (projected.y * 0.5 + 0.5)) * height,
    );
  }

  private updateSelectionBox(start: Vector2, end: Vector2): void {
    if (!this.selectionBox) {
      return;
    }

    const [left, top, right, bottom] = toScreenRect(start, end);
    this.selectionBox.classList.remove("is-hidden");
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${Math.max(right - left, 1)}px`;
    this.selectionBox.style.height = `${Math.max(bottom - top, 1)}px`;
  }

  private finishBoxSelection(): void {
    this.boxSelection = null;
    this.pointerSelection = null;
    if (this.controls) {
      this.controls.enabled = true;
    }
    if (this.selectionBox) {
      this.selectionBox.classList.add("is-hidden");
      this.selectionBox.style.width = "0";
      this.selectionBox.style.height = "0";
    }
  }

  private syncHighlightMesh(): void {
    this.disposeHighlightMesh();

    if (!this.mesh || !this.positionArray || this.selectedTriangles.size === 0) {
      return;
    }

    const positions: number[] = [];
    const normals: number[] = [];

    for (const triangleId of [...this.selectedTriangles].sort((left, right) => left - right)) {
      const base = triangleId * POSITION_COMPONENTS;
      for (let offset = 0; offset < POSITION_COMPONENTS; offset += 1) {
        positions.push(this.positionArray[base + offset]);
      }

      if (this.normalArray) {
        for (let offset = 0; offset < POSITION_COMPONENTS; offset += 1) {
          normals.push(this.normalArray[base + offset]);
        }
      } else {
        const normal = this.triangleRecords[triangleId]?.normal ?? new Vector3(0, 0, 1);
        for (let count = 0; count < VECTOR_COMPONENTS; count += 1) {
          normals.push(normal.x, normal.y, normal.z);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, VECTOR_COMPONENTS),
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(normals, VECTOR_COMPONENTS),
    );

    const material = new MeshBasicMaterial({
      color: SELECTION_FILL_COLOR,
      opacity: 0.45,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.highlightMesh = new Mesh(geometry, material);
    this.scene.add(this.highlightMesh);
  }

  private renderOnce(): void {
    if (!this.renderer) {
      return;
    }

    this.renderer.render(this.scene, this.camera);
    this.syncOrientationGizmo();
  }

  private resize = (): void => {
    if (!this.container || !this.renderer) {
      return;
    }

    const width =
      this.container.clientWidth || this.container.getBoundingClientRect().width || 1;
    const height =
      this.container.clientHeight || this.container.getBoundingClientRect().height || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.orientationGizmo?.resize();
  };

  private syncOrientationGizmo(): void {
    if (!this.controls || !this.mesh) {
      this.orientationGizmo?.setVisible(false);
      return;
    }

    const viewDirection = this.camera.position.clone().sub(this.controls.target);
    this.orientationGizmo?.setVisible(true);
    this.orientationGizmo?.syncFromCamera(viewDirection);
  }

  private getViewportPoint(event: PointerEvent): Vector2 | null {
    if (!this.renderer) {
      return null;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return null;
    }

    return new Vector2(x, y);
  }

  private disposeMesh(): void {
    this.disposeHighlightMesh();

    if (!this.mesh) {
      this.orientationGizmo?.setVisible(false);
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
    this.orientationGizmo?.setVisible(false);
  }

  private disposeHighlightMesh(): void {
    if (!this.highlightMesh) {
      return;
    }

    this.scene.remove(this.highlightMesh);
    this.highlightMesh.geometry.dispose();
    if (Array.isArray(this.highlightMesh.material)) {
      this.highlightMesh.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(this.highlightMesh.material);
    }
    this.highlightMesh = null;
  }
}

function buildTriangleRecords(positionArray: ArrayLike<number>): TriangleRecord[] {
  const records: TriangleRecord[] = [];
  const triangleCount = Math.floor(positionArray.length / POSITION_COMPONENTS);

  for (let triangleId = 0; triangleId < triangleCount; triangleId += 1) {
    const base = triangleId * POSITION_COMPONENTS;
    const a = new Vector3(
      positionArray[base],
      positionArray[base + 1],
      positionArray[base + 2],
    );
    const b = new Vector3(
      positionArray[base + 3],
      positionArray[base + 4],
      positionArray[base + 5],
    );
    const c = new Vector3(
      positionArray[base + 6],
      positionArray[base + 7],
      positionArray[base + 8],
    );
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const area = cross.length() * 0.5;
    const normal = area > 0 ? cross.normalize() : new Vector3(0, 0, 1);
    const bboxMin = new Vector3(
      Math.min(a.x, b.x, c.x),
      Math.min(a.y, b.y, c.y),
      Math.min(a.z, b.z, c.z),
    );
    const bboxMax = new Vector3(
      Math.max(a.x, b.x, c.x),
      Math.max(a.y, b.y, c.y),
      Math.max(a.z, b.z, c.z),
    );

    records.push({
      id: triangleId,
      centroid,
      normal,
      area: roundNumber(area),
      bboxMin,
      bboxMax,
    });
  }

  return records;
}

function buildSelectionComponents(
  selectedTriangles: Set<number>,
  triangleRecords: TriangleRecord[],
  adjacency: Map<number, number[]>,
): SelectionComponentPayload[] {
  return splitSelectionComponents(selectedTriangles, adjacency).map(
    (triangleIds, index) => {
      const centroid = new Vector3();
      const avgNormal = new Vector3();
      const bboxMin = new Vector3(Infinity, Infinity, Infinity);
      const bboxMax = new Vector3(-Infinity, -Infinity, -Infinity);
      let area = 0;
      let weightSum = 0;

      for (const triangleId of triangleIds) {
        const record = triangleRecords[triangleId];
        if (!record) {
          continue;
        }

        const weight = record.area > 0 ? record.area : 1;
        centroid.add(record.centroid.clone().multiplyScalar(weight));
        avgNormal.add(record.normal.clone().multiplyScalar(weight));
        bboxMin.min(record.bboxMin);
        bboxMax.max(record.bboxMax);
        area += record.area;
        weightSum += weight;
      }

      if (weightSum > 0) {
        centroid.multiplyScalar(1 / weightSum);
        avgNormal.normalize();
      }

      return {
        id: `sel_${index}`,
        triangleIds,
        centroid: toVectorTuple(centroid),
        bboxMin: toVectorTuple(bboxMin),
        bboxMax: toVectorTuple(bboxMax),
        avgNormal: toVectorTuple(avgNormal),
        area: roundNumber(area),
      };
    },
  );
}

function toScreenRect(
  start: Vector2,
  end: Vector2,
): [number, number, number, number] {
  const left = Math.round(Math.min(start.x, end.x));
  const top = Math.round(Math.min(start.y, end.y));
  const right = Math.round(Math.max(start.x, end.x));
  const bottom = Math.round(Math.max(start.y, end.y));

  return [left, top, right, bottom];
}

function isPointInRect(
  point: Vector2,
  rect: [number, number, number, number],
): boolean {
  return (
    point.x >= rect[0] &&
    point.x <= rect[2] &&
    point.y >= rect[1] &&
    point.y <= rect[3]
  );
}

function toNdcPoint(point: Vector2, canvas: HTMLCanvasElement): Vector2 {
  const width = canvas.clientWidth || canvas.width || 1;
  const height = canvas.clientHeight || canvas.height || 1;
  return new Vector2((point.x / width) * 2 - 1, -(point.y / height) * 2 + 1);
}

function toVectorTuple(vector: Vector3): [number, number, number] {
  return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)];
}

function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}

function getTriangleId(faceIndex: number | null | undefined): number | null {
  if (typeof faceIndex !== "number" || faceIndex < 0) {
    return null;
  }

  return faceIndex;
}

function buildContextFileName(date: Date): string {
  const iso = date.toISOString().replace(/\.\d{3}Z$/, "");
  return `context-${iso.replace(/:/g, "-")}.json`;
}

function disposeMaterial(material: Material): void {
  material.dispose();
}
