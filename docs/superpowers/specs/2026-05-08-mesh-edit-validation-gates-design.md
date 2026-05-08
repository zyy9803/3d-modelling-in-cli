# Mesh Edit Validation Gates Design

## Overview

This design upgrades the STL edit pipeline from "Codex drafts a Python script and the server accepts any parseable STL" to "Codex drafts an edit plan and script, while the platform validates execution and geometry before delivery."

The goal is to solve four systemic problems:

- Generated mesh results are unstable.
- Drafted `edit.py` files often fail at execution time.
- Local requests can unintentionally modify unrelated regions.
- Generated STL files can contain open boundaries or broken topology.

The key product rule is:

> Codex may propose edits, but the platform decides whether a generated STL is safe to deliver.

## Goals

- Require every mesh edit draft to include both `edit.py` and a structured `edit_plan.json`.
- Validate `edit.py` before the user can generate a model.
- Execute model generation through a temporary candidate output first.
- Reject outputs that contain non-closed regions.
- Reject outputs that introduce non-manifold topology.
- Reject local edits that modify protected regions outside the requested scope.
- Report validation failures with enough detail for Codex to revise the draft.
- Keep the original STL and previous model versions unchanged.

## Non-Goals

- Do not replace Codex with a complete local CAD kernel.
- Do not build a full mesh repair library in TypeScript.
- Do not guarantee that every valid user request can be completed automatically.
- Do not silently repair failed outputs after generation if that repair could change user intent.
- Do not support non-STL model formats in this design.

## Recommended Approach

Use a validation-gate pipeline:

1. Codex inspects the active STL and writes `edit_plan.json` plus `edit.py`.
2. The server validates the draft artifacts.
3. If the draft is valid, the UI may show the draft as ready.
4. When the user generates, the server runs `edit.py` into a temporary candidate path.
5. The server validates the candidate STL structurally and geometrically.
6. Only a passing candidate is copied or promoted to the final output model path.
7. Failed candidates stay in the job workspace for debugging, but are not registered as active models.

This keeps Codex flexible while adding hard product boundaries around execution and geometry.

## Job Artifacts

Each edit job workspace should contain:

```text
job_001/
  context.json
  edit_plan.json
  edit.py
  candidate.stl
  validation_report.json
  result.json
```

- `context.json`: server-owned input, paths, selection, view context, and user instruction.
- `edit_plan.json`: Codex-owned structured declaration of intended changes.
- `edit.py`: Codex-owned executable draft script.
- `candidate.stl`: temporary generation output used for validation.
- `validation_report.json`: server-owned validation result and failure diagnostics.
- `result.json`: optional script-authored execution summary.

The final output model path remains server-owned. `edit.py` should write to the path passed by the server, but the server should initially pass the temporary candidate path.

## Edit Plan Contract

`edit_plan.json` is required for every ready draft.

Example:

```json
{
  "version": 1,
  "intent": "Create a recessed groove in the selected circular region.",
  "scopeKind": "local",
  "targetRegion": {
    "source": "selection",
    "triangleIds": [10, 11, 12],
    "bboxMin": [0, 0, 0],
    "bboxMax": [10, 10, 3],
    "expansionMm": 1.0
  },
  "protectedRegions": [
    {
      "reason": "Outside requested edit scope",
      "source": "inverse-target-region"
    }
  ],
  "allowedOperations": ["move_vertices", "add_faces", "delete_faces_in_target"],
  "disallowedOperations": ["full_model_remesh", "full_model_smooth", "full_model_decimate"],
  "expectedEffects": {
    "requiresClosedOutput": true,
    "maxProtectedVertexDisplacementMm": 0.01,
    "maxGlobalBboxDeltaMm": 0.1
  }
}
```

Required fields:

- `version`
- `intent`
- `scopeKind`: `local` or `global`
- `targetRegion`
- `protectedRegions`
- `allowedOperations`
- `disallowedOperations`
- `expectedEffects.requiresClosedOutput`

For local edits, the plan must define a target region and at least one protected region. If Codex cannot define these from the selection and user instruction, it must ask a clarification question instead of producing a ready draft.

## Draft Validation

Draft validation runs after Codex finishes a chat turn and before `draft_state_changed` becomes `ready`.

