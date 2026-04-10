import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { buildCodexTurnPrompt } from '../src/shared/codex-turn-prompt.js';
import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  EditJobContext,
  SessionImportModelRequest,
  SessionImportModelResponse,
  SessionDecisionRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types.js';

import {
  createEditJobFactory,
  type EditJobFactory,
  type EditJobRecord,
} from './edit-job.js';
import {
  createModelRegistry,
  type ModelRegistry,
} from './model-registry.js';
import {
  createModelStorage,
  type ModelStorage,
} from './model-storage.js';
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
  modelsRoot?: string;
  jobsRoot?: string;
  modelRegistry?: ModelRegistry;
  editJobFactory?: EditJobFactory;
  modelStorage?: ModelStorage;
};

export class CodexSessionController {
  private readonly subscribers = new Set<SessionSubscriber>();
  private readonly sessionId: string;
  private readonly processManager: CodexProcessManager;
  private readonly gateway: CodexGateway;
  private readonly modelRegistry: ModelRegistry;
  private readonly editJobFactory: EditJobFactory;
  private readonly modelStorage: ModelStorage;
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
  private activeEditJob: EditJobRecord | null = null;

  public constructor(private readonly options: CodexSessionControllerOptions) {
    this.sessionId = options.sessionId ?? 'sess_main';
    const modelsRoot = resolve(options.modelsRoot ?? join(options.rootDir, 'artifacts', 'models'));
    const jobsRoot = resolve(options.jobsRoot ?? join(options.rootDir, 'artifacts', 'jobs'));
    this.modelRegistry = options.modelRegistry ?? createModelRegistry(modelsRoot);
    this.editJobFactory =
      options.editJobFactory ?? createEditJobFactory({ jobsRoot, registry: this.modelRegistry });
    this.modelStorage = options.modelStorage ?? createModelStorage(modelsRoot);
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
        void this.handleNotification(notification);
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

  public async readModelFile(modelId: string): Promise<Buffer | null> {
    const model = this.modelRegistry.getModel(modelId);
    if (!model) {
      return null;
    }

    return this.modelStorage.readModelFile(model.storagePath);
  }

  public async importModel(request: SessionImportModelRequest): Promise<SessionImportModelResponse> {
    this.assertSessionId(request.sessionId);

    const fileBuffer = Buffer.from(request.fileContentBase64, 'base64');
    const model = this.modelRegistry.registerImportedModel({
      sourceFileName: request.fileName,
    });
    await this.modelStorage.writeModelFile(model.storagePath, fileBuffer);

    this.activeModelId = model.modelId;
    this.modelLabel = model.sourceFileName;
    this.broadcast({
      type: 'model_switched',
      activeModelId: model.modelId,
      modelLabel: model.sourceFileName,
    });

    return {
      modelId: model.modelId,
      modelLabel: model.sourceFileName,
    };
  }

  public async submitMessage(request: SessionMessageRequest): Promise<{ accepted: true }> {
    this.assertSessionId(request.sessionId);
    this.ensureCanSendMessage();

    const normalizedRequest: SessionMessageRequest = {
      ...request,
      activeModelId: request.activeModelId ?? this.activeModelId,
    };

    this.activeModelId = normalizedRequest.activeModelId;
    this.ensureKnownModel(normalizedRequest.activeModelId, this.modelLabel);
    await this.gateway.whenReady();
    await this.ensureThread();

    const editJob = await this.prepareEditJob(normalizedRequest);
    const prompt = buildCodexTurnPrompt(
      editJob
        ? {
            ...normalizedRequest,
            editJob: this.toEditJobContext(editJob),
          }
        : normalizedRequest,
    );
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
        try {
          const response = await this.gateway.startTurn({
            threadId: this.requireThreadId(),
            input,
            cwd: this.options.rootDir,
          });
          this.activeTurnId = response.turn.id;
        } catch (error) {
          if (editJob) {
            this.activeEditJob = null;
            await this.failActiveEditJob(editJob, this.describeError(error));
          }

          throw error;
        }
      }
    } else {
      this.sessionStatus = 'sending';
      this.broadcast({
        type: 'status_changed',
        status: 'sending',
      });

      try {
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
      } catch (error) {
        if (editJob) {
          this.activeEditJob = null;
          await this.failActiveEditJob(editJob, this.describeError(error));
        }

        throw error;
      }
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
    this.ensureKnownModel(request.activeModelId, request.modelLabel);

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
    this.activeEditJob = null;
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
      baseInstructions:
        'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows. You may modify mesh geometry and generate new STL models, but you must never overwrite the input model.',
      developerInstructions:
        'Use the user prompt as the source of truth for model context and selection context. If an edit job is provided, treat its context as authoritative for file paths. Only create edit.py, result.json, or write the output STL when you decide to perform an actual mesh edit for this turn. For analysis, clarification, and discussion turns, do not generate model artifacts. Do not overwrite the base model.',
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

  private async handleNotification(notification: ServerNotification): Promise<void> {
    let completedTurn: { id: string; status?: string | null } | null = null;

    switch (notification.method) {
      case 'thread/started':
        this.threadId = notification.params.thread.id;
        break;
      case 'turn/started':
        this.activeTurnId = notification.params.turn.id;
        break;
      case 'turn/completed':
        completedTurn = notification.params.turn;
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

    if (completedTurn) {
      await this.finalizeActiveEditJob(completedTurn);
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

  private broadcastModelGenerated(job: EditJobRecord): void {
    this.broadcast({
      type: 'model_generated',
      jobId: job.jobId,
      baseModelId: job.baseModel.modelId,
      newModelId: job.outputModel.modelId,
      modelLabel: job.outputModel.sourceFileName,
    });
  }

  private broadcastModelGenerationFailed(job: EditJobRecord, message: string): void {
    this.broadcast({
      type: 'model_generation_failed',
      jobId: job.jobId,
      baseModelId: job.baseModel.modelId,
      message,
    });
  }

  private async prepareEditJob(request: SessionMessageRequest): Promise<EditJobRecord | null> {
    if (this.activeTurnId && this.activeEditJob) {
      return this.activeEditJob;
    }

    if (!request.activeModelId) {
      return this.activeEditJob;
    }

    const editJob = await this.editJobFactory.createJob({
      activeModelId: request.activeModelId,
      selectionContext: request.selectionContext,
      viewContext: request.viewContext,
      userInstruction: request.message.text,
    });

    this.activeEditJob = editJob;
    return editJob;
  }

  private async finalizeActiveEditJob(turn: { id: string; status?: string | null }): Promise<void> {
    const editJob = this.activeEditJob;
    if (!editJob) {
      return;
    }

    this.activeEditJob = null;

    if (turn.status !== 'completed') {
      await this.failActiveEditJob(
        editJob,
        `Codex turn ended with status ${turn.status ?? 'unknown'} before generating a new STL.`,
      );
      return;
    }

    if (!(await this.didCodexAttemptModelGeneration(editJob))) {
      return;
    }

    const validation = await this.modelStorage.validateGeneratedModel(editJob.outputModel.storagePath);
    if (!validation.ok) {
      await this.failActiveEditJob(editJob, validation.message ?? 'Generated STL validation failed.');
      return;
    }

    this.activeModelId = editJob.outputModel.modelId;
    this.modelLabel = editJob.outputModel.sourceFileName;
    this.broadcastModelGenerated(editJob);
  }

  private async failActiveEditJob(editJob: EditJobRecord, message: string): Promise<void> {
    this.broadcastModelGenerationFailed(editJob, message);
  }

  private async didCodexAttemptModelGeneration(editJob: EditJobRecord): Promise<boolean> {
    return (
      (await pathExists(editJob.scriptPath)) ||
      (await pathExists(editJob.resultPath)) ||
      (await pathExists(editJob.outputModel.storagePath))
    );
  }

  private ensureKnownModel(activeModelId: string | null, modelLabel: string | null): void {
    if (!activeModelId || this.modelRegistry.getModel(activeModelId)) {
      return;
    }

    const desiredSequence = parseModelSequence(activeModelId);
    if (desiredSequence == null) {
      throw new Error(`Unsupported active model id: ${activeModelId}`);
    }

    const sourceFileName = modelLabel ?? `${activeModelId}.stl`;
    while (this.modelRegistry.listModels().length < desiredSequence) {
      this.modelRegistry.registerImportedModel({ sourceFileName });
    }

    if (!this.modelRegistry.getModel(activeModelId)) {
      throw new Error(`Failed to register active model: ${activeModelId}`);
    }
  }

  private toEditJobContext(editJob: EditJobRecord): EditJobContext {
    return {
      jobId: editJob.jobId,
      workspacePath: editJob.workspacePath,
      contextPath: editJob.contextPath,
      baseModelPath: editJob.baseModel.storagePath,
      outputModelPath: editJob.outputModel.storagePath,
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
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

function parseModelSequence(modelId: string): number | null {
  const match = /^model_(\d+)$/u.exec(modelId);
  if (!match) {
    return null;
  }

  const sequence = Number(match[1]);
  return Number.isInteger(sequence) ? sequence : null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
