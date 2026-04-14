# Codex Session Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 3A of the STL viewer: a lightweight local server that manages one Codex app-server session plus a right-side frontend chat panel that streams Codex responses, surfaces pause/decision states, preserves transcript across STL switches, and only clears conversation when the user explicitly clicks `清空会话`.

**Architecture:** Add a thin Node BFF under `server/` that starts `codex --sandbox danger-full-access --ask-for-approval never app-server`, connects to it over local WebSocket, normalizes app-server notifications/requests into a compact SSE event model, and keeps one in-memory chat session. On the frontend, add a `chat-store` + `session-client` + `ChatPanel` stack, then wire `ViewerApp` to send `activeModelId + selectionContext + viewContext + user text` and render connection/session state separately.

**Tech Stack:** TypeScript, Vite, Vitest, Node.js built-ins, `ws`, `tsx`, existing Three.js viewer modules, Codex app-server generated TypeScript bindings.

---

## File Map

### Create

- `tsconfig.server.json`
- `src/shared/codex-session-types.ts`
- `src/shared/codex-turn-prompt.ts`
- `src/shared/codex-turn-prompt.test.ts`
- `server/generated/codex-app-server/` (generated bindings committed to repo)
- `server/codex-process.ts`
- `server/codex-process.test.ts`
- `server/codex-gateway.ts`
- `server/codex-gateway.test.ts`
- `server/codex-adapter.ts`
- `server/codex-adapter.test.ts`
- `server/codex-session.ts`
- `server/codex-session.test.ts`
- `server/routes.ts`
- `server/routes.test.ts`
- `server/index.ts`
- `src/components/chat/services/sessionClient.ts`
- `tests/frontend/chat/session-client.test.ts`
- `src/components/chat/state/chatState.ts`
- `tests/frontend/chat/chat-store.test.ts`
- `src/components/chat/components/ChatPanel/index.tsx`
- `tests/frontend/chat/ChatPanel.test.tsx`

### Modify

- `package.json`
- `src/components/viewer/core/StlViewport.ts`
- `src/app/ViewerApp.tsx`
- `tests/frontend/app/ViewerApp.test.tsx`
- `src/app/ViewerApp.scss`
- `src/components/chat/components/ChatPanel/index.scss`

### Responsibilities

- `src/shared/codex-session-types.ts`
  - Shared request, event, decision-card, and status types consumed by both server and frontend.
- `src/shared/codex-turn-prompt.ts`
  - Converts `activeModelId + selectionContext + viewContext + user text` into one deterministic text payload for Codex `UserInput`.
- `server/codex-process.ts`
  - Starts and monitors the local Codex app-server subprocess with the fixed sandbox/approval flags.
- `server/codex-gateway.ts`
  - Owns the WebSocket/JSON-RPC connection to app-server and sends typed requests using generated bindings.
- `server/codex-adapter.ts`
  - Maps app-server notifications and server requests into compact frontend SSE events, and maps UI decisions back into typed app-server responses.
- `server/codex-session.ts`
  - Maintains the single in-memory session, transcript, pending decision, and active model info.
- `server/routes.ts`
  - Exposes `GET /api/status`, `GET /api/session/stream`, `POST /api/session/message`, `POST /api/session/decision`, `POST /api/session/model-switch`, `POST /api/session/clear`.
- `src/components/chat/services/sessionClient.ts`
  - Frontend HTTP/SSE client.
- `src/components/chat/state/chatState.ts`
  - Reduces SSE events into chat panel state.
- `src/components/chat/components/ChatPanel/index.tsx`
  - Renders connection light, transcript, pending decision card, context summary, and input box.
- `src/components/viewer/core/StlViewport.ts`
  - Exposes a non-download selection snapshot API for chat sends.
- `src/app/ViewerApp.tsx`
  - Owns active model identity, wires file loads to server-side model-switch events, mounts chat UI, and triggers `清空会话`.

### Notes

- Keep generated Codex app-server bindings in-repo under `server/generated/codex-app-server/` so implementation does not depend on running the generator at test time.
- Add a derived endpoint `POST /api/session/model-switch` even though the spec only listed the core routes. This is required to satisfy the approved “切换 STL 不清空会话，但必须记录模型切换” behavior.
- Phase 3A does not execute STL edits. The Codex thread instructions must explicitly say that edits are not applied yet and the assistant must not claim it changed the mesh.

### Task 1: Shared Contracts And Prompt Builder

**Files:**
- Create: `src/shared/codex-session-types.ts`
- Create: `src/shared/codex-turn-prompt.ts`
- Create: `src/shared/codex-turn-prompt.test.ts`
- Modify: `package.json`
- Create: `tsconfig.server.json`

- [ ] **Step 1: Write the failing prompt-builder test**

```ts
import { describe, expect, it } from 'vitest';

import { buildCodexTurnPrompt } from './codex-turn-prompt';
import type { SessionMessageRequest } from './codex-session-types';

describe('buildCodexTurnPrompt', () => {
  it('includes the active model, selection summary, and user instruction', () => {
    const request: SessionMessageRequest = {
      sessionId: 'sess_main',
      activeModelId: 'model_003',
      message: {
        role: 'user',
        text: '把我选中的区域向内缩 2mm',
      },
      selectionContext: {
        mode: 'box',
        triangleIds: [10, 11, 12],
        components: [
          {
            id: 'sel_0',
            triangleIds: [10, 11, 12],
            centroid: [1, 2, 3],
            bboxMin: [0, 1, 2],
            bboxMax: [2, 3, 4],
            avgNormal: [0, 0, 1],
            area: 12.5,
          },
        ],
      },
      viewContext: {
        cameraPosition: [8, 8, 8],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [-0.57735, -0.57735, -0.57735],
        dominantOrientation: '+X',
        viewportSize: [1440, 900],
      },
    };

    const prompt = buildCodexTurnPrompt(request);

    expect(prompt).toContain('activeModelId: model_003');
    expect(prompt).toContain('triangleCount: 3');
    expect(prompt).toContain('componentCount: 1');
    expect(prompt).toContain('dominantOrientation: +X');
    expect(prompt).toContain('把我选中的区域向内缩 2mm');
    expect(prompt).toContain('Phase 3A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/codex-turn-prompt.test.ts`

Expected: FAIL with `Cannot find module './codex-turn-prompt'` or missing exported types.

- [ ] **Step 3: Add shared types, prompt builder, and server tooling**

