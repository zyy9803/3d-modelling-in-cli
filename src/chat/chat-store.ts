import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  DecisionQuestion,
  SessionContentFormat,
  SessionActivityKind,
  SessionDecisionCard,
  SessionInfoField,
  SessionStreamEvent,
} from '../shared/codex-session-types';

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'reasoning';

export type ChatEntryStatus = 'streaming' | 'completed' | 'interrupted';

export type ChatMessage = {
  kind: 'message';
  id: string;
  role: ChatMessageRole;
  title?: string;
  text: string;
  status: ChatEntryStatus | null;
};

export type ChatActivity = {
  kind: 'activity';
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
  messages: ChatTimelineEntry[];
  pendingDecision: SessionDecisionCard | null;
  contextSummary: ChatContextSummary;
};

export type ChatStore = {
  getState(): ChatStoreState;
  subscribe(listener: () => void): () => void;
  applyEvent(event: SessionStreamEvent): void;
  setContextSummary(summary: ChatContextSummary): void;
  setModelContext(model: { activeModelId: string | null; modelLabel: string | null }): void;
  appendUserMessage(text: string): void;
  clearSessionView(): void;
};

const DEFAULT_CONTEXT_SUMMARY: ChatContextSummary = {
  triangleCount: 0,
  componentCount: 0,
  orientation: '+X',
};

const DEFAULT_STATE: ChatStoreState = {
  connectionStatus: 'starting',
  connectionMessage: '\u0043\u006f\u0064\u0065\u0078 \u542f\u52a8\u4e2d',
  sessionStatus: 'idle',
  sessionId: null,
  activeModelId: null,
  modelLabel: null,
  messages: [],
  pendingDecision: null,
  contextSummary: DEFAULT_CONTEXT_SUMMARY,
};

