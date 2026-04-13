import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers/AppProviders";
import { ViewerApp } from "../../../src/app/ViewerApp";
import type { ChatStoreState } from "../../../src/components/chat/state";
import type { SessionStreamEvent } from "../../../src/shared/codex-session-types";

type FakeSessionClient = {
  onEvent: ((event: SessionStreamEvent) => void) | null;
  fetchModelFileCalls: string[];
  importModelCalls: Array<{ sessionId: string; file: File }>;
  generateModelCalls: Array<{ sessionId: string }>;
  sendMessageCalls: Array<Record<string, unknown>>;
  connect: (options: { onEvent: (event: SessionStreamEvent) => void }) => () => void;
  getStatus: () => Promise<{
    connectionStatus: "starting" | "connected" | "disconnected" | "failed";
    connectionMessage: string;
    sessionStatus: "idle" | "sending" | "streaming" | "waiting_decision" | "resuming" | "completed" | "failed";
    activeModelId: string | null;
    modelLabel: string | null;
    draft: ChatStoreState["draft"];
  }>;
  sendMessage: (request: Record<string, unknown>) => Promise<void>;
  generateModel: (request: { sessionId: string }) => Promise<void>;
  sendDecision: () => Promise<void>;
  interrupt: () => Promise<void>;
  importModel: (sessionId: string, file: File) => Promise<{ modelId: string; modelLabel: string }>;
  switchModel: (request: {
    sessionId: string;
    activeModelId: string | null;
    modelLabel: string | null;
  }) => Promise<void>;
  clearSession: () => Promise<void>;
  fetchModelFile: (modelId: string) => Promise<File>;
};

type FakeViewport = {
  mounted: boolean;
  loadedFiles: File[];
  themeModes: Array<"light" | "dark">;
  mount: (container: HTMLElement, orientationRoot?: HTMLElement) => void;
  loadFile: (file: File) => Promise<void>;
  setThemeMode: (mode: "light" | "dark") => void;
  resetView: () => void;
  clearSelection: () => void;
  exportContext: () => null;
  buildChatPayload: () => {
    selectionContext: {
      mode: "click";
      triangleIds: number[];
      components: [];
    };
    viewContext: {
      cameraPosition: [number, number, number];
      target: [number, number, number];
      up: [number, number, number];
      fov: number;
      viewDirection: [number, number, number];
      dominantOrientation: string;
      viewportSize: [number, number];
    };
  };
  dispose: () => void;
};

let mountedRoot: Root | null = null;
let mountedContainer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    mountedRoot?.unmount();
  });
  vi.restoreAllMocks();
  mountedRoot = null;
  mountedContainer?.remove();
  mountedContainer = null;
});

async function renderViewerApp(options: {
  sessionClient: FakeSessionClient;
  createViewport?: () => FakeViewport;
  initialChatState?: Partial<ChatStoreState>;
}): Promise<HTMLDivElement> {
  if (!mountedContainer) {
    mountedContainer = document.createElement("div");
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
  }

  await act(async () => {
    mountedRoot!.render(
      <AppProviders>
        <ViewerApp {...options} />
      </AppProviders>,
    );
    await flushMicrotasks();
  });

  return mountedContainer;
}