```ts
// src/shared/codex-session-types.ts
export type CodexConnectionStatus = 'starting' | 'connected' | 'disconnected' | 'failed';

export type ChatSessionStatus =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'waiting_decision'
  | 'resuming'
  | 'completed'
  | 'failed';

export type SelectionComponentPayload = {
  id: string;
  triangleIds: number[];
  centroid: [number, number, number];
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  avgNormal: [number, number, number];
  area: number;
};

export type SelectionContextPayload = {
  mode: 'click' | 'box';
  triangleIds: number[];
  screenRect?: [number, number, number, number];
  components: SelectionComponentPayload[];
};

export type ViewContextPayload = {
  cameraPosition: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  viewDirection: [number, number, number];
  dominantOrientation: string;
  viewportSize: [number, number];
};

export type SessionMessageRequest = {
  sessionId: string;
  activeModelId: string | null;
  message: {
    role: 'user';
    text: string;
  };
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
};

export type SessionModelSwitchRequest = {
  sessionId: string;
  activeModelId: string | null;
  modelLabel: string | null;
};

export type DecisionQuestion = {
  id: string;
  header: string;
  question: string;
  allowOther: boolean;
  options: Array<{
    label: string;
    description: string;
  }>;
};

export type SessionDecisionCard = {
  id: string;
  kind: 'approval' | 'user_input';
  title: string;
  body: string;
  questions: DecisionQuestion[];
};

export type SessionDecisionRequest = {
  sessionId: string;
  decisionId: string;
  answers: Record<string, string>;
};

export type SessionStreamEvent =
  | {
      type: 'connection_status_changed';
      connectionStatus: CodexConnectionStatus;
      message: string;
    }
  | {
      type: 'session_started';
      sessionId: string;
    }
  | {
      type: 'status_changed';
      status: ChatSessionStatus;
    }
  | {
      type: 'message_started';
      messageId: string;
      role: 'assistant';
    }
  | {
      type: 'message_delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'message_completed';
      messageId: string;
    }
  | {
      type: 'needs_decision';
      decision: SessionDecisionCard;
    }
  | {
      type: 'session_paused';
      decisionId: string;
    }
  | {
      type: 'session_resumed';
      decisionId: string;
    }
  | {
      type: 'model_switched';
      activeModelId: string | null;
      modelLabel: string | null;
    }
  | {
      type: 'session_cleared';
    }
  | {
      type: 'error';
      scope: 'connection' | 'session';
      message: string;
    };
```

```ts
// src/shared/codex-turn-prompt.ts
import type { SessionMessageRequest } from './codex-session-types';

export function buildCodexTurnPrompt(request: SessionMessageRequest): string {
  const selection = request.selectionContext;
  const view = request.viewContext;

  return [
    'Phase 3A conversation only. Do not claim that any STL or mesh edit has been executed.',
    `activeModelId: ${request.activeModelId ?? 'null'}`,
    `triangleCount: ${selection.triangleIds.length}`,
    `componentCount: ${selection.components.length}`,
    `dominantOrientation: ${view.dominantOrientation}`,
    `viewContext: ${JSON.stringify(view)}`,
    `selectionContext: ${JSON.stringify(selection)}`,
    `userInstruction: ${request.message.text}`,
  ].join('\n');
}
```

```json
// package.json
{
  "scripts": {
    "dev:client": "vite --strictPort --port 5173",
    "dev:server": "tsx watch --tsconfig tsconfig.server.json server/index.ts",
    "dev": "tsx scripts/dev.ts",
    "build:client": "tsx scripts/buildClient.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "tsx scripts/build.ts",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "three": "^0.179.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^24.3.0",
    "concurrently": "^9.2.0",
    "tsx": "^4.20.0"
  }
}
```

```json
// tsconfig.server.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noEmitOnError": true,
    "rootDir": ".",
    "outDir": "dist/server",
    "types": ["node"]
  },
  "include": ["server/**/*.ts", "src/shared/**/*.ts"]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/codex-turn-prompt.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.server.json src/shared/codex-session-types.ts src/shared/codex-turn-prompt.ts src/shared/codex-turn-prompt.test.ts
git commit -m "feat: add codex session shared contracts"
```

### Task 2: Codex Process Manager

**Files:**
- Create: `server/codex-process.ts`
- Create: `server/codex-process.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing process-manager test**

```ts
import { describe, expect, it, vi } from 'vitest';

import { CodexProcessManager } from './codex-process';

