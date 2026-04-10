import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';
import { createChatStore } from '../chat/chat-store';
import type { SessionStreamEvent } from '../shared/codex-session-types';

type FakeSessionClient = {
  onEvent: ((event: SessionStreamEvent) => void) | null;
  fetchModelFileCalls: string[];
  importModelCalls: Array<{ sessionId: string; file: File }>;
  switchModelCalls: Array<{ sessionId: string; activeModelId: string | null; modelLabel: string | null }>;
  connect: (options: { onEvent: (event: SessionStreamEvent) => void }) => () => void;
  getStatus: () => Promise<{
    connectionStatus: 'starting' | 'connected' | 'disconnected' | 'failed';
    connectionMessage: string;
    sessionStatus: 'idle' | 'sending' | 'streaming' | 'waiting_decision' | 'resuming' | 'completed' | 'failed';
    activeModelId: string | null;
    modelLabel: string | null;
  }>;
  sendMessage: () => Promise<void>;
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
  mount: (container: HTMLElement, orientationRoot?: HTMLElement) => void;
  loadFile: (file: File) => Promise<void>;
  resetView: () => void;
  clearSelection: () => void;
  exportContext: () => null;
  buildChatPayload: () => {
    selectionContext: {
      mode: 'click';
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
};

describe('ViewerApp', () => {
  it('renders the empty state and phase-2 toolbar actions', () => {
    const root = document.createElement('div');

    new ViewerApp(root, { sessionClient: createFakeSessionClient() });

    expect(root.textContent?.match(/拖拽 STL 文件到这里开始预览/g)?.length ?? 0).toBe(1);
    expect(root.querySelector('[data-dropzone-root]')?.textContent?.trim()).toBe('');
    expect(root.querySelector('[data-export-context]')).not.toBeNull();
    expect(root.querySelector('[data-clear-selection]')).not.toBeNull();
    expect(root.querySelector('[data-reset-view]')).not.toBeNull();
  });

  it('renders the selection status bar', () => {
    const root = document.createElement('div');

    new ViewerApp(root, { sessionClient: createFakeSessionClient() });

    expect(root.querySelector('[data-selection-status]')?.textContent).toContain('0');
  });

  it('keeps the orientation anchor mounted but empty before a model is loaded', () => {
    const root = document.createElement('div');

    new ViewerApp(root, { sessionClient: createFakeSessionClient() });

    expect(root.querySelector('[data-orientation-root]')).not.toBeNull();
    expect(root.querySelector('[data-orientation-root]')?.childElementCount).toBe(0);
  });

  it('marks the shell as a viewport-filling layout', () => {
    const root = document.createElement('div');

    new ViewerApp(root, { sessionClient: createFakeSessionClient() });

    expect(root.querySelector('.app-shell--with-chat')).not.toBeNull();
  });

  it('fetches and loads generated models without clearing chat state', async () => {
    const store = createChatStore({
      messages: [
        {
          kind: 'message',
          id: 'user-1',
          role: 'user',
          text: 'keep this conversation',
          status: 'completed',
        },
      ],
    });

    const sessionClient = createFakeSessionClient();
    const viewport = createFakeViewport();
    const root = document.createElement('div');

    new ViewerApp(root, {
      chatStore: store,
      sessionClient,
      createViewport: () => viewport,
    });

    sessionClient.onEvent?.({
      type: 'model_generated',
      jobId: 'job_001',
      baseModelId: 'model_001',
      newModelId: 'model_002',
      modelLabel: 'part-edited.stl',
    });

    await flushMicrotasks();

    expect(sessionClient.fetchModelFileCalls).toEqual(['model_002']);
    expect(viewport.loadedFiles).toHaveLength(1);
    expect(viewport.loadedFiles[0]?.name).toBe('model_002.stl');
    expect(store.getState().activeModelId).toBe('model_002');
    expect(root.textContent).toContain('part-edited.stl');
    expect(store.getState().messages.map((message) => message.text)).toEqual([
      'keep this conversation',
      'New model generated: part-edited.stl',
    ]);
  });

  it('does not switch the active model when generated-model fetch fails', async () => {
    const store = createChatStore();
    const sessionClient = createFakeSessionClient({
      fetchModelFile: async () => {
        throw new Error('fetch failed');
      },
    });
    const viewport = createFakeViewport();
    const root = document.createElement('div');

    new ViewerApp(root, {
      chatStore: store,
      sessionClient,
      createViewport: () => viewport,
    });

    sessionClient.onEvent?.({
      type: 'model_generated',
      jobId: 'job_001',
      baseModelId: 'model_001',
      newModelId: 'model_002',
      modelLabel: 'part-edited.stl',
    });

    await flushMicrotasks();

    expect(sessionClient.fetchModelFileCalls).toEqual(['model_002']);
    expect(viewport.loadedFiles).toHaveLength(0);
    expect(store.getState().activeModelId).toBeNull();
    expect(store.getState().modelLabel).toBeNull();
    expect(store.getState().messages.map((message) => message.text)).toEqual([
      'New model generated: part-edited.stl',
      '错误：fetch failed',
    ]);
  });

  it('does not switch the active model when viewport load fails', async () => {
    const store = createChatStore();
    const sessionClient = createFakeSessionClient();
    const viewport = createFakeViewport({
      loadFile: async () => {
        throw new Error('viewport failed');
      },
    });
    const root = document.createElement('div');

    new ViewerApp(root, {
      chatStore: store,
      sessionClient,
      createViewport: () => viewport,
    });

    sessionClient.onEvent?.({
      type: 'model_generated',
      jobId: 'job_002',
      baseModelId: 'model_001',
      newModelId: 'model_003',
      modelLabel: 'part-edited-2.stl',
    });

    await flushMicrotasks();

    expect(sessionClient.fetchModelFileCalls).toEqual(['model_003']);
    expect(viewport.loadedFiles).toHaveLength(0);
    expect(store.getState().activeModelId).toBeNull();
    expect(store.getState().modelLabel).toBeNull();
    expect(store.getState().messages.map((message) => message.text)).toEqual([
      'New model generated: part-edited-2.stl',
      '错误：viewport failed',
    ]);
  });

  it('advances the next uploaded model id past restored and generated ids', async () => {
    const sessionClient = createFakeSessionClient({
      status: {
        connectionStatus: 'connected',
        connectionMessage: 'connected',
        sessionStatus: 'idle',
        activeModelId: 'model_007',
        modelLabel: 'restored.stl',
      },
    });
    const viewport = createFakeViewport();
    const root = document.createElement('div');

    new ViewerApp(root, {
      sessionClient,
      createViewport: () => viewport,
    });

    await flushMicrotasks();

    sessionClient.onEvent?.({
      type: 'model_generated',
      jobId: 'job_007',
      baseModelId: 'model_007',
      newModelId: 'model_008',
      modelLabel: 'generated.stl',
    });

    await flushMicrotasks();

    const fileInput = root.querySelector<HTMLInputElement>('[data-file-input]');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['solid upload\nendsolid upload\n'], 'upload.stl', { type: 'model/stl' })],
    });

    fileInput?.dispatchEvent(new Event('change'));

    await flushMicrotasks();

    expect(sessionClient.importModelCalls).toHaveLength(1);
    expect(sessionClient.importModelCalls[0]?.sessionId).toBe('sess_main');
    expect(sessionClient.importModelCalls[0]?.file.name).toBe('upload.stl');
  });

  it('loads a restorable active model from session status on startup', async () => {
    const sessionClient = createFakeSessionClient({
      status: {
        connectionStatus: 'connected',
        connectionMessage: 'connected',
        sessionStatus: 'idle',
        activeModelId: 'model_002',
        modelLabel: 'generated.stl',
      },
    });
    const viewport = createFakeViewport();
    const root = document.createElement('div');

    new ViewerApp(root, {
      sessionClient,
      createViewport: () => viewport,
    });

    await flushMicrotasks();

    expect(sessionClient.fetchModelFileCalls).toEqual(['model_002']);
    expect(viewport.loadedFiles).toHaveLength(1);
    expect(root.textContent).toContain('generated.stl');
  });
});

