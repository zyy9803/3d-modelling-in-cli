# Orientation Gizmo Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden static XYZ buttons with a post-load orientation gizmo that stays pinned to the viewport corner, rotates with the active camera, and snaps the main view to any of the six axis-aligned faces.

**Architecture:** Keep the existing `StlViewport` camera/orbit logic as the single source of truth. Rebuild the right-bottom control as a DOM/CSS 3D cube with six clickable faces and three axis markers, and drive its transform from the main camera quaternion via pure helper functions. The app layer only decides whether the gizmo is visible and forwards click events back to `StlViewport.orientTo()`.

**Tech Stack:** TypeScript, Three.js, DOM/CSS 3D transforms, Vitest

---

## File Structure

- Modify: `src/viewer/orientation-gizmo.ts`
  Rebuilds the gizmo renderer around a DOM/CSS 3D cube and adds pure helpers for camera-to-CSS transform generation.
- Modify: `src/viewer/orientation-gizmo.test.ts`
  Covers transform helpers, anchor preservation, and six-face rendering.
- Modify: `src/viewer/StlViewport.ts`
  Emits gizmo visibility and transform state from the active camera, and keeps the click-to-snap path unchanged.
- Modify: `src/app/ViewerApp.ts`
  Tracks whether a model is loaded and only renders the gizmo after successful load.
- Modify: `src/app/ViewerApp.test.ts`
  Updates expectations for hidden-before-load gizmo behavior.
- Modify: `src/styles.css`
  Adds the cube, faces, axes, and anchor styling for the new control.

### Task 1: Define the DOM gizmo contract with tests

**Files:**
- Modify: `src/viewer/orientation-gizmo.test.ts`
- Modify: `src/app/ViewerApp.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  buildOrientationTransform,
  getClosestOrientationKey,
  getOrientationDirection,
  renderOrientationGizmo,
} from './orientation-gizmo';

describe('orientation gizmo DOM renderer', () => {
  it('keeps the anchor class and renders six clickable faces when visible', () => {
    const root = document.createElement('div');
    root.className = 'orientation-anchor';

    renderOrientationGizmo(
      root,
      {
        visible: true,
        activeKey: '+X',
        cubeTransform: 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)',
      },
      () => undefined,
    );

    expect(root.classList.contains('orientation-anchor')).toBe(true);
    expect(root.querySelectorAll('[data-orientation-face]').length).toBe(6);
    expect(root.querySelector('.orientation-gizmo__cube')?.getAttribute('style')).toContain('matrix3d');
  });

  it('renders nothing while hidden', () => {
    const root = document.createElement('div');

    renderOrientationGizmo(
      root,
      {
        visible: false,
        activeKey: null,
        cubeTransform: '',
      },
      () => undefined,
    );

    expect(root.querySelector('.orientation-gizmo')).toBeNull();
  });

  it('maps camera rotation into a CSS matrix transform', () => {
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const transform = buildOrientationTransform(quaternion);

    expect(transform.startsWith('matrix3d(')).toBe(true);
    expect(transform).not.toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp orientation gizmo', () => {
  it('does not render orientation faces before a model is loaded', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelectorAll('[data-orientation-face]').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/viewer/orientation-gizmo.test.ts src/app/ViewerApp.test.ts`

Expected: FAIL because the new helper/state contract is not implemented yet

- [ ] **Step 3: Implement the minimal renderer contract**

```ts
export type OrientationGizmoState = {
  visible: boolean;
  activeKey: OrientationKey | null;
  cubeTransform: string;
};
```

`renderOrientationGizmo()` should:
- keep the outer anchor untouched
- clear and rebuild the inner gizmo node only when `visible === true`
- render one `.orientation-gizmo__cube` with six face buttons and three axis labels

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/viewer/orientation-gizmo.test.ts src/app/ViewerApp.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/viewer/orientation-gizmo.ts src/viewer/orientation-gizmo.test.ts src/app/ViewerApp.test.ts
git commit -m "test: define rotating orientation gizmo"
```

### Task 2: Synchronize the gizmo with the viewport camera

**Files:**
- Modify: `src/viewer/StlViewport.ts`
- Modify: `src/app/ViewerApp.ts`

- [ ] **Step 1: Write the failing integration expectation**

Extend the existing `ViewerApp` test with:

```ts
it('keeps the orientation anchor mounted for the viewport overlay', () => {
  const root = document.createElement('div');

  new ViewerApp(root);

  expect(root.querySelector('[data-orientation-root]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/app/ViewerApp.test.ts`

Expected: FAIL if the app no longer satisfies the new gizmo state contract

- [ ] **Step 3: Implement camera-to-gizmo state flow**

`StlViewport` should emit:

```ts
type OrientationGizmoState = {
  visible: boolean;
  activeKey: OrientationKey | null;
  cubeTransform: string;
};
```

Implementation notes:
- derive `activeKey` from the existing camera direction logic
- derive `cubeTransform` from `camera.quaternion.clone().invert()`
- emit `visible: true` only after a mesh has been loaded and framed
- emit `visible: false` before load and after mesh disposal

`ViewerApp` should:
- store the latest gizmo state
- render the gizmo after every state change
- keep the click handler wired to `viewport.orientTo(key)`

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/app/ViewerApp.test.ts src/viewer/orientation-gizmo.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/viewer/StlViewport.ts src/app/ViewerApp.ts src/app/ViewerApp.test.ts
git commit -m "feat: sync orientation gizmo with viewport camera"
```

### Task 3: Style the cube and verify the full build

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add the cube/face/axis styles**

Add styles for:
- `.orientation-gizmo`
- `.orientation-gizmo__scene`
- `.orientation-gizmo__cube`
- `.orientation-gizmo__face`
- `.orientation-gizmo__axis`

The style should:
- keep the anchor in the viewport corner
- use `transform-style: preserve-3d`
- give each face a fixed `translateZ()` placement
- hide backfaces
- keep the cube readable on dark background

- [ ] **Step 2: Run full verification**

Run: `npm test`

Expected: all tests pass

Run: `npm run build`

Expected: build succeeds with exit code `0`

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: add 3d orientation gizmo"
```

## Self-Review

- Spec coverage: covers post-load visibility, right-bottom positioning, camera-synced rotation, and six-face snapping only
- Placeholder scan: no `TODO`, `TBD`, or underspecified test steps remain
- Type consistency: one shared `OrientationGizmoState` contract drives both viewport emission and DOM rendering
