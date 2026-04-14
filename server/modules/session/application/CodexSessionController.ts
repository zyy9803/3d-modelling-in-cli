import { execFile } from 'node:child_process';
import { access, copyFile, readFile, readdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, join, resolve } from 'node:path';

import { buildCodexTurnPrompt } from '../../../../src/shared/codex-turn-prompt.js';
import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  DraftState,
  EditJobContext,
  SessionGenerateModelRequest,
  SessionImportModelRequest,
  SessionImportModelResponse,
  SessionDecisionRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../../../../src/shared/codex-session-types.js';

import {
  createEditJobFactory,
  type DraftJobRecord,
  type EditJobFactory,
  type ExecutionJobRecord,
} from '../../jobs/infrastructure/editJobWorkspace.js';
import {
  createEditJobService,
  type EditJobService,
} from '../../jobs/application/EditJobService.js';
import { createDebugLogger, type DebugLogger } from '../../../shared/logging/debugLog.js';
import {
  createModelRegistry,
  type ModelRegistry,
} from '../../models/infrastructure/ModelRegistry.js';
import {
  createModelStorage,
  type ModelStorage,
} from '../../models/infrastructure/ModelStorage.js';
import {
  createModelCatalogService,
  type ModelCatalogService,
} from '../../models/application/ModelCatalogService.js';
import {
  buildDecisionActivityEvents,
  buildDecisionEnvelope,
  buildDecisionResponse,
  type PendingDecisionEnvelope,
} from '../mappers/decisionMapper.js';
import {
  mapThreadStatus,
  normalizeServerNotification,
} from '../mappers/notificationMapper.js';
import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
  PermissionsRequestApprovalParams,
  ServerNotification,
  ServerRequest,
} from '../../codexRuntime/protocol/CodexAppServerProtocol.js';
import {
  createCodexRuntime,
  type CodexRuntime,
} from '../infrastructure/CodexRuntime.js';
import {
  SessionEventBus,
  type SessionSubscriber,
} from '../infrastructure/SessionEventBus.js';
import {
  EMPTY_DRAFT_STATE,
  replaySessionSnapshot,
  type SessionSnapshot,
} from '../domain/SessionSnapshot.js';

const execFileAsync = promisify(execFile);

export type CodexSessionControllerOptions = {
  rootDir: string;
  appServerPort: number;
  sessionId?: string;
  modelsRoot?: string;
  jobsRoot?: string;
  modelRegistry?: ModelRegistry;
  editJobFactory?: EditJobFactory;
  modelStorage?: ModelStorage;
  draftRunner?: (job: ExecutionJobRecord) => Promise<void>;
};

export class CodexSessionController {
  private readonly eventBus = new SessionEventBus();
  private readonly sessionId: string;
  private readonly runtime: CodexRuntime;
  private readonly modelRegistry: ModelRegistry;
  private readonly editJobFactory: EditJobFactory;
  private readonly modelStorage: ModelStorage;
  private readonly modelCatalogService: ModelCatalogService;
  private readonly editJobService: EditJobService;
  private readonly debugLogger: DebugLogger;
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
  private activeDraftJob: DraftJobRecord | null = null;
  private draftState: DraftState = { ...EMPTY_DRAFT_STATE };
  private readonly draftRunner: (job: ExecutionJobRecord) => Promise<void>;