describe("ViewerApp", () => {
  it("renders the empty state and toolbar actions", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    expect(
      root.textContent?.match(/拖拽 STL 文件到这里开始预览/g)?.length ?? 0,
    ).toBe(1);
    expect(root.querySelector('[data-dropzone-root="true"]')?.textContent?.trim()).toBe(
      "",
    );
    expect(root.querySelector('[data-export-context="true"]')).not.toBeNull();
    expect(root.querySelector('[data-clear-selection="true"]')).not.toBeNull();
    expect(root.querySelector('[data-reset-view="true"]')).not.toBeNull();
  });

  it("uses low-emphasis text buttons in the viewer toolbar", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    expect(root.querySelector('[data-reset-view="true"]')?.className).toContain(
      "MuiButton-text",
    );
    expect(root.querySelector('[data-export-context="true"]')?.className).toContain(
      "MuiButton-text",
    );
    expect(root.querySelector('[data-clear-selection="true"]')?.className).toContain(
      "MuiButton-text",
    );
  });

  it("renders the selection status bar", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    expect(root.querySelector('[data-selection-status="true"]')?.textContent).toContain(
      "0",
    );
  });

  it("shows the selection shortcut hint in the viewer toolbar", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    const selectionGroup = root.querySelector<HTMLElement>('[data-selection-status-group="true"]');
    const hint = root.querySelector<HTMLElement>('[data-selection-shortcuts-hint="true"]');

    expect(hint?.textContent).toContain(
      "Shift 增加选区，Ctrl/Cmd 减少选区",
    );
    expect(selectionGroup).not.toBeNull();
    expect(hint?.parentElement).toBe(selectionGroup);
    expect(getComputedStyle(selectionGroup!).flexDirection).toBe("row");
  });

  it("keeps the orientation anchor mounted but empty before a model is loaded", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    expect(root.querySelector('[data-orientation-root="true"]')).not.toBeNull();
    expect(
      root.querySelector('[data-orientation-root="true"]')?.childElementCount,
    ).toBe(0);
  });

  it("marks the shell as a viewport-filling layout", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    expect(root.querySelector(".app-shell--with-chat")).not.toBeNull();
  });

  it("toggles the color mode from the top bar", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    const shell = root.querySelector<HTMLElement>('[data-app-shell="true"]');
    const toggle = root.querySelector<HTMLButtonElement>('[data-theme-toggle="true"]');

    expect(shell?.dataset.colorMode).toBe("light");
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.click();
      await flushMicrotasks();
    });

    expect(shell?.dataset.colorMode).toBe("dark");
  });

  it("syncs the current color mode to the viewport", async () => {
    const viewport = createFakeViewport();
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
      createViewport: () => viewport,
    });

    const toggle = root.querySelector<HTMLButtonElement>('[data-theme-toggle="true"]');

    expect(viewport.themeModes).toEqual(["light"]);

    await act(async () => {
      toggle?.click();
      await flushMicrotasks();
    });

    expect(viewport.themeModes).toEqual(["light", "dark"]);
  });

  it("updates the split percentage when dragging the resize handle", async () => {
    const root = await renderViewerApp({
      sessionClient: createFakeSessionClient(),
    });

    const shell = root.querySelector<HTMLElement>('[data-app-shell="true"]');
    const resizer = root.querySelector<HTMLElement>('[data-split-resizer="true"]');

    expect(shell).not.toBeNull();
    expect(resizer?.getAttribute("aria-valuenow")).toBe("62");

    vi.spyOn(shell!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizer?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 744 }),
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 840 }),
      );
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await flushMicrotasks();
    });

    expect(resizer?.getAttribute("aria-valuenow")).toBe("70");
  });

  it("fetches and loads generated models without clearing chat state", async () => {
    const sessionClient = createFakeSessionClient();
    const viewport = createFakeViewport();
    const root = await renderViewerApp({
      sessionClient,
      createViewport: () => viewport,
      initialChatState: {
        messages: [
          {
            kind: "message",
            id: "user-1",
            role: "user",
            text: "keep this conversation",
            status: "completed",
          },
        ],
      },
    });

    await act(async () => {
      sessionClient.onEvent?.({
        type: "model_generated",
        jobId: "job_001",
        baseModelId: "model_001",
        newModelId: "model_002",
        modelLabel: "model_002_from_model_001.stl",
        modelPath: "/tmp/models/model_002_from_model_001.stl",
      });

      await flushMicrotasks();
    });

    expect(sessionClient.fetchModelFileCalls).toEqual(["model_002"]);
    expect(viewport.loadedFiles).toHaveLength(1);
    expect(viewport.loadedFiles[0]?.name).toBe("model_002.stl");
    expect(root.textContent).toContain("model_002_from_model_001.stl");
    expect(
      root.querySelector('[data-copy-model-path="true"]')?.classList.contains(
        "is-hidden",
      ),
    ).toBe(false);
    expect(root.textContent).toContain("keep this conversation");
    expect(root.textContent).toContain(
      "新 STL 已生成：/tmp/models/model_002_from_model_001.stl",
    );
    expect(root.querySelector('[data-file-meta="true"]')?.className).not.toContain(
      "MuiPaper-outlined",
    );
  });

  it("does not switch the active model when generated-model fetch fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sessionClient = createFakeSessionClient({
      fetchModelFile: async () => {
        throw new Error("fetch failed");
      },
    });
    const viewport = createFakeViewport();
    const root = await renderViewerApp({
      sessionClient,
      createViewport: () => viewport,
    });

    await act(async () => {
      sessionClient.onEvent?.({
        type: "model_generated",
        jobId: "job_001",
        baseModelId: "model_001",
        newModelId: "model_002",
        modelLabel: "model_002_from_model_001.stl",
        modelPath: "/tmp/models/model_002_from_model_001.stl",
      });

      await flushMicrotasks();
    });

    expect(sessionClient.fetchModelFileCalls).toEqual(["model_002"]);
    expect(viewport.loadedFiles).toHaveLength(0);
    expect(root.textContent).toContain("错误：fetch failed");
  });

  it("loads a restorable active model from session status on startup", async () => {
    const sessionClient = createFakeSessionClient({
      status: {
        connectionStatus: "connected",
        connectionMessage: "connected",
        sessionStatus: "idle",
        activeModelId: "model_002",
        modelLabel: "model_002_from_model_001.stl",
        draft: {
          status: "empty",
          jobId: null,
          baseModelId: null,
          scriptPath: null,
          message: null,
        },
      },
    });
    const viewport = createFakeViewport();
    const root = await renderViewerApp({
      sessionClient,
      createViewport: () => viewport,
    });

    await flushMicrotasks();

    expect(sessionClient.fetchModelFileCalls).toEqual(["model_002"]);
    expect(viewport.loadedFiles).toHaveLength(1);
    expect(root.textContent).toContain("model_002_from_model_001.stl");
  });

  it("calls the explicit generate endpoint when the draft is ready and the button is clicked", async () => {
    const sessionClient = createFakeSessionClient({
      status: {
        connectionStatus: "connected",
        connectionMessage: "connected",
        sessionStatus: "completed",
        activeModelId: "model_001",
        modelLabel: "part.stl",
        draft: {
          status: "ready",
          jobId: "job_001",
          baseModelId: "model_001",
          scriptPath: "/tmp/job_001/edit.py",
          message: null,
        },
      },
    });

    const root = await renderViewerApp({
      sessionClient,
      createViewport: () => createFakeViewport(),
    });

    await flushMicrotasks();

    const button = root.querySelector<HTMLButtonElement>(
      '[data-generate-model="true"]',
    );
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
      await flushMicrotasks();
    });

    expect(sessionClient.generateModelCalls).toEqual([{ sessionId: "sess_main" }]);
  });

  it("allows sending a message with no selected triangles and treats it as the whole STL", async () => {
    const sessionClient = createFakeSessionClient({
      status: {
        connectionStatus: "connected",
        connectionMessage: "connected",
        sessionStatus: "idle",
        activeModelId: "model_001",
        modelLabel: "part.stl",
        draft: {
          status: "empty",
          jobId: null,
          baseModelId: null,
          scriptPath: null,
          message: null,
        },
      },
    });

    const root = await renderViewerApp({
      sessionClient,
      createViewport: () =>
        createFakeViewport({
          buildChatPayload: () => ({
            selectionContext: {
              mode: "click",
              triangleIds: [],
              components: [],
            },
            viewContext: {
              cameraPosition: [0, 0, 5],
              target: [0, 0, 0],
              up: [0, 1, 0],
              fov: 50,
              viewDirection: [0, 0, -1],
              dominantOrientation: "+X",
              viewportSize: [800, 600],
            },
          }),
        }),
    });

    await flushMicrotasks();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-chat-input="true"]',
    );
    expect(input).not.toBeNull();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "edit whole model");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      await flushMicrotasks();
    });

    await act(async () => {
      root
        .querySelector<HTMLFormElement>('[data-chat-form="true"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flushMicrotasks();
    });

    expect(sessionClient.sendMessageCalls).toHaveLength(1);
    expect(sessionClient.sendMessageCalls[0]).toMatchObject({
      sessionId: "sess_main",
      activeModelId: "model_001",
      selectionContext: {
        triangleIds: [],
      },
    });
    expect(root.textContent).not.toContain("请先选中需要交给 Codex 的三角面");
  });
});

