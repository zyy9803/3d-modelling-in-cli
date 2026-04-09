export type Vector3Tuple = readonly [number, number, number];
export type ViewportSizeTuple = readonly [number, number];

export type SelectionMode = 'click' | 'box';

export type CodexConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ChatSessionStatus =
  | 'idle'
  | 'queued'
  | 'streaming'
  | 'awaiting-decision'
  | 'complete'
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
  activeModelId: string;
  text: string;
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
};

export type SessionModelSwitchRequest = {
  sessionId: string;
  activeModelId: string;
};

export type DecisionQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  allowFreeform?: boolean;
};

export type SessionDecisionCard = {
  id: string;
  title: string;
  prompt: string;
  questions: DecisionQuestion[];
};

export type SessionDecisionRequest = {
  sessionId: string;
  cardId: string;
  answers: Record<string, string>;
};

export type SessionStreamEvent =
  | {
      type: 'connection-status';
      status: CodexConnectionStatus;
      detail?: string;
    }
  | {
      type: 'session-status';
      sessionId: string;
      status: ChatSessionStatus;
    }
  | {
      type: 'message';
      sessionId: string;
      role: 'user' | 'assistant' | 'system';
      text: string;
    }
  | {
      type: 'decision-card';
      sessionId: string;
      card: SessionDecisionCard;
    }
  | {
      type: 'decision-request';
      sessionId: string;
      request: SessionDecisionRequest;
    }
  | {
      type: 'error';
      message: string;
      sessionId?: string;
      code?: string;
    };