describe('CodexProcessManager', () => {
  it('spawns codex app-server with fixed sandbox and approval flags', async () => {
    const spawnChild = vi.fn().mockReturnValue({
      pid: 42,
      once: vi.fn(),
      on: vi.fn(),
      stdout: null,
      stderr: null,
      kill: vi.fn(),
    });

    const manager = new CodexProcessManager({
      cwd: 'C:/Users/Admin/Projects/3DModel',
      spawnChild,
      allocatePort: async () => 43117,
      waitForSocket: async () => undefined,
    });

    await manager.start();

    expect(spawnChild).toHaveBeenCalledWith(
      'codex',
      [
        '--sandbox',
        'danger-full-access',
        '--ask-for-approval',
        'on-request',
        'app-server',
        '--listen',
        'ws://127.0.0.1:43117',
      ],
      expect.objectContaining({
        cwd: 'C:/Users/Admin/Projects/3DModel',
      }),
    );
    expect(manager.getStatus()).toBe('connected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/codex-process.test.ts`

Expected: FAIL with missing module or missing exported class.

- [ ] **Step 3: Implement the process manager**

```ts
// server/codex-process.ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';

import type { CodexConnectionStatus } from '../src/shared/codex-session-types';

type SpawnChild = typeof spawn;

export type CodexProcessManagerOptions = {
  cwd: string;
  spawnChild?: SpawnChild;
  allocatePort?: () => Promise<number>;
  waitForSocket?: (url: string) => Promise<void>;
};

export class CodexProcessManager {
  private status: CodexConnectionStatus = 'disconnected';
  private child: ChildProcessWithoutNullStreams | ReturnType<SpawnChild> | null = null;
  private listenUrl: string | null = null;

  constructor(private readonly options: CodexProcessManagerOptions) {}

  async start(): Promise<void> {
    const port = await (this.options.allocatePort ?? defaultAllocatePort)();
    this.listenUrl = `ws://127.0.0.1:${port}`;
    this.status = 'starting';

    this.child = (this.options.spawnChild ?? spawn)(
      'codex',
      [
        '--sandbox',
        'danger-full-access',
        '--ask-for-approval',
        'on-request',
        'app-server',
        '--listen',
        this.listenUrl,
      ],
      {
        cwd: this.options.cwd,
        stdio: 'pipe',
      },
    );

    await (this.options.waitForSocket ?? defaultWaitForSocket)(this.listenUrl);
    this.status = 'connected';
  }

  getStatus(): CodexConnectionStatus {
    return this.status;
  }

  getListenUrl(): string {
    if (!this.listenUrl) {
      throw new Error('Codex app-server has not been started');
    }
    return this.listenUrl;
  }
}

async function defaultAllocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate local port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function defaultWaitForSocket(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  const { WebSocket } = await import('ws');

  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.once('open', () => {
          socket.close();
          resolve();
        });
        socket.once('error', reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Timed out waiting for Codex app-server at ${url}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test server/codex-process.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/codex-process.ts server/codex-process.test.ts
git commit -m "feat: add codex process manager"
```

### Task 3: WebSocket Gateway And Protocol Adapter

**Files:**
- Create: `server/generated/codex-app-server/`
- Create: `server/codex-gateway.ts`
- Create: `server/codex-gateway.test.ts`
- Create: `server/codex-adapter.ts`
- Create: `server/codex-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, expect, it } from 'vitest';

import { normalizeServerRequest } from './codex-adapter';

describe('normalizeServerRequest', () => {
  it('maps request_user_input to a frontend decision card', () => {
    const event = normalizeServerRequest({
      method: 'item/tool/requestUserInput',
      id: 'req_01',
      params: {
        threadId: 'thread_01',
        turnId: 'turn_01',
        itemId: 'item_01',
        questions: [
          {
            id: 'q_01',
            header: 'Shape',
            question: '选择一个处理方式',
            isOther: false,
            isSecret: false,
            options: [{ label: '继续', description: '按当前假设继续' }],
          },
        ],
      },
    });

    expect(event.type).toBe('needs_decision');
    expect(event.decision.kind).toBe('user_input');
    expect(event.decision.questions[0]?.header).toBe('Shape');
  });
});
```

```ts
import { describe, expect, it, vi } from 'vitest';

import { CodexGateway } from './codex-gateway';

describe('CodexGateway', () => {
  it('sends JSON-RPC responses back to the app-server', async () => {
    const sent: string[] = [];
    const gateway = new CodexGateway();
    (gateway as unknown as { socket: { send: (payload: string) => void } }).socket = {
      send: (payload: string) => sent.push(payload),
    };

    await gateway.respond('req_01', { decision: 'approve' });

    expect(sent).toEqual(['{"id":"req_01","result":{"decision":"approve"}}']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/codex-adapter.test.ts`

Expected: FAIL with missing module or missing export.

- [ ] **Step 3: Generate app-server bindings and implement gateway/adapter**

Run:

```bash
codex app-server generate-ts --out server/generated/codex-app-server
```

```ts
// server/codex-gateway.ts
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

import type { ClientRequest, ServerNotification, ServerRequest, v2 } from './generated/codex-app-server/index.js';

export class CodexGateway extends EventEmitter {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<string, (payload: unknown) => void>();

  async connect(url: string): Promise<void> {
    this.socket = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });

    this.socket.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as
        | { id: string; result?: unknown }
        | { method: string; params: unknown; id?: string };

      if ('id' in parsed && parsed.id && this.pending.has(parsed.id)) {
        this.pending.get(parsed.id)?.(parsed.result);
        this.pending.delete(parsed.id);
        return;
      }

      if ('id' in parsed && parsed.id) {
        this.emit('serverRequest', parsed as ServerRequest);
        return;
      }

      this.emit('notification', parsed as ServerNotification);
    });
  }

  async request<TResponse>(request: ClientRequest): Promise<TResponse> {
    if (!this.socket) {
      throw new Error('Codex gateway is not connected');
    }

    return await new Promise<TResponse>((resolve) => {
      const id = String(this.nextId++);
      this.pending.set(id, (payload) => resolve(payload as TResponse));
      this.socket?.send(JSON.stringify({ ...request, id }));
    });
  }

  async startThread(cwd: string, developerInstructions: string): Promise<string> {
    const response = await this.request<v2.ThreadStartResponse>({
      method: 'thread/start',
      id: '0',
      params: {
        cwd,
        approvalPolicy: 'on-request',
        sandbox: 'danger-full-access',
        developerInstructions,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      },
    });

    return response.threadId;
  }

  async respond(requestId: string, result: unknown): Promise<void> {
    if (!this.socket) {
      throw new Error('Codex gateway is not connected');
    }

    this.socket.send(JSON.stringify({ id: requestId, result }));
  }
}
```

```ts
// server/codex-adapter.ts
import { EventEmitter } from 'node:events';

import { buildCodexTurnPrompt } from '../src/shared/codex-turn-prompt';
import type { SessionDecisionCard, SessionDecisionRequest, SessionMessageRequest, SessionStreamEvent } from '../src/shared/codex-session-types';
import type { ServerNotification, ServerRequest } from './generated/codex-app-server/index.js';
import { CodexGateway } from './codex-gateway';

const THREAD_INSTRUCTIONS = [
  'You are assisting a web STL viewer Phase 3A session.',
  'You receive the current model id, view context, and selected triangles as structured text.',
  'Do not claim that any STL or mesh edit has been executed.',
  'If information is insufficient, ask a focused follow-up question.',
].join('\n');

export function normalizeNotification(notification: ServerNotification): SessionStreamEvent | null {
  switch (notification.method) {
    case 'item/agentMessage/delta':
      return {
        type: 'message_delta',
        messageId: notification.params.itemId,
        delta: notification.params.delta,
      };
    case 'turn/started':
      return {
        type: 'message_started',
        messageId: notification.params.turnId,
        role: 'assistant',
      };
    case 'turn/completed':
      return {
        type: 'message_completed',
        messageId: notification.params.turnId,
      };
    case 'thread/status/changed':
      return {
        type: 'status_changed',
        status: notification.params.status === 'running' ? 'streaming' : 'completed',
      };
    case 'error':
      return {
        type: 'error',
        scope: 'session',
        message: notification.params.message,
      };
    default:
      return null;
  }
}

export function normalizeServerRequest(request: ServerRequest): SessionStreamEvent {
  switch (request.method) {
    case 'item/tool/requestUserInput':
      return {
        type: 'needs_decision',
        decision: {
          id: request.id,
          kind: 'user_input',
          title: 'Codex 需要你的输入',
          body: '当前会话已暂停，等待用户决策。',
          questions: request.params.questions.map((question) => ({
            id: question.id,
            header: question.header,
            question: question.question,
            allowOther: question.isOther,
            options: (question.options ?? []).map((option) => ({
              label: option.label,
              description: option.description,
            })),
          })),
        },
      };
    case 'item/commandExecution/requestApproval':
      return approvalDecisionEvent(
        request.id,
        '命令执行审批',
        request.params.reason ?? request.params.command ?? 'Codex 请求执行命令',
        request.params.availableDecisions?.map(String) ?? ['approve', 'deny'],
      );
    case 'item/fileChange/requestApproval':
      return approvalDecisionEvent(
        request.id,
        '文件写入审批',
        request.params.reason ?? 'Codex 请求写入文件',
        ['approve', 'deny'],
      );
    case 'item/permissions/requestApproval':
      return approvalDecisionEvent(
        request.id,
        '权限审批',
        request.params.reason ?? 'Codex 请求额外权限',
        ['grant', 'deny'],
      );
    default:
      return approvalDecisionEvent(request.id, '待确认操作', request.method, ['approve', 'deny']);
  }
}

function approvalDecisionEvent(
  id: string,
  title: string,
  body: string,
  options: string[],
): SessionStreamEvent {
  const decision: SessionDecisionCard = {
    id,
    kind: 'approval',
    title,
    body,
    questions: [
      {
        id: 'decision',
        header: title,
        question: body,
        allowOther: false,
        options: options.map((label) => ({
          label,
          description: `选择 ${label}`,
        })),
      },
    ],
  };

  return {
    type: 'needs_decision',
    decision,
  };
}

export class CodexAdapter extends EventEmitter {
  private threadId: string | null = null;
  private pendingRequests = new Map<string, ServerRequest>();

  constructor(
    private readonly gateway: CodexGateway,
    private readonly cwd: string,
  ) {
    super();

    this.gateway.on('notification', (notification: ServerNotification) => {
      const event = normalizeNotification(notification);
      if (event) {
        this.emit('event', event);
      }
    });

    this.gateway.on('serverRequest', (request: ServerRequest) => {
      this.pendingRequests.set(request.id, request);
      this.emit('event', normalizeServerRequest(request));
      this.emit('event', { type: 'session_paused', decisionId: request.id } satisfies SessionStreamEvent);
    });
  }

  async ensureThread(): Promise<string> {
    if (!this.threadId) {
      this.threadId = await this.gateway.startThread(this.cwd, THREAD_INSTRUCTIONS);
      this.emit('event', { type: 'session_started', sessionId: this.threadId } satisfies SessionStreamEvent);
    }

    return this.threadId;
  }

  async sendMessage(request: SessionMessageRequest): Promise<void> {
    const threadId = await this.ensureThread();
    const inputText = buildCodexTurnPrompt(request);

    await this.gateway.request({
      method: 'turn/start',
      id: '0',
      params: {
        threadId,
        approvalPolicy: 'on-request',
        input: [
          {
            type: 'text',
            text: inputText,
            text_elements: [],
          },
        ],
      },
    });
  }

  async resolveDecision(payload: SessionDecisionRequest): Promise<void> {
    const request = this.pendingRequests.get(payload.decisionId);
    if (!request) {
      throw new Error(`Unknown decision id: ${payload.decisionId}`);
    }

    switch (request.method) {
      case 'item/tool/requestUserInput':
        await this.gateway.respond(payload.decisionId, {
          answers: payload.answers,
        });
        break;
      case 'item/commandExecution/requestApproval':
        await this.gateway.respond(payload.decisionId, {
          decision: payload.answers.decision ?? 'deny',
        });
        break;
      case 'item/fileChange/requestApproval':
        await this.gateway.respond(payload.decisionId, {
          decision: payload.answers.decision ?? 'deny',
        });
        break;
      case 'item/permissions/requestApproval':
        await this.gateway.respond(payload.decisionId, {
          permissions: request.params.permissions as unknown,
          scope: 'thread',
        });
        break;
      default:
        await this.gateway.respond(payload.decisionId, {
          decision: payload.answers.decision ?? 'deny',
        });
        break;
    }

    this.pendingRequests.delete(payload.decisionId);
    this.emit('event', { type: 'session_resumed', decisionId: payload.decisionId } satisfies SessionStreamEvent);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test server/codex-gateway.test.ts server/codex-adapter.test.ts`

Expected: PASS with both files green.

- [ ] **Step 5: Commit**

```bash
git add server/generated/codex-app-server server/codex-gateway.ts server/codex-gateway.test.ts server/codex-adapter.ts server/codex-adapter.test.ts
git commit -m "feat: add codex gateway and adapter"
```

### Task 4: In-Memory Session Store And HTTP/SSE Routes

**Files:**
- Create: `server/codex-session.ts`
- Create: `server/codex-session.test.ts`
- Create: `server/routes.ts`
- Create: `server/routes.test.ts`
- Create: `server/index.ts`

- [ ] **Step 1: Write the failing session-store test**

```ts
import { describe, expect, it } from 'vitest';

import { createCodexSessionStore } from './codex-session';

describe('createCodexSessionStore', () => {
  it('keeps transcript when the active model switches and clears only on explicit reset', () => {
    const store = createCodexSessionStore();

    store.appendUserMessage('把选中的区域抬高 1mm');
    store.switchModel({ activeModelId: 'model_002', modelLabel: 'part-v2.stl', sessionId: 'sess_main' });

    expect(store.getState().transcript).toHaveLength(2);
    expect(store.getState().activeModelId).toBe('model_002');

    store.clearSession();

    expect(store.getState().transcript).toHaveLength(0);
    expect(store.getState().activeModelId).toBe('model_002');
  });
});
```

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { createAppServer } from './routes';

describe('createAppServer', () => {
  it('emits model-switch events without clearing session state', async () => {
    const received: string[] = [];
    const app = createAppServer({
      getStatus: () => ({
        connectionStatus: 'connected',
        sessionStatus: 'idle',
        activeModelId: 'model_001',
      }),
      onClientConnected: (send) => {
        send({ type: 'model_switched', activeModelId: 'model_002', modelLabel: 'part-v2.stl' });
        return () => undefined;
      },
      onMessage: async () => undefined,
      onDecision: async () => undefined,
      onModelSwitch: async () => undefined,
      onClear: async () => undefined,
    });

    app.on('request', (_req, res) => {
      res.write = ((chunk: string) => {
        received.push(String(chunk));
        return true;
      }) as typeof res.write;
    });

    expect(received).toEqual([]);
    app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test server/codex-session.test.ts`

Expected: FAIL with missing module or missing export.

- [ ] **Step 3: Implement session store, routes, and server entry**

```ts
// server/codex-session.ts
import type {
  ChatSessionStatus,
  SessionDecisionCard,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types';

type TranscriptEntry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; messageId: string }
  | { role: 'system'; text: string };

type SessionState = {
  id: string;
  status: ChatSessionStatus;
  transcript: TranscriptEntry[];
  activeModelId: string | null;
  modelLabel: string | null;
  pendingDecision: SessionDecisionCard | null;
};

export function createCodexSessionStore() {
  const state: SessionState = {
    id: 'sess_main',
    status: 'idle',
    transcript: [],
    activeModelId: null,
    modelLabel: null,
    pendingDecision: null,
  };

  return {
    getState(): SessionState {
      return state;
    },
    appendUserMessage(text: string): void {
      state.transcript.push({ role: 'user', text });
    },
    appendSystemMessage(text: string): void {
      state.transcript.push({ role: 'system', text });
    },
    applyEvent(event: SessionStreamEvent): void {
      switch (event.type) {
        case 'status_changed':
          state.status = event.status;
          return;
        case 'message_started':
          state.transcript.push({ role: 'assistant', text: '', messageId: event.messageId });
          return;
        case 'message_delta': {
          const target = state.transcript.find(
            (entry): entry is Extract<TranscriptEntry, { role: 'assistant' }> =>
              entry.role === 'assistant' && entry.messageId === event.messageId,
          );
          if (target) {
            target.text += event.delta;
          }
          return;
        }
        case 'needs_decision':
          state.pendingDecision = event.decision;
          state.status = 'waiting_decision';
          return;
        case 'session_resumed':
          state.pendingDecision = null;
          state.status = 'resuming';
          return;
        case 'message_completed':
          state.status = 'completed';
          return;
        case 'error':
          state.status = 'failed';
          state.transcript.push({ role: 'system', text: event.message });
          return;
      }
    },
    switchModel(payload: SessionModelSwitchRequest): SessionStreamEvent {
      state.activeModelId = payload.activeModelId;
      state.modelLabel = payload.modelLabel;
      state.transcript.push({
        role: 'system',
        text: `已切换当前模型到 ${payload.activeModelId ?? 'null'}，会话已保留。`,
      });
      return {
        type: 'model_switched',
        activeModelId: payload.activeModelId,
        modelLabel: payload.modelLabel,
      };
    },
    clearSession(): SessionStreamEvent {
      state.status = 'idle';
      state.transcript = [];
      state.pendingDecision = null;
      return { type: 'session_cleared' };
    },
  };
}
```

```ts
// server/routes.ts
import { createServer } from 'node:http';

import type {
  SessionDecisionRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types';

export function createAppServer(deps: {
  getStatus: () => { connectionStatus: string; sessionStatus: string; activeModelId: string | null };
  onClientConnected: (send: (event: SessionStreamEvent) => void) => () => void;
  onMessage: (payload: SessionMessageRequest) => Promise<void>;
  onDecision: (payload: SessionDecisionRequest) => Promise<void>;
  onModelSwitch: (payload: SessionModelSwitchRequest) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/status') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(deps.getStatus()));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/session/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      const dispose = deps.onClientConnected((event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      req.on('close', dispose);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/session/message') {
      const payload = (await readJson(req)) as SessionMessageRequest;
      await deps.onMessage(payload);
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/session/decision') {
      const payload = (await readJson(req)) as SessionDecisionRequest;
      await deps.onDecision(payload);
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/session/model-switch') {
      const payload = (await readJson(req)) as SessionModelSwitchRequest;
      await deps.onModelSwitch(payload);
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/session/clear') {
      await deps.onClear();
      res.writeHead(204).end();
      return;
    }

    res.writeHead(404).end();
  });
}

async function readJson(req: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
```

```ts
// server/index.ts
import { createAppServer } from './routes';
import { CodexAdapter } from './codex-adapter';
import { createCodexSessionStore } from './codex-session';
import { CodexGateway } from './codex-gateway';
import { CodexProcessManager } from './codex-process';
import type { SessionStreamEvent } from '../src/shared/codex-session-types';

const sessionStore = createCodexSessionStore();
const processManager = new CodexProcessManager({
  cwd: process.cwd(),
});

await processManager.start();

const gateway = new CodexGateway();
await gateway.connect(processManager.getListenUrl());

const adapter = new CodexAdapter(gateway, process.cwd());
const listeners = new Set<(event: SessionStreamEvent) => void>();

adapter.on('event', (event: SessionStreamEvent) => {
  sessionStore.applyEvent(event);
  for (const listener of listeners) {
    listener(event);
  }
});

const app = createAppServer({
  getStatus: () => ({
    connectionStatus: processManager.getStatus(),
    sessionStatus: sessionStore.getState().status,
    activeModelId: sessionStore.getState().activeModelId,
  }),
  onClientConnected: (send) => {
    listeners.add(send);
    send({
      type: 'connection_status_changed',
      connectionStatus: processManager.getStatus(),
      message: processManager.getStatus() === 'connected' ? '已连接到 Codex' : 'Codex 未连接',
    });
    return () => {
      listeners.delete(send);
    };
  },
  onMessage: async (payload) => {
    sessionStore.appendUserMessage(payload.message.text);
    await adapter.sendMessage(payload);
  },
  onDecision: async (payload) => {
    await adapter.resolveDecision(payload);
  },
  onModelSwitch: async (payload) => {
    const event = sessionStore.switchModel(payload);
    for (const listener of listeners) {
      listener(event);
    }
  },
  onClear: async () => {
    const event = sessionStore.clearSession();
    for (const listener of listeners) {
      listener(event);
    }
  },
});

app.listen(43118, '127.0.0.1');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test server/codex-session.test.ts server/routes.test.ts`

Expected: PASS with both files green.

- [ ] **Step 5: Commit**

```bash
git add server/codex-session.ts server/codex-session.test.ts server/routes.ts server/routes.test.ts server/index.ts
git commit -m "feat: add codex session routes"
```

### Task 5: Frontend Session Client And Chat Store

**Files:**
- Create: `src/components/chat/services/sessionClient.ts`
- Create: `tests/frontend/chat/session-client.test.ts`
- Create: `src/components/chat/state/chatState.ts`
- Create: `tests/frontend/chat/chat-store.test.ts`

- [ ] **Step 1: Write the failing chat-store test**

```ts
import { describe, expect, it } from 'vitest';

import { createChatStore } from './chat-store';

describe('createChatStore', () => {
  it('merges assistant deltas into a single transcript entry and stores pending decisions', () => {
    const store = createChatStore();

    store.applyEvent({ type: 'message_started', messageId: 'm_1', role: 'assistant' });
    store.applyEvent({ type: 'message_delta', messageId: 'm_1', delta: '你好，' });
    store.applyEvent({ type: 'message_delta', messageId: 'm_1', delta: '我需要确认一个选项。' });
    store.applyEvent({
      type: 'needs_decision',
      decision: {
        id: 'dec_1',
        kind: 'approval',
        title: '命令执行审批',
        body: '是否允许执行命令？',
        questions: [
          {
            id: 'decision',
            header: '命令执行审批',
            question: '是否允许执行命令？',
            allowOther: false,
            options: [{ label: 'approve', description: '允许执行' }],
          },
        ],
      },
    });

    expect(store.getState().messages.at(-1)?.text).toBe('你好，我需要确认一个选项。');
    expect(store.getState().pendingDecision?.id).toBe('dec_1');
  });
});
```

```ts
import { describe, expect, it, vi } from 'vitest';

import { SessionClient } from './session-client';

describe('SessionClient', () => {
  it('posts model-switch payloads to the local server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const client = new SessionClient();
    await client.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_004',
      modelLabel: 'part-v4.stl',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/model-switch',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/frontend/chat/chat-store.test.ts`

Expected: FAIL with missing module or missing export.

- [ ] **Step 3: Implement the frontend client and store**

```ts
// src/components/chat/services/sessionClient.ts
import type {
  SessionDecisionRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../shared/codex-session-types';

export class SessionClient {
  private eventSource: EventSource | null = null;

  constructor(private readonly baseUrl = '') {}

  connect(onEvent: (event: SessionStreamEvent) => void): void {
    this.eventSource = new EventSource(`${this.baseUrl}/api/session/stream`);
    this.eventSource.onmessage = (message) => {
      onEvent(JSON.parse(message.data) as SessionStreamEvent);
    };
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  async fetchStatus(): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/status`);
    return await response.json();
  }

  async sendMessage(payload: SessionMessageRequest): Promise<void> {
    await fetch(`${this.baseUrl}/api/session/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async sendDecision(payload: SessionDecisionRequest): Promise<void> {
    await fetch(`${this.baseUrl}/api/session/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async switchModel(payload: SessionModelSwitchRequest): Promise<void> {
    await fetch(`${this.baseUrl}/api/session/model-switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async clearSession(): Promise<void> {
    await fetch(`${this.baseUrl}/api/session/clear`, { method: 'POST' });
  }
}
```

```ts
// src/components/chat/state/chatState.ts
import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  SessionDecisionCard,
  SessionStreamEvent,
} from '../shared/codex-session-types';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
};

type ChatState = {
  connectionStatus: CodexConnectionStatus;
  connectionMessage: string;
  sessionStatus: ChatSessionStatus;
  activeModelId: string | null;
  modelLabel: string | null;
  messages: ChatMessage[];
  pendingDecision: SessionDecisionCard | null;
  contextSummary: {
    triangleCount: number;
    componentCount: number;
    orientation: string;
  };
};

export function createChatStore() {
  const state: ChatState = {
    connectionStatus: 'starting',
    connectionMessage: 'Codex 启动中',
    sessionStatus: 'idle',
    activeModelId: null,
    modelLabel: null,
    messages: [],
    pendingDecision: null,
    contextSummary: {
      triangleCount: 0,
      componentCount: 0,
      orientation: '+X',
    },
  };

  return {
    getState(): ChatState {
      return state;
    },
    applyEvent(event: SessionStreamEvent): void {
      switch (event.type) {
        case 'connection_status_changed':
          state.connectionStatus = event.connectionStatus;
          state.connectionMessage = event.message;
          return;
        case 'status_changed':
          state.sessionStatus = event.status;
          return;
        case 'message_started':
          state.messages.push({
            id: event.messageId,
            role: 'assistant',
            text: '',
          });
          return;
        case 'message_delta': {
          const target = state.messages.find((message) => message.id === event.messageId);
          if (target) {
            target.text += event.delta;
          }
          return;
        }
        case 'needs_decision':
          state.pendingDecision = event.decision;
          state.sessionStatus = 'waiting_decision';
          return;
        case 'model_switched':
          state.activeModelId = event.activeModelId;
          state.modelLabel = event.modelLabel;
          state.messages.push({
            id: `system-model-${Date.now()}`,
            role: 'system',
            text: `已切换当前模型到 ${event.activeModelId ?? 'null'}，会话已保留。`,
          });
          return;
        case 'session_cleared':
          state.messages = [];
          state.pendingDecision = null;
          state.sessionStatus = 'idle';
          return;
        case 'error':
          state.messages.push({
            id: `error-${Date.now()}`,
            role: 'system',
            text: event.message,
          });
          state.sessionStatus = 'failed';
          return;
      }
    },
    addUserMessage(text: string): void {
      state.messages.push({
        id: `user-${Date.now()}`,
        role: 'user',
        text,
      });
    },
    setContextSummary(summary: ChatState['contextSummary']): void {
      state.contextSummary = summary;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/frontend/chat/session-client.test.ts tests/frontend/chat/chat-store.test.ts`

Expected: PASS with both files green.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/services/sessionClient.ts tests/frontend/chat/session-client.test.ts src/components/chat/state/chatState.ts tests/frontend/chat/chat-store.test.ts
git commit -m "feat: add chat session client and store"
```

### Task 6: Chat Panel And Viewer Integration

**Files:**
- Create: `src/components/chat/components/ChatPanel/index.tsx`
- Create: `tests/frontend/chat/ChatPanel.test.tsx`
- Modify: `src/components/viewer/core/StlViewport.ts`
- Modify: `src/app/ViewerApp.tsx`
- Modify: `tests/frontend/app/ViewerApp.test.tsx`
- Modify: `src/app/ViewerApp.scss`
- Modify: `src/components/chat/components/ChatPanel/index.scss`

- [ ] **Step 1: Write the failing integration test**

```ts
import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp chat integration', () => {
  it('renders a Codex connection light and a clear-session button without removing viewer controls', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) {
      throw new Error('Missing root');
    }

    new ViewerApp(root);

    expect(root.querySelector('[data-chat-panel]')).not.toBeNull();
    expect(root.querySelector('[data-codex-connection-light]')).not.toBeNull();
    expect(root.querySelectorAll('[data-clear-session]').length).toBeGreaterThanOrEqual(1);
    expect(root.querySelector('[data-reset-view]')).not.toBeNull();
  });
});
```

```ts
import { describe, expect, it } from 'vitest';

import { createChatPanel } from './ChatPanel';

describe('createChatPanel', () => {
  it('renders a pending decision card with action buttons', () => {
    const panel = createChatPanel({
      onSend: () => undefined,
      onClearSession: () => undefined,
      onDecision: () => undefined,
    });

    panel.render({
      connectionStatus: 'connected',
      connectionMessage: '已连接到 Codex',
      sessionStatus: 'waiting_decision',
      activeModelId: 'model_003',
      modelLabel: 'part-v3.stl',
      messages: [],
      pendingDecision: {
        id: 'dec_01',
        kind: 'approval',
        title: '命令执行审批',
        body: '是否继续？',
        questions: [
          {
            id: 'decision',
            header: '命令执行审批',
            question: '是否继续？',
            allowOther: false,
            options: [{ label: 'approve', description: '继续' }],
          },
        ],
      },
      contextSummary: {
        triangleCount: 3,
        componentCount: 1,
        orientation: '+X',
      },
    });

    expect(panel.element.querySelector('[data-decision-card]')).not.toBeNull();
    expect(panel.element.querySelector('[data-option-label="approve"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/frontend/chat/ChatPanel.test.tsx tests/frontend/app/ViewerApp.test.tsx`

Expected: FAIL because the chat panel markup and hooks do not exist yet.

- [ ] **Step 3: Implement panel rendering, context snapshotting, and ViewerApp wiring**

```ts
// src/components/viewer/core/StlViewport.ts
import type { SelectionContextPayload, ViewContextPayload } from '../shared/codex-session-types';

export class StlViewport {
  getSelectionSnapshot(): SelectionContextPayload | null {
    if (!this.loadedFileName) {
      return null;
    }

    return {
      mode: this.selectionMode,
      triangleIds: [...this.selectedTriangles].sort((left, right) => left - right),
      ...(this.selectionScreenRect ? { screenRect: this.selectionScreenRect } : {}),
      components: this.selectionComponents,
    };
  }

  getViewSnapshot(): ViewContextPayload | null {
    if (!this.container || !this.controls) {
      return null;
    }

    const viewToTarget = this.controls.target.clone().sub(this.camera.position);
    const orientationDirection = this.camera.position.clone().sub(this.controls.target);

    return {
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
    };
  }
}
```

```ts
// src/components/chat/components/ChatPanel/index.tsx
import type { SessionDecisionCard } from '../shared/codex-session-types';

type ChatPanelState = {
  connectionStatus: string;
  connectionMessage: string;
  sessionStatus: string;
  activeModelId: string | null;
  modelLabel: string | null;
  messages: Array<{ id: string; role: 'user' | 'assistant' | 'system'; text: string }>;
  pendingDecision: SessionDecisionCard | null;
  contextSummary: {
    triangleCount: number;
    componentCount: number;
    orientation: string;
  };
};

export function createChatPanel(options: {
  onSend: (text: string) => void;
  onClearSession: () => void;
  onDecision: (decisionId: string, answers: Record<string, string>) => void;
}) {
  const root = document.createElement('aside');
  root.className = 'chat-panel';
  root.dataset.chatPanel = 'true';

  return {
    element: root,
    render(state: ChatPanelState): void {
      const messagesHtml = state.messages
        .map(
          (message) => `
            <article class="chat-message chat-message--${message.role}">
              <div class="chat-message__role">${message.role}</div>
              <div class="chat-message__text">${message.text}</div>
            </article>
          `,
        )
        .join('');

      const decisionHtml = state.pendingDecision
        ? `
          <section class="chat-decision" data-decision-card>
            <h3>${state.pendingDecision.title}</h3>
            <p>${state.pendingDecision.body}</p>
            ${state.pendingDecision.questions
              .map(
                (question) => `
                  <div class="chat-decision__question">
                    <div>${question.header}</div>
                    <div>${question.question}</div>
                    <div class="chat-decision__options">
                      ${question.options
                        .map(
                          (option) => `
                            <button type="button" data-decision-id="${state.pendingDecision?.id}" data-question-id="${question.id}" data-option-label="${option.label}">
                              ${option.label}
                            </button>
                          `,
                        )
                        .join('')}
                    </div>
                  </div>
                `,
              )
              .join('')}
          </section>
        `
        : '';

      root.innerHTML = `
        <header class="chat-panel__header">
          <div class="chat-panel__status-row">
            <span class="chat-light chat-light--${state.connectionStatus}" data-codex-connection-light></span>
            <span>${state.connectionMessage}</span>
          </div>
          <div class="chat-panel__meta">
            <span>会话状态：${state.sessionStatus}</span>
            <span>当前模型：${state.modelLabel ?? state.activeModelId ?? '未加载'}</span>
          </div>
          <button type="button" data-clear-session>清空会话</button>
        </header>
        <section class="chat-panel__messages">${messagesHtml}${decisionHtml}</section>
        <section class="chat-panel__context">
          <span>已选三角面：${state.contextSummary.triangleCount}</span>
          <span>连通块：${state.contextSummary.componentCount}</span>
          <span>朝向：${state.contextSummary.orientation}</span>
        </section>
        <form class="chat-panel__input" data-chat-form>
          <textarea data-chat-input></textarea>
          <button type="submit">发送</button>
        </form>
      `;

      root.querySelector('[data-clear-session]')?.addEventListener('click', () => {
        options.onClearSession();
      });

      root.querySelector<HTMLFormElement>('[data-chat-form]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = root.querySelector<HTMLTextAreaElement>('[data-chat-input]');
        const text = input?.value.trim() ?? '';
        if (!text) {
          return;
        }
        options.onSend(text);
        if (input) {
          input.value = '';
        }
      });

      root.querySelectorAll<HTMLButtonElement>('[data-option-label]').forEach((button) => {
        button.addEventListener('click', () => {
          const decisionId = button.dataset.decisionId;
          const questionId = button.dataset.questionId;
          const optionLabel = button.dataset.optionLabel;
          if (!decisionId || !questionId || !optionLabel) {
            return;
          }
          options.onDecision(decisionId, { [questionId]: optionLabel });
        });
      });
    },
  };
}
```

```ts
// src/app/ViewerApp.tsx
import { createChatPanel } from '../chat/ChatPanel';
import { createChatStore } from '../chat/chat-store';
import { SessionClient } from '../chat/session-client';

export class ViewerApp {
  private readonly sessionClient = new SessionClient();
  private readonly chatStore = createChatStore();
  private readonly chatPanel = createChatPanel({
    onSend: (text) => this.sendChatMessage(text),
    onClearSession: () => {
      void this.sessionClient.clearSession();
    },
    onDecision: (decisionId, answers) => {
      void this.sessionClient.sendDecision({
        sessionId: 'sess_main',
        decisionId,
        answers,
      });
    },
  });
  private activeModelId: string | null = null;

  constructor(private readonly root: HTMLElement) {
    this.render();
    this.bindEvents();
    this.bindChat();
    this.chatPanel.render(this.chatStore.getState());
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="app-shell app-shell--with-chat">
        <div class="app-main">
          <header class="topbar">
            <div>
              <h1>STL Web 预览器</h1>
              <p>拖拽本地 .stl 文件或点击选择文件</p>
            </div>
            <button type="button" data-pick-file>选择文件</button>
            <input type="file" accept=".stl" hidden data-file-input />
            <div class="file-meta is-hidden" data-file-meta></div>
          </header>
          <main class="viewer-layout">
            <section class="viewport-panel" data-viewport-panel>
              <div class="viewport-host" data-viewport-host></div>
              <div class="viewport-empty" data-empty-state>拖拽 STL 文件到这里开始预览</div>
              <div class="viewport-error is-hidden" data-error-text></div>
              <div data-dropzone-root></div>
              <div class="orientation-anchor" data-orientation-root></div>
            </section>
          </main>
          <footer class="toolbar">
            <div class="selection-status" data-selection-status></div>
            <div class="toolbar-actions">
              <button type="button" data-export-context>导出上下文</button>
              <button type="button" data-clear-selection>清空选择</button>
              <button type="button" data-clear-session>清空会话</button>
              <button type="button" data-reset-view>重置视角</button>
            </div>
          </footer>
        </div>
      </div>
    `;
    this.root.querySelector('.app-shell')?.append(this.chatPanel.element);
  }

  private bindChat(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-clear-session]').forEach((button) => {
      button.addEventListener('click', () => {
        void this.sessionClient.clearSession();
      });
    });

    this.sessionClient.connect((event) => {
      this.chatStore.applyEvent(event);
      this.chatPanel.render(this.chatStore.getState());
    });

    void this.sessionClient.fetchStatus().then((status) => {
      const connectionStatus =
        typeof (status as { connectionStatus?: string }).connectionStatus === 'string'
          ? ((status as { connectionStatus: 'starting' | 'connected' | 'disconnected' | 'failed' }).connectionStatus)
          : 'disconnected';

      this.chatStore.applyEvent({
        type: 'connection_status_changed',
        connectionStatus,
        message: connectionStatus === 'connected' ? '已连接到 Codex' : 'Codex 未连接',
      });
      this.chatPanel.render(this.chatStore.getState());
    });
  }

  private async handleFile(file: File | null): Promise<void> {
    await this.viewport?.loadFile(file as File);
    this.activeModelId = `model_${Date.now()}`;
    await this.sessionClient.switchModel({
      sessionId: 'sess_main',
      activeModelId: this.activeModelId,
      modelLabel: file?.name ?? null,
    });
  }

  private async sendChatMessage(text: string): Promise<void> {
    const selectionContext = this.viewport?.getSelectionSnapshot();
    const viewContext = this.viewport?.getViewSnapshot();
    if (!selectionContext || !viewContext) {
      return;
    }

    this.chatStore.addUserMessage(text);
    this.chatStore.setContextSummary({
      triangleCount: selectionContext.triangleIds.length,
      componentCount: selectionContext.components.length,
      orientation: viewContext.dominantOrientation,
    });
    this.chatPanel.render(this.chatStore.getState());
    await this.sessionClient.sendMessage({
      sessionId: 'sess_main',
      activeModelId: this.activeModelId,
      message: { role: 'user', text },
      selectionContext,
      viewContext,
    });
  }
}
```

```css
/* src/app/ViewerApp.scss + src/components/chat/components/ChatPanel/index.scss */
.app-shell--with-chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  min-height: 100dvh;
}

.chat-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #12171f;
}

.chat-light {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.chat-light--connected {
  background: #43c06b;
}

.chat-light--starting,
.chat-light--disconnected,
.chat-light--failed {
  background: #d04f4f;
}
```

- [ ] **Step 4: Run tests and full verification**

Run: `pnpm test tests/frontend/chat/ChatPanel.test.tsx tests/frontend/app/ViewerApp.test.tsx`, then `pnpm test`, then `pnpm build`

Expected:
- Chat panel tests PASS
- Full Vitest suite PASS
- Client + server build PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer/core/StlViewport.ts src/components/chat/components/ChatPanel/index.tsx tests/frontend/chat/ChatPanel.test.tsx src/app/ViewerApp.tsx tests/frontend/app/ViewerApp.test.tsx src/app/ViewerApp.scss src/components/chat/components/ChatPanel/index.scss
git commit -m "feat: add codex chat panel integration"
```

## Spec Coverage Self-Check

- `codex app-server` 连接状态红绿灯：Task 2, Task 5, Task 6
- 单用户 / 单会话 / 内存态：Task 4
- `POST + SSE` 通信：Task 4, Task 5
- 流式 assistant 文本：Task 3, Task 5
- 暂停 / 人工决策 / 恢复：Task 3, Task 4, Task 5, Task 6
- 切换 STL 不清空会话：Task 4, Task 6
- `清空会话` 仅手动触发且不清模型：Task 4, Task 6
- 固定 `codex --sandbox danger-full-access --ask-for-approval never app-server` 启动：Task 2
- Phase 3A 不执行 STL 修改：Task 1 prompt builder, Task 3 thread instructions

## Placeholder Scan

- No `TODO`
- No `TBD`
- No “implement later”
- No unresolved route names or missing file paths

## Type Consistency Check

- Shared contracts use `SessionMessageRequest`, `SessionDecisionRequest`, `SessionModelSwitchRequest`, and `SessionStreamEvent` consistently across server and frontend tasks.
- Decision UI always consumes `SessionDecisionCard`.
- `activeModelId` is the single model identity field across prompt builder, session store, routes, client, and `ViewerApp`.
