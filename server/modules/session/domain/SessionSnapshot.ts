import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  DraftState,
  SessionDecisionCard,
  SessionStreamEvent,
} from '../../../../src/shared/codex-session-types.js';

export const EMPTY_DRAFT_STATE: DraftState = {
  status: 'empty',
  jobId: null,
  baseModelId: null,
  scriptPath: null,
  message: null,
};

export type SessionSnapshot = {
  sessionId: string;
  connectionStatus: CodexConnectionStatus;
  connectionMessage: string;
  sessionStatus: ChatSessionStatus;
  activeModelId: string | null;
  modelLabel: string | null;
  draft: DraftState;
};

export function replaySessionSnapshot(
  subscriber: (event: SessionStreamEvent) => void,
  snapshot: SessionSnapshot & {
    pendingDecision: SessionDecisionCard | null;
    pendingDecisionId: string | null;
    hasThread: boolean;
  },
): void {
  subscriber({
    type: 'connection_status_changed',
    connectionStatus: snapshot.connectionStatus,
    message: snapshot.connectionMessage,
  });
  subscriber({
    type: 'status_changed',
    status: snapshot.sessionStatus,
  });
  subscriber({
    type: 'draft_state_changed',
    draft: { ...snapshot.draft },
  });

  if (snapshot.hasThread) {
    subscriber({
      type: 'session_started',
      sessionId: snapshot.sessionId,
    });
  }

  if (snapshot.activeModelId || snapshot.modelLabel) {
    subscriber({
      type: 'model_switched',
      activeModelId: snapshot.activeModelId,
      modelLabel: snapshot.modelLabel,
    });
  }

  if (snapshot.pendingDecision && snapshot.pendingDecisionId) {
    subscriber({
      type: 'needs_decision',
      decision: snapshot.pendingDecision,
    });
    subscriber({
      type: 'session_paused',
      decisionId: snapshot.pendingDecisionId,
    });
  }
}
