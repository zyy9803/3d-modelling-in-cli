import { createChatPanel } from '../chat/ChatPanel';
import { createChatStore, type ChatContextSummary, type ChatStore } from '../chat/chat-store';
import { SessionClient } from '../chat/session-client';
import { createFileDropzone, isStlFile } from '../ui/FileDropzone';
import { StlViewport, type ViewportSelectionSummary } from '../viewer/StlViewport';
import type { SessionStreamEvent } from '../shared/codex-session-types';

const SESSION_ID = 'sess_main';

const EMPTY_SELECTION_SUMMARY: ViewportSelectionSummary = {
  triangleCount: 0,
  componentCount: 0,
  mode: 'click',
};

const EMPTY_CHAT_CONTEXT: ChatContextSummary = {
  triangleCount: 0,
  componentCount: 0,
  orientation: '+X',
};

type SessionClientLike = Pick<
  SessionClient,
  | 'connect'
  | 'getStatus'
  | 'sendMessage'
  | 'sendDecision'
  | 'interrupt'
  | 'importModel'
  | 'switchModel'
  | 'clearSession'
  | 'fetchModelFile'
>;

type ViewportLike = Pick<
  StlViewport,
  'mount' | 'loadFile' | 'resetView' | 'clearSelection' | 'exportContext' | 'buildChatPayload'
>;

type ViewerAppOptions = {
  sessionClient?: SessionClientLike;
  chatStore?: ChatStore;
  createViewport?: () => ViewportLike;
};

export class ViewerApp {
  private readonly sessionClient: SessionClientLike;
  private readonly chatStore: ChatStore;
  private readonly createViewport: (() => ViewportLike) | null;
  private readonly chatPanel = createChatPanel({
    onSend: (text) => {
      void this.handleSendMessage(text);
    },
    onInterrupt: () => {
      void this.handleInterruptTurn();
    },
    onClearSession: () => {
      void this.handleClearSession();
    },
    onDecision: (decisionId, answers) => {
      void this.handleDecision(decisionId, answers);
    },
  });

  private viewport: ViewportLike | null = null;
  private activeModelId: string | null = null;
  private activeModelLabel: string | null = null;
  private readonly viewportPanel: HTMLElement;
  private readonly viewportHost: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly fileMeta: HTMLElement;
  private readonly errorText: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly orientationRoot: HTMLElement;
  private readonly dropzoneRoot: HTMLElement;
  private readonly selectionStatus: HTMLElement;
  private readonly chatSlot: HTMLElement;

