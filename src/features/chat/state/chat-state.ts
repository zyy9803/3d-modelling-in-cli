import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  DecisionQuestion,
  DraftState,
  SessionContentFormat,
  SessionActivityKind,
  SessionDecisionCard,
  SessionInfoField,
  SessionStreamEvent,
} from "../../../shared/codex-session-types";

export type ChatMessageRole = "user" | "assistant" | "system" | "reasoning";

export type ChatEntryStatus = "streaming" | "completed" | "interrupted";

export type ChatMessage = {
  kind: "message";
  id: string;
  role: ChatMessageRole;
  title?: string;
  text: string;
  status: ChatEntryStatus | null;
};

export type ChatActivity = {
  kind: "activity";
  id: string;
  activityKind: SessionActivityKind;
  title: string;
  fields: SessionInfoField[];
  text: string;
  bodyFormat: SessionContentFormat;
  status: ChatEntryStatus | null;
};

export type ChatTimelineEntry = ChatMessage | ChatActivity;

export type ChatContextSummary = {
  triangleCount: number;
  componentCount: number;
  orientation: string;
};

export type ChatStoreState = {
  connectionStatus: CodexConnectionStatus;
  connectionMessage: string;
  sessionStatus: ChatSessionStatus;
  sessionId: string | null;
  activeModelId: string | null;
  modelLabel: string | null;
  draft: DraftState;
  messages: ChatTimelineEntry[];
  pendingDecision: SessionDecisionCard | null;
  contextSummary: ChatContextSummary;
};

export type ChatStateAction =
  | { type: "session-event"; event: SessionStreamEvent }
  | { type: "set-context-summary"; summary: ChatContextSummary }
  | {
      type: "set-model-context";
      model: { activeModelId: string | null; modelLabel: string | null };
    }
  | { type: "append-user-message"; text: string }
  | { type: "clear-session-view" };

export const DEFAULT_CHAT_CONTEXT_SUMMARY: ChatContextSummary = {
  triangleCount: 0,
  componentCount: 0,
  orientation: "+X",
};

export const DEFAULT_CHAT_STATE: ChatStoreState = {
  connectionStatus: "starting",
  connectionMessage: "Codex 启动中",
  sessionStatus: "idle",
  sessionId: null,
  activeModelId: null,
  modelLabel: null,
  draft: {
    status: "empty",
    jobId: null,
    baseModelId: null,
    scriptPath: null,
    message: null,
  },
  messages: [],
  pendingDecision: null,
  contextSummary: DEFAULT_CHAT_CONTEXT_SUMMARY,
};

export function createInitialChatState(
  initialState: Partial<ChatStoreState> = {},
): ChatStoreState {
  return {
    ...DEFAULT_CHAT_STATE,
    ...initialState,
    draft: {
      ...DEFAULT_CHAT_STATE.draft,
      ...initialState.draft,
    },
    contextSummary: {
      ...DEFAULT_CHAT_CONTEXT_SUMMARY,
      ...initialState.contextSummary,
    },
    messages: initialState.messages
      ? initialState.messages.map(cloneTimelineEntry)
      : [],
    pendingDecision: initialState.pendingDecision
      ? cloneDecision(initialState.pendingDecision)
      : null,
  };
}

export function chatStateReducer(
  state: ChatStoreState,
  action: ChatStateAction,
): ChatStoreState {
  switch (action.type) {
    case "session-event":
      return reduceSessionEvent(state, action.event);
    case "set-context-summary":
      return {
        ...state,
        contextSummary: normalizeContextSummary(action.summary),
      };
    case "set-model-context":
      return {
        ...state,
        activeModelId: action.model.activeModelId,
        modelLabel: action.model.modelLabel,
      };
    case "append-user-message":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            kind: "message",
            id: `user-${nextStableId()}`,
            role: "user",
            text: action.text,
            status: "completed",
          },
        ],
        sessionStatus:
          state.sessionStatus === "streaming" ? state.sessionStatus : "sending",
      };
    case "clear-session-view":
      return {
        ...state,
        sessionId: null,
        sessionStatus: "idle",
        draft: { ...DEFAULT_CHAT_STATE.draft },
        messages: [],
        pendingDecision: null,
      };
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

