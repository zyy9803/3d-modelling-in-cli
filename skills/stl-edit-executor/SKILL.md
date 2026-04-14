---
name: stl-edit-executor
description: Use when executing an STL mesh edit after scope has already been inferred and the agent must keep the change aligned with user intent while avoiding unnecessary high-side-effect rewrites.
---

# STL Edit Executor

## Overview

Apply this after `stl-edit-planner`.

The executor turns an already-understood STL edit request into concrete action. Prefer the smallest justified change that satisfies the request. Keep planning internal and do not emit planner-only structure unless you need to explain a blocking risk or ask a clarification.

## When to Use

Use this skill when:

- The request is an actual STL modification task, not just discussion.
- The intended scope is already clear enough to act.
- A script, command sequence, or concrete edit procedure is about to be generated.

Do not use this skill when:

- The request is still ambiguous enough that a clarification is required.
- No plausible edit scope has been identified yet.

## Execution Rules

1. Follow the inferred scope from planning. Do not silently widen it during execution.
2. Prefer local edits for local requests.
3. Global transforms are allowed when explicitly requested by the user or clearly required by the requested operation.
4. A seed selection may be expanded to a coherent local feature region if that expansion was already justified during planning.
5. Preserve unrelated parts of the model by default, even if they could also be improved.
6. Do not add unsolicited cleanup or beautification steps.
7. Do not turn a local edit into a whole-model rewrite just because that path feels simpler.
8. If execution reveals a new ambiguity or a materially broader impact than planned, stop and ask a concise clarification instead of improvising.

## High-Side-Effect Operations

Treat these as high-side-effect operations:

- full-model remesh
- full-model repair
- full-model smooth
- full-model decimate
- full-model normalization, recentering, or reorientation
- broad topology changes outside the intended feature

Do not use them unless at least one of these is true:

- The user explicitly requested that operation.
- The requested edit is itself a global transform.
- The operation is necessary to complete the requested edit and there is no narrower practical path.

If the third case applies and it would materially broaden impact, ask before proceeding.

## Intent Preservation Rules

- Match the requested kind of change before optimizing implementation convenience.
- Do not invent missing exact dimensions, directions, or semantic feature labels.
- Do not claim the selected triangles are exact if they were only used as seeds.
- Do not pretend a risky inference is certain.
- If the user asked for a feature-level change, edit the feature; if the user asked for a whole-model transform, execute the whole-model transform.

## Internal Self-Check

Before finishing, verify internally:

- Did I keep the scope consistent with the request?
- Did I add any broad cleanup not asked for?
- Did I use a global operation without a valid reason?
- Did I expand beyond the selected triangles for a justified feature reason rather than convenience?
- Would the user likely describe the affected area as "the thing they meant" rather than "extra stuff"?

If any answer is no or uncertain, do not bluff. Ask a short clarification or state the limitation.

## User-Facing Behavior

- If you can proceed safely, continue without exposing internal planning scaffolding.
- If blocked, ask one concise question focused on the single missing fact.
- If no safe interpretation exists, say so plainly instead of forcing an edit.

## Common Mistakes

- Sneaking in global cleanup after a local request.
- Refusing a valid global transform because "local by default" was misread as "local only".
- Expanding from seed triangles to a much larger area without saying why.
- Using implementation convenience as the main scope decision.
- Continuing after a newly discovered ambiguity instead of stopping.
