import { useViewerAppContext, ViewerAppProvider } from "./context/ViewerAppContext";
import type { ViewerAppOptions } from "./hooks/useViewerAppController";
import { ChatPanel } from "../features/chat";
import { FileDropzone } from "../features/viewer";

export function ViewerApp(options: ViewerAppOptions) {
  return (
    <ViewerAppProvider {...options}>
      <ViewerAppLayout />
    </ViewerAppProvider>
  );
}

function ViewerAppLayout() {
  const controller = useViewerAppContext();

  return (
    <div className="app-shell app-shell--with-chat">
      <a className="skip-link" href="#workspace-main">
        跳转到主内容
      </a>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__intro">
            <div className="topbar__title-group">
              <h1>STL Web 预览器</h1>
              <p>导入 .stl 后即可开始预览、选区和协作。</p>
            </div>
          </div>
          <div className="topbar__actions">
            <div
              className={`file-meta${controller.fileMeta ? "" : " is-hidden"}`}
              data-file-meta="true"
            >
              <div className="file-meta__text">
                <strong className="file-meta__name" data-file-meta-name="true">
                  {controller.fileMeta?.name ?? ""}
                </strong>
                <span
                  className="file-meta__path"
                  data-file-meta-path="true"
                  title={controller.fileMeta?.modelPath ?? controller.fileMeta?.detail ?? ""}
                >
                  {controller.fileMeta?.detail ?? ""}
                </span>
              </div>
              <button
                className={`button button--ghost button--compact file-meta__copy${
                  controller.fileMeta?.modelPath ? "" : " is-hidden"
                }`}
                type="button"
                data-copy-model-path="true"
                disabled={!controller.fileMeta?.modelPath}
                onClick={() => {
                  void controller.handleCopyModelPath();
                }}
              >
                复制路径
              </button>
            </div>
            <button
              className="button button--primary button--compact"
              type="button"
              data-pick-file="true"
              onClick={controller.handlePickFile}
            >
              导入 STL
            </button>
          </div>
          <input
            ref={controller.fileInputRef}
            type="file"
            accept=".stl"
            hidden
            data-file-input="true"
            onChange={controller.handleFileInputChange}
          />
        </header>

        <div className="workspace-shell" id="workspace-main">
          <main className="viewer-layout">
            <section
              className={`viewport-panel${
                controller.viewportLoaded ? " is-loaded" : ""
              }${controller.isDragActive ? " is-drag-active" : ""}`}
              data-viewport-panel="true"
              onDragOver={controller.handleViewportDragOver}
              onDragLeave={controller.handleViewportDragLeave}
              onDrop={controller.handleViewportDrop}
            >
              <div
                ref={controller.viewportHostRef}
                className="viewport-host"
                data-viewport-host="true"
              />
              <div
                className={`viewport-empty${
                  controller.viewportLoaded ? " is-hidden" : ""
                }`}
                data-empty-state="true"
              >
                <div className="empty-state">
                  <h2>拖拽 STL 文件到这里开始预览</h2>
                </div>
              </div>
              <div
                className={`viewport-error${
                  controller.errorMessage ? "" : " is-hidden"
                }`}
                data-error-text="true"
              >
                {controller.errorMessage}
              </div>
              <div data-dropzone-root="true">
                <FileDropzone />
              </div>
              <div
                ref={controller.orientationRootRef}
                className="orientation-anchor"
                data-orientation-root="true"
              />
            </section>

            <footer className="viewer-toolbar" aria-label="画布操作">
              <p className="selection-status" data-selection-status="true">
                {controller.selectionStatusText}
              </p>
              <div className="viewer-toolbar__actions">
                <button
                  className="button button--toolbar button--compact"
                  type="button"
                  data-reset-view="true"
                  onClick={controller.handleResetView}
                >
                  重置视角
                </button>
                <button
                  className="button button--toolbar button--compact"
                  type="button"
                  data-export-context="true"
                  onClick={controller.handleExportContext}
                >
                  导出上下文
                </button>
                <button
                  className="button button--toolbar button--compact"
                  type="button"
                  data-clear-selection="true"
                  onClick={controller.handleClearSelection}
                >
                  清空选择
                </button>
              </div>
            </footer>
          </main>
        </div>
      </div>

      <div className="chat-slot" data-chat-slot="true">
        <ChatPanel
          state={controller.chatState}
          handlers={{
            onSend: controller.handleSendMessage,
            onGenerateModel: controller.handleGenerateModel,
            onInterrupt: controller.handleInterruptTurn,
            onClearSession: controller.handleClearSession,
            onDecision: controller.handleDecision,
          }}
        />
      </div>
    </div>
  );
}