Checks:

- `edit.py` exists.
- `edit_plan.json` exists.
- `edit_plan.json` parses as JSON.
- Required plan fields are present.
- `edit.py` compiles with `py_compile`.
- `edit.py --help` or a dry-run compatible invocation does not crash if the script exposes CLI help.
- The script can be invoked with the platform's standard argument style.
- The script does not write to the base model path.
- The script does not contain obvious forbidden filesystem operations outside the job/output paths.
- Dependency policy is explicit and consistent with the runtime.

Current code blocks third-party imports during execution. This design recommends replacing the blanket ban with an explicit project policy:

- Allow standard library always.
- Allow project-approved mesh dependencies only if the server can verify they are installed.
- Recommended approved packages: `numpy`, `trimesh`.
- If approved dependencies are unavailable, the draft is not ready and the report should say which dependency is missing.

Rationale: robust STL validation and topology analysis are much more reliable with a mesh library than with ad hoc text or binary parsing.

## Generation Validation

Generation must use a candidate path first:

```text
edit.py --input <baseModelPath> --output <candidatePath> --context <contextPath> --plan <editPlanPath>
```

After script execution, the server validates `candidate.stl`.

Structural checks:

- Candidate file exists and is non-empty.
- Candidate parses as STL.
- Candidate has vertices and faces.
- Candidate contains finite coordinates only.
- Candidate does not overwrite the input STL.

Topology checks:

- `boundary_edges == 0`.
- `nonmanifold_edges == 0`.
- `watertight == true` when the mesh library exposes a reliable watertight check.
- Degenerate face count is zero after tolerance-based cleanup, or below a strict configured threshold.

The non-closed-region rule is a hard gate. If `boundary_edges > 0`, generation fails.

## Geometry Difference Audit

After topology checks, the server compares base and candidate geometry.

Global metrics:

- Vertex count delta.
- Face count delta.
- Bounding box delta.
- Surface area delta.
- Volume delta when watertight volume is available.
- Boundary edge count.
- Non-manifold edge count.

Local edit audit:

- Build a target mask from `edit_plan.json`.
- Build a protected mask from the inverse target region and declared protected regions.
- Compare nearest-neighbor displacement for protected vertices.
- Reject if protected-region displacement exceeds `maxProtectedVertexDisplacementMm`.
- Reject if new or deleted faces appear outside the allowed region.
- Reject if the candidate's global bounding box changes more than the plan allows.

Global edit audit:

- Skip protected-region immutability checks only when `scopeKind` is `global`.
- Still enforce closed output and topology validity.
- Still reject unexpected parse, NaN, or empty mesh results.

This directly addresses the A-region/B-region failure mode: local edits must prove that protected B regions stayed unchanged within tolerance.

## Validation Report

Every validation run writes `validation_report.json`.

Example:

```json
{
  "ok": false,
  "stage": "generation_geometry",
  "errors": [
    {
      "code": "OPEN_BOUNDARY_EDGES",
      "message": "Generated STL has 42 boundary edges. Output must be closed."
    }
  ],
  "metrics": {
    "boundaryEdges": 42,
    "nonmanifoldEdges": 0,
    "watertight": false,
    "protectedMaxDisplacementMm": 0.003
  }
}
```

Failure codes should be stable so the frontend and Codex prompt can react consistently.

Recommended codes:

- `MISSING_EDIT_SCRIPT`
- `MISSING_EDIT_PLAN`
- `INVALID_EDIT_PLAN`
- `PYTHON_SYNTAX_ERROR`
- `SCRIPT_EXECUTION_FAILED`
- `OUTPUT_STL_MISSING`
- `OUTPUT_STL_INVALID`
- `OPEN_BOUNDARY_EDGES`
- `NONMANIFOLD_EDGES`
- `NOT_WATERTIGHT`
- `PROTECTED_REGION_MODIFIED`
- `GLOBAL_BBOX_DRIFT`
- `FORBIDDEN_INPUT_OVERWRITE`
- `UNAPPROVED_DEPENDENCY`

## Prompt Changes

The Codex turn prompt should say:

