import { createFileDropzone, isStlFile } from '../ui/FileDropzone';
import { type OrientationKey, renderOrientationGizmo } from '../viewer/orientation-gizmo';
import { StlViewport, type ViewportSelectionSummary } from '../viewer/StlViewport';

const EMPTY_SELECTION_SUMMARY: ViewportSelectionSummary = {
  triangleCount: 0,
  componentCount: 0,
  mode: 'click',
};

export class ViewerApp {
  private activeOrientation: OrientationKey | null = null;
  private viewport: StlViewport | null = null;
  private selectionSummary = EMPTY_SELECTION_SUMMARY;
  private readonly viewportPanel: HTMLElement;
  private readonly viewportHost: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly fileMeta: HTMLElement;
  private readonly errorText: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly orientationRoot: HTMLElement;
  private readonly dropzoneRoot: HTMLElement;
  private readonly selectionStatus: HTMLElement;

  constructor(private readonly root: HTMLElement) {
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

    this.bindEvents();
    this.updateSelectionStatus(this.selectionSummary);
    this.renderOrientationGizmo();
    this.mountViewport();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="app-shell app-shell--viewport">
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
            <button type="button" data-reset-view>重置视角</button>
          </div>
        </footer>
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
    });

    this.requireElement<HTMLButtonElement>('[data-clear-selection]').addEventListener('click', () => {
      this.viewport?.clearSelection();
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

  private mountViewport(): void {
    if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') {
      return;
    }

    this.viewport = new StlViewport({
      onOrientationChange: (key) => {
        this.activeOrientation = key;
        this.renderOrientationGizmo();
      },
      onSelectionChange: (summary) => {
        this.updateSelectionStatus(summary);
      },
    });

    this.viewport.mount(this.viewportHost);
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
    } catch (error) {
      console.error(error);
      this.showError('文件无法解析，请确认它是有效的 STL 文件');
    }
  }

  private renderOrientationGizmo(): void {
    renderOrientationGizmo(this.orientationRoot, this.activeOrientation, (key) => {
      this.viewport?.orientTo(key);
    });
  }

  private updateSelectionStatus(summary: ViewportSelectionSummary): void {
    this.selectionSummary = summary;
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
