# Codex Mesh Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Codex to generate a new STL from the currently active model and selection context via a Python job workspace, then automatically switch the frontend to the generated model.

**Architecture:** Extend the current chat/session server into an edit-job pipeline. Each edit request creates a versioned model output path plus a job workspace containing `context.json`; Codex receives those paths in the turn prompt, generates and runs a Python script, and the server validates and registers the new STL before notifying the frontend through the existing SSE stream.

**Tech Stack:** TypeScript, Node.js HTTP/SSE server, Codex app-server, Python runner, Three.js STLLoader, Vite frontend

---

### Task 1: Add Model Registry and Job Workspace Primitives

**Files:**
- Create: `server/model-registry.ts`
- Create: `server/edit-job.ts`
- Modify: `src/shared/codex-session-types.ts`
- Test: `server/model-registry.test.ts`
- Test: `server/edit-job.test.ts`

- [ ] **Step 1: Write the failing model registry test**

```ts
import { describe, expect, it } from 'vitest';
import { createModelRegistry } from './model-registry.js';

describe('createModelRegistry', () => {
  it('allocates original and derived model ids with parent linkage', () => {
    const registry = createModelRegistry('C:/repo/artifacts/models');

    const original = registry.registerImportedModel({
      sourceFileName: 'part.stl',
    });
    const derived = registry.registerDerivedModel({
      parentModelId: original.modelId,
      sourceFileName: 'part-edited.stl',
      jobId: 'job_001',
    });

    expect(original.modelId).toBe('model_001');
    expect(derived.modelId).toBe('model_002');
    expect(derived.parentModelId).toBe('model_001');
    expect(derived.storagePath.endsWith('model_002_from_model_001.stl')).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing edit job test**

```ts
import { describe, expect, it } from 'vitest';
import { createEditJobFactory } from './edit-job.js';
import { createModelRegistry } from './model-registry.js';

describe('createEditJobFactory', () => {
  it('creates a job workspace with context and output paths', async () => {
    const registry = createModelRegistry('C:/repo/artifacts/models');
    const baseModel = registry.registerImportedModel({
      sourceFileName: 'part.stl',
    });
    const factory = createEditJobFactory({
      jobsRoot: 'C:/repo/artifacts/jobs',
      registry,
    });

    const job = await factory.createJob({
      activeModelId: baseModel.modelId,
      selectionContext: { mode: 'click', triangleIds: [1], components: [] },
      viewContext: {
        cameraPosition: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1000, 800],
      },
      userInstruction: 'raise selected patch',
    });

    expect(job.jobId).toBe('job_001');
    expect(job.contextPath.endsWith('artifacts/jobs/job_001/context.json')).toBe(true);
    expect(job.outputModel.modelId).toBe('model_002');
  });
});
```

- [ ] **Step 3: Add shared event and payload types**

```ts
export type ModelGeneratedEvent = {
  type: 'model_generated';
  jobId: string;
  baseModelId: string;
  newModelId: string;
  modelLabel: string;
};

export type ModelGenerationStartedEvent = {
  type: 'model_generation_started';
  jobId: string;
  baseModelId: string;
};

