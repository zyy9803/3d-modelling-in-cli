import { buildCodexTurnPrompt } from '../src/shared/codex-turn-prompt.js';
import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  SessionDecisionRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types.js';

import {
  buildDecisionActivityEvents,
  buildDecisionEnvelope,
  buildDecisionResponse,
  mapThreadStatus,
  normalizeServerNotification,
  type PendingDecisionEnvelope,
} from './codex-adapter.js';
import type {
  ServerNotification,
  ServerRequest,
} from './codex-app-server-protocol.js';
import { CodexGateway } from './codex-gateway.js';
import { CodexProcessManager, type CodexProcessEvent } from './codex-process.js';

type SessionSubscriber = (event: SessionStreamEvent) => void;

export type SessionSnapshot = {
  sessionId: string;
  connectionStatus: CodexConnectionStatus;
  connectionMessage: string;
  sessionStatus: ChatSessionStatus;
  activeModelId: string | null;
  modelLabel: string | null;
};

export type CodexSessionControllerOptions = {
  rootDir: string;
  appServerPort: number;
  sessionId?: string;
};

export class CodexSessionController {
  private readonly subscribers = new Set<SessionSubscriber>();
  private readonly sessionId: string;
  private readonly processManager: CodexProcessManager;
  private readonly gateway: CodexGateway;
  private connectionStatus: CodexConnectionStatus = 'starting';
  private connectionMessage = 'Codex starting';
  private sessionStatus: ChatSessionStatus = 'idle';
  private activeModelId: string | null = null;
  private modelLabel: string | null = null;
  private threadId: string | null = null;
  private activeTurnId: string | null = null;
  private interruptedTurnId: string | null = null;
  private pendingDecision: PendingDecisionEnvelope | null = null;
  private resolvingDecisionId: string | null = null;

  public constructor(private readonly options: CodexSessionControllerOptions) {
    this.sessionId = options.sessionId ?? 'sess_main';
    this.processManager = new CodexProcessManager({
      listenPort: options.appServerPort,
      cwd: options.rootDir,
    });
    this.gateway = new CodexGateway(this.processManager.listenUrl, {
      onConnectionStatusChange: (status, message) => {
        this.connectionStatus = status;
        this.connectionMessage = message;
        this.broadcast({
          type: 'connection_status_changed',
          connectionStatus: status,
          message,
        });
      },
      onNotification: (notification) => {
        this.handleNotification(notification);
      },
      onServerRequest: (request) => {
        this.handleServerRequest(request);
      },
    });

    this.processManager.on('process', (event: CodexProcessEvent) => {
      if (event.type === 'error') {
        this.connectionStatus = 'failed';
        this.connectionMessage = event.error.message;
        this.broadcast({
          type: 'connection_status_changed',
          connectionStatus: 'failed',
          message: event.error.message,
        });
        return;
      }

      if (event.type === 'exit' && !this.processManager.isStopping()) {
        const message =
          event.code === 0
            ? 'Codex app-server exited.'
            : 'Codex app-server exited unexpectedly.';
        this.connectionStatus = event.code === 0 ? 'disconnected' : 'failed';
        this.connectionMessage = message;
        this.broadcast({
          type: 'connection_status_changed',
          connectionStatus: this.connectionStatus,
          message,
        });
      }
    });
  }

  public start(): void {
    this.processManager.start();
    this.gateway.start();
  }

  public stop(): void {
    this.gateway.stop();
    this.processManager.stop();
  }