function reduceSessionEvent(
  previousState: ChatStoreState,
  event: SessionStreamEvent,
): ChatStoreState {
  const state = cloneState(previousState);

  switch (event.type) {
    case "connection_status_changed":
      state.connectionStatus = event.connectionStatus;
      state.connectionMessage = event.message;
      break;
    case "session_started":
      state.sessionId = event.sessionId;
      state.sessionStatus = "idle";
      pushSystemMessage(state, `会话已启动：${event.sessionId}`);
      break;
    case "status_changed":
      state.sessionStatus = event.status;
      if (event.status === "resuming") {
        state.pendingDecision = null;
      }
      break;
    case "draft_state_changed":
      state.draft = { ...event.draft };
      if (event.draft.status === "ready") {
        pushSystemMessage(
          state,
          `草稿脚本已就绪：${event.draft.scriptPath ?? event.draft.jobId ?? "edit.py"}`,
        );
      } else if (event.draft.status === "failed" && event.draft.message) {
        pushSystemMessage(state, `草稿脚本状态异常：${event.draft.message}`);
      }
      break;
    case "message_started": {
      const existing = findMessage(state, event.messageId);
      if (existing) {
        existing.role = event.role;
        existing.title = event.title;
        existing.status = "streaming";
      } else {
        state.messages.push({
          kind: "message",
          id: event.messageId,
          role: event.role,
          title: event.title,
          text: "",
          status: "streaming",
        });
      }
      state.sessionStatus = "streaming";
      break;
    }
    case "message_delta": {
      const target = findMessage(state, event.messageId);
      if (target) {
        target.text = event.replace ? event.delta : `${target.text}${event.delta}`;
        target.status = "streaming";
      } else {
        state.messages.push({
          kind: "message",
          id: event.messageId,
          role: "assistant",
          text: event.delta,
          status: "streaming",
        });
      }
      break;
    }
    case "message_completed": {
      const target = findMessage(state, event.messageId);
      if (target) {
        target.status = "completed";
      }
      break;
    }
    case "activity_started": {
      const existing = findActivity(state, event.activityId);
      if (existing) {
        existing.activityKind = event.activityKind;
        existing.title = event.title;
        existing.fields = cloneInfoFields(event.fields);
        existing.bodyFormat =
          event.bodyFormat ?? defaultActivityBodyFormat(event.activityKind);
        if (typeof event.text === "string") {
          existing.text = event.text;
        }
        existing.status = "streaming";
      } else {
        state.messages.push({
          kind: "activity",
          id: event.activityId,
          activityKind: event.activityKind,
          title: event.title,
          fields: cloneInfoFields(event.fields),
          text: event.text ?? "",
          bodyFormat:
            event.bodyFormat ?? defaultActivityBodyFormat(event.activityKind),
          status: "streaming",
        });
      }
      state.sessionStatus = "streaming";
      break;
    }
    case "activity_delta": {
      const target = findActivity(state, event.activityId);
      if (target) {
        target.text = event.replace ? event.delta : `${target.text}${event.delta}`;
        target.status = "streaming";
      } else {
        state.messages.push({
          kind: "activity",
          id: event.activityId,
          activityKind: "tool_call",
          title: "Agent Activity",
          fields: [],
          text: event.delta,
          bodyFormat: "plain",
          status: "streaming",
        });
      }
      break;
    }
    case "activity_completed": {
      const target = findActivity(state, event.activityId);
      if (target) {
        if (Array.isArray(event.fields)) {
          target.fields = cloneInfoFields(event.fields);
        }
        if (typeof event.text === "string") {
          target.text = event.replace ? event.text : `${target.text}${event.text}`;
        }
        if (event.bodyFormat) {
          target.bodyFormat = event.bodyFormat;
        }
        target.status = "completed";
      }
      break;
    }
    case "turn_interrupted":
      for (const message of state.messages) {
        if (message.status !== "streaming") {
          continue;
        }

        if (message.kind === "activity") {
          message.status = "interrupted";
          continue;
        }

        if (message.role === "assistant" || message.role === "reasoning") {
          message.status = "interrupted";
        }
      }
      pushSystemMessage(state, `会话已中断：${event.turnId}`);
      state.sessionStatus = "completed";
      break;
    case "needs_decision":
      state.pendingDecision = cloneDecision(event.decision);
      state.sessionStatus = "waiting_decision";
      pushSystemMessage(state, `需要决策：${event.decision.title}`);
      break;
    case "session_paused":
      state.sessionStatus = "waiting_decision";
      pushSystemMessage(state, `会话已暂停，等待决策：${event.decisionId}`);
      break;
    case "session_resumed":
      state.sessionStatus = "streaming";
      state.pendingDecision = null;
      pushSystemMessage(state, `会话已恢复：${event.decisionId}`);
      break;
    case "model_switched":
      state.activeModelId = event.activeModelId;
      state.modelLabel = event.modelLabel;
      pushSystemMessage(
        state,
        `当前模型已切换为 ${event.modelLabel ?? event.activeModelId ?? "未命名模型"}`,
      );
      break;
    case "model_generation_started":
      state.draft = {
        ...state.draft,
        status: "running",
        jobId: event.jobId,
        baseModelId: event.baseModelId,
        message: null,
      };
      break;
    case "model_generated":
      pushSystemMessage(state, `新 STL 已生成：${event.modelPath}`);
      break;
    case "model_generation_failed":
      pushSystemMessage(state, `Model generation failed: ${event.message}`);
      break;
    case "session_cleared":
      state.sessionId = null;
      state.sessionStatus = "idle";
      state.draft = { ...DEFAULT_CHAT_STATE.draft };
      state.messages = [];
      state.pendingDecision = null;
      break;
    case "error":
      state.sessionStatus = "failed";
      pushSystemMessage(state, `错误：${event.message}`);
      break;
    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }

  return state;
}