- Draft turns must produce `edit_plan.json` and `edit.py` when preparing an edit.
- `edit_plan.json` must declare target and protected regions.
- Local edits must preserve geometry outside the declared target region.
- Draft scripts must support the platform invocation arguments.
- Draft scripts must not run during chat turns.
- Outputs must be closed, manifold STL meshes.
- If a closed and scope-preserving result cannot be produced, Codex must ask a clarification or explain the blocker.

The prompt should avoid implying that a good-looking STL is enough. It must explicitly say that server validation is authoritative.

## Server Changes

Add a validation layer between `EditJobService` and `CodexSessionController`.

Suggested modules:

```text
server/modules/jobs/application/EditDraftValidationService.ts
server/modules/jobs/application/EditGenerationValidationService.ts
server/modules/mesh/validation/MeshValidationService.ts
server/modules/mesh/validation/PythonMeshValidator.ts
```

Responsibilities:

- `EditDraftValidationService`: validates `edit_plan.json` and `edit.py`.
- `EditGenerationValidationService`: runs candidate generation and promotes only passing outputs.
- `MeshValidationService`: computes topology and geometry-diff metrics.
- `PythonMeshValidator`: wraps Python mesh validation scripts and normalizes reports.

`CodexSessionController.finalizeActiveDraftJob` should set draft status to `ready` only after draft validation passes.

`CodexSessionController.generateModel` should call generation validation before registering or switching to the output model.

## Frontend Behavior

The frontend should keep the current draft states but display clearer failure messages:

- Draft is not ready because `edit.py` is invalid.
- Draft is not ready because `edit_plan.json` is missing or invalid.
- Generation failed because the output STL is not closed.
- Generation failed because protected regions changed.
- Generation failed because the script crashed.

The UI should not switch models when validation fails.

## Testing Strategy

Unit tests:

- Draft fails when `edit.py` is missing.
- Draft fails when `edit_plan.json` is missing.
- Draft fails when `edit.py` has syntax errors.
- Draft fails when required plan fields are absent.
- Generation fails when no STL is produced.
- Generation fails when candidate STL has boundary edges.
- Generation fails when candidate STL has non-manifold edges.
- Local generation fails when protected vertices move beyond tolerance.
- Passing generation promotes candidate STL to the registered output model.

Fixture tests:

- Use a small closed cube STL as a passing baseline.
- Use a cube with one face removed to test `OPEN_BOUNDARY_EDGES`.
- Use a mesh with duplicated overlapping faces or shared-over-many faces to test `NONMANIFOLD_EDGES`.
- Use a local-edit fixture where only selected top faces move.
- Use a local-edit fixture where an unrelated side face also moves and must be rejected.

Integration tests:

- `submitMessage` produces a draft job, but draft state is not ready until validation passes.
- `generateModel` runs candidate validation and only broadcasts `model_generated` after all gates pass.
- Failed validation broadcasts `model_generation_failed` with the stable error message.

## Migration Plan

Phase 1: Draft gates

- Add `edit_plan.json` to job paths and prompt.
- Add plan schema validation.
- Add Python syntax validation.
- Make draft readiness depend on validation.

Phase 2: Candidate generation gates

- Generate to `candidate.stl`.
- Validate parseability, finite coordinates, closed boundaries, non-manifold edges, and watertightness.
- Promote only passing candidates.

Phase 3: Geometry-diff gates

- Implement target/protected mask interpretation.
- Add protected-region displacement checks.
- Add bbox, area, and volume drift checks.
- Add validation reports to frontend messages.

Phase 4: Codex repair loop

- Feed validation reports back into subsequent Codex turns.
- Ask Codex to revise `edit_plan.json` and `edit.py` based on stable failure codes.
- Keep failed candidate artifacts available for debugging.

## Acceptance Criteria

- A generated model is never delivered if it has open boundary edges.
- A generated model is never delivered if it has non-manifold edges.
- A ready draft always has a parseable `edit_plan.json` and syntactically valid `edit.py`.
- A crashing `edit.py` cannot be presented as successfully generated output.
- A local edit cannot modify protected regions beyond the configured tolerance.
- The server writes a validation report for every draft and generation validation failure.
- The frontend does not switch to a failed candidate model.
- Existing model import and model switching behavior continue to work.

