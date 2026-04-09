# STL Web Viewer Design

## Overview

This document defines the first implementation of a lightweight STL file viewer for the web, built with TypeScript and Three.js.

The viewer is intended to provide a focused local preview workflow rather than a full CAD tool. Users load a local `.stl` file by drag-and-drop or file selection, inspect it in a Three.js viewport, and quickly switch among standard orientations.

## Goals

- Build a web-based STL viewer that runs locally in the browser.
- Use `TypeScript + Three.js` with a lightweight project structure.
- Support local STL loading through file selection and drag-and-drop.
- Support mouse wheel zoom.
- Support left mouse drag interaction, with a UI toggle between:
  - orbiting around the model
  - panning the whole view
- Automatically center the model and fit the initial camera framing after load.
- Provide a bottom control bar with:
  - `Rotate`
  - `Pan`
  - `Reset View`
- Provide a bottom-right orientation widget with clickable standard directions based on XYZ axes.

## Non-Goals

- Editing STL geometry
- Material presets, lighting presets, or theme switching
- Measurement tools
- Section views
- Orthographic camera mode
- Persistent file history
- Server-side upload or storage
- Full end-to-end browser automation coverage in the first iteration

## Chosen Approach

The project will use:

- `Vite` for local development and bundling
- `TypeScript` for application code
- `Three.js` for rendering
- `STLLoader` from Three.js examples for parsing STL files
- `OrbitControls` from Three.js examples for camera interaction

This approach is preferred because it keeps the repo lightweight, avoids unnecessary framework overhead, and still gives stable primitives for STL loading, camera control, and future extension.

## User Experience

The viewer is a single-page application with four visible zones:

1. Header / import area
2. Main 3D viewport
3. Bottom interaction controls
4. Bottom-right orientation widget

### Primary flow

1. User opens the app.
2. Empty state prompts the user to drag a local `.stl` file into the page or choose a file from disk.
3. The selected file is parsed and rendered.
4. The viewer automatically frames the model.
5. The user inspects the model with wheel zoom and left-drag interaction.
6. The user can switch between rotate mode and pan mode from the bottom controls.
7. The user can click the orientation widget to jump to standard axis-aligned views.

## Layout

### Header / import area

The top area contains:

- application title
- drag-and-drop hint
- file picker button
- loaded file metadata summary when a file is active

The metadata summary only needs to show:

- file name
- file size

### Main viewport

The viewport occupies the majority of the page.

It includes:

- WebGL canvas
- empty state message before a file is loaded
- loading or error message overlay if parsing fails

The model should visually remain the focus. Supporting UI should stay compact and not cover the central viewing area.

### Bottom controls

The bottom control bar contains exactly three actions:

- `Rotate`
- `Pan`
- `Reset View`

`Rotate` is selected by default.

### Orientation widget

The bottom-right widget uses a lightweight view-cube inspired control with visible axis labels.

The clickable directions are:

- `+X`
- `-X`
- `+Y`
- `-Y`
- `+Z`
- `-Z`

The widget should look spatial rather than text-only. The implementation does not need a full 3D mini-scene; a compact HTML/CSS overlay with clear axis affordances is sufficient for the first version if it remains intuitive and clickable.

## Rendering Architecture

The application is split into a small set of focused modules.

### `ViewerApp`

Responsibilities:

- holds app-level state
- coordinates file loading
- coordinates interaction mode
- passes orientation commands into the viewport
- renders surrounding UI

App-level state includes:

- current file metadata
- current interaction mode: `rotate | pan`
- current load status: `idle | loading | ready | error`
- current orientation highlight

### `FileDropzone`

Responsibilities:

- receives drag-and-drop input
- triggers the file picker
- validates the selected file type at a basic level
- returns the chosen `File` object to `ViewerApp`

### `StlViewport`

Responsibilities:

- creates the Three.js renderer, scene, camera, and lights
- owns `OrbitControls`
- loads STL geometry
- updates the scene when a new file is selected
- computes bounding box, model center, and framing distance
- handles resize updates
- animates camera movement for orientation jumps and reset view

### `OrientationGizmo`

Responsibilities:

- renders the bottom-right orientation control
- exposes click events for standard directions
- displays the currently active direction based on the current camera orientation

## Scene Setup

The Three.js scene uses:

- `PerspectiveCamera`
- `WebGLRenderer`
- ambient light
- directional light
- a neutral background suitable for geometry inspection

The viewer should render the STL with a simple shaded material, such as `MeshStandardMaterial` or `MeshPhongMaterial`, using a neutral surface color that keeps shape details readable.

