# STL 选择上下文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 STL Web 预览器增加当前视角记录、单击/框选三角面选择、连通组件摘要和 `context.json` 导出能力。

**Architecture:** 以当前 `StlViewport` 为整合入口，新增纯逻辑模块处理三角面邻接、选择状态和上下文导出。交互层只做点击、框选和高亮，不做面组或高级特征推断；导出内容围绕 `view + selection + components` 组织。

**Tech Stack:** TypeScript, Three.js, Vitest, DOM overlay

---

## 文件结构

- Create: `src/viewer/mesh-topology.ts`
- Create: `src/viewer/mesh-topology.test.ts`
- Create: `src/viewer/selection-manager.ts`
- Create: `src/viewer/selection-manager.test.ts`
- Create: `src/viewer/selection-context.ts`
- Create: `src/viewer/selection-context.test.ts`
- Modify: `src/viewer/StlViewport.ts`
- Modify: `src/app/ViewerApp.ts`
- Modify: `src/app/ViewerApp.test.ts`
- Modify: `src/styles.css`

### Task 1: 以 TDD 建立三角面邻接与选择状态基础

**Files:**
- Create: `src/viewer/mesh-topology.ts`
- Create: `src/viewer/mesh-topology.test.ts`
- Create: `src/viewer/selection-manager.ts`
- Create: `src/viewer/selection-manager.test.ts`

- [ ] **Step 1: 写失败测试，定义三角面邻接与组件拆分**

```ts
import { describe, expect, it } from 'vitest';

import { buildTriangleAdjacency, splitSelectionComponents } from './mesh-topology';

describe('buildTriangleAdjacency', () => {
  it('connects triangles that share an edge', () => {
    const vertices = [
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ];

    const adjacency = buildTriangleAdjacency(vertices);

    expect(adjacency.get(0)).toEqual([1]);
    expect(adjacency.get(1)).toEqual([0]);
  });
});

describe('splitSelectionComponents', () => {
  it('splits selected triangles into connected components', () => {
    const adjacency = new Map([
      [0, [1]],
      [1, [0]],
      [2, []],
    ]);

    expect(splitSelectionComponents(new Set([0, 1, 2]), adjacency)).toEqual([
      [0, 1],
      [2],
    ]);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import {
  addTriangles,
  clearSelection,
  removeTriangles,
  replaceSelection,
} from './selection-manager';

describe('selection-manager', () => {
  it('replaces the current selection', () => {
    expect(replaceSelection(new Set([1, 2]), [8, 9])).toEqual(new Set([8, 9]));
  });

  it('adds triangles to the current selection', () => {
    expect(addTriangles(new Set([1, 2]), [2, 3])).toEqual(new Set([1, 2, 3]));
  });

  it('removes triangles from the current selection', () => {
    expect(removeTriangles(new Set([1, 2, 3]), [2])).toEqual(new Set([1, 3]));
  });

  it('clears the current selection', () => {
    expect(clearSelection()).toEqual(new Set());
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/viewer/mesh-topology.test.ts src/viewer/selection-manager.test.ts`

Expected: FAIL because the new modules do not exist yet

- [ ] **Step 3: 写最小实现**

```ts
// src/viewer/mesh-topology.ts
export function buildTriangleAdjacency(positionArray: ArrayLike<number>): Map<number, number[]> {
  // Each triangle is three sequential vertices in the non-indexed STL geometry.
  // Build normalized edges and connect triangles that share one edge.
}

export function splitSelectionComponents(
  selected: Set<number>,
  adjacency: Map<number, number[]>,
): number[][] {
  // DFS/BFS on selected triangle ids only.
}
```

```ts
// src/viewer/selection-manager.ts
export function replaceSelection(_: Set<number>, next: Iterable<number>): Set<number> {
  return new Set(next);
}

export function addTriangles(current: Set<number>, next: Iterable<number>): Set<number> {
  return new Set([...current, ...next]);
}

export function removeTriangles(current: Set<number>, next: Iterable<number>): Set<number> {
  const result = new Set(current);
  for (const triangleId of next) result.delete(triangleId);
  return result;
}

export function clearSelection(): Set<number> {
  return new Set();
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- src/viewer/mesh-topology.test.ts src/viewer/selection-manager.test.ts`

Expected: PASS, all tests green

- [ ] **Step 5: Commit**

```bash
git add src/viewer/mesh-topology.ts src/viewer/mesh-topology.test.ts src/viewer/selection-manager.ts src/viewer/selection-manager.test.ts
git commit -m "test: add selection topology helpers"
```

### Task 2: 以 TDD 定义上下文导出 JSON

**Files:**
- Create: `src/viewer/selection-context.ts`
- Create: `src/viewer/selection-context.test.ts`

- [ ] **Step 1: 写失败测试，定义导出格式**

