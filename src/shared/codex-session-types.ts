export type Vector3Tuple = readonly [number, number, number];
export type ViewportSizeTuple = readonly [number, number];

export type SelectionMode = 'click' | 'box';

export type CodexConnectionStatus = 'starting' | 'connected' | 'disconnected' | 'failed';

export type ChatSessionStatus =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'waiting_decision'
  | 'resuming'
  | 'completed'
  | 'failed';

export type SelectionComponentPayload = {
  id: string;
  triangleIds: number[];
  centroid: Vector3Tuple;
  bboxMin: Vector3Tuple;
  bboxMax: Vector3Tuple;
  avgNormal: Vector3Tuple;
  area: number;
};

export type SelectionContextPayload = {
  version: 1;
  model: {
    id: string;
    fileName: string;
  };
  selection: {
    mode: SelectionMode;
    triangleIds: number[];
    screenRect?: readonly [number, number, number, number];
  };
  components: SelectionComponentPayload[];
};

export type ViewContextPayload = {
  cameraPosition: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
  fov: number;
  viewDirection: Vector3Tuple;
  dominantOrientation: string;
  viewportSize: ViewportSizeTuple;
};

export type SessionMessageRequest = {
  sessionId: string;
  activeModelId: string | null;
  message: {
    role: 'user';
    text: string;
  };
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
};

export type SessionModelSwitchRequest = {
  sessionId: string;
  activeModelId: string | null;
  modelLabel: string | null;
};

export type DecisionQuestionOption = {
  label: string;
  description: string;
};

export type DecisionQuestion = {
  id: string;
  header: string;
  question: string;
  allowOther: boolean;
  options: DecisionQuestionOption[];
};

export type SessionDecisionCard = {
  kind: string;
  title: string;
  body: string;
  questions: DecisionQuestion[];
};

export type SessionDecisionRequest = {
  sessionId: string;
  decisionId: string;
  answers: Record<string, string>;
};

export type SessionStreamEvent =
  | {
      type: 'connection_status_changed';
      status: CodexConnectionStatus;
      detail?: string;
    }
  | {
      type: 'status_changed';
      sessionId: string;
      status: ChatSessionStatus;
    }
  | {
      type: 'message_started';
      sessionId: string;
      messageId: string;
      role: 'assistant' | 'user' | 'system';
    }
  | {
      type: 'message_delta';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'message_completed';
      sessionId: string;
      messageId: string;
      text: string;
    }
  | {
      type: 'needs_decision';
      sessionId: string;
      decision: SessionDecisionCard;
    }
  | {
      type: 'session_paused';
      sessionId: string;
      reason?: string;
    }
  | {
      type: 'session_resumed';
      sessionId: string;
    }
  | {
      type: 'model_switched';
      sessionId: string;
      activeModelId: string | null;
      modelLabel: string | null;
    }
  | {
      type: 'session_cleared';
      sessionId: string;
    }
  | {
      type: 'error';
      message: string;
      sessionId?: string;
      code?: string;
    };