function createFakeSessionClient(
  overrides: Partial<Pick<FakeSessionClient, "fetchModelFile">> & {
    status?: Awaited<ReturnType<FakeSessionClient["getStatus"]>>;
  } = {},
): FakeSessionClient {
  const state = {
    onEvent: null as ((event: SessionStreamEvent) => void) | null,
    fetchModelFileCalls: [] as string[],
    importModelCalls: [] as Array<{ sessionId: string; file: File }>,
    generateModelCalls: [] as Array<{ sessionId: string }>,
    sendMessageCalls: [] as Array<Record<string, unknown>>,
  };

  return {
    get onEvent() {
      return state.onEvent;
    },
    set onEvent(value: ((event: SessionStreamEvent) => void) | null) {
      state.onEvent = value;
    },
    get fetchModelFileCalls() {
      return state.fetchModelFileCalls;
    },
    get importModelCalls() {
      return state.importModelCalls;
    },
    get generateModelCalls() {
      return state.generateModelCalls;
    },
    get sendMessageCalls() {
      return state.sendMessageCalls;
    },
    connect(options) {
      state.onEvent = options.onEvent;
      return () => {
        state.onEvent = null;
      };
    },
    async getStatus() {
      return (
        overrides.status ?? {
          connectionStatus: "connected",
          connectionMessage: "connected",
          sessionStatus: "idle",
          activeModelId: null,
          modelLabel: null,
          draft: {
            status: "empty",
            jobId: null,
            baseModelId: null,
            scriptPath: null,
            message: null,
          },
        }
      );
    },
    async sendMessage(request) {
      state.sendMessageCalls.push(request);
    },
    async generateModel(request) {
      state.generateModelCalls.push(request);
    },
    async sendDecision() {},
    async interrupt() {},
    async importModel(sessionId: string, file: File) {
      state.importModelCalls.push({ sessionId, file });
      return {
        modelId: "model_009",
        modelLabel: file.name,
      };
    },
    async switchModel() {},
    async clearSession() {},
    async fetchModelFile(modelId: string) {
      state.fetchModelFileCalls.push(modelId);
      if (overrides.fetchModelFile) {
        return overrides.fetchModelFile(modelId);
      }
      return new File(["solid generated\nendsolid generated\n"], `${modelId}.stl`, {
        type: "model/stl",
      });
    },
  };
}