export type ModelGenerationFailedEvent = {
  type: 'model_generation_failed';
  jobId: string;
  baseModelId: string;
  message: string;
};
```

- [ ] **Step 4: Implement the model registry**

```ts
export function createModelRegistry(modelsRoot: string) {
  let sequence = 0;
  const records = new Map<string, ModelRecord>();

  function nextId(): string {
    sequence += 1;
    return `model_${String(sequence).padStart(3, '0')}`;
  }

  return {
    registerImportedModel({ sourceFileName }: { sourceFileName: string }): ModelRecord {
      const modelId = nextId();
      const storagePath = join(modelsRoot, `${modelId}_original.stl`);
      const record = { modelId, parentModelId: null, sourceFileName, storagePath, sourceJobId: null };
      records.set(modelId, record);
      return record;
    },
    registerDerivedModel({
      parentModelId,
      sourceFileName,
      jobId,
    }: {
      parentModelId: string;
      sourceFileName: string;
      jobId: string;
    }): ModelRecord {
      const modelId = nextId();
      const storagePath = join(modelsRoot, `${modelId}_from_${parentModelId}.stl`);
      const record = { modelId, parentModelId, sourceFileName, storagePath, sourceJobId: jobId };
      records.set(modelId, record);
      return record;
    },
    getModel(modelId: string): ModelRecord | null {
      return records.get(modelId) ?? null;
    },
  };
}
```

- [ ] **Step 5: Implement the edit job factory**

```ts
export function createEditJobFactory(options: EditJobFactoryOptions) {
  let sequence = 0;

  return {
    async createJob(input: CreateEditJobInput): Promise<EditJobRecord> {
      sequence += 1;
      const jobId = `job_${String(sequence).padStart(3, '0')}`;
      const baseModel = options.registry.getModel(input.activeModelId);
      if (!baseModel) {
        throw new Error(`Unknown active model: ${input.activeModelId}`);
      }

      const outputModel = options.registry.registerDerivedModel({
        parentModelId: baseModel.modelId,
        sourceFileName: `${baseModel.sourceFileName.replace(/\.stl$/i, '')}-edited.stl`,
        jobId,
      });

      const workspacePath = join(options.jobsRoot, jobId);
      const contextPath = join(workspacePath, 'context.json');
      const scriptPath = join(workspacePath, 'edit.py');
      const resultPath = join(workspacePath, 'result.json');

      await mkdir(workspacePath, { recursive: true });
      await writeFile(
        contextPath,
        JSON.stringify(
          {
            jobId,
            baseModelId: baseModel.modelId,
            activeModelId: input.activeModelId,
            baseModelPath: baseModel.storagePath,
            outputModelPath: outputModel.storagePath,
            selectionContext: input.selectionContext,
            viewContext: input.viewContext,
            userInstruction: input.userInstruction,
          },
          null,
          2,
        ),
        'utf8',
      );

      return {
        jobId,
        workspacePath,
        contextPath,
        scriptPath,
        resultPath,
        baseModel,
        outputModel,
      };
    },
  };
}
```

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- --runInBand server/model-registry.test.ts server/edit-job.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/model-registry.ts server/edit-job.ts server/model-registry.test.ts server/edit-job.test.ts src/shared/codex-session-types.ts
git commit -m "feat: add model registry and edit job workspace"
```

### Task 2: Replace Phase 3A Prompting with Mesh Edit Job Prompting

**Files:**
- Modify: `server/codex-session.ts`
- Modify: `src/shared/codex-turn-prompt.ts`
- Test: `src/shared/codex-turn-prompt.test.ts`

- [ ] **Step 1: Write the failing prompt test**

```ts
it('includes job paths and mesh edit constraints', () => {
  const prompt = buildCodexTurnPrompt({
    sessionId: 'sess_main',
    activeModelId: 'model_001',
    message: { role: 'user', text: 'cut a slot' },
    selectionContext: { mode: 'click', triangleIds: [7], components: [] },
    viewContext: {
      cameraPosition: [1, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 50,
      viewDirection: [0, 0, -1],
      dominantOrientation: '+X',
      viewportSize: [1280, 720],
    },
    editJob: {
      jobId: 'job_001',
      workspacePath: 'C:/repo/artifacts/jobs/job_001',
      contextPath: 'C:/repo/artifacts/jobs/job_001/context.json',
      baseModelPath: 'C:/repo/artifacts/models/model_001_original.stl',
      outputModelPath: 'C:/repo/artifacts/models/model_002_from_model_001.stl',
    },
  });

  expect(prompt).toContain('You may edit mesh geometry and generate a new STL.');
  expect(prompt).toContain('contextJsonPath: C:/repo/artifacts/jobs/job_001/context.json');
  expect(prompt).toContain('outputModelPath: C:/repo/artifacts/models/model_002_from_model_001.stl');
});
```

- [ ] **Step 2: Extend the prompt request type**