  public subscribe(subscriber: SessionSubscriber): () => void {
    this.subscribers.add(subscriber);
    this.replaySnapshot(subscriber);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      connectionStatus: this.connectionStatus,
      connectionMessage: this.connectionMessage,
      sessionStatus: this.sessionStatus,
      activeModelId: this.activeModelId,
      modelLabel: this.modelLabel,
    };
  }

  public async submitMessage(request: SessionMessageRequest): Promise<{ accepted: true }> {
    this.assertSessionId(request.sessionId);
    this.ensureCanSendMessage();

    this.activeModelId = request.activeModelId;
    await this.gateway.whenReady();
    await this.ensureThread();

    const prompt = buildCodexTurnPrompt(request);
    const input = [
      {
        type: 'text' as const,
        text: prompt,
        text_elements: [],
      },
    ];

    if (this.activeTurnId) {
      try {
        await this.gateway.steerTurn({
          threadId: this.requireThreadId(),
          expectedTurnId: this.activeTurnId,
          input,
        });
      } catch {
        this.activeTurnId = null;
        const response = await this.gateway.startTurn({
          threadId: this.requireThreadId(),
          input,
          cwd: this.options.rootDir,
        });
        this.activeTurnId = response.turn.id;
      }
    } else {
      this.sessionStatus = 'sending';
      this.broadcast({
        type: 'status_changed',
        status: 'sending',
      });

      const response = await this.gateway.startTurn({
        threadId: this.requireThreadId(),
        input,
        cwd: this.options.rootDir,
      });

      this.activeTurnId = response.turn.id;
      this.sessionStatus = 'streaming';
      this.broadcast({
        type: 'status_changed',
        status: 'streaming',
      });
    }

    return {
      accepted: true,
    };
  }

  public async submitDecision(request: SessionDecisionRequest): Promise<{ accepted: true }> {
    this.assertSessionId(request.sessionId);

    if (!this.pendingDecision) {
      throw new Error('No pending decision exists.');
    }

    if (this.pendingDecision.id !== request.decisionId) {
      throw new Error('Decision id does not match the pending decision.');
    }

    const pendingDecision = this.pendingDecision;
    this.pendingDecision = null;
    this.resolvingDecisionId = pendingDecision.id;
    this.sessionStatus = 'resuming';
    this.broadcast({
      type: 'status_changed',
      status: 'resuming',
    });

    await this.gateway.respondToServerRequest(
      pendingDecision.requestId,
      buildDecisionResponse(pendingDecision, request.answers),
    );

    return {
      accepted: true,
    };
  }

  public async switchModel(request: SessionModelSwitchRequest): Promise<{ accepted: true }> {
    this.assertSessionId(request.sessionId);
    this.activeModelId = request.activeModelId;
    this.modelLabel = request.modelLabel;

    this.broadcast({
      type: 'model_switched',
      activeModelId: request.activeModelId,
      modelLabel: request.modelLabel,
    });

    return {
      accepted: true,
    };
  }

  public async interruptTurn(request: SessionInterruptRequest): Promise<{ accepted: true }> {
    this.assertSessionId(request.sessionId);

    if (!this.threadId || !this.activeTurnId) {
      return {
        accepted: true,
      };
    }

    const interruptedTurnId = this.activeTurnId;
    this.interruptedTurnId = interruptedTurnId;
    await this.gateway.interruptTurn({
      threadId: this.threadId,
      turnId: interruptedTurnId,
    });

    this.broadcast({
      type: 'turn_interrupted',
      turnId: interruptedTurnId,
    });

    return {
      accepted: true,
    };
  }

  public async clearSession(): Promise<{ accepted: true }> {
    if (this.threadId && this.activeTurnId) {
      try {
        await this.gateway.interruptTurn({
          threadId: this.threadId,
          turnId: this.activeTurnId,
        });
      } catch {
        // Best effort only. Clearing the local session state is still valid.
      }
    }

    this.threadId = null;
    this.activeTurnId = null;
    this.interruptedTurnId = null;
    this.pendingDecision = null;
    this.resolvingDecisionId = null;
    this.sessionStatus = 'idle';

    this.broadcast({
      type: 'session_cleared',
    });
    this.broadcast({
      type: 'status_changed',
      status: 'idle',
    });

    return {
      accepted: true,
    };
  }

  private async ensureThread(): Promise<void> {
    if (this.threadId) {
      return;
    }

    const response = await this.gateway.startThread({
      cwd: this.options.rootDir,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: 'danger-full-access',
      config: null,
      serviceName: 'stl-web-viewer',
      baseInstructions: 'Phase 3A only. Do not claim that any STL or mesh edit has already been executed.',
      developerInstructions:
        'Use the user prompt as the source of truth for model context and selection context. If a future mesh edit is requested, discuss it but do not claim it has been applied.',
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    });

    this.threadId = response.thread.id;
    this.broadcast({
      type: 'session_started',
      sessionId: this.sessionId,
    });
  }

  private handleNotification(notification: ServerNotification): void {
    switch (notification.method) {
      case 'thread/started':
        this.threadId = notification.params.thread.id;
        break;
      case 'turn/started':
        this.activeTurnId = notification.params.turn.id;
        break;
      case 'turn/completed':
        if (
          notification.params.turn.status === 'interrupted' &&
          this.interruptedTurnId !== notification.params.turn.id
        ) {
          this.broadcast({
            type: 'turn_interrupted',
            turnId: notification.params.turn.id,
          });
        }
        if (notification.params.turn.status === 'interrupted') {
          this.interruptedTurnId = null;
        }
        this.activeTurnId = null;
        if (!this.pendingDecision && !this.resolvingDecisionId) {
          this.sessionStatus = 'completed';
        }
        break;
      case 'thread/status/changed': {
        const mappedStatus = mapThreadStatus(notification.params.status);
        if (mappedStatus === 'failed') {
          this.sessionStatus = 'failed';
        } else if (mappedStatus === 'waiting_decision') {
          this.sessionStatus = 'waiting_decision';
        } else if (mappedStatus === 'streaming') {
          this.sessionStatus = 'streaming';
        }
        break;
      }
      case 'serverRequest/resolved': {
        const requestId = String(notification.params.requestId);
        if (this.resolvingDecisionId && requestId === this.resolvingDecisionId) {
          this.resolvingDecisionId = null;
          this.sessionStatus = 'streaming';
          this.broadcast({
            type: 'session_resumed',
            decisionId: requestId,
          });
          this.broadcast({
            type: 'status_changed',
            status: 'streaming',
          });
        }
        break;
      }
      case 'error':
        this.sessionStatus = 'failed';
        break;
      default:
        break;
    }

    for (const event of normalizeServerNotification(notification)) {
      this.applyStreamEventState(event);
      this.broadcast(event);
    }
  }

  private handleServerRequest(request: ServerRequest): void {
    const envelope = buildDecisionEnvelope(request);
    if (!envelope) {
      return;
    }

    this.pendingDecision = envelope;
    this.resolvingDecisionId = null;
    this.sessionStatus = 'waiting_decision';

    for (const event of buildDecisionActivityEvents(`approval-${envelope.id}`, envelope.card)) {
      this.broadcast(event);
    }

    this.broadcast({
      type: 'needs_decision',
      decision: envelope.card,
    });
    this.broadcast({
      type: 'session_paused',
      decisionId: envelope.id,
    });
    this.broadcast({
      type: 'status_changed',
      status: 'waiting_decision',
    });
  }

  private applyStreamEventState(event: SessionStreamEvent): void {
    if (event.type === 'status_changed') {
      this.sessionStatus = event.status;
      return;
    }

    if (event.type === 'error') {
      this.sessionStatus = 'failed';
    }
  }

  private replaySnapshot(subscriber: SessionSubscriber): void {
    subscriber({
      type: 'connection_status_changed',
      connectionStatus: this.connectionStatus,
      message: this.connectionMessage,
    });
    subscriber({
      type: 'status_changed',
      status: this.sessionStatus,
    });

    if (this.threadId) {
      subscriber({
        type: 'session_started',
        sessionId: this.sessionId,
      });
    }

    if (this.activeModelId || this.modelLabel) {
      subscriber({
        type: 'model_switched',
        activeModelId: this.activeModelId,
        modelLabel: this.modelLabel,
      });
    }

    if (this.pendingDecision) {
      subscriber({
        type: 'needs_decision',
        decision: this.pendingDecision.card,
      });
      subscriber({
        type: 'session_paused',
        decisionId: this.pendingDecision.id,
      });
    }
  }

  private broadcast(event: SessionStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  private requireThreadId(): string {
    if (!this.threadId) {
      throw new Error('Codex thread has not been created yet.');
    }

    return this.threadId;
  }

  private assertSessionId(sessionId: string): void {
    if (sessionId !== this.sessionId) {
      throw new Error(`Session mismatch: expected ${this.sessionId}, got ${sessionId}`);
    }
  }

  private ensureCanSendMessage(): void {
    if (this.pendingDecision || this.resolvingDecisionId) {
      throw new Error('Cannot send a new message while a decision is pending.');
    }
  }
}
