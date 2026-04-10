import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  RequestId,
  ServerNotification,
  ServerRequest,
  ThreadStartParams,
  ThreadStartResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from './codex-app-server-protocol.js';

type GatewayHandlers = {
  onConnectionStatusChange: (status: 'starting' | 'connected' | 'disconnected' | 'failed', message: string) => void;
  onNotification: (notification: ServerNotification) => void;
  onServerRequest: (request: ServerRequest) => void;
};

type GatewaySpy = {
  wsUrl: string;
  handlers: GatewayHandlers;
  startThreadCalls: ThreadStartParams[];
  startTurnCalls: TurnStartParams[];
  steerTurnCalls: TurnSteerParams[];
  interruptTurnCalls: TurnInterruptParams[];
  respondCalls: Array<{ requestId: RequestId; result: unknown }>;
  whenReady(): Promise<void>;
  start(): void;
  stop(): void;
  startThread(params: ThreadStartParams): Promise<ThreadStartResponse>;
  startTurn(params: TurnStartParams): Promise<TurnStartResponse>;
  steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse>;
  interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse>;
  respondToServerRequest(requestId: RequestId, result: unknown): Promise<void>;
};

type ProcessSpy = {
  listenUrl: string;
  on(eventName: 'process', listener: (event: unknown) => void): void;
  start(): void;
  stop(): void;
  isStopping(): boolean;
};

const mockState = vi.hoisted(() => ({
  gateways: [] as GatewaySpy[],
  processes: [] as ProcessSpy[],
}));

vi.mock('./codex-gateway.js', () => {
  class FakeCodexGateway {
    public readonly startThreadCalls: ThreadStartParams[] = [];
    public readonly startTurnCalls: TurnStartParams[] = [];
    public readonly steerTurnCalls: TurnSteerParams[] = [];
    public readonly interruptTurnCalls: TurnInterruptParams[] = [];
    public readonly respondCalls: Array<{ requestId: RequestId; result: unknown }> = [];

    public constructor(
      public readonly wsUrl: string,
      public readonly handlers: GatewayHandlers,
    ) {
      mockState.gateways.push(this as unknown as GatewaySpy);
    }

    public get status(): 'starting' | 'connected' | 'disconnected' | 'failed' {
      return 'connected';
    }

    public start(): void {}

    public stop(): void {}

    public async whenReady(): Promise<void> {}

    public async startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
      this.startThreadCalls.push(params);
      return {
        thread: {
          id: 'thread_1',
        },
      };
    }

    public async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
      this.startTurnCalls.push(params);
      return {
        turn: {
          id: 'turn_1',
          status: 'completed',
        },
      };
    }

    public async steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse> {
      this.steerTurnCalls.push(params);
      return {
        turnId: 'turn_1',
      };
    }

    public async interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
      this.interruptTurnCalls.push(params);
      return {};
    }

    public async respondToServerRequest(requestId: RequestId, result: unknown): Promise<void> {
      this.respondCalls.push({
        requestId,
        result,
      });
    }
  }

  return {
    CodexGateway: FakeCodexGateway,
  };
});

vi.mock('./codex-process.js', () => {
  class FakeCodexProcessManager {
    public readonly listenUrl: string;
    private stopping = false;
    private readonly listeners = new Set<(event: unknown) => void>();

    public constructor(options: { listenPort: number }) {
      this.listenUrl = `ws://127.0.0.1:${options.listenPort}`;
      mockState.processes.push(this as unknown as ProcessSpy);
    }

    public on(eventName: 'process', listener: (event: unknown) => void): void {
      if (eventName === 'process') {
        this.listeners.add(listener);
      }
    }

    public start(): void {}

    public stop(): void {
      this.stopping = true;
    }

    public isStopping(): boolean {
      return this.stopping;
    }
  }

  return {
    CodexProcessManager: FakeCodexProcessManager,
  };
});

import { CodexSessionController } from './codex-session.js';

