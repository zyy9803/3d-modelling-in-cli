import { createFileDropzone } from '../ui/FileDropzone';

export class ViewerApp {
  constructor(private root: HTMLElement) {
    this.render();
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
        </header>
        <main class="viewer-layout">
          <section class="viewport-panel">
            <div class="viewport-empty">拖拽 STL 文件到这里开始预览</div>
          </section>
        </main>
        <footer class="toolbar">
          <button type="button" data-mode="rotate" aria-pressed="true">旋转</button>
          <button type="button" data-mode="pan" aria-pressed="false">平移</button>
          <button type="button" data-reset-view>重置视角</button>
        </footer>
      </div>
    `;

    this.root.querySelector('.viewport-panel')?.append(createFileDropzone());
  }
}