```ts
import { describe, expect, it } from 'vitest';

import { createSelectionContext } from './selection-context';

describe('createSelectionContext', () => {
  it('builds the exported context payload', () => {
    const context = createSelectionContext({
      fileName: 'part.stl',
      view: {
        cameraPosition: [1, 2, 3],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+X',
        viewportSize: [1280, 720],
      },
      selection: {
        mode: 'click',
        triangleIds: [7],
      },
      components: [
        {
          id: 'sel_0',
          triangleIds: [7],
          centroid: [0, 0, 0],
          bboxMin: [-1, -1, -1],
          bboxMax: [1, 1, 1],
          avgNormal: [0, 0, 1],
          area: 2,
        },
      ],
    });

    expect(context.model.file).toBe('part.stl');
    expect(context.selection.triangleIds).toEqual([7]);
    expect(context.components).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/viewer/selection-context.test.ts`

Expected: FAIL because the context builder does not exist yet

- [ ] **Step 3: 写最小实现**

```ts
// src/viewer/selection-context.ts
export function createSelectionContext(input: {
  fileName: string;
  view: ViewExport;
  selection: SelectionExport;
  components: SelectionComponentExport[];
}) {
  return {
    version: 1,
    model: { file: input.fileName },
    view: input.view,
    selection: input.selection,
    components: input.components,
  };
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test -- src/viewer/selection-context.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/viewer/selection-context.ts src/viewer/selection-context.test.ts
git commit -m "test: add selection context export builder"
```

### Task 3: 集成视口点击、框选、高亮与导出

**Files:**
- Modify: `src/viewer/StlViewport.ts`
- Modify: `src/app/ViewerApp.ts`
- Modify: `src/app/ViewerApp.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: 写失败测试，定义阶段二 UI**

```ts
import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp phase 2', () => {
  it('renders export and clear selection actions', () => {
    const root = document.createElement('div');
    new ViewerApp(root);

    expect(root.querySelector('[data-export-context]')?.textContent).toBe('导出上下文');
    expect(root.querySelector('[data-clear-selection]')?.textContent).toBe('清空选择');
  });

  it('renders the selection status bar', () => {
    const root = document.createElement('div');
    new ViewerApp(root);

    expect(root.querySelector('[data-selection-status]')?.textContent).toContain('已选');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/app/ViewerApp.test.ts`

Expected: FAIL because the new buttons and status bar are not rendered yet

- [ ] **Step 3: 写最小实现并接入视口**

```ts
// StlViewport responsibilities added in this task:
// - cache triangle records after STL load
// - build adjacency from the loaded geometry
// - handle raycast click -> triangleId
// - handle Shift+drag box selection with a DOM overlay rectangle
// - track selected triangle ids
// - compute selection components
// - expose getSelectionSummary() and exportContext()
```

```ts
// ViewerApp responsibilities added in this task:
// - render [data-export-context], [data-clear-selection], [data-selection-status]
// - call viewport.clearSelection() on clear
// - call viewport.exportContext() on export
// - reflect current selected triangle count + component count in the status bar
```

- [ ] **Step 4: 运行 focused verification**

Run: `npm test -- src/app/ViewerApp.test.ts`

Expected: PASS

Run: `npm test`

Expected: all test files pass

- [ ] **Step 5: Commit**

```bash
git add src/viewer/StlViewport.ts src/app/ViewerApp.ts src/app/ViewerApp.test.ts src/styles.css
git commit -m "feat: add triangle selection workflow"
```

### Task 4: 验证导出与浏览器行为

**Files:**
- Modify: `src/viewer/StlViewport.ts`
- Modify: `src/app/ViewerApp.ts`

- [ ] **Step 1: 补齐导出下载行为**

```ts
// Use Blob + URL.createObjectURL + temporary anchor download.
// File name format: context-YYYY-MM-DDTHH-mm-ss.json
```

- [ ] **Step 2: 运行完整验证**

Run: `npm test`

Expected: all tests pass

Run: `npm run build`

Expected: build succeeds with exit code `0`

- [ ] **Step 3: 手工验证**

Run: `npm run dev -- --host 127.0.0.1 --port 4173`

Verify manually:
- click one triangle and observe highlight
- hold `Shift` and drag a box to select visible triangles
- use `Ctrl/Cmd` to add and `Alt` to subtract
- press `Esc` to clear
- click `导出上下文` and inspect the downloaded JSON

- [ ] **Step 4: Commit**

```bash
git add src/viewer/StlViewport.ts src/app/ViewerApp.ts
git commit -m "feat: export STL selection context"
```

## 自检

- Spec coverage: 计划覆盖了视角记录、单击/框选选择、追加/减选/清空、连通组件摘要、`context.json` 导出和 UI 入口。
- Placeholder scan: 没有保留 `TODO`、`TBD` 或“后续再实现”式步骤。
- Type consistency: 选择基础对象统一为 `triangleId`，导出对象统一使用 `view / selection / components`。