describe('CodexSessionController', () => {
  beforeEach(() => {
    mockState.gateways.length = 0;
    mockState.processes.length = 0;
  });

  afterEach(() => {
    mockState.gateways.length = 0;
    mockState.processes.length = 0;
  });

  it('creates an edit job on submitMessage without emitting generation events before output exists', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });
    const events: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await controller.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
    });
    events.length = 0;

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'raise the selected patch by 2mm',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1280, 720],
      },
    });

    const gateway = mockState.gateways[0];
    expect(gateway.startThreadCalls).toHaveLength(1);
    expect(gateway.startTurnCalls).toHaveLength(1);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_started',
        }),
      ]),
    );
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain('editJob.jobId: job_001');
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain(
      `editJob.outputModelPath: ${join(rootDir, 'artifacts', 'models', 'model_002_from_model_001.stl')}`,
    );
  });

  it('emits model_generated when the generated STL exists after turn completion', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });
    const events: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await controller.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
    });
    events.length = 0;

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'raise the selected patch by 2mm',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1280, 720],
      },
    });

    const outputPath = join(rootDir, 'artifacts', 'models', 'model_002_from_model_001.stl');
    await writeFile(outputPath, 'solid demo\nendsolid demo\n', 'utf8');

    await (controller as unknown as {
      handleNotification(notification: ServerNotification): Promise<void>;
    }).handleNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
          status: 'completed',
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generated',
          jobId: 'job_001',
          baseModelId: 'model_001',
          newModelId: 'model_002',
          modelLabel: 'part-edited.stl',
        }),
      ]),
    );
  });

  it('advances snapshot and replay to the generated model after successful completion', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });

    await controller.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
    });

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'raise the selected patch by 2mm',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1280, 720],
      },
    });

    const outputPath = join(rootDir, 'artifacts', 'models', 'model_002_from_model_001.stl');
    await writeFile(outputPath, 'solid demo\nfacet normal 0 0 1\nendsolid demo\n', 'utf8');

    await (controller as unknown as {
      handleNotification(notification: ServerNotification): Promise<void>;
    }).handleNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
          status: 'completed',
        },
      },
    });

    expect(controller.getSnapshot()).toMatchObject({
      activeModelId: 'model_002',
      modelLabel: 'part-edited.stl',
    });

    const replayedEvents: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      replayedEvents.push(event as Record<string, unknown>);
    });

    expect(replayedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_switched',
          activeModelId: 'model_002',
          modelLabel: 'part-edited.stl',
        }),
      ]),
    );
  });

  it('treats a completed turn with no edit artifacts as a normal dialogue turn', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });
    const events: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await controller.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
    });
    events.length = 0;

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'raise the selected patch by 2mm',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1280, 720],
      },
    });

    await (controller as unknown as {
      handleNotification(notification: ServerNotification): Promise<void>;
    }).handleNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
          status: 'completed',
        },
      },
    });

    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_failed',
        }),
        expect.objectContaining({
          type: 'model_generated',
        }),
      ]),
    );
  });

  it('emits model_generation_failed when Codex attempted generation but no STL was produced', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });
    const events: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await controller.switchModel({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      modelLabel: 'part.stl',
    });
    events.length = 0;

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'raise the selected patch by 2mm',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [1, 2, 3],
        components: [],
      },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [1280, 720],
      },
    });

    const workspacePath = join(rootDir, 'artifacts', 'jobs', 'job_001');
    await writeFile(join(workspacePath, 'edit.py'), 'print("attempted")\n', 'utf8');

    await (controller as unknown as {
      handleNotification(notification: ServerNotification): Promise<void>;
    }).handleNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
          status: 'completed',
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_failed',
          jobId: 'job_001',
          baseModelId: 'model_001',
          message: expect.stringContaining('Generated STL not found'),
        }),
      ]),
    );
  });

  it('surfaces assistant text when the final agent message arrives only on item completion', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
    });
    const events: Array<Record<string, unknown>> = [];
    controller.subscribe((event) => {
      events.push(event as Record<string, unknown>);
    });

    await (controller as unknown as {
      handleNotification(notification: ServerNotification): Promise<void>;
    }).handleNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread_1',
        item: {
          id: 'msg_1',
          type: 'agentMessage',
          text: 'Final assistant reply',
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message_delta',
          messageId: 'msg_1',
          delta: 'Final assistant reply',
          replace: true,
        }),
        expect.objectContaining({
          type: 'message_completed',
          messageId: 'msg_1',
        }),
      ]),
    );
  });
});
