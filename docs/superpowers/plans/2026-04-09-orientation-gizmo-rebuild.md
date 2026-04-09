# Orientation Gizmo Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the right-bottom orientation gizmo as a real Three.js overlay so XYZ axes, six coordinate faces, rotation syncing, and face clicks all use one consistent 3D coordinate system.

**Architecture:** Keep the main STL viewport renderer unchanged, but add a dedicated mini renderer/scene/camera for the gizmo mounted inside the existing orientation root. Drive the gizmo camera from the main camera direction, render six labeled face planes plus XYZ axes, and raycast the gizmo scene for click-to-snap. Keep the gizmo hidden until a model is loaded.

**Tech Stack:** TypeScript, Three.js, Vitest

---

## File Structure

- Modify: `src/viewer/orientation-gizmo.ts`
  Add pure face/axis configs that define the six faces and three positive axes in world coordinates.
- Create: `src/viewer/orientation-gizmo-overlay.ts`
  Encapsulate the mini Three.js renderer, scene, camera, face meshes, axes, sync method, visibility, and click handling.
- Create: `src/viewer/orientation-gizmo-overlay.test.ts`
  Test overlay-independent helpers and config assumptions.
- Modify: `src/viewer/StlViewport.ts`
  Mount and sync the overlay, and keep it hidden until STL load succeeds.
- Modify: `src/app/ViewerApp.ts`
  Pass the orientation root down to the viewport; stop rendering the old DOM button gizmo in app code.
- Modify: `src/app/ViewerApp.test.ts`
  Keep coverage for hidden-before-load anchor presence.
- Modify: `src/styles.css`
  Style the overlay host only; the gizmo visuals come from WebGL instead of DOM/CSS 3D.

## Self-Review

- Scope stays limited to 6 faces + XYZ axes + post-load visibility + click-to-snap
- No attempt to add corner/edge clicks
- No Playwright dependency in verification