function createFakeViewport(
  overrides: Partial<Pick<FakeViewport, "loadFile" | "buildChatPayload">> = {},
): FakeViewport {
  const state = {
    mounted: false,
    loadedFiles: [] as File[],
    themeModes: [] as Array<"light" | "dark">,
  };

  return {
    get mounted() {
      return state.mounted;
    },
    get loadedFiles() {
      return state.loadedFiles;
    },
    get themeModes() {
      return state.themeModes;
    },
    mount() {
      state.mounted = true;
    },
    async loadFile(file: File) {
      if (overrides.loadFile) {
        await overrides.loadFile(file);
        return;
      }
      state.loadedFiles.push(file);
    },
    resetView() {},
    setThemeMode(mode: "light" | "dark") {
      state.themeModes.push(mode);
    },
    clearSelection() {},
    exportContext() {
      return null;
    },
    buildChatPayload() {
      if (overrides.buildChatPayload) {
        return overrides.buildChatPayload();
      }
      return {
        selectionContext: {
          mode: "click",
          triangleIds: [1],
          components: [],
        },
        viewContext: {
          cameraPosition: [0, 0, 5],
          target: [0, 0, 0],
          up: [0, 1, 0],
          fov: 50,
          viewDirection: [0, 0, -1],
          dominantOrientation: "+X",
          viewportSize: [800, 600],
        },
      };
    },
    dispose() {},
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
