# STL Web 预览器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于 TypeScript 与 Three.js 的 Web 端 STL 预览器，支持本地文件导入、滚轮缩放、旋转/平移模式切换、自动居中 framing、重置视角与右下角 XYZ 朝向控件。

**Architecture:** 使用 Vite 启动一个原生 TypeScript 单页应用。Three.js 与 OrbitControls 负责 3D 渲染和相机交互，DOM 负责文件导入、底部模式按钮和右下角朝向控件，纯数学与映射逻辑拆到独立工具文件并优先以 Vitest 做 TDD。

**Tech Stack:** Vite, TypeScript, Three.js, Vitest, jsdom

---

## 文件结构

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src/app/ViewerApp.ts`
- Create: `src/ui/FileDropzone.ts`
- Create: `src/viewer/StlViewport.ts`
- Create: `src/viewer/camera-fit.ts`
- Create: `src/viewer/orientation-gizmo.ts`
- Create: `src/viewer/control-mode.ts`
- Create: `src/viewer/camera-fit.test.ts`
- Create: `src/viewer/orientation-gizmo.test.ts`
- Create: `src/viewer/control-mode.test.ts`

### Task 1: 初始化工程与测试环境

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `index.html`

- [ ] **Step 1: 写入基础工程配置**

```json
{
  "name": "stl-web-viewer",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

```gitignore
node_modules/
dist/
.superpowers/
coverage/
```

- [ ] **Step 2: 安装依赖**

Run: `npm install three`

Expected: install succeeds with exit code `0`

Run: `npm install -D typescript vite vitest jsdom @types/three`

Expected: install succeeds with exit code `0`

- [ ] **Step 3: 写入 TypeScript 与 Vite 配置**

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: 验证空测试基线**

Run: `npm test`

Expected: exits `0`, reports no failed tests

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts .gitignore index.html
git commit -m "chore: scaffold STL viewer project"
```

### Task 2: 用 TDD 实现相机 framing 数学工具

**Files:**
- Create: `src/viewer/camera-fit.test.ts`
- Create: `src/viewer/camera-fit.ts`

- [ ] **Step 1: 写失败测试，锁定 framing 行为**

```ts
import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { fitCameraToBounds } from './camera-fit';

describe('fitCameraToBounds', () => {
  it('returns center and positive distance for a non-empty bounds', () => {
    const bounds = new Box3(new Vector3(-5, -2, -1), new Vector3(5, 2, 1));

    const result = fitCameraToBounds(bounds, 50, 1.5);

    expect(result.center.toArray()).toEqual([0, 0, 0]);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.near).toBeGreaterThan(0);
    expect(result.far).toBeGreaterThan(result.near);
  });

  it('falls back to a safe default distance for a degenerate bounds', () => {
    const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(0, 0, 0));

    const result = fitCameraToBounds(bounds, 50, 1.25);

    expect(result.center.toArray()).toEqual([0, 0, 0]);
    expect(result.distance).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/viewer/camera-fit.test.ts`

Expected: FAIL because `./camera-fit` or `fitCameraToBounds` does not exist

- [ ] **Step 3: 写最小实现**

```ts
import { Box3, Vector3 } from 'three';

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
  const fovRadians = (fovDegrees * Math.PI) / 180;
  const distance = Math.max(radius / Math.sin(fovRadians * 0.5), 1) * padding;

  return {
    center,
    distance,
    near: Math.max(distance / 100, 0.01),
    far: Math.max(distance * 10, 10),
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- src/viewer/camera-fit.test.ts`

Expected: PASS, `2` tests passed

- [ ] **Step 5: Commit**

```bash
git add src/viewer/camera-fit.ts src/viewer/camera-fit.test.ts
git commit -m "test: add camera fit utility"
```

### Task 3: 用 TDD 实现交互模式映射与朝向映射

**Files:**
- Create: `src/viewer/control-mode.test.ts`
- Create: `src/viewer/control-mode.ts`
- Create: `src/viewer/orientation-gizmo.test.ts`
- Create: `src/viewer/orientation-gizmo.ts`

- [ ] **Step 1: 写失败测试，定义模式映射**

```ts
import { describe, expect, it } from 'vitest';
import { MOUSE } from 'three';
import { getMouseBindings } from './control-mode';

describe('getMouseBindings', () => {
  it('maps rotate mode left button to rotate', () => {
    expect(getMouseBindings('rotate').LEFT).toBe(MOUSE.ROTATE);
  });

  it('maps pan mode left button to pan', () => {
    expect(getMouseBindings('pan').LEFT).toBe(MOUSE.PAN);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { getOrientationDirection } from './orientation-gizmo';

describe('getOrientationDirection', () => {
  it('returns unit vectors for standard axes', () => {
    expect(getOrientationDirection('+X')).toEqual(new Vector3(1, 0, 0));
    expect(getOrientationDirection('-Y')).toEqual(new Vector3(0, -1, 0));
    expect(getOrientationDirection('+Z')).toEqual(new Vector3(0, 0, 1));
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/viewer/control-mode.test.ts src/viewer/orientation-gizmo.test.ts`

Expected: FAIL because helper modules do not exist yet

- [ ] **Step 3: 写最小实现**

```ts
// src/viewer/control-mode.ts
import { MOUSE } from 'three';

export type ControlMode = 'rotate' | 'pan';

export function getMouseBindings(mode: ControlMode) {
  return {
    LEFT: mode === 'rotate' ? MOUSE.ROTATE : MOUSE.PAN,
    MIDDLE: MOUSE.PAN,
    RIGHT: null,
  };
}
```

```ts
// src/viewer/orientation-gizmo.ts
import { Vector3 } from 'three';

export const ORIENTATION_KEYS = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const;
export type OrientationKey = (typeof ORIENTATION_KEYS)[number];

export function getOrientationDirection(key: OrientationKey): Vector3 {
  switch (key) {
    case '+X': return new Vector3(1, 0, 0);
    case '-X': return new Vector3(-1, 0, 0);
    case '+Y': return new Vector3(0, 1, 0);
    case '-Y': return new Vector3(0, -1, 0);
    case '+Z': return new Vector3(0, 0, 1);
    case '-Z': return new Vector3(0, 0, -1);
  }
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- src/viewer/control-mode.test.ts src/viewer/orientation-gizmo.test.ts`

Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add src/viewer/control-mode.ts src/viewer/control-mode.test.ts src/viewer/orientation-gizmo.ts src/viewer/orientation-gizmo.test.ts
git commit -m "test: add viewer interaction helpers"
```

### Task 4: 搭建应用入口、文件导入 UI 与空状态

**Files:**
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src/app/ViewerApp.ts`
- Create: `src/ui/FileDropzone.ts`

- [ ] **Step 1: 先写一个 DOM 层测试，验证空状态和模式按钮默认值**

```ts
import { describe, expect, it } from 'vitest';
import { ViewerApp } from './ViewerApp';

describe('ViewerApp', () => {
  it('renders empty state and rotate mode by default', () => {
    const root = document.createElement('div');
    new ViewerApp(root);

    expect(root.textContent).toContain('拖拽');
    expect(root.querySelector('[data-mode=\"rotate\"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/app/ViewerApp.test.ts`

Expected: FAIL because app module does not exist yet

- [ ] **Step 3: 写最小 DOM 实现**

```ts
export class ViewerApp {
  constructor(private root: HTMLElement) {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div>
            <h1>STL Web 预览器</h1>
            <p>拖拽本地 .stl 文件或点击选择文件</p>
          </div>
          <button type="button" data-pick-file>选择文件</button>
        </header>
        <main class="viewer-layout">
          <section class="viewport-panel">
            <div class="viewport-empty">拖拽 STL 文件到这里开始预览</div>
          </section>
        </main>
        <footer class="toolbar">
          <button data-mode="rotate" aria-pressed="true">旋转</button>
          <button data-mode="pan" aria-pressed="false">平移</button>
          <button data-reset-view>重置视角</button>
        </footer>
      </div>
    `;
  }
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- src/app/ViewerApp.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/styles.css src/app/ViewerApp.ts src/app/ViewerApp.test.ts src/ui/FileDropzone.ts
git commit -m "feat: add viewer shell UI"
```

### Task 5: 接入 Three.js 视口与 STL 加载

**Files:**
- Modify: `src/app/ViewerApp.ts`
- Modify: `src/ui/FileDropzone.ts`
- Create: `src/viewer/StlViewport.ts`

- [ ] **Step 1: 写失败测试，锁定文件类型校验**

```ts
import { describe, expect, it } from 'vitest';
import { isStlFile } from '../ui/FileDropzone';

describe('isStlFile', () => {
  it('accepts .stl files case-insensitively', () => {
    expect(isStlFile(new File(['solid'], 'model.STL'))).toBe(true);
  });

  it('rejects non-stl files', () => {
    expect(isStlFile(new File(['{}'], 'model.json'))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/ui/FileDropzone.test.ts`

Expected: FAIL because helper does not exist yet

- [ ] **Step 3: 写最小实现并接入视口类**

```ts
export function isStlFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.stl');
}
```

`StlViewport` 需要至少提供：

```ts
export class StlViewport {
  mount(container: HTMLElement): void;
  loadFile(file: File): Promise<void>;
  setMode(mode: ControlMode): void;
  resetView(): void;
  orientTo(key: OrientationKey): void;
}
```

- [ ] **Step 4: 运行目标测试并构建**

Run: `npm test -- src/ui/FileDropzone.test.ts`

Expected: PASS

Run: `npm run build`

Expected: build succeeds with exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/ViewerApp.ts src/ui/FileDropzone.ts src/ui/FileDropzone.test.ts src/viewer/StlViewport.ts
git commit -m "feat: add STL loading viewport"
```

### Task 6: 接入朝向控件、模式切换、重置视角与最终样式

**Files:**
- Modify: `src/app/ViewerApp.ts`
- Modify: `src/styles.css`
- Modify: `src/viewer/StlViewport.ts`
- Modify: `src/viewer/orientation-gizmo.ts`

- [ ] **Step 1: 写失败测试，锁定朝向控件 DOM 输出**

```ts
import { describe, expect, it } from 'vitest';
import { renderOrientationGizmo } from './orientation-gizmo';

describe('renderOrientationGizmo', () => {
  it('renders six axis buttons', () => {
    const root = document.createElement('div');
    renderOrientationGizmo(root, '+X', () => {});

    expect(root.querySelectorAll('[data-orientation]').length).toBe(6);
    expect(root.textContent).toContain('+X');
    expect(root.textContent).toContain('-Z');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/viewer/orientation-gizmo.test.ts`

Expected: FAIL because render helper is missing

- [ ] **Step 3: 写最小实现并把事件接到 `ViewerApp` / `StlViewport`**

```ts
export function renderOrientationGizmo(
  root: HTMLElement,
  active: OrientationKey | null,
  onSelect: (key: OrientationKey) => void,
): void {
  root.innerHTML = ORIENTATION_KEYS.map((key) => `
    <button
      type="button"
      data-orientation="${key}"
      aria-pressed="${String(active === key)}"
    >${key}</button>
  `).join('');
}
```

- [ ] **Step 4: 运行完整验证**

Run: `npm test`

Expected: all tests pass

Run: `npm run build`

Expected: build succeeds with exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/ViewerApp.ts src/styles.css src/viewer/StlViewport.ts src/viewer/orientation-gizmo.ts
git commit -m "feat: finish STL viewer interactions"
```

## 自检

- Spec coverage: 计划覆盖了脚手架、文件导入、Three.js 视口、滚轮缩放、旋转/平移切换、自动 framing、重置视角、XYZ 朝向控件、样式与测试。
- Placeholder scan: 没有保留 `TODO` 或“稍后实现”这类占位描述。
- Type consistency: `ControlMode` 使用 `rotate | pan`，朝向 key 使用 `+X/-X/+Y/-Y/+Z/-Z`，与 spec 保持一致。
