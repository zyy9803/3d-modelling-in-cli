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
} from '../../codex-runtime/protocol/codex-app-server-protocol.js';
import {
  CodexProcessManager,
  type CodexProcessEvent,
} from '../../codex-runtime/infrastructure/codex-process.js';
import { CodexGateway } from '../../codex-runtime/infrastructure/codex-gateway.js';

type RuntimeConnectionStatus =
  | 'starting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export type CodexRuntimeHandlers = {
  onConnectionStatusChange: (
    status: RuntimeConnectionStatus,
    message: string,
  ) => void;
  onNotification: (notification: ServerNotification) => void;
  onServerRequest: (request: ServerRequest) => void;
  onProcessEvent?: (event: CodexProcessEvent) => void;
};

export type CodexRuntime = {
  start(): void;
  stop(): void;
  isStopping(): boolean;
  whenReady(): Promise<void>;
  startThread(params: ThreadStartParams): Promise<ThreadStartResponse>;
  startTurn(params: TurnStartParams): Promise<TurnStartResponse>;
  steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse>;
  interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse>;
  respondToServerRequest(requestId: RequestId, result: unknown): Promise<void>;
};

export function createCodexRuntime(options: {
  listenPort: number;
  cwd: string;
  handlers: CodexRuntimeHandlers;
}): CodexRuntime {
  const processManager = new CodexProcessManager({
    listenPort: options.listenPort,
    cwd: options.cwd,
  });
  const gateway = new CodexGateway(processManager.listenUrl, {
    onConnectionStatusChange: options.handlers.onConnectionStatusChange,
    onNotification: options.handlers.onNotification,
    onServerRequest: options.handlers.onServerRequest,
  });

  processManager.on('process', (event: CodexProcessEvent) => {
    options.handlers.onProcessEvent?.(event);
  });

  return {
    start(): void {
      processManager.start();
      gateway.start();
    },
    stop(): void {
      gateway.stop();
      processManager.stop();
    },
    isStopping(): boolean {
      return processManager.isStopping();
    },
    whenReady(): Promise<void> {
      return gateway.whenReady();
    },
    startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
      return gateway.startThread(params);
    },
    startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
      return gateway.startTurn(params);
    },
    steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse> {
      return gateway.steerTurn(params);
    },
    interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
      return gateway.interruptTurn(params);
    },
    respondToServerRequest(
      requestId: RequestId,
      result: unknown,
    ): Promise<void> {
      return gateway.respondToServerRequest(requestId, result);
    },
  };
}
