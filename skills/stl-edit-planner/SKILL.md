---
name: stl-edit-planner
description: Use when handling STL mesh edit requests with selection or view metadata and the agent must infer the intended edit scope before generating or revising a mesh-edit script.
---

# STL Edit Planner

## Overview

Use this before producing any STL edit script or edit instructions.

The planner is an internal stage. Its job is to decide the narrowest justified edit scope from the user request, `selectionContext`, and `viewContext`. Do not reveal planner-only structure unless a clarification is required.

## When to Use

Use this skill when:

- The request is to modify an existing STL or triangle mesh.
- `selectionContext` or `viewContext` is available.
- The selected triangles may be only seed evidence rather than the exact final edit boundary.
- A local edit might be mistaken for a global transform, or vice versa.

Do not use this skill for:

- Pure analysis with no requested modification.
- Text-only discussion of possible edits.
- Creating a brand-new model from scratch.

## Internal Planning Targets

Before executing, determine these items internally:

- `requested_operation`: what the user actually wants changed
- `seed_region`: the triangles or components explicitly selected
- `inferred_edit_region`: the region you believe should actually be edited
- `scope_kind`: `local` or `global`
- `protected_regions`: areas that should stay unchanged by default
- `ambiguity_level`: `low` or `high`

Keep these internal. Do not print them unless you must ask a clarification.

## Planning Rules

1. Treat selected triangles as evidence, not automatically as the exact edit mask.
2. Default to a local edit when the user describes a local feature change.
3. Allow expansion from selected triangles to a coherent local feature only when there is direct evidence from the request or visible local geometry.
4. Do not expand from a small local seed to broad model-wide changes without a clear reason.
5. Global transforms such as scale, rotate, translate, center, or reorient are allowed when the user explicitly asks for them, or when the requested operation is inherently global.
6. Do not treat "convenient for implementation" as a valid reason to widen scope.
7. Separate the requested edit from opportunistic cleanup. A cleanup step is not part of the plan unless the user asked for it or the edit cannot be completed without it.
8. If two materially different interpretations are both plausible, mark the request as high ambiguity and ask one concise clarification question.

## Scope Inference Heuristics

Infer a wider local feature region only when one or more of these are clearly true:

- The selected triangles appear to belong to the same visible plane, wall, slot, boss, rim, fillet band, or protrusion the user is describing.
- The user language refers to a feature rather than isolated triangles, such as "this plane", "this side wall", "this raised area", or "the selected face".
- The edit only makes sense when applied to the full local feature rather than to a few seed triangles.

Do not infer a wider region when:

- The user intent is precise but underspecified.
- Multiple neighboring features are equally plausible.
- A wider edit would change unrelated visible structure.

## Clarification Gate

Ask a clarification instead of continuing when any of these are true:

- It is unclear whether the request is local or global.
- It is unclear whether the selected triangles are seeds for a feature or the exact target.
- The request depends on a dimension, side, or direction that is not recoverable from the provided context.
- The same instruction could produce two visibly different outcomes.

When asking, ask only one short question and focus on the single blocking ambiguity.

## Planner Output Behavior

- If ambiguity is low: continue silently into execution.
- If ambiguity is high: ask a concise clarification and do not generate the edit script yet.
- Never expose a verbose planning report to the user by default.

## Common Mistakes

- Treating local-by-default as a ban on global transforms.
- Treating a few selected triangles as an exact boundary when they are only seeds.
- Silently widening scope because a global rewrite feels easier.
- Folding unrelated cleanup into the plan.
- Asking multiple questions when only one ambiguity is actually blocking.
