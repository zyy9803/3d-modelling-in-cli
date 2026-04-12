export type RequestId = string | number;

export type AskForApproval =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never'
  | {
      granular: {
        sandbox_approval: boolean;
        rules: boolean;
        skill_approval: boolean;
        request_permissions: boolean;
        mcp_elicitations: boolean;
      };
    };

export type ApprovalsReviewer = 'user' | 'guardian_subagent';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type ClientInfo = {
  name: string;
  title: string | null;
  version: string;
};

export type InitializeCapabilities = {
  experimentalApi: boolean;
  optOutNotificationMethods?: string[] | null;
};

export type InitializeParams = {
  clientInfo: ClientInfo;
  capabilities: InitializeCapabilities | null;
};

export type InitializeResponse = {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
};

export type UserInput = {
  type: 'text';
  text: string;
  text_elements: Array<never>;
};

export type Thread = {
  id: string;
};

export type Turn = {
  id: string;
  status?: 'completed' | 'interrupted' | 'failed' | string;
};

export type ThreadStartParams = {
  cwd?: string | null;
  approvalPolicy?: AskForApproval | null;
  approvalsReviewer?: ApprovalsReviewer | null;
  sandbox?: SandboxMode | null;
  config?: Record<string, unknown> | null;
  serviceName?: string | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  ephemeral?: boolean | null;
  experimentalRawEvents: boolean;
  persistExtendedHistory: boolean;
};

export type ThreadStartResponse = {
  thread: Thread;
};

export type TurnStartParams = {
  threadId: string;
  input: Array<UserInput>;
  cwd?: string | null;
};

export type TurnStartResponse = {
  turn: Turn;
};

export type TurnSteerParams = {
  threadId: string;
  expectedTurnId: string;
  input: Array<UserInput>;
};

export type TurnSteerResponse = {
  turnId: string;
};

export type TurnInterruptParams = {
  threadId: string;
  turnId: string;
};

export type TurnInterruptResponse = Record<string, never>;

export type ThreadActiveFlag = 'waitingOnApproval' | 'waitingOnUserInput';

export type ThreadStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'systemError' }
  | {
      type: 'active';
      activeFlags: ThreadActiveFlag[];
    };

export type AgentMessageItem = {
  type: 'agentMessage';
  id: string;
  text: string;
};

export type ReasoningItem = {
  type: 'reasoning';
  id: string;
  summary?: unknown;
  content?: unknown;
};

export type CommandExecutionItem = {
  type: 'commandExecution';
  id: string;
  title?: string;
  command?: string | null;
  cwd?: string | null;
  status?: string | null;
  text?: string;
  stdout?: string | null;
  stderr?: string | null;
  output?: unknown;
  exitCode?: number | null;
};

export type ToolCallItem = {
  type: 'toolCall';
  id: string;
  title?: string;
  toolName?: string | null;
  arguments?: unknown;
  status?: string | null;
  text?: string;
  result?: unknown;
};

export type PlanItem = {
  type: 'plan';
  id: string;
  title?: string;
  text?: string;
  content?: unknown;
  steps?: unknown;
  status?: string | null;
};

export type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | ToolCallItem
  | PlanItem
  | {
      type: string;
      id: string;
      text?: string;
      [key: string]: unknown;
    };

export type ToolRequestUserInputOption = {
  label: string;
  description: string;
};

export type ToolRequestUserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  options: Array<ToolRequestUserInputOption> | null;
};

export type ToolRequestUserInputParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: Array<ToolRequestUserInputQuestion>;
};

export type ToolRequestUserInputAnswer = {
  answers: string[];
};

export type ToolRequestUserInputResponse = {
  answers: Record<string, ToolRequestUserInputAnswer | undefined>;
};

export type CommandExecutionApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: unknown;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: unknown;
      };
    };

export type CommandExecutionRequestApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  approvalId?: string | null;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  availableDecisions?: Array<CommandExecutionApprovalDecision> | null;
};

export type CommandExecutionRequestApprovalResponse = {
  decision: CommandExecutionApprovalDecision;
};

export type FileChangeApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

export type FileChangeRequestApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  grantRoot?: string | null;
};

export type FileChangeRequestApprovalResponse = {
  decision: FileChangeApprovalDecision;
};

export type RequestPermissionProfile = {
  network?: unknown;
  fileSystem?: unknown;
};

export type GrantedPermissionProfile = {
  network?: unknown;
  fileSystem?: unknown;
};

export type PermissionGrantScope = 'turn' | 'session';

export type PermissionsRequestApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  reason: string | null;
  permissions: RequestPermissionProfile;
};

export type PermissionsRequestApprovalResponse = {
  permissions: GrantedPermissionProfile;
  scope: PermissionGrantScope;
};

export type ServerRequest =
  | {
      method: 'item/tool/requestUserInput';
      id: RequestId;
      params: ToolRequestUserInputParams;
    }
  | {
      method: 'item/commandExecution/requestApproval';
      id: RequestId;
      params: CommandExecutionRequestApprovalParams;
    }
  | {
      method: 'item/fileChange/requestApproval';
      id: RequestId;
      params: FileChangeRequestApprovalParams;
    }
  | {
      method: 'item/permissions/requestApproval';
      id: RequestId;
      params: PermissionsRequestApprovalParams;
    };

export type ServerNotification =
  | {
      method: 'thread/started';
      params: {
        thread: Thread;
      };
    }
  | {
      method: 'thread/status/changed';
      params: {
        threadId: string;
        status: ThreadStatus;
      };
    }
  | {
      method: 'turn/started';
      params: {
        threadId: string;
        turn: Turn;
      };
    }
  | {
      method: 'turn/completed';
      params: {
        threadId: string;
        turn: Turn;
      };
    }
  | {
      method: 'item/started';
      params: {
        item: ThreadItem;
        threadId: string;
        turnId: string;
      };
    }
  | {
      method: 'item/completed';
      params: {
        item: ThreadItem;
        threadId: string;
        turnId: string;
      };
    }
  | {
      method: 'item/agentMessage/delta';
      params: {
        threadId: string;
        turnId: string;
        itemId: string;
        delta: string;
      };
    }
  | {
      method: 'item/reasoning/summaryTextDelta';
      params: {
        threadId: string;
        turnId: string;
        itemId: string;
        delta: string;
      };
    }
  | {
      method: 'item/reasoning/textDelta';
      params: {
        threadId: string;
        turnId: string;
        itemId: string;
        delta: string;
      };
    }
  | {
      method: 'serverRequest/resolved';
      params: {
        threadId: string;
        requestId: RequestId;
      };
    }
  | {
      method: 'error';
      params: {
        message: string;
      };
    };

export type ClientRequestMethod =
  | 'initialize'
  | 'thread/start'
  | 'turn/start'
  | 'turn/steer'
  | 'turn/interrupt';