```ts
export type SessionMessageRequest = {
  sessionId: string;
  activeModelId: string | null;
  message: { role: 'user'; text: string };
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
  editJob?: {
    jobId: string;
    workspacePath: string;
    contextPath: string;
    baseModelPath: string;
    outputModelPath: string;
  };
};
```

- [ ] **Step 3: Replace prompt text**

```ts
return [
  'You are an expert in 3D modeling, triangle mesh editing, and STL workflows.',
  'You may edit mesh geometry and generate a new STL.',
  'Do not overwrite the input STL.',
  `jobId: ${request.editJob?.jobId ?? 'unknown'}`,
  `jobWorkspace: ${request.editJob?.workspacePath ?? 'unknown'}`,
  `contextJsonPath: ${request.editJob?.contextPath ?? 'unknown'}`,
  `baseModelPath: ${request.editJob?.baseModelPath ?? 'unknown'}`,
  `outputModelPath: ${request.editJob?.outputModelPath ?? 'unknown'}`,
  `activeModelId: ${request.activeModelId ?? 'null'}`,
  `selectionContext: ${formatSelectionContext(selection)}`,
  `viewContext: ${formatViewContext(view)}`,
  `userInstruction: ${request.message.text}`,
].join('\n');
```

- [ ] **Step 4: Replace thread base instructions**

```ts
baseInstructions:
  'You are an expert in 3D modeling and STL mesh editing. You may generate a new STL, but you must never overwrite the input STL.',
developerInstructions:
  'Use the provided job context as the source of truth. Read context.json, modify the mesh using Python, and write the new STL only to the provided output path.',
```

- [ ] **Step 5: Run prompt tests**

Run: `npm test -- --runInBand src/shared/codex-turn-prompt.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/codex-session.ts src/shared/codex-turn-prompt.ts src/shared/codex-turn-prompt.test.ts src/shared/codex-session-types.ts
git commit -m "feat: allow codex mesh edit prompting"
```

### Task 3: Integrate Edit Jobs into Session Submission and Completion

**Files:**
- Modify: `server/codex-session.ts`
- Create: `server/model-storage.ts`
- Test: `server/codex-session.test.ts`

- [ ] **Step 1: Write the failing session completion test**

```ts
it('emits model_generated when output STL exists after turn completion', async () => {
  const controller = createTestSessionController();
  await controller.submitMessage(createEditRequest());
  await writeFile('C:/repo/artifacts/models/model_002_from_model_001.stl', 'solid demo\nendsolid demo\n', 'utf8');

  controller['handleNotification']({
    method: 'turn/completed',
    params: {
      threadId: 'thread_1',
      turn: { id: 'turn_1', status: 'completed' },
    },
  });

  expect(controllerEvents).toContainEqual(
    expect.objectContaining({
      type: 'model_generated',
      newModelId: 'model_002',
    }),
  );
});
```

- [ ] **Step 2: Add model storage helpers**

```ts
export async function readModelFile(modelPath: string): Promise<Buffer> {
  return readFile(modelPath);
}

export async function outputModelExists(modelPath: string): Promise<boolean> {
  try {
    const stat = await lstat(modelPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Track the active edit job in the session controller**

```ts
private activeEditJob: EditJobRecord | null = null;
```

- [ ] **Step 4: Create an edit job for each submitted message**

```ts
const editJob = await this.editJobFactory.createJob({
  activeModelId: this.requireActiveModelId(request.activeModelId),
  selectionContext: request.selectionContext,
  viewContext: request.viewContext,
  userInstruction: request.message.text,
});