The first version does not include wireframe mode.

## Camera and Control Behavior

### Orbit control baseline

`OrbitControls` is used as the camera interaction controller.

Default behavior:

- wheel: zoom
- left mouse drag: orbit the model
- middle mouse drag: pan
- right mouse drag: disabled

### Rotate / Pan mode switch

The bottom control bar changes the behavior of the left mouse button:

- in `Rotate` mode, left drag maps to `ROTATE`
- in `Pan` mode, left drag maps to `PAN`

Wheel zoom remains enabled in both modes.

Switching mode does not reset the current camera pose.

### Reset View

`Reset View` returns the camera to the viewer's default framed isometric orientation, not to a pure front, side, or top axis.

The reset pose is defined as:

- target = current model center
- camera direction = normalized diagonal vector
- distance = framing distance derived from current bounds

For the first version, the default reset direction is the normalized vector `(1, 1, 1)`.

## STL Loading and Framing

When a file is selected:

1. Parse the file using `STLLoader`.
2. Build a mesh with the chosen preview material.
3. Compute the geometry bounding box.
4. Derive:
   - center
   - size
   - bounding sphere or max extent
5. Update the controls target to the model center.
6. Move the camera to a fitted isometric position.
7. Update near/far planes as needed so the model remains reliably visible.

The implementation should preserve the generic STL data and avoid destructive modification of source file contents. If geometry centering is needed internally, it should only affect the in-memory preview object.

### Framing rule

The camera fitting logic should ensure:

- the whole model is visible after load
- extra margin remains around the object
- extremely small or large models still remain visible

The fitting helper should be implemented as a testable pure utility where practical.

## Orientation Widget Behavior

The widget maps each clickable direction to a camera position on the corresponding axis relative to the current model center.

Examples:

- `+X`: camera positioned on positive X axis, looking at center
- `-X`: camera positioned on negative X axis, looking at center
- `+Y`: camera positioned above the model
- `-Y`: camera positioned below the model
- `+Z`: camera positioned on positive Z axis
- `-Z`: camera positioned on negative Z axis

Behavior rules:

- clicking a direction animates the camera to that orientation
- the controls target remains fixed on the model center
- the current interaction mode remains unchanged
- after the animation completes, `OrbitControls` remains active from the new pose
- the widget highlight updates when the user manually rotates close to a standard orientation

Because STL files generally do not encode semantic front/back meaning, the UI will present axis labels only, not words like "front" or "left side" that imply model semantics.

## Error Handling

The first version handles these cases explicitly:

- non-STL file selected
- empty or unreadable file
- STL parsing failure
- viewport resize

Expected behavior:

- invalid file type: show a compact inline error message
- parse failure: show a readable failure message and keep the app usable for retry
- no loaded file: show empty state overlay instead of a blank unexplained canvas
- resize: update renderer size and camera aspect ratio immediately

## Testing Strategy

The first version uses a mixed strategy of targeted automated tests plus manual verification.

### Automated tests

Use `Vitest` for pure logic and mapping helpers.

Test targets:

- camera framing helper
- orientation key to camera direction mapping
- rotate/pan mode to `OrbitControls` mouse-button mapping

The intent is to lock down the math and interaction rules that are easy to regress.

### Manual verification

Manual checks must cover:

- choosing a local STL file
- dragging and dropping a local STL file
- wheel zoom
- left-drag orbit in rotate mode
- left-drag pan in pan mode
- reset view returns to the framed isometric pose
- model auto-centers and fits after load
- clicking each orientation direction jumps to the expected axis view
- viewport remains correct after window resize

## Initial File Structure

The first implementation should use a small file layout:

```text
src/
  main.ts
  styles.css
  app/
    ViewerApp.ts
  ui/
    FileDropzone.ts
  viewer/
    StlViewport.ts
    orientation-gizmo.ts
    camera-fit.ts
```

This layout keeps application orchestration, UI, viewer internals, and math helpers separated without introducing unnecessary layers.

## Implementation Notes

- The first version should prefer a plain TypeScript architecture over React or any higher-level rendering framework.
- The orientation widget can be implemented as DOM overlay UI mounted above the canvas.
- Camera movement for reset and orientation jumps should be animated with a short interpolation rather than an abrupt snap.
- The preview should use neutral defaults and avoid decorative UI that competes with the model.

## Repo Hygiene

The visual brainstorming companion stores generated mockup files under `.superpowers/brainstorm/`. That path should be added to `.gitignore` before regular development continues, but it is not part of this spec commit.
