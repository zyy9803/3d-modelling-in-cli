export type Vector3Tuple = [number, number, number];
export type ViewportSizeTuple = [number, number];

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
  mode: SelectionMode;
  triangleIds: number[];
  screenRect?: [number, number, number, number];
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

export type DecisionQuestion = {
  id: string;
  header: string;
  question: string;
  allowOther: boolean;
  options: Array<{
    label: string;
    description: string;
  }>;
};

export type SessionDecisionCard = {
  id: string;
  kind: 'approval' | 'user_input';
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
      connectionStatus: CodexConnectionStatus;
      message: string;
    }
  | {
      type: 'session_started';
      sessionId: string;
    }
  | {
      type: 'status_changed';
      status: ChatSessionStatus;
    }
  | {
      type: 'message_started';
      messageId: string;
      role: 'assistant';
    }
  | {
      type: 'message_delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'message_completed';
      messageId: string;
    }
  | {
      type: 'needs_decision';
      decision: SessionDecisionCard;
    }
  | {
      type: 'session_paused';
      decisionId: string;
    }
  | {
      type: 'session_resumed';
      decisionId: string;
    }
  | {
      type: 'model_switched';
      activeModelId: string | null;
      modelLabel: string | null;
    }
  | {
      type: 'session_cleared';
    }
  | {
      type: 'error';
      scope: 'connection' | 'session';
      message: string;
    };
