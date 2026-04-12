import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";

import {
  chatStateReducer,
  createInitialChatState,
  type ChatContextSummary,
  type ChatStoreState,
  SessionClient,
} from "../../features/chat";
import {
  EMPTY_SELECTION_SUMMARY,
  formatFileSize,
  formatSelectionStatus,
  isStlFile,
} from "../../features/viewer";
import type { SessionStreamEvent } from "../../shared/codex-session-types";
import {
  StlViewport,
  type ViewportSelectionSummary,
} from "../../lib/viewer";

const SESSION_ID = "sess_main";

const EMPTY_CHAT_CONTEXT: ChatContextSummary = {
  triangleCount: 0,
  componentCount: 0,
  orientation: "+X",
};

export type SessionClientLike = Pick<
  SessionClient,
  | "connect"
  | "getStatus"
  | "sendMessage"
  | "generateModel"
  | "sendDecision"
  | "interrupt"
  | "importModel"
  | "switchModel"
  | "clearSession"
  | "fetchModelFile"
>;

export type ViewportLike = Pick<
  StlViewport,
  | "mount"
  | "loadFile"
  | "resetView"
  | "clearSelection"
  | "exportContext"
  | "buildChatPayload"
> & {
  dispose?: () => void;
};

type FileMetaState = {
  name: string;
  detail: string;
  modelPath: string | null;
};

export type ViewerAppOptions = {
  sessionClient?: SessionClientLike;
  createViewport?: () => ViewportLike;
  initialChatState?: Partial<ChatStoreState>;
};

