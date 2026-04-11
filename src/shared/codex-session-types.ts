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

export type EditJobContext = {
  jobId: string;
  workspacePath: string;
  contextPath: string;
  baseModelPath: string;
  scriptPath: string;
};

export type DraftStatus = 'empty' | 'ready' | 'running' | 'executed' | 'failed';

export type DraftState = {
  status: DraftStatus;
  jobId: string | null;
  baseModelId: string | null;
  scriptPath: string | null;
  message: string | null;
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
  editJob?: EditJobContext;
};

export type SessionGenerateModelRequest = {
  sessionId: string;
};

export type SessionInterruptRequest = {
  sessionId: string;
};

export type SessionModelSwitchRequest = {
  sessionId: string;
  activeModelId: string | null;
  modelLabel: string | null;
};

export type SessionImportModelRequest = {
  sessionId: string;
  fileName: string;
  fileContentBase64: string;
};

export type SessionImportModelResponse = {
  modelId: string;
  modelLabel: string;
};

export type DecisionOption = {
  label: string;
  description: string;
  value: string;
};

export type DecisionQuestion = {
  id: string;
  header: string;
  question: string;
  allowOther: boolean;
  options: DecisionOption[];
};

export type SessionActivityKind = 'command_execution' | 'tool_call' | 'plan' | 'approval';

export type SessionInfoField = {
  label: string;
  value: string;
};

export type SessionContentFormat = 'plain' | 'code';

export type SessionDecisionCard =
  | {
      id: string;
      kind: 'user_input';
      title: string;
      body: string;
      questions: DecisionQuestion[];
    }
  | {
      id: string;
      kind: 'command_execution';
      title: string;
      body: string;
      command: string | null;
      cwd: string | null;
      questions: DecisionQuestion[];
    }
  | {
      id: string;
      kind: 'file_change';
      title: string;
      body: string;
      grantRoot: string | null;
      questions: DecisionQuestion[];
    }
  | {
      id: string;
      kind: 'permissions';
      title: string;
      body: string;
      permissionsSummary: string;
      questions: DecisionQuestion[];
    };

export type SessionDecisionRequest = {
  sessionId: string;
  decisionId: string;
  answers: Record<string, string>;
};

export type StreamMessageRole = 'assistant' | 'reasoning';

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
      type: 'draft_state_changed';
      draft: DraftState;
    }
  | {
      type: 'message_started';
      messageId: string;
      role: StreamMessageRole;
      title?: string;
    }
  | {
      type: 'message_delta';
      messageId: string;
      delta: string;
      replace?: boolean;
    }
  | {
      type: 'message_completed';
      messageId: string;
    }
  | {
      type: 'activity_started';
      activityId: string;
      activityKind: SessionActivityKind;
      title: string;
      fields?: SessionInfoField[];
      text?: string;
      bodyFormat?: SessionContentFormat;
    }
  | {
      type: 'activity_delta';
      activityId: string;
      delta: string;
      replace?: boolean;
    }
  | {
      type: 'activity_completed';
      activityId: string;
      fields?: SessionInfoField[];
      text?: string;
      replace?: boolean;
      bodyFormat?: SessionContentFormat;
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
      type: 'turn_interrupted';
      turnId: string;
    }
  | {
      type: 'model_generation_started';
      jobId: string;
      baseModelId: string;
    }
  | {
      type: 'model_generated';
      jobId: string;
      baseModelId: string;
      newModelId: string;
      modelLabel: string;
      modelPath: string;
    }
  | {
      type: 'model_generation_failed';
      jobId: string;
      baseModelId: string;
      message: string;
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
