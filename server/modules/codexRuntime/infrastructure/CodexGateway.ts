import WebSocket, { type RawData } from 'ws';

import type {
  ClientRequestMethod,
  InitializeParams,
  InitializeResponse,
  RequestId,
  ServerNotification,
  ServerRequest,
  ThreadStartParams,
  ThreadStartResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnSteerParams,
  TurnSteerResponse,
  TurnStartParams,
  TurnStartResponse,
} from '../protocol/CodexAppServerProtocol.js';

type ConnectionStatus = 'starting' | 'connected' | 'disconnected' | 'failed';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc?: '2.0';
  id: RequestId;
  result?: unknown;
  error?: {
    message?: string;
  };
};

type GatewayHandlers = {
  onConnectionStatusChange: (status: ConnectionStatus, message: string) => void;
  onNotification: (notification: ServerNotification) => void;
  onServerRequest: (request: ServerRequest) => void;
};

export class CodexGateway {
  private ws: WebSocket | null = null;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<RequestId, PendingRequest>();
  private connectLoopActive = false;
  private closing = false;
  private connectionStatus: ConnectionStatus = 'starting';
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((reason: Error) => void) | null = null;

  public constructor(
    private readonly wsUrl: string,
    private readonly handlers: GatewayHandlers,
  ) {}

  public get status(): ConnectionStatus {
    return this.connectionStatus;
  }

  public start(): void {
    if (this.connectLoopActive || this.closing) {
      return;
    }

    void this.connectLoop();
  }

  public stop(): void {
    this.closing = true;
    this.ws?.close();
    this.ws = null;
    this.rejectAllPending(new Error('Codex gateway stopped.'));
    this.rejectReadyPromise(new Error('Codex gateway stopped.'));
  }

  public async whenReady(): Promise<void> {
    if (this.connectionStatus === 'connected') {
      return;
    }

    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
    }

    return this.readyPromise;
  }

  public async startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
    return this.sendRequest<ThreadStartResponse>('thread/start', params);
  }

  public async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.sendRequest<TurnStartResponse>('turn/start', params);
  }

  public async steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse> {
    return this.sendRequest<TurnSteerResponse>('turn/steer', params);
  }

  public async interruptTurn(
    params: TurnInterruptParams,
  ): Promise<TurnInterruptResponse> {
    return this.sendRequest<TurnInterruptResponse>('turn/interrupt', params);
  }

  public async respondToServerRequest(
    requestId: RequestId,
    result: unknown,
  ): Promise<void> {
    await this.whenReady();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Codex app-server is not connected.');
    }

    this.ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        result,
      }),
    );
  }

  private async connectLoop(): Promise<void> {
    this.connectLoopActive = true;
    try {
      while (!this.closing) {
        this.setStatus('starting', 'Connecting to Codex app-server...');

        try {
          await this.connectOnce();
          return;
        } catch (error) {
          if (this.closing) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : 'Failed to connect to Codex app-server.';
          this.setStatus('disconnected', message);
          await this.delay(800);
        }
      }
    } finally {
      this.connectLoopActive = false;
    }
  }

  private async connectOnce(): Promise<void> {
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);

      const cleanup = (): void => {
        ws.off('open', handleOpen);
        ws.off('error', handleError);
      };

      const handleOpen = (): void => {
        cleanup();
        resolve(ws);
      };

      const handleError = (error: Error): void => {
        cleanup();
        ws.close();
        reject(error);
      };

      ws.once('open', handleOpen);
      ws.once('error', handleError);
    });

    this.ws = socket;
    socket.on('message', (raw: RawData) => {
      void this.handleMessage(raw.toString());
    });
    socket.on('close', () => {
      if (this.ws !== socket) {
        return;
      }

      this.ws = null;
      this.rejectAllPending(new Error('Codex app-server connection closed.'));
      this.rejectReadyPromise(new Error('Codex app-server connection closed.'));

      if (!this.closing) {
        this.setStatus('disconnected', 'Codex app-server connection closed.');
        void this.connectLoop();
      }
    });

    socket.on('error', (error: Error) => {
      if (!this.closing) {
        this.setStatus(
          'disconnected',
          error.message || 'Codex app-server connection error.',
        );
      }
    });

    try {
      await this.sendRawRequest<InitializeResponse>('initialize', {
        clientInfo: {
          name: 'stl-web-viewer-bff',
          title: 'STL Web Viewer BFF',
          version: '0.0.0',
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [],
        },
      } satisfies InitializeParams);
    } catch (error) {
      socket.close();
      throw error;
    }

    this.setStatus('connected', 'Connected to Codex app-server.');
    this.resolveReadyPromise();
  }

  private async handleMessage(raw: string): Promise<void> {
    const payload = JSON.parse(raw) as Record<string, unknown>;

    if (typeof payload.method === 'string') {
      if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
        this.handlers.onServerRequest(payload as unknown as ServerRequest);
        return;
      }

      this.handlers.onNotification(payload as unknown as ServerNotification);
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, 'id')) {
      return;
    }

    const message = payload as JsonRpcResponse;
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(message.error.message ?? 'Codex app-server request failed.'),
      );
      return;
    }

    pending.resolve(message.result);
  }

  private async sendRequest<TResponse>(
    method: ClientRequestMethod,
    params: unknown,
  ): Promise<TResponse> {
    await this.whenReady();
    return this.sendRawRequest<TResponse>(method, params);
  }

  private async sendRawRequest<TResponse>(
    method: string,
    params: unknown,
  ): Promise<TResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Codex app-server is not connected.');
    }

    const requestId = this.nextRequestId++;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const response = new Promise<TResponse>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as TResponse),
        reject,
      });
    });

    this.ws.send(JSON.stringify(payload));
    return response;
  }

  private setStatus(status: ConnectionStatus, message: string): void {
    this.connectionStatus = status;
    this.handlers.onConnectionStatusChange(status, message);
  }

  private resolveReadyPromise(): void {
    if (this.resolveReady) {
      this.resolveReady();
    }
    this.clearReadyPromise();
  }

  private rejectReadyPromise(error: Error): void {
    if (this.rejectReady) {
      this.rejectReady(error);
    }
    this.clearReadyPromise();
  }

  private clearReadyPromise(): void {
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
