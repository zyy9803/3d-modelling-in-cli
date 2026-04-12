import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
  PermissionsRequestApprovalParams,
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
} from '../../codex-runtime/protocol/codex-app-server-protocol.js';

type GatewayHandlers = {
  onConnectionStatusChange: (
    status: 'starting' | 'connected' | 'disconnected' | 'failed',
    message: string,
  ) => void;
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

vi.mock('../../codex-runtime/infrastructure/codex-gateway.js', () => {
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

    public async startThread(
      params: ThreadStartParams,
    ): Promise<ThreadStartResponse> {
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

    public async interruptTurn(
      params: TurnInterruptParams,
    ): Promise<TurnInterruptResponse> {
      this.interruptTurnCalls.push(params);
      return {};
    }

    public async respondToServerRequest(
      requestId: RequestId,
      result: unknown,
    ): Promise<void> {
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

vi.mock('../../codex-runtime/infrastructure/codex-process.js', () => {
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

import { CodexSessionController } from './session-service.js';

describe('CodexSessionController', () => {
  beforeEach(() => {
    mockState.gateways.length = 0;
    mockState.processes.length = 0;
  });

  afterEach(() => {
    mockState.gateways.length = 0;
    mockState.processes.length = 0;
  });

  it('creates a draft job on submitMessage and sends draft-only prompt context', async () => {
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
    expect(gateway.startThreadCalls[0]?.developerInstructions).toContain(
      'first read context.json and inspect the active STL from baseModelPath so you have a global understanding of the mesh before discussing or drafting modifications',
    );
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_started',
        }),
      ]),
    );
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain(
      'editJob.jobId: job_001',
    );
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain(
      `editJob.scriptPath: ${join(
        rootDir,
        'artifacts',
        'jobs',
        'job_001',
        'edit.py',
      )}`,
    );
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain(
      'You must first inspect and globally parse the active STL',
    );
    expect(String(gateway.startTurnCalls[0].input[0].text)).toContain(
      'read editJob.contextPath and inspect editJob.baseModelPath directly before making geometry claims or proposing edits.',
    );
  });

  it('emits draft_state_changed ready when edit.py exists after turn completion', async () => {
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
    await writeFile(join(workspacePath, 'edit.py'), 'print("draft ready")\n', 'utf8');

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
          type: 'draft_state_changed',
          draft: expect.objectContaining({
            status: 'ready',
            jobId: 'job_001',
            baseModelId: 'model_001',
          }),
        }),
      ]),
    );
  });

  it('keeps draft state empty for normal dialogue turns with no draft script', async () => {
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
        text: 'let us discuss options first',
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

    expect(controller.getSnapshot().draft).toEqual({
      status: 'empty',
      jobId: null,
      baseModelId: null,
      scriptPath: null,
      message: null,
    });
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generated',
        }),
      ]),
    );
  });

  it('runs generation only when explicitly requested after a ready draft exists', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const draftRunner = vi.fn(async () => {
      const outputPath = join(
        rootDir,
        'artifacts',
        'models',
        'model_002_from_model_001.stl',
      );
      await writeFile(outputPath, 'solid demo\nendsolid demo\n', 'utf8');
    });
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
      draftRunner,
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

    await writeFile(
      join(rootDir, 'artifacts', 'jobs', 'job_001', 'edit.py'),
      'print("draft")\n',
      'utf8',
    );

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

    events.length = 0;
    await controller.generateModel({
      sessionId: 'sess_main',
    });

    expect(draftRunner).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_started',
          jobId: 'job_001',
          baseModelId: 'model_001',
        }),
        expect.objectContaining({
          type: 'model_generated',
          newModelId: 'model_002',
          modelLabel: 'model_002_from_model_001.stl',
          modelPath: join(
            rootDir,
            'artifacts',
            'models',
            'model_002_from_model_001.stl',
          ),
        }),
        expect.objectContaining({
          type: 'draft_state_changed',
          draft: expect.objectContaining({
            status: 'executed',
            jobId: 'job_001',
          }),
        }),
      ]),
    );

    expect(controller.getSnapshot()).toMatchObject({
      activeModelId: 'model_002',
      modelLabel: 'model_002_from_model_001.stl',
      draft: expect.objectContaining({
        status: 'executed',
      }),
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
          modelLabel: 'model_002_from_model_001.stl',
        }),
        expect.objectContaining({
          type: 'draft_state_changed',
          draft: expect.objectContaining({
            status: 'executed',
          }),
        }),
      ]),
    );
  });

  it('emits model_generation_failed when the explicit execution does not produce a valid STL', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'codex-session-'));
    const controller = new CodexSessionController({
      rootDir,
      appServerPort: 4179,
      sessionId: 'sess_main',
      draftRunner: vi.fn(async () => {}),
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

    await writeFile(
      join(rootDir, 'artifacts', 'jobs', 'job_001', 'edit.py'),
      'print("draft")\n',
      'utf8',
    );

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

    events.length = 0;
    await controller.generateModel({
      sessionId: 'sess_main',
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generation_failed',
          jobId: 'job_001',
          baseModelId: 'model_001',
          message: expect.stringContaining('Generated STL not found'),
        }),
        expect.objectContaining({
          type: 'draft_state_changed',
          draft: expect.objectContaining({
            status: 'failed',
          }),
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

  it('passes positional input/output arguments to draft scripts during model generation', async () => {
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

    await writeFile(
      join(rootDir, 'artifacts', 'models', 'model_001_original.stl'),
      'solid demo\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid demo\n',
      'utf8',
    );

    await controller.submitMessage({
      sessionId: 'sess_main',
      activeModelId: 'model_001',
      message: {
        role: 'user',
        text: 'prepare a mesh edit draft',
      },
      selectionContext: {
        mode: 'click',
        triangleIds: [],
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

    await writeFile(
      join(rootDir, 'artifacts', 'jobs', 'job_001', 'edit.py'),
      [
        'import argparse',
        'import shutil',
        '',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("input")',
        'parser.add_argument("output")',
        'args = parser.parse_args()',
        'shutil.copyfile(args.input, args.output)',
        '',
      ].join('\n'),
      'utf8',
    );

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

    events.length = 0;
    await controller.generateModel({
      sessionId: 'sess_main',
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'model_generated',
          newModelId: 'model_002',
        }),
      ]),
    );
  });

  it('auto-accepts command execution approvals without surfacing a decision card', async () => {
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

    const request: ServerRequest = {
      method: 'item/commandExecution/requestApproval',
      id: 'req_cmd_1',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'cmd_1',
        command: 'python inspect.py',
        cwd: rootDir,
        availableDecisions: ['accept', 'acceptForSession', 'decline'],
      } satisfies CommandExecutionRequestApprovalParams,
    };

    await (controller as unknown as {
      handleServerRequest(request: ServerRequest): Promise<void>;
    }).handleServerRequest(request);

    const gateway = mockState.gateways[0];
    expect(gateway.respondCalls).toEqual([
      {
        requestId: 'req_cmd_1',
        result: {
          decision: 'acceptForSession',
        },
      },
    ]);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'needs_decision' }),
        expect.objectContaining({ type: 'session_paused' }),
      ]),
    );
  });

  it('auto-accepts file change approvals without surfacing a decision card', async () => {
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

    const request: ServerRequest = {
      method: 'item/fileChange/requestApproval',
      id: 'req_file_1',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'file_1',
        grantRoot: rootDir,
      } satisfies FileChangeRequestApprovalParams,
    };

    await (controller as unknown as {
      handleServerRequest(request: ServerRequest): Promise<void>;
    }).handleServerRequest(request);

    const gateway = mockState.gateways[0];
    expect(gateway.respondCalls).toEqual([
      {
        requestId: 'req_file_1',
        result: {
          decision: 'acceptForSession',
        },
      },
    ]);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'needs_decision' }),
        expect.objectContaining({ type: 'session_paused' }),
      ]),
    );
  });

  it('auto-accepts permissions approvals without surfacing a decision card', async () => {
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

    const request: ServerRequest = {
      method: 'item/permissions/requestApproval',
      id: 'req_perm_1',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'perm_1',
        reason: 'Need network and file access',
        permissions: {
          network: { mode: 'enabled' },
          fileSystem: { mode: 'full' },
        },
      } satisfies PermissionsRequestApprovalParams,
    };

    await (controller as unknown as {
      handleServerRequest(request: ServerRequest): Promise<void>;
    }).handleServerRequest(request);

    const gateway = mockState.gateways[0];
    expect(gateway.respondCalls).toEqual([
      {
        requestId: 'req_perm_1',
        result: {
          permissions: {
            network: { mode: 'enabled' },
            fileSystem: { mode: 'full' },
          },
          scope: 'session',
        },
      },
    ]);
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'needs_decision' }),
        expect.objectContaining({ type: 'session_paused' }),
      ]),
    );
  });
});