export type ViewerAppController = {
  chatState: ChatStoreState;
  errorMessage: string;
  fileMeta: FileMetaState | null;
  isDragActive: boolean;
  viewportLoaded: boolean;
  selectionSummary: ViewportSelectionSummary;
  selectionStatusText: string;
  viewportHostRef: RefObject<HTMLDivElement | null>;
  orientationRootRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handlePickFile: () => void;
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleCopyModelPath: () => Promise<void>;
  handleResetView: () => void;
  handleExportContext: () => void;
  handleClearSelection: () => void;
  handleViewportDragOver: (event: DragEvent<HTMLElement>) => void;
  handleViewportDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleViewportDrop: (event: DragEvent<HTMLElement>) => void;
  handleSendMessage: (text: string) => Promise<void>;
  handleGenerateModel: () => Promise<void>;
  handleInterruptTurn: () => Promise<void>;
  handleClearSession: () => Promise<void>;
  handleDecision: (
    decisionId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
};

export function useViewerAppController(
  options: ViewerAppOptions = {},
): ViewerAppController {
  const sessionClient = useMemo(
    () => options.sessionClient ?? new SessionClient(),
    [options.sessionClient],
  );
  const [chatState, dispatch] = useReducer(
    chatStateReducer,
    options.initialChatState ?? {},
    createInitialChatState,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [fileMeta, setFileMeta] = useState<FileMetaState | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [viewportLoaded, setViewportLoaded] = useState(false);
  const [selectionSummary, setSelectionSummary] = useState(
    EMPTY_SELECTION_SUMMARY,
  );
  const viewportHostRef = useRef<HTMLDivElement | null>(null);
  const orientationRootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<ViewportLike | null>(null);
  const activeModelIdRef = useRef<string | null>(null);
  const activeModelLabelRef = useRef<string | null>(null);
  const activeModelPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewportHostRef.current) {
      return;
    }

    const viewport = createViewport(options.createViewport, (summary) => {
      setSelectionSummary(summary);
      syncChatContextSummary(viewportRef.current, dispatch);
    });

    if (!viewport) {
      return;
    }

    viewportRef.current = viewport;
    viewport.mount(viewportHostRef.current, orientationRootRef.current ?? undefined);

    return () => {
      viewport.dispose?.();
      viewportRef.current = null;
    };
  }, [options.createViewport]);

  useEffect(() => {
    activeModelIdRef.current = chatState.activeModelId;
    activeModelLabelRef.current = chatState.modelLabel;
  }, [chatState.activeModelId, chatState.modelLabel]);

  useEffect(() => {
    let disconnect = () => {};

    try {
      disconnect = sessionClient.connect({
        onEvent: (event) => {
          dispatch({
            type: "session-event",
            event,
          });

          switch (event.type) {
            case "model_switched":
              applyModelContext(
                dispatch,
                {
                  activeModelIdRef,
                  activeModelLabelRef,
                  activeModelPathRef,
                },
                event.activeModelId,
                event.modelLabel,
                activeModelPathRef.current,
              );
              break;
            case "model_generated":
              void loadGeneratedModel({
                dispatch,
                event,
                sessionClient,
                setErrorMessage,
                setFileMeta,
                setViewportLoaded,
                viewportRef,
                activeModelIdRef,
                activeModelLabelRef,
                activeModelPathRef,
              });
              break;
            default:
              break;
          }
        },
      });
    } catch (error) {
      reportChatError(dispatch, error, "connection");
    }

    void sessionClient
      .getStatus()
      .then((status) => {
        dispatch({
          type: "session-event",
          event: {
            type: "connection_status_changed",
            connectionStatus: status.connectionStatus,
            message: status.connectionMessage,
          },
        });
        dispatch({
          type: "session-event",
          event: {
            type: "status_changed",
            status: status.sessionStatus,
          },
        });
        dispatch({
          type: "session-event",
          event: {
            type: "draft_state_changed",
            draft: status.draft,
          },
        });

        if (
          activeModelIdRef.current === null &&
          activeModelLabelRef.current === null &&
          (status.activeModelId !== null || status.modelLabel !== null)
        ) {
          applyModelContext(
            dispatch,
            {
              activeModelIdRef,
              activeModelLabelRef,
              activeModelPathRef,
            },
            status.activeModelId,
            status.modelLabel,
            activeModelPathRef.current,
          );
          if (status.activeModelId) {
            void restoreModelFromStatus({
              dispatch,
              modelId: status.activeModelId,
              modelLabel: status.modelLabel,
              sessionClient,
              setErrorMessage,
              setFileMeta,
              setViewportLoaded,
              viewportRef,
            });
          }
        }
      })
      .catch((error: unknown) => {
        dispatch({
          type: "session-event",
          event: {
            type: "connection_status_changed",
            connectionStatus: "failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch session status.",
          },
        });
      });

    return () => {
      disconnect();
    };
  }, [sessionClient]);

  async function handleFile(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    if (!isStlFile(file)) {
      setErrorMessage("只支持 .stl 文件");
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      setErrorMessage("当前环境不支持 WebGL 渲染");
      return;
    }

    setErrorMessage("");
    setFileMeta({
      name: file.name,
      detail: `${file.name} · ${formatFileSize(file.size)}`,
      modelPath: null,
    });

    try {
      await viewport.loadFile(file);
      const importedModel = await sessionClient.importModel(SESSION_ID, file);
      applyModelContext(
        dispatch,
        {
          activeModelIdRef,
          activeModelLabelRef,
          activeModelPathRef,
        },
        importedModel.modelId,
        importedModel.modelLabel,
        null,
      );
      markViewportLoaded(setViewportLoaded, setFileMeta, file.name, null);
      syncChatContextSummary(viewport, dispatch);
    } catch (error) {
      console.error(error);
      setErrorMessage("文件无法解析，请确认它是有效的 STL 文件");
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleSendMessage(text: string): Promise<void> {
    const viewport = viewportRef.current;
    const payload = viewport?.buildChatPayload();
    const activeModelId = activeModelIdRef.current;
    if (!payload || !activeModelId) {
      setErrorMessage("请先加载 STL 文件后再发送给 Codex");
      return;
    }

    setErrorMessage("");
    syncChatContextSummary(viewport, dispatch);
    dispatch({
      type: "append-user-message",
      text,
    });

    try {
      await sessionClient.sendMessage({
        sessionId: SESSION_ID,
        activeModelId,
        message: {
          role: "user",
          text,
        },
        selectionContext: payload.selectionContext,
        viewContext: payload.viewContext,
      });
    } catch (error) {
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleGenerateModel(): Promise<void> {
    try {
      await sessionClient.generateModel({
        sessionId: SESSION_ID,
      });
    } catch (error) {
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleInterruptTurn(): Promise<void> {
    try {
      await sessionClient.interrupt({
        sessionId: SESSION_ID,
      });
    } catch (error) {
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleClearSession(): Promise<void> {
    try {
      await sessionClient.clearSession();
    } catch (error) {
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleDecision(
    decisionId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    try {
      await sessionClient.sendDecision({
        sessionId: SESSION_ID,
        decisionId,
        answers,
      });
    } catch (error) {
      reportChatError(dispatch, error, "session");
    }
  }

  async function handleCopyModelPath(): Promise<void> {
    const activeModelPath = activeModelPathRef.current;
    if (
      !activeModelPath ||
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeModelPath);
      setFileMeta((current) =>
        current
          ? {
              ...current,
              detail: `已复制：${activeModelPath}`,
            }
          : current,
      );
    } catch {
      setFileMeta((current) =>
        current
          ? {
              ...current,
              detail: `复制失败：${activeModelPath}`,
            }
          : current,
      );
    }
  }

  function handlePickFile(): void {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const input = event.currentTarget;
    void handleFile(input.files?.[0] ?? null);
    input.value = "";
  }

  function handleResetView(): void {
    viewportRef.current?.resetView();
    syncChatContextSummary(viewportRef.current, dispatch);
  }

  function handleExportContext(): void {
    viewportRef.current?.exportContext();
  }

  function handleClearSelection(): void {
    viewportRef.current?.clearSelection();
    syncChatContextSummary(viewportRef.current, dispatch);
  }

  function handleViewportDragOver(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleViewportDragLeave(event: DragEvent<HTMLElement>): void {
    if (event.target === event.currentTarget) {
      setIsDragActive(false);
    }
  }

  function handleViewportDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    void handleFile(event.dataTransfer?.files?.[0] ?? null);
  }

  return {
    chatState,
    errorMessage,
    fileMeta,
    isDragActive,
    viewportLoaded,
    selectionSummary,
    selectionStatusText: formatSelectionStatus(selectionSummary),
    viewportHostRef,
    orientationRootRef,
    fileInputRef,
    handlePickFile,
    handleFileInputChange,
    handleCopyModelPath,
    handleResetView,
    handleExportContext,
    handleClearSelection,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
    handleSendMessage,
    handleGenerateModel,
    handleInterruptTurn,
    handleClearSession,
    handleDecision,
  };
}

function createViewport(
  createViewportImpl: (() => ViewportLike) | undefined,
  onSelectionChange: (summary: ViewportSelectionSummary) => void,
): ViewportLike | null {
  if (createViewportImpl) {
    return createViewportImpl();
  }

  if (
    typeof window === "undefined" ||
    typeof WebGLRenderingContext === "undefined"
  ) {
    return null;
  }

  return new StlViewport({
    onSelectionChange,
  });
}

function applyModelContext(
  dispatch: Dispatch<{
    type: "set-model-context";
    model: { activeModelId: string | null; modelLabel: string | null };
  }>,
  refs: {
    activeModelIdRef: MutableRefObject<string | null>;
    activeModelLabelRef: MutableRefObject<string | null>;
    activeModelPathRef: MutableRefObject<string | null>;
  },
  activeModelId: string | null,
  modelLabel: string | null,
  modelPath: string | null = null,
): void {
  refs.activeModelIdRef.current = activeModelId;
  refs.activeModelLabelRef.current = modelLabel;
  refs.activeModelPathRef.current = modelPath;
  dispatch({
    type: "set-model-context",
    model: {
      activeModelId,
      modelLabel,
    },
  });

}

function markViewportLoaded(
  setViewportLoaded: Dispatch<SetStateAction<boolean>>,
  setFileMeta: Dispatch<SetStateAction<FileMetaState | null>>,
  modelLabel: string,
  modelPath: string | null,
): void {
  setViewportLoaded(true);
  setFileMeta({
    name: modelLabel,
    detail: modelPath ? `真实路径：${modelPath}` : "当前预览文件",
    modelPath,
  });
}

function syncChatContextSummary(
  viewport: ViewportLike | null,
  dispatch: Dispatch<{ type: "set-context-summary"; summary: ChatContextSummary }>,
): void {
  const payload = viewport?.buildChatPayload();
  dispatch({
    type: "set-context-summary",
    summary: payload
      ? {
          triangleCount: payload.selectionContext.triangleIds.length,
          componentCount: payload.selectionContext.components.length,
          orientation: payload.viewContext.dominantOrientation,
        }
      : EMPTY_CHAT_CONTEXT,
  });
}

async function loadGeneratedModel(args: {
  dispatch: Dispatch<
    | { type: "set-model-context"; model: { activeModelId: string | null; modelLabel: string | null } }
    | { type: "set-context-summary"; summary: ChatContextSummary }
    | { type: "session-event"; event: SessionStreamEvent }
  >;
  event: Extract<SessionStreamEvent, { type: "model_generated" }>;
  sessionClient: SessionClientLike;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  setFileMeta: Dispatch<SetStateAction<FileMetaState | null>>;
  setViewportLoaded: Dispatch<SetStateAction<boolean>>;
  viewportRef: RefObject<ViewportLike | null>;
  activeModelIdRef: MutableRefObject<string | null>;
  activeModelLabelRef: MutableRefObject<string | null>;
  activeModelPathRef: MutableRefObject<string | null>;
}): Promise<void> {
  const viewport = args.viewportRef.current;
  if (!viewport) {
    args.setErrorMessage(
      "Generated model could not be loaded because the viewport is unavailable.",
    );
    return;
  }

  try {
    const file = await args.sessionClient.fetchModelFile(args.event.newModelId);
    await viewport.loadFile(file);
    args.activeModelPathRef.current = args.event.modelPath;
    applyModelContext(
      args.dispatch,
      {
        activeModelIdRef: args.activeModelIdRef,
        activeModelLabelRef: args.activeModelLabelRef,
        activeModelPathRef: args.activeModelPathRef,
      },
      args.event.newModelId,
      args.event.modelLabel,
      args.event.modelPath,
    );
    markViewportLoaded(
      args.setViewportLoaded,
      args.setFileMeta,
      args.event.modelLabel,
      args.event.modelPath,
    );
    syncChatContextSummary(viewport, args.dispatch);
    args.setErrorMessage("");
  } catch (error) {
    console.error(error);
    args.setErrorMessage(`Failed to load generated model: ${args.event.modelPath}`);
    reportChatError(args.dispatch, error, "session");
  }
}

async function restoreModelFromStatus(args: {
  dispatch: Dispatch<{ type: "set-context-summary"; summary: ChatContextSummary }>;
  modelId: string;
  modelLabel: string | null;
  sessionClient: SessionClientLike;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  setFileMeta: Dispatch<SetStateAction<FileMetaState | null>>;
  setViewportLoaded: Dispatch<SetStateAction<boolean>>;
  viewportRef: RefObject<ViewportLike | null>;
}): Promise<void> {
  const viewport = args.viewportRef.current;
  if (!viewport) {
    return;
  }

  try {
    const file = await args.sessionClient.fetchModelFile(args.modelId);
    await viewport.loadFile(file);
    markViewportLoaded(
      args.setViewportLoaded,
      args.setFileMeta,
      args.modelLabel ?? file.name,
      null,
    );
    syncChatContextSummary(viewport, args.dispatch);
    args.setErrorMessage("");
  } catch {
    // Best effort only. Imported local models may not exist in server-backed storage.
  }
}

function reportChatError(
  dispatch: Dispatch<{ type: "session-event"; event: SessionStreamEvent }>,
  error: unknown,
  scope: "connection" | "session",
): void {
  dispatch({
    type: "session-event",
    event: {
      type: "error",
      scope,
      message: error instanceof Error ? error.message : "Unknown error",
    },
  });
}