  public constructor(private readonly options: CodexSessionControllerOptions) {
    this.sessionId = options.sessionId ?? 'sess_main';
    const modelsRoot = resolve(options.modelsRoot ?? join(options.rootDir, 'artifacts', 'models'));
    const jobsRoot = resolve(options.jobsRoot ?? join(options.rootDir, 'artifacts', 'jobs'));
    this.debugLogger = createDebugLogger(join(options.rootDir, 'artifacts', 'logs', 'session-debug.log'));
    this.modelRegistry = options.modelRegistry ?? createModelRegistry(modelsRoot);
    this.editJobFactory =
      options.editJobFactory ?? createEditJobFactory({ jobsRoot, registry: this.modelRegistry });
    this.modelStorage = options.modelStorage ?? createModelStorage(modelsRoot);
    this.modelCatalogService = createModelCatalogService({
      modelRegistry: this.modelRegistry,
      modelStorage: this.modelStorage,
    });
    this.editJobService = createEditJobService(this.editJobFactory);
    this.draftRunner = options.draftRunner ?? runDraftScript;
    this.debugLogger.log('session.constructed', {
      sessionId: this.sessionId,
      rootDir: options.rootDir,
      appServerPort: options.appServerPort,
      logPath: this.debugLogger.path,
    });
    this.runtime = createCodexRuntime({
      listenPort: options.appServerPort,
      cwd: options.rootDir,
      handlers: {
      onConnectionStatusChange: (status, message) => {
        this.debugLogger.log('gateway.connection_status_changed', { status, message });
        this.connectionStatus = status;
        this.connectionMessage = message;
        this.broadcast({
          type: 'connection_status_changed',
          connectionStatus: status,
          message,
        });
      },
      onNotification: (notification) => {
        this.debugLogger.log('gateway.notification', {
          method: notification.method,
          params: notification.params,
        });
        void this.handleNotification(notification);
      },
      onServerRequest: (request) => {
        this.debugLogger.log('gateway.server_request', {
          id: request.id,
          method: request.method,
          params: request.params,
        });
        void this.handleServerRequest(request);
      },
      onProcessEvent: (event) => {
        this.debugLogger.log('process.event', event);
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

        if (event.type === 'exit' && !this.runtime.isStopping()) {
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
      },
      },
    });
  }

  public start(): void {
    this.debugLogger.log('session.start');
    this.runtime.start();
  }

  public stop(): void {
    this.debugLogger.log('session.stop');
    this.runtime.stop();
  }

  public subscribe(subscriber: SessionSubscriber): () => void {
    this.replaySnapshot(subscriber);
    return this.eventBus.subscribe(subscriber);
  }

  public getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      connectionStatus: this.connectionStatus,
      connectionMessage: this.connectionMessage,
      sessionStatus: this.sessionStatus,
      activeModelId: this.activeModelId,
      modelLabel: this.modelLabel,
      draft: { ...this.draftState },
    };
  }

  public async readModelFile(modelId: string): Promise<Buffer | null> {
    return this.modelCatalogService.readModelFile(modelId);
  }

  public async importModel(request: SessionImportModelRequest): Promise<SessionImportModelResponse> {
    this.debugLogger.log('session.import_model', {
      sessionId: request.sessionId,
      fileName: request.fileName,
      contentLength: request.fileContentBase64.length,
    });
    this.assertSessionId(request.sessionId);

    const model = await this.modelCatalogService.importModel(request);

    this.activeModelId = model.modelId;
    this.modelLabel = model.modelLabel;
    this.clearDraftState();
    this.broadcast({
      type: 'model_switched',
      activeModelId: model.modelId,
      modelLabel: model.modelLabel,
    });

    return {
      modelId: model.modelId,
      modelLabel: model.modelLabel,
    };
  }

  public async submitMessage(request: SessionMessageRequest): Promise<{ accepted: true }> {
    this.debugLogger.log('session.submit_message.received', summarizeMessageRequest(request));
    this.assertSessionId(request.sessionId);
    this.ensureCanSendMessage();

    const normalizedRequest: SessionMessageRequest = {
      ...request,
      activeModelId: request.activeModelId ?? this.activeModelId,
    };

    this.activeModelId = normalizedRequest.activeModelId;
    this.ensureKnownModel(normalizedRequest.activeModelId, this.modelLabel);
    await this.runtime.whenReady();
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
    this.debugLogger.log('session.submit_message.prompt_built', {
      activeModelId: normalizedRequest.activeModelId,
      jobId: editJob?.jobId ?? null,
      scriptPath: editJob?.scriptPath ?? null,
      promptPreview: prompt.split('\n').slice(0, 14),
    });
    const input = [
      {
        type: 'text' as const,
        text: prompt,
        text_elements: [],
      },
    ];

    if (this.activeTurnId) {
      this.debugLogger.log('session.submit_message.steer_turn', {
        threadId: this.requireThreadId(),
        expectedTurnId: this.activeTurnId,
      });
      try {
        await this.runtime.steerTurn({
          threadId: this.requireThreadId(),
          expectedTurnId: this.activeTurnId,
          input,
        });
      } catch {
        this.activeTurnId = null;
        try {
          this.debugLogger.log('session.submit_message.start_turn_after_steer_failed', {
            threadId: this.requireThreadId(),
          });
          const response = await this.runtime.startTurn({
            threadId: this.requireThreadId(),
            input,
            cwd: editJob?.workspacePath ?? this.options.rootDir,
          });
          this.activeTurnId = response.turn.id;
        } catch (error) {
          this.debugLogger.log('session.submit_message.start_turn_after_steer_failed.error', {
            error: this.describeError(error),
          });
          this.clearDraftState(this.describeError(error));

          throw error;
        }
      }
    } else {
      this.sessionStatus = 'sending';
      this.debugLogger.log('session.status_changed.local', { status: 'sending' });
      this.broadcast({
        type: 'status_changed',
        status: 'sending',
      });

      try {
        this.debugLogger.log('session.submit_message.start_turn', {
          threadId: this.requireThreadId(),
        });
        const response = await this.runtime.startTurn({
          threadId: this.requireThreadId(),
          input,
          cwd: editJob?.workspacePath ?? this.options.rootDir,
        });

        this.activeTurnId = response.turn.id;
        this.sessionStatus = 'streaming';
        this.debugLogger.log('session.status_changed.local', { status: 'streaming', turnId: response.turn.id });
        this.broadcast({
          type: 'status_changed',
          status: 'streaming',
        });
      } catch (error) {
        this.debugLogger.log('session.submit_message.start_turn.error', {
          error: this.describeError(error),
        });
        this.clearDraftState(this.describeError(error));

        throw error;
      }
    }

    return {
      accepted: true,
    };
  }

  public async generateModel(request: SessionGenerateModelRequest): Promise<{ accepted: true }> {
    this.debugLogger.log('session.generate_model.received', request);
    this.assertSessionId(request.sessionId);

    const draftJob = this.activeDraftJob;
    if (!draftJob || (this.draftState.status !== 'ready' && this.draftState.status !== 'failed')) {
      throw new Error('No ready draft script exists for model generation.');
    }

    this.updateDraftState({
      status: 'running',
      jobId: draftJob.jobId,
      baseModelId: draftJob.baseModel.modelId,
      scriptPath: draftJob.scriptPath,
      message: null,
    });
    this.broadcast({
      type: 'model_generation_started',
      jobId: draftJob.jobId,
      baseModelId: draftJob.baseModel.modelId,
    });

    try {
      await validateDraftScriptForExecution(draftJob.scriptPath);
      const executionJob = await this.editJobService.prepareExecution(draftJob);
      this.debugLogger.log('session.generate_model.execution_prepared', {
        jobId: executionJob.jobId,
        scriptPath: executionJob.scriptPath,
        contextPath: executionJob.contextPath,
        outputModelPath: executionJob.outputModel.storagePath,
      });
      await this.draftRunner(executionJob);
      await reconcileGeneratedModelOutput(executionJob);

      const validation = await this.modelStorage.validateGeneratedModel(executionJob.outputModel.storagePath);
      if (!validation.ok) {
        throw new Error(validation.message ?? 'Generated STL validation failed.');
      }

      this.activeModelId = executionJob.outputModel.modelId;
      this.modelLabel = executionJob.outputModel.sourceFileName;
      this.updateDraftState({
        status: 'executed',
        jobId: draftJob.jobId,
        baseModelId: draftJob.baseModel.modelId,
        scriptPath: draftJob.scriptPath,
        message: null,
      });
      this.broadcastModelGenerated(executionJob);
    } catch (error) {
      const message = this.describeError(error);
      this.debugLogger.log('session.generate_model.error', {
        jobId: draftJob.jobId,
        message,
      });
      this.updateDraftState({
        status: 'failed',
        jobId: draftJob.jobId,
        baseModelId: draftJob.baseModel.modelId,
        scriptPath: draftJob.scriptPath,
        message,
      });
      this.broadcastModelGenerationFailed(draftJob, message);
    }

    return {
      accepted: true,
    };
  }

  public async submitDecision(request: SessionDecisionRequest): Promise<{ accepted: true }> {
    this.debugLogger.log('session.submit_decision', request);
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
    this.debugLogger.log('session.status_changed.local', {
      status: 'resuming',
      decisionId: pendingDecision.id,
    });
    this.broadcast({
      type: 'status_changed',
      status: 'resuming',
    });

    await this.runtime.respondToServerRequest(
      pendingDecision.requestId,
      buildDecisionResponse(pendingDecision, request.answers),
    );

    return {
      accepted: true,
    };
  }

  public async switchModel(request: SessionModelSwitchRequest): Promise<{ accepted: true }> {
    this.debugLogger.log('session.switch_model', request);
    this.assertSessionId(request.sessionId);
    this.activeModelId = request.activeModelId;
    this.modelLabel = request.modelLabel;
    this.ensureKnownModel(request.activeModelId, request.modelLabel);
    this.clearDraftState();

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
    this.debugLogger.log('session.interrupt_turn', request);
    this.assertSessionId(request.sessionId);

    if (!this.threadId || !this.activeTurnId) {
      return {
        accepted: true,
      };
    }

    const interruptedTurnId = this.activeTurnId;
    this.interruptedTurnId = interruptedTurnId;
    await this.runtime.interruptTurn({
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
    this.debugLogger.log('session.clear');
    if (this.threadId && this.activeTurnId) {
      try {
        await this.runtime.interruptTurn({
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
    this.activeDraftJob = null;
    this.draftState = { ...EMPTY_DRAFT_STATE };
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

    const response = await this.runtime.startThread({
      cwd: this.options.rootDir,
      approvalPolicy: 'never',
      approvalsReviewer: null,
      sandbox: 'danger-full-access',
      config: null,
      serviceName: 'stl-web-viewer',
      baseInstructions:
        'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows. You may analyze meshes and draft Python mesh-edit scripts, but you must never overwrite the input model.',
      developerInstructions:
        'Use the user prompt as the source of truth for model context and selection context. If an edit job is provided, treat its context as authoritative for file paths. In every chat turn, first read context.json and inspect the active STL from baseModelPath so you have a global understanding of the mesh before discussing or drafting modifications. Read-only shell commands and one-off local Python inspection scripts are allowed for STL parsing and geometry inspection only. In chat turns you may create or update edit.py only. Do not run the draft script, do not create result.json, and do not write any output STL. Do not install packages, do not attempt web browsing or network access, and do not overwrite the base model. If exact external dimensions are missing, ask the user to provide them. If context is insufficient, reply with a concise clarification request instead of continuing to explore. The user must explicitly trigger model generation later.',
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    });
    this.debugLogger.log('session.ensure_thread.started', {
      threadId: response.thread.id,
      approvalPolicy: 'never',
      approvalsReviewer: null,
      sandbox: 'danger-full-access',
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
        this.debugLogger.log('session.thread_status_changed.mapped', {
          raw: notification.params.status,
          mappedStatus,
        });
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
      await this.finalizeActiveDraftJob(completedTurn);
    }
  }

  private async handleServerRequest(request: ServerRequest): Promise<void> {
    if (await this.autoApproveServerRequest(request)) {
      return;
    }

    const envelope = buildDecisionEnvelope(request);
    this.debugLogger.log('session.handle_server_request', {
      id: request.id,
      method: request.method,
      hasEnvelope: Boolean(envelope),
    });
    if (!envelope) {
      return;
    }

    this.pendingDecision = envelope;
    this.resolvingDecisionId = null;
    this.sessionStatus = 'waiting_decision';
    this.debugLogger.log('session.status_changed.local', {
      status: 'waiting_decision',
      decisionId: envelope.id,
      decisionKind: envelope.kind,
      title: envelope.card.title,
    });

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

  private async autoApproveServerRequest(request: ServerRequest): Promise<boolean> {
    switch (request.method) {
      case 'item/commandExecution/requestApproval': {
        const params = request.params as CommandExecutionRequestApprovalParams;
        const decision =
          params.availableDecisions?.find((value) => value === 'acceptForSession') ??
          params.availableDecisions?.find((value) => value === 'accept') ??
          'accept';
        this.debugLogger.log('session.auto_approve.command_execution', {
          requestId: request.id,
          decision,
          command: params.command ?? null,
          cwd: params.cwd ?? null,
        });
        await this.runtime.respondToServerRequest(request.id, { decision });
        return true;
      }
      case 'item/fileChange/requestApproval':
        this.debugLogger.log('session.auto_approve.file_change', {
          requestId: request.id,
          grantRoot: (request.params as FileChangeRequestApprovalParams).grantRoot ?? null,
        });
        await this.runtime.respondToServerRequest(request.id, { decision: 'acceptForSession' });
        return true;
      case 'item/permissions/requestApproval': {
        const params = request.params as PermissionsRequestApprovalParams;
        this.debugLogger.log('session.auto_approve.permissions', {
          requestId: request.id,
          permissions: params.permissions,
        });
        await this.runtime.respondToServerRequest(request.id, {
          permissions: {
            network: params.permissions.network,
            fileSystem: params.permissions.fileSystem,
          },
          scope: 'session',
        });
        return true;
      }
      default:
        return false;
    }
  }

  private applyStreamEventState(event: SessionStreamEvent): void {
    this.debugLogger.log('session.stream_event', event);
    if (event.type === 'status_changed') {
      this.sessionStatus = event.status;
      return;
    }

    if (event.type === 'error') {
      this.sessionStatus = 'failed';
    }
  }

  private replaySnapshot(subscriber: SessionSubscriber): void {
    replaySessionSnapshot(subscriber, {
      ...this.getSnapshot(),
      pendingDecision: this.pendingDecision?.card ?? null,
      pendingDecisionId: this.pendingDecision?.id ?? null,
      hasThread: this.threadId !== null,
    });
  }

  private broadcast(event: SessionStreamEvent): void {
    this.debugLogger.log('session.broadcast', event);
    this.eventBus.publish(event);
  }

  private broadcastModelGenerated(job: ExecutionJobRecord): void {
    this.broadcast({
      type: 'model_generated',
      jobId: job.jobId,
      baseModelId: job.baseModel.modelId,
      newModelId: job.outputModel.modelId,
      modelLabel: basename(job.outputModel.storagePath),
      modelPath: job.outputModel.storagePath,
    });
  }

  private broadcastModelGenerationFailed(job: DraftJobRecord, message: string): void {
    this.broadcast({
      type: 'model_generation_failed',
      jobId: job.jobId,
      baseModelId: job.baseModel.modelId,
      message,
    });
  }

  private async prepareEditJob(request: SessionMessageRequest): Promise<DraftJobRecord | null> {
    if (this.activeTurnId && this.activeDraftJob) {
      return this.activeDraftJob;
    }

    if (!request.activeModelId) {
      return this.activeDraftJob;
    }

    this.clearDraftState();

    const editJob = await this.editJobService.createDraft({
      activeModelId: request.activeModelId,
      selectionContext: request.selectionContext,
      viewContext: request.viewContext,
      userInstruction: request.message.text,
    });

    this.activeDraftJob = editJob;
    this.debugLogger.log('session.prepare_edit_job.created', {
      jobId: editJob.jobId,
      baseModelId: editJob.baseModel.modelId,
      workspacePath: editJob.workspacePath,
      contextPath: editJob.contextPath,
      scriptPath: editJob.scriptPath,
    });
    return editJob;
  }

  private async finalizeActiveDraftJob(turn: { id: string; status?: string | null }): Promise<void> {
    const editJob = this.activeDraftJob;
    if (!editJob) {
      return;
    }

    if (turn.status !== 'completed') {
      this.debugLogger.log('session.finalize_draft.turn_not_completed', turn);
      this.clearDraftState(`Codex turn ended with status ${turn.status ?? 'unknown'} before draft completion.`);
      return;
    }

    if (!(await pathExists(editJob.scriptPath))) {
      this.debugLogger.log('session.finalize_draft.no_script', {
        jobId: editJob.jobId,
        scriptPath: editJob.scriptPath,
      });
      this.clearDraftState();
      return;
    }

    this.debugLogger.log('session.finalize_draft.script_ready', {
      jobId: editJob.jobId,
      scriptPath: editJob.scriptPath,
    });
    this.updateDraftState({
      status: 'ready',
      jobId: editJob.jobId,
      baseModelId: editJob.baseModel.modelId,
      scriptPath: editJob.scriptPath,
      message: null,
    });
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

  private toEditJobContext(editJob: DraftJobRecord): EditJobContext {
    return {
      jobId: editJob.jobId,
      workspacePath: editJob.workspacePath,
      contextPath: editJob.contextPath,
      baseModelPath: editJob.baseModel.storagePath,
      scriptPath: editJob.scriptPath,
    };
  }

  private updateDraftState(nextState: DraftState): void {
    this.draftState = { ...nextState };
    this.debugLogger.log('session.draft_state_changed.local', this.draftState);
    this.broadcast({
      type: 'draft_state_changed',
      draft: { ...this.draftState },
    });
  }

  private clearDraftState(message: string | null = null): void {
    this.activeDraftJob = null;
    this.updateDraftState({
      ...EMPTY_DRAFT_STATE,
      message,
    });
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

async function runDraftScript(job: ExecutionJobRecord): Promise<void> {
  const scriptSource = await readFile(job.scriptPath, 'utf8');
  const scriptArgs = buildDraftScriptArgs(scriptSource, job);
  const candidates = getDraftScriptCommandCandidates(process.platform, scriptArgs);

  let missingInterpreterCount = 0;

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate.command, candidate.args, {
        cwd: job.workspacePath,
      });
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & {
        stderr?: string;
        stdout?: string;
        code?: string | number | null;
      };

      if (nodeError.code === 'ENOENT') {
        missingInterpreterCount += 1;
        continue;
      }

      const details = stripAnsi(nodeError.stderr || nodeError.stdout || nodeError.message);
      throw new Error(`Failed to run draft script: ${details}`);
    }
  }

  if (missingInterpreterCount === candidates.length) {
    throw new Error('Python interpreter not found. Tried python3/python (or py -3 on Windows).');
  }
}

export function getDraftScriptCommandCandidates(
  platform: NodeJS.Platform,
  scriptArgs: string[],
): Array<{ command: string; args: string[] }> {
  return platform === 'win32'
    ? [
        { command: 'py', args: ['-3', 'edit.py', ...scriptArgs] },
        { command: 'python', args: ['edit.py', ...scriptArgs] },
      ]
    : [
        { command: 'python3', args: ['edit.py', ...scriptArgs] },
        { command: 'python', args: ['edit.py', ...scriptArgs] },
      ];
}

function summarizeMessageRequest(request: SessionMessageRequest) {
  return {
    sessionId: request.sessionId,
    activeModelId: request.activeModelId,
    messageText: request.message.text,
    triangleCount: request.selectionContext.triangleIds.length,
    componentCount: request.selectionContext.components.length,
    dominantOrientation: request.viewContext.dominantOrientation,
  };
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

async function validateDraftScriptForExecution(scriptPath: string): Promise<void> {
  const script = await readFile(scriptPath, 'utf8');
  const disallowedImports = [
    'numpy',
    'trimesh',
    'scipy',
    'pandas',
    'shapely',
    'mapbox_earcut',
    'stl',
    'meshio',
  ];

  for (const moduleName of disallowedImports) {
    const pattern = new RegExp(`^\\s*(?:from\\s+${escapeRegExp(moduleName)}\\b|import\\s+${escapeRegExp(moduleName)}\\b)`, 'm');
    if (pattern.test(script)) {
      throw new Error(
        `Draft script uses unsupported third-party dependency "${moduleName}". Execution scripts must use the Python standard library only.`,
      );
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
}

function buildDraftScriptArgs(scriptSource: string, job: ExecutionJobRecord): string[] {
  const args: string[] = [];
  const requiresNamedInputArg = /add_argument\(\s*["']--input["']/u.test(scriptSource);
  const requiresNamedOutputArg = /add_argument\(\s*["']--output["']/u.test(scriptSource);
  const requiresPositionalInputArg = /add_argument\(\s*["']input["'](?:\s*[,)\n])/u.test(scriptSource);
  const requiresPositionalOutputArg = /add_argument\(\s*["']output["'](?:\s*[,)\n])/u.test(scriptSource);

  if (requiresNamedInputArg) {
    args.push('--input', job.baseModel.storagePath);
  }

  if (requiresNamedOutputArg) {
    args.push('--output', job.outputModel.storagePath);
  }

  if (!requiresNamedInputArg && !requiresNamedOutputArg && requiresPositionalInputArg && requiresPositionalOutputArg) {
    args.push(job.baseModel.storagePath, job.outputModel.storagePath);
  }

  return args;
}

async function reconcileGeneratedModelOutput(job: ExecutionJobRecord): Promise<void> {
  if (await pathExists(job.outputModel.storagePath)) {
    return;
  }

  const candidates = await findWorkspaceGeneratedStls(job.workspacePath);
  if (candidates.length === 0) {
    return;
  }

  const newest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!newest) {
    return;
  }

  await copyFile(newest.path, job.outputModel.storagePath);
}

async function findWorkspaceGeneratedStls(rootPath: string): Promise<Array<{ path: string; mtimeMs: number }>> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const results: Array<{ path: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    const entryPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findWorkspaceGeneratedStls(entryPath)));
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.stl')) {
      continue;
    }

    const entryStat = await stat(entryPath);
    results.push({
      path: entryPath,
      mtimeMs: entryStat.mtimeMs,
    });
  }

  return results;
}