function normalizeContextSummary(summary: ChatContextSummary): ChatContextSummary {
  return {
    triangleCount: Math.max(0, Math.trunc(summary.triangleCount)),
    componentCount: Math.max(0, Math.trunc(summary.componentCount)),
    orientation: summary.orientation || DEFAULT_CHAT_CONTEXT_SUMMARY.orientation,
  };
}

function pushSystemMessage(state: ChatStoreState, text: string): void {
  state.messages.push({
    kind: "message",
    id: `system-${nextStableId()}`,
    role: "system",
    text,
    status: "completed",
  });
}

function findMessage(
  state: ChatStoreState,
  messageId: string,
): ChatMessage | undefined {
  const entry = state.messages.find(
    (message) => message.id === messageId && message.kind === "message",
  );
  return entry?.kind === "message" ? entry : undefined;
}

function findActivity(
  state: ChatStoreState,
  activityId: string,
): ChatActivity | undefined {
  const entry = state.messages.find(
    (message) => message.id === activityId && message.kind === "activity",
  );
  return entry?.kind === "activity" ? entry : undefined;
}

function cloneState(state: ChatStoreState): ChatStoreState {
  return {
    ...state,
    draft: { ...state.draft },
    contextSummary: { ...state.contextSummary },
    messages: state.messages.map(cloneTimelineEntry),
    pendingDecision: state.pendingDecision ? cloneDecision(state.pendingDecision) : null,
  };
}

function cloneTimelineEntry(message: ChatTimelineEntry): ChatTimelineEntry {
  return message.kind === "activity" ? cloneActivity(message) : cloneMessage(message);
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return { ...message };
}

function cloneActivity(message: ChatActivity): ChatActivity {
  return {
    ...message,
    fields: cloneInfoFields(message.fields),
  };
}

function cloneDecision(decision: SessionDecisionCard): SessionDecisionCard {
  return {
    ...decision,
    questions: decision.questions.map(cloneQuestion),
  };
}

function cloneQuestion(question: DecisionQuestion): DecisionQuestion {
  return {
    ...question,
    options: question.options.map((option) => ({ ...option })),
  };
}

function cloneInfoFields(fields: SessionInfoField[] | undefined): SessionInfoField[] {
  return (fields ?? []).map((field) => ({ ...field }));
}

function defaultActivityBodyFormat(
  activityKind: SessionActivityKind,
): SessionContentFormat {
  return activityKind === "command_execution" || activityKind === "tool_call"
    ? "code"
    : "plain";
}

function nextStableId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