this.activeEditJob = editJob;
this.broadcast({
  type: 'model_generation_started',
  jobId: editJob.jobId,
  baseModelId: editJob.baseModel.modelId,
});
```

- [ ] **Step 5: Inject edit job data into the turn prompt request**

```ts
const prompt = buildCodexTurnPrompt({
  ...request,
  editJob: {
    jobId: editJob.jobId,
    workspacePath: editJob.workspacePath,
    contextPath: editJob.contextPath,
    baseModelPath: editJob.baseModel.storagePath,
    outputModelPath: editJob.outputModel.storagePath,
  },
});
```

- [ ] **Step 6: On turn completion, validate and emit model events**

```ts
if (notification.method === 'turn/completed' && this.activeEditJob) {
  const job = this.activeEditJob;
  this.activeEditJob = null;

  const exists = await outputModelExists(job.outputModel.storagePath);
  if (!exists) {
    this.broadcast({
      type: 'model_generation_failed',
      jobId: job.jobId,
      baseModelId: job.baseModel.modelId,
      message: 'Codex did not generate a new STL file.',
    });
    return;
  }

  this.broadcast({
    type: 'model_generated',
    jobId: job.jobId,
    baseModelId: job.baseModel.modelId,
    newModelId: job.outputModel.modelId,
    modelLabel: job.outputModel.sourceFileName,
  });
}
```

- [ ] **Step 7: Run the session tests**

Run: `npm test -- --runInBand server/codex-session.test.ts`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/codex-session.ts server/model-storage.ts server/codex-session.test.ts
git commit -m "feat: emit model generation events from session turns"
```

### Task 4: Add Model File Serving Endpoint

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/model-registry.ts`
- Test: `server/routes.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
it('serves generated STL by model id', async () => {
  const registry = createModelRegistry('C:/repo/artifacts/models');
  const model = registry.registerImportedModel({ sourceFileName: 'part.stl' });
  await writeFile(model.storagePath, 'solid demo\nendsolid demo\n', 'utf8');

  const response = await request(app).get(`/api/models/${model.modelId}`);

  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('model/stl');
});
```

- [ ] **Step 2: Expose model lookup from the registry**

```ts
getModel(modelId: string): ModelRecord | null {
  return records.get(modelId) ?? null;
}
```

- [ ] **Step 3: Add the model file route**

```ts
if (url.pathname.startsWith('/api/models/') && request.method === 'GET') {
  const modelId = url.pathname.split('/').pop() ?? '';
  const model = session.getModel(modelId);
  if (!model) {
    writeJson(response, 404, { error: 'Model not found' });
    return;
  }

  const file = await readFile(model.storagePath);
  writeCorsHeaders(response);
  response.writeHead(200, {
    'Content-Type': 'model/stl',
    'Content-Length': file.length,
  });
  response.end(file);
  return;
}
```

- [ ] **Step 4: Run route tests**

Run: `npm test -- --runInBand server/routes.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/model-registry.ts server/routes.test.ts
git commit -m "feat: serve generated models by model id"
```

### Task 5: Auto-Switch Frontend to Generated Models

**Files:**
- Modify: `src/chat/chat-store.ts`
- Modify: `src/shared/codex-session-types.ts`
- Modify: `src/chat/session-client.ts`
- Modify: `src/app/ViewerApp.ts`
- Test: `src/chat/chat-store.test.ts`
- Test: `src/app/ViewerApp.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
it('updates active model when model_generated arrives', () => {
  const store = createChatStore();

  store.applyEvent({
    type: 'model_generated',
    jobId: 'job_001',
    baseModelId: 'model_001',
    newModelId: 'model_002',
    modelLabel: 'part-edited.stl',
  });

  expect(store.getState().activeModelId).toBe('model_002');
});
```

- [ ] **Step 2: Add model generation events to shared types**

```ts
| {
    type: 'model_generation_started';
    jobId: string;
    baseModelId: string;
  }
| {
    type: 'model_generated';
    jobId: string;
    baseModelId: string;
    newModelId: string;
    modelLabel: string;
  }
| {
    type: 'model_generation_failed';
    jobId: string;
    baseModelId: string;
    message: string;
  }
```

- [ ] **Step 3: Update chat-store message handling**

```ts
case 'model_generation_started':
  pushSystemMessage(`正在生成新模型：${event.jobId}`);
  break;
case 'model_generated':
  state.activeModelId = event.newModelId;
  state.modelLabel = event.modelLabel;
  pushSystemMessage(`新模型已生成：${event.modelLabel}`);
  break;
