import { createChatPanel } from '../chat/ChatPanel';
import { createChatStore, type ChatContextSummary } from '../chat/chat-store';
import { SessionClient } from '../chat/session-client';
import { createFileDropzone, isStlFile } from '../ui/FileDropzone';
import { StlViewport, type ViewportSelectionSummary } from '../viewer/StlViewport';

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

export class ViewerApp {
  private readonly sessionClient = new SessionClient();
  private readonly chatStore = createChatStore();
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

  private viewport: StlViewport | null = null;
  private activeModelId: string | null = null;
  private activeModelLabel: string | null = null;
  private modelSequence = 0;
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

  public constructor(private readonly root: HTMLElement) {
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
        <div class="chat-slot" data-chat-slot></div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.requireElement<HTMLButtonElement>('[data-pick-file]').addEventListener('click', () => {
      this.fileInput.click();
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
        this.chatStore.applyEvent(event);
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
        this.chatStore.setModelContext({
          activeModelId: status.activeModelId,
          modelLabel: status.modelLabel,
        });
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
      this.viewportPanel.classList.add('is-loaded');
      this.emptyState.classList.add('is-hidden');

      this.activeModelId = this.createNextModelId();
      this.activeModelLabel = file.name;
      this.chatStore.setModelContext({
        activeModelId: this.activeModelId,
        modelLabel: this.activeModelLabel,
      });
      this.syncChatContextSummary();

      await this.sessionClient.switchModel({
        sessionId: SESSION_ID,
        activeModelId: this.activeModelId,
        modelLabel: this.activeModelLabel,
      });
    } catch (error) {
      console.error(error);
      this.showError('文件无法解析，请确认它是有效的 STL 文件');
      this.reportChatError(error, 'session');
    }
  }

  private async handleSendMessage(text: string): Promise<void> {
    const payload = this.viewport?.buildChatPayload();
    if (!payload || !this.activeModelId) {
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
        activeModelId: this.activeModelId,
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

  private syncChatContextSummary(): void {
    const payload = this.viewport?.buildChatPayload();
    this.chatStore.setModelContext({
      activeModelId: this.activeModelId,
      modelLabel: this.activeModelLabel,
    });
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

  private createNextModelId(): string {
    this.modelSequence += 1;
    return `model_${String(this.modelSequence).padStart(3, '0')}`;
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