  public constructor(private readonly root: HTMLElement, options: ViewerAppOptions = {}) {
    this.sessionClient = options.sessionClient ?? new SessionClient();
    this.chatStore = options.chatStore ?? createChatStore();
    this.createViewport = options.createViewport ?? null;
    this.render();
    this.viewportPanel = this.requireElement<HTMLElement>('[data-viewport-panel]');
    this.viewportHost = this.requireElement<HTMLElement>('[data-viewport-host]');
    this.dropzoneRoot = this.requireElement<HTMLElement>('[data-dropzone-root]');
    this.dropzoneRoot.append(createFileDropzone());
    this.fileInput = this.requireElement<HTMLInputElement>('[data-file-input]');
    this.fileMeta = this.requireElement<HTMLElement>('[data-file-meta]');
    this.errorText = this.requireElement<HTMLElement>('[data-error-text]');
    this.emptyState = this.requireElement<HTMLElement>('[data-empty-state]');
    this.orientationRoot = this.requireElement<HTMLElement>('[data-orientation-root]');
    this.selectionStatus = this.requireElement<HTMLElement>('[data-selection-status]');
    this.chatSlot = this.requireElement<HTMLElement>('[data-chat-slot]');
    this.chatSlot.append(this.chatPanel.element);

    this.bindEvents();
    this.bindChat();
    this.updateSelectionStatus(EMPTY_SELECTION_SUMMARY);
    this.mountViewport();
    this.syncChatContextSummary();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="app-shell app-shell--with-chat">
        <a class="skip-link" href="#workspace-main">跳转到主内容</a>
        <div class="app-main">
          <header class="topbar">
            <div class="topbar__intro">
              <div class="topbar__title-group">
                <h1>STL Web 预览器</h1>
                <p>导入 .stl 后即可开始预览、选区和协作。</p>
              </div>
            </div>
            <div class="topbar__actions">
              <div class="file-meta is-hidden" data-file-meta></div>
              <button class="button button--primary button--compact" type="button" data-pick-file>导入 STL</button>
            </div>
            <input type="file" accept=".stl" hidden data-file-input />
          </header>
          <div class="workspace-shell" id="workspace-main">
            <main class="viewer-layout">
              <section class="viewport-panel" data-viewport-panel>
                <div class="viewport-host" data-viewport-host></div>
                <div class="viewport-empty" data-empty-state>
                  <div class="empty-state">
                    <h2>拖拽 STL 文件到这里开始预览</h2>
                    <p>也可以直接从本地导入一个 .stl 文件开始工作。</p>
                    <div class="empty-state__actions">
                      <button class="button button--primary" type="button" data-pick-file>导入 STL</button>
                      <span class="empty-state__meta">支持拖拽和点击导入</span>
                    </div>
                  </div>
                </div>
                <div class="viewport-error is-hidden" data-error-text></div>
                <div data-dropzone-root></div>
                <div class="orientation-anchor" data-orientation-root></div>
              </section>
              <footer class="viewer-toolbar" aria-label="画布操作">
                <p class="selection-status" data-selection-status></p>
                <div class="viewer-toolbar__actions">
                  <button class="button button--toolbar button--compact" type="button" data-reset-view>重置视角</button>
                  <button class="button button--toolbar button--compact" type="button" data-export-context>导出上下文</button>
                  <button class="button button--toolbar button--compact" type="button" data-clear-selection>清空选择</button>
                </div>
              </footer>
            </main>
          </div>
        </div>
        <div class="chat-slot" data-chat-slot></div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-pick-file]').forEach((button) => {
      button.addEventListener('click', () => {
        this.fileInput.click();
      });
    });

    this.fileInput.addEventListener('change', async () => {
      await this.handleFile(this.fileInput.files?.[0] ?? null);
      this.fileInput.value = '';
    });

    this.requireElement<HTMLButtonElement>('[data-reset-view]').addEventListener('click', () => {
      this.viewport?.resetView();
      this.syncChatContextSummary();
    });

    this.requireElement<HTMLButtonElement>('[data-clear-selection]').addEventListener('click', () => {
      this.viewport?.clearSelection();
      this.syncChatContextSummary();
    });

    this.requireElement<HTMLButtonElement>('[data-clear-session]').addEventListener('click', () => {
      void this.handleClearSession();
    });

    this.requireElement<HTMLButtonElement>('[data-export-context]').addEventListener('click', () => {
      this.viewport?.exportContext();
    });

    this.viewportPanel.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.viewportPanel.classList.add('is-drag-active');
    });

    this.viewportPanel.addEventListener('dragleave', (event) => {
      if (event.target === this.viewportPanel) {
        this.viewportPanel.classList.remove('is-drag-active');
      }
    });

    this.viewportPanel.addEventListener('drop', async (event) => {
      event.preventDefault();
      this.viewportPanel.classList.remove('is-drag-active');
      await this.handleFile(event.dataTransfer?.files?.[0] ?? null);
    });
  }

  private bindChat(): void {
    this.chatStore.subscribe(() => {
      this.chatPanel.render(this.chatStore.getState());
    });
    this.chatPanel.render(this.chatStore.getState());

    this.sessionClient.connect({
      onEvent: (event) => {
        this.handleSessionEvent(event);
      },
    });

    void this.sessionClient
      .getStatus()
      .then((status) => {
        this.chatStore.applyEvent({
          type: 'connection_status_changed',
          connectionStatus: status.connectionStatus,
          message: status.connectionMessage,
        });
        this.chatStore.applyEvent({
          type: 'status_changed',
          status: status.sessionStatus,
        });
        if (
          this.activeModelId === null &&
          this.activeModelLabel === null &&
          (status.activeModelId !== null || status.modelLabel !== null)
        ) {
          this.applyModelContext(status.activeModelId, status.modelLabel);
          if (status.activeModelId) {
            void this.restoreModelFromStatus(status.activeModelId, status.modelLabel);
          }
        }
      })
      .catch((error: unknown) => {
        this.chatStore.applyEvent({
          type: 'connection_status_changed',
          connectionStatus: 'failed',
          message: error instanceof Error ? error.message : 'Failed to fetch session status.',
        });
      });
  }

  private mountViewport(): void {
    if (this.createViewport) {
      this.viewport = this.createViewport();
      this.viewport.mount(this.viewportHost, this.orientationRoot);
      return;
    }

    if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') {
      return;
    }

    this.viewport = new StlViewport({
      onSelectionChange: (summary) => {
        this.updateSelectionStatus(summary);
        this.syncChatContextSummary();
      },
    });

    this.viewport.mount(this.viewportHost, this.orientationRoot);
  }

  private handleSessionEvent(event: SessionStreamEvent): void {
    this.chatStore.applyEvent(event);

    switch (event.type) {
      case 'model_switched':
        this.applyModelContext(event.activeModelId, event.modelLabel);
        break;
      case 'model_generated':
        void this.loadGeneratedModel(event.newModelId, event.modelLabel);
        break;
      default:
        break;
    }
  }

  private async loadGeneratedModel(modelId: string, modelLabel: string): Promise<void> {
    if (!this.viewport) {
      this.showError('Generated model could not be loaded because the viewport is unavailable.');
      return;
    }

    try {
      const file = await this.sessionClient.fetchModelFile(modelId);
      await this.viewport.loadFile(file);
      this.applyModelContext(modelId, modelLabel);
      this.markViewportLoaded(modelLabel);
      this.syncChatContextSummary();
      this.showError('');
    } catch (error) {
      console.error(error);
      this.showError(`Failed to load generated model: ${modelLabel}`);
      this.reportChatError(error, 'session');
    }
  }

  private async restoreModelFromStatus(modelId: string, modelLabel: string | null): Promise<void> {
    if (!this.viewport) {
      return;
    }

    try {
      const file = await this.sessionClient.fetchModelFile(modelId);
      await this.viewport.loadFile(file);
      this.markViewportLoaded(modelLabel ?? file.name);
      this.syncChatContextSummary();
      this.showError('');
    } catch {
      // Best effort only. Status restoration should not surface a hard error because
      // imported local models may not exist in server-backed storage.
    }
  }

  private async handleFile(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (!isStlFile(file)) {
      this.showError('只支持 .stl 文件');
      return;
    }

    if (!this.viewport) {
      this.showError('当前环境不支持 WebGL 渲染');
      return;
    }

    this.showError('');
    this.fileMeta.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    this.fileMeta.classList.remove('is-hidden');

    try {
      await this.viewport.loadFile(file);
      const importedModel = await this.sessionClient.importModel(SESSION_ID, file);
      this.applyModelContext(importedModel.modelId, importedModel.modelLabel);
      this.markViewportLoaded(file.name);
      this.syncChatContextSummary();
    } catch (error) {
      console.error(error);
      this.showError('文件无法解析，请确认它是有效的 STL 文件');
      this.reportChatError(error, 'session');
    }
  }

  private async handleSendMessage(text: string): Promise<void> {
    const payload = this.viewport?.buildChatPayload();
    const activeModelId = this.activeModelId;
    if (!payload || !activeModelId) {
      this.showError('请先加载 STL 文件后再发送给 Codex');
      return;
    }

    if (payload.selectionContext.triangleIds.length === 0) {
      this.showError('请先选中需要交给 Codex 的三角面');
      return;
    }

    this.showError('');
    this.syncChatContextSummary();
    this.chatStore.appendUserMessage(text);

    try {
      await this.sessionClient.sendMessage({
        sessionId: SESSION_ID,
        activeModelId,
        message: {
          role: 'user',
          text,
        },
        selectionContext: payload.selectionContext,
        viewContext: payload.viewContext,
      });
    } catch (error) {
      this.reportChatError(error, 'session');
    }
  }

  private async handleClearSession(): Promise<void> {
    try {
      await this.sessionClient.clearSession();
    } catch (error) {
      this.reportChatError(error, 'session');
    }
  }

  private async handleDecision(decisionId: string, answers: Record<string, string>): Promise<void> {
    try {
      await this.sessionClient.sendDecision({
        sessionId: SESSION_ID,
        decisionId,
        answers,
      });
    } catch (error) {
      this.reportChatError(error, 'session');
    }
  }

  private async handleInterruptTurn(): Promise<void> {
    try {
      await this.sessionClient.interrupt({
        sessionId: SESSION_ID,
      });
    } catch (error) {
      this.reportChatError(error, 'session');
    }
  }

  private applyModelContext(activeModelId: string | null, modelLabel: string | null): void {
    this.activeModelId = activeModelId;
    this.activeModelLabel = modelLabel;
    this.chatStore.setModelContext({
      activeModelId,
      modelLabel,
    });
  }

  private markViewportLoaded(modelLabel: string): void {
    this.viewportPanel.classList.add('is-loaded');
    this.emptyState.classList.add('is-hidden');
    this.fileMeta.textContent = modelLabel;
    this.fileMeta.classList.remove('is-hidden');
  }

  private syncChatContextSummary(): void {
    const payload = this.viewport?.buildChatPayload();
    this.chatStore.setContextSummary(
      payload
        ? {
            triangleCount: payload.selectionContext.triangleIds.length,
            componentCount: payload.selectionContext.components.length,
            orientation: payload.viewContext.dominantOrientation,
          }
        : EMPTY_CHAT_CONTEXT,
    );
  }

  private updateSelectionStatus(summary: ViewportSelectionSummary): void {
    this.selectionStatus.textContent = formatSelectionStatus(summary);
  }

  private showError(message: string): void {
    if (!message) {
      this.errorText.textContent = '';
      this.errorText.classList.add('is-hidden');
      return;
    }

    this.errorText.textContent = message;
    this.errorText.classList.remove('is-hidden');
  }

  private reportChatError(error: unknown, scope: 'connection' | 'session'): void {
    this.chatStore.applyEvent({
      type: 'error',
      scope,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Required element not found: ${selector}`);
    }
    return element;
  }
}

function formatSelectionStatus(summary: ViewportSelectionSummary): string {
  const modeLabel = summary.mode === 'box' ? '框选' : '点选';
  return `已选 ${summary.triangleCount} 个三角面 | ${summary.componentCount} 个连通块 | 当前选择：${modeLabel}`;
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