case 'model_generation_failed':
  pushSystemMessage(`新模型生成失败：${event.message}`);
  break;
```

- [ ] **Step 4: Add frontend model fetch helper**

```ts
async fetchModelFile(modelId: string): Promise<File> {
  const response = await fetch(this.resolveUrl(`/api/models/${modelId}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch model ${modelId}`);
  }

  const blob = await response.blob();
  return new File([blob], `${modelId}.stl`, { type: 'model/stl' });
}
```

- [ ] **Step 5: Auto-load generated models in ViewerApp**

```ts
if (event.type === 'model_generated') {
  void this.loadGeneratedModel(event.newModelId, event.modelLabel);
}
```

```ts
private async loadGeneratedModel(modelId: string, modelLabel: string): Promise<void> {
  const file = await this.sessionClient.fetchModelFile(modelId);
  await this.viewport?.loadFile(file);
  this.activeModelId = modelId;
  this.activeModelLabel = modelLabel;
  this.chatStore.setModelContext({
    activeModelId: modelId,
    modelLabel,
  });
}
```

- [ ] **Step 6: Run frontend tests**

Run: `npm test -- --runInBand src/chat/chat-store.test.ts src/app/ViewerApp.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/chat/chat-store.ts src/shared/codex-session-types.ts src/chat/session-client.ts src/app/ViewerApp.ts src/chat/chat-store.test.ts src/app/ViewerApp.test.ts
git commit -m "feat: auto-switch to generated stl models"
```

### Task 6: Validate STL Outputs Before Switching

**Files:**
- Modify: `server/model-storage.ts`
- Modify: `server/codex-session.ts`
- Test: `server/model-storage.test.ts`

- [ ] **Step 1: Write the failing STL validation test**

```ts
it('rejects empty generated files', async () => {
  await writeFile('C:/repo/out.stl', '', 'utf8');
  await expect(validateGeneratedStl('C:/repo/out.stl')).resolves.toMatchObject({
    ok: false,
  });
});
```

- [ ] **Step 2: Implement minimal validation**

```ts
export async function validateGeneratedStl(modelPath: string): Promise<{ ok: boolean; message?: string }> {
  const exists = await outputModelExists(modelPath);
  if (!exists) {
    return { ok: false, message: 'Output STL not found.' };
  }

  const content = await readFile(modelPath, 'utf8');
  if (content.trim().length === 0) {
    return { ok: false, message: 'Output STL is empty.' };
  }

  return { ok: true };
}
```

- [ ] **Step 3: Use validation before emitting model_generated**

```ts
const validation = await validateGeneratedStl(job.outputModel.storagePath);
if (!validation.ok) {
  this.broadcast({
    type: 'model_generation_failed',
    jobId: job.jobId,
    baseModelId: job.baseModel.modelId,
    message: validation.message ?? 'Generated STL failed validation.',
  });
  return;
}
```

- [ ] **Step 4: Run validation tests**

Run: `npm test -- --runInBand server/model-storage.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/model-storage.ts server/codex-session.ts server/model-storage.test.ts
git commit -m "feat: validate generated stl outputs"
```

### Task 7: Final Verification and Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-04-10-codex-mesh-edit-design.md` (only if implementation drift requires it)

- [ ] **Step 1: Run focused tests**

Run: `npm test -- --runInBand server/model-registry.test.ts server/edit-job.test.ts server/codex-session.test.ts server/routes.test.ts server/model-storage.test.ts src/chat/chat-store.test.ts src/app/ViewerApp.test.ts src/shared/codex-turn-prompt.test.ts`  
Expected: PASS

- [ ] **Step 2: Run type checks**

Run: `npx tsc --noEmit`  
Expected: PASS

Run: `npx tsc -p tsconfig.server.json`  
Expected: PASS

- [ ] **Step 3: Run build**

Run: `npm run build`  
Expected: PASS

- [ ] **Step 4: Update spec only if needed**

```md
- If actual event names or file paths drifted during implementation, update the design doc to match reality.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-10-codex-mesh-edit-design.md
git commit -m "docs: sync mesh edit design with implementation"
```