export function createChatStore(initialState: Partial<ChatStoreState> = {}): ChatStore {
  const state: ChatStoreState = {
    ...DEFAULT_STATE,
    ...initialState,
    contextSummary: {
      ...DEFAULT_CONTEXT_SUMMARY,
      ...initialState.contextSummary,
    },
    messages: initialState.messages ? initialState.messages.map(cloneTimelineEntry) : [],
    pendingDecision: initialState.pendingDecision ? cloneDecision(initialState.pendingDecision) : null,
  };

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function pushSystemMessage(text: string): void {
    state.messages.push({
      kind: 'message',
      id: `system-${nextStableId()}`,
      role: 'system',
      text,
      status: 'completed',
    });
  }

  function findMessage(messageId: string): ChatMessage | undefined {
    const entry = state.messages.find((message) => message.id === messageId && message.kind === 'message');
    return entry?.kind === 'message' ? entry : undefined;
  }

  function findActivity(activityId: string): ChatActivity | undefined {
    const entry = state.messages.find((message) => message.id === activityId && message.kind === 'activity');
    return entry?.kind === 'activity' ? entry : undefined;
  }

  return {
    getState(): ChatStoreState {
      return cloneState(state);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    applyEvent(event: SessionStreamEvent): void {
      switch (event.type) {
        case 'connection_status_changed':
          state.connectionStatus = event.connectionStatus;
          state.connectionMessage = event.message;
          break;
        case 'session_started':
          state.sessionId = event.sessionId;
          state.sessionStatus = 'idle';
          pushSystemMessage(`\u4f1a\u8bdd\u5df2\u542f\u52a8\uff1a${event.sessionId}`);
          break;
        case 'status_changed':
          state.sessionStatus = event.status;
          if (event.status === 'resuming') {
            state.pendingDecision = null;
          }
          break;
        case 'message_started': {
          const existing = findMessage(event.messageId);
          if (existing) {
            existing.role = event.role;
            existing.title = event.title;
            existing.status = 'streaming';
          } else {
            state.messages.push({
              kind: 'message',
              id: event.messageId,
              role: event.role,
              title: event.title,
              text: '',
              status: 'streaming',
            });
          }
          state.sessionStatus = 'streaming';
          break;
        }
        case 'message_delta': {
          const target = findMessage(event.messageId);
          if (target) {
            target.text = event.replace ? event.delta : `${target.text}${event.delta}`;
            target.status = 'streaming';
          } else {
            state.messages.push({
              kind: 'message',
              id: event.messageId,
              role: 'assistant',
              text: event.delta,
              status: 'streaming',
            });
          }
          break;
        }
        case 'message_completed': {
          const target = findMessage(event.messageId);
          if (target) {
            target.status = 'completed';
          }
          break;
        }
        case 'activity_started': {
          const existing = findActivity(event.activityId);
          if (existing) {
            existing.activityKind = event.activityKind;
            existing.title = event.title;
            existing.fields = cloneInfoFields(event.fields);
            existing.bodyFormat = event.bodyFormat ?? defaultActivityBodyFormat(event.activityKind);
            if (typeof event.text === 'string') {
              existing.text = event.text;
            }
            existing.status = 'streaming';
          } else {
            state.messages.push({
              kind: 'activity',
              id: event.activityId,
              activityKind: event.activityKind,
              title: event.title,
              fields: cloneInfoFields(event.fields),
              text: event.text ?? '',
              bodyFormat: event.bodyFormat ?? defaultActivityBodyFormat(event.activityKind),
              status: 'streaming',
            });
          }
          state.sessionStatus = 'streaming';
          break;
        }
        case 'activity_delta': {
          const target = findActivity(event.activityId);
          if (target) {
            target.text = event.replace ? event.delta : `${target.text}${event.delta}`;
            target.status = 'streaming';
          } else {
            state.messages.push({
              kind: 'activity',
              id: event.activityId,
              activityKind: 'tool_call',
              title: 'Agent Activity',
              fields: [],
              text: event.delta,
              bodyFormat: 'plain',
              status: 'streaming',
            });
          }
          break;
        }
        case 'activity_completed': {
          const target = findActivity(event.activityId);
          if (target) {
            if (Array.isArray(event.fields)) {
              target.fields = cloneInfoFields(event.fields);
            }
            if (typeof event.text === 'string') {
              target.text = event.replace ? event.text : `${target.text}${event.text}`;
            }
            if (event.bodyFormat) {
              target.bodyFormat = event.bodyFormat;
            }
            target.status = 'completed';
          }
          break;
        }
        case 'turn_interrupted':
          for (const message of state.messages) {
            if (message.status !== 'streaming') {
              continue;
            }

            if (message.kind === 'activity') {
              message.status = 'interrupted';
              continue;
            }

            if (message.role === 'assistant' || message.role === 'reasoning') {
              message.status = 'interrupted';
            }
          }
          pushSystemMessage(`会话已中断：${event.turnId}`);
          state.sessionStatus = 'completed';
          break;
        case 'needs_decision':
          state.pendingDecision = cloneDecision(event.decision);
          state.sessionStatus = 'waiting_decision';
          pushSystemMessage(`\u9700\u8981\u51b3\u7b56\uff1a${event.decision.title}`);
          break;
        case 'session_paused':
          state.sessionStatus = 'waiting_decision';
          pushSystemMessage(`\u4f1a\u8bdd\u5df2\u6682\u505c\uff0c\u7b49\u5f85\u51b3\u7b56\uff1a${event.decisionId}`);
          break;
        case 'session_resumed':
          state.sessionStatus = 'streaming';
          state.pendingDecision = null;
          pushSystemMessage(`\u4f1a\u8bdd\u5df2\u6062\u590d\uff1a${event.decisionId}`);
          break;
        case 'model_switched':
          state.activeModelId = event.activeModelId;
          state.modelLabel = event.modelLabel;
          pushSystemMessage(
            `\u5f53\u524d\u6a21\u578b\u5df2\u5207\u6362\u4e3a ${event.modelLabel ?? event.activeModelId ?? '\u672a\u547d\u540d\u6a21\u578b'}`,
          );
          break;
        case 'model_generation_started':
          break;
        case 'model_generated':
          pushSystemMessage(`New model generated: ${event.modelLabel}`);
          break;
        case 'model_generation_failed':
          pushSystemMessage(`Model generation failed: ${event.message}`);
          break;
        case 'session_cleared':
          state.sessionId = null;
          state.sessionStatus = 'idle';
          state.messages = [];
          state.pendingDecision = null;
          break;
        case 'error':
          state.sessionStatus = 'failed';
          pushSystemMessage(`\u9519\u8bef\uff1a${event.message}`);
          break;
        default: {
          const exhaustiveCheck: never = event;
          void exhaustiveCheck;
        }
      }

      notify();
    },

    setContextSummary(summary: ChatContextSummary): void {
      state.contextSummary = {
        triangleCount: Math.max(0, Math.trunc(summary.triangleCount)),
        componentCount: Math.max(0, Math.trunc(summary.componentCount)),
        orientation: summary.orientation || DEFAULT_CONTEXT_SUMMARY.orientation,
      };
      notify();
    },

    setModelContext(model: { activeModelId: string | null; modelLabel: string | null }): void {
      state.activeModelId = model.activeModelId;
      state.modelLabel = model.modelLabel;
      notify();
    },

    appendUserMessage(text: string): void {
      state.messages.push({
        kind: 'message',
        id: `user-${nextStableId()}`,
        role: 'user',
        text,
        status: 'completed',
      });
      if (state.sessionStatus !== 'streaming') {
        state.sessionStatus = 'sending';
      }
      notify();
    },

    clearSessionView(): void {
      state.sessionId = null;
      state.sessionStatus = 'idle';
      state.messages = [];
      state.pendingDecision = null;
      notify();
    },
  };
}

function cloneState(state: ChatStoreState): ChatStoreState {
  return {
    ...state,
    contextSummary: { ...state.contextSummary },
    messages: state.messages.map(cloneTimelineEntry),
    pendingDecision: state.pendingDecision ? cloneDecision(state.pendingDecision) : null,
  };
}

function cloneTimelineEntry(message: ChatTimelineEntry): ChatTimelineEntry {
  return message.kind === 'activity' ? cloneActivity(message) : cloneMessage(message);
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

function defaultActivityBodyFormat(activityKind: SessionActivityKind): SessionContentFormat {
  return activityKind === 'command_execution' || activityKind === 'tool_call' ? 'code' : 'plain';
}

function nextStableId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
