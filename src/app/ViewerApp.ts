import { createFileDropzone, isStlFile } from '../ui/FileDropzone';
import { type ControlMode } from '../viewer/control-mode';
import { type OrientationKey, renderOrientationGizmo } from '../viewer/orientation-gizmo';
import { StlViewport } from '../viewer/StlViewport';

export class ViewerApp {
  private readonly modeButtons = new Map<ControlMode, HTMLButtonElement>();
  private mode: ControlMode = 'rotate';
  private activeOrientation: OrientationKey | null = null;
  private viewport: StlViewport | null = null;
  private readonly viewportPanel: HTMLElement;
  private readonly viewportHost: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly fileMeta: HTMLElement;
  private readonly errorText: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly orientationRoot: HTMLElement;
  private readonly dropzoneRoot: HTMLElement;

  constructor(private root: HTMLElement) {
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
    this.modeButtons.set('rotate', this.requireElement<HTMLButtonElement>('[data-mode="rotate"]'));
    this.modeButtons.set('pan', this.requireElement<HTMLButtonElement>('[data-mode="pan"]'));

    this.bindEvents();
    this.renderOrientationGizmo();
    this.mountViewport();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="app-shell">
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
          <button type="button" data-mode="rotate" aria-pressed="true">旋转</button>
          <button type="button" data-mode="pan" aria-pressed="false">平移</button>
          <button type="button" data-reset-view>重置视角</button>
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

    for (const [mode, button] of this.modeButtons) {
      button.addEventListener('click', () => this.setMode(mode));
    }

    this.requireElement<HTMLButtonElement>('[data-reset-view]').addEventListener('click', () => {
      this.viewport?.resetView();
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
    });

    this.viewport.mount(this.viewportHost);
    this.viewport.setMode(this.mode);
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

  private setMode(mode: ControlMode): void {
    this.mode = mode;

    for (const [candidate, button] of this.modeButtons) {
      button.setAttribute('aria-pressed', String(candidate === mode));
    }

    this.viewport?.setMode(mode);
  }

  private renderOrientationGizmo(): void {
    renderOrientationGizmo(this.orientationRoot, this.activeOrientation, (key) => {
      this.viewport?.orientTo(key);
    });
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

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