function createFakeSessionClient(
  overrides: Partial<Pick<FakeSessionClient, 'fetchModelFile'>> & {
    status?: Awaited<ReturnType<FakeSessionClient['getStatus']>>;
  } = {},
): FakeSessionClient {
  const state = {
    onEvent: null as ((event: SessionStreamEvent) => void) | null,
    fetchModelFileCalls: [] as string[],
    importModelCalls: [] as Array<{ sessionId: string; file: File }>,
    switchModelCalls: [] as Array<{ sessionId: string; activeModelId: string | null; modelLabel: string | null }>,
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
    get switchModelCalls() {
      return state.switchModelCalls;
    },
    connect(options) {
      state.onEvent = options.onEvent;
      return () => {
        state.onEvent = null;
      };
    },
    async getStatus() {
      return overrides.status ?? {
        connectionStatus: 'connected',
        connectionMessage: 'connected',
        sessionStatus: 'idle',
        activeModelId: null,
        modelLabel: null,
      };
    },
    async sendMessage() {},
    async sendDecision() {},
    async interrupt() {},
    async importModel(sessionId: string, file: File) {
      state.importModelCalls.push({ sessionId, file });
      return {
        modelId: 'model_009',
        modelLabel: file.name,
      };
    },
    async switchModel(request) {
      state.switchModelCalls.push(request);
    },
    async clearSession() {},
    async fetchModelFile(modelId: string) {
      state.fetchModelFileCalls.push(modelId);
      if (overrides.fetchModelFile) {
        return overrides.fetchModelFile(modelId);
      }
      return new File(['solid generated\nendsolid generated\n'], `${modelId}.stl`, { type: 'model/stl' });
    },
  };
}

function createFakeViewport(
  overrides: Partial<Pick<FakeViewport, 'loadFile'>> = {},
): FakeViewport {
  const state = {
    mounted: false,
    loadedFiles: [] as File[],
  };

  return {
    get mounted() {
      return state.mounted;
    },
    get loadedFiles() {
      return state.loadedFiles;
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
    clearSelection() {},
    exportContext() {
      return null;
    },
    buildChatPayload() {
      return {
        selectionContext: {
          mode: 'click',
          triangleIds: [1],
          components: [],
        },
        viewContext: {
          cameraPosition: [0, 0, 5],
          target: [0, 0, 0],
          up: [0, 1, 0],
          fov: 50,
          viewDirection: [0, 0, -1],
          dominantOrientation: '+X',
          viewportSize: [800, 600],
        },
      };
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
