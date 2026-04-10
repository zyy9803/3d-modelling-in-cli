import type {
  CommandExecutionApprovalDecision,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeApprovalDecision,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  GrantedPermissionProfile,
  PermissionGrantScope,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  RequestId,
  RequestPermissionProfile,
  ServerNotification,
  ServerRequest,
  ThreadItem,
  ThreadStatus,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
} from './codex-app-server-protocol.js';
import type {
  ChatSessionStatus,
  DecisionOption,
  SessionActivityKind,
  SessionDecisionCard,
  SessionStreamEvent,
} from '../src/shared/codex-session-types.js';

export type PendingDecisionKind =
  | 'user_input'
  | 'command_approval'
  | 'file_change_approval'
  | 'permissions_approval';

export type PendingDecisionEnvelope = {
  id: string;
  requestId: RequestId;
  kind: PendingDecisionKind;
  threadId: string;
  turnId: string;
  itemId: string;
  request: ServerRequest;
  card: SessionDecisionCard;
};

export function normalizeServerNotification(notification: ServerNotification): SessionStreamEvent[] {
  switch (notification.method) {
    case 'turn/started':
      return [{ type: 'status_changed', status: 'streaming' }];
    case 'turn/completed':
      return [{ type: 'status_changed', status: 'completed' }];
    case 'thread/status/changed': {
      const status = mapThreadStatus(notification.params.status);
      return status === 'idle' ? [] : [{ type: 'status_changed', status }];
    }
    case 'item/started':
      return normalizeStartedItem(notification.params.item);
    case 'item/completed':
      return normalizeCompletedItem(notification.params.item);
    case 'item/agentMessage/delta':
      return [
        {
          type: 'message_delta',
          messageId: notification.params.itemId,
          delta: notification.params.delta,
        },
      ];
    case 'item/reasoning/summaryTextDelta':
    case 'item/reasoning/textDelta':
      return [
        {
          type: 'message_delta',
          messageId: notification.params.itemId,
          delta: notification.params.delta,
        },
      ];
    case 'error':
      return [
        {
          type: 'error',
          scope: 'session',
          message: notification.params.message,
        },
      ];
    default:
      return [];
  }
}

export function mapThreadStatus(status: ThreadStatus): ChatSessionStatus {
  switch (status.type) {
    case 'systemError':
      return 'failed';
    case 'active':
      return status.activeFlags.some((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput')
        ? 'waiting_decision'
        : 'streaming';
    case 'idle':
    case 'notLoaded':
    default:
      return 'idle';
  }
}

export function buildDecisionEnvelope(request: ServerRequest): PendingDecisionEnvelope | null {
  switch (request.method) {
    case 'item/tool/requestUserInput':
      return buildUserInputEnvelope(request.id, request.params, request);
    case 'item/commandExecution/requestApproval':
      return buildCommandApprovalEnvelope(request.id, request.params, request);
    case 'item/fileChange/requestApproval':
      return buildFileChangeApprovalEnvelope(request.id, request.params, request);
    case 'item/permissions/requestApproval':
      return buildPermissionsApprovalEnvelope(request.id, request.params, request);
    default:
      return null;
  }
}

export function buildDecisionResponse(
  envelope: PendingDecisionEnvelope,
  answers: Record<string, string>,
):
  | ToolRequestUserInputResponse
  | CommandExecutionRequestApprovalResponse
  | FileChangeRequestApprovalResponse
  | PermissionsRequestApprovalResponse {
  switch (envelope.kind) {
    case 'user_input':
      return buildUserInputResponse(envelope.request.params as ToolRequestUserInputParams, answers);
    case 'command_approval':
      return buildCommandApprovalResponse(
        envelope.request.params as CommandExecutionRequestApprovalParams,
        answers,
      );
    case 'file_change_approval':
      return buildFileChangeApprovalResponse(
        envelope.request.params as FileChangeRequestApprovalParams,
        answers,
      );
    case 'permissions_approval':
      return buildPermissionsApprovalResponse(
        envelope.request.params as PermissionsRequestApprovalParams,
        answers,
      );
    default:
      return buildUserInputResponse(envelope.request.params as ToolRequestUserInputParams, answers);
  }
}

export function buildDecisionActivityEvents(activityId: string, card: SessionDecisionCard): SessionStreamEvent[] {
  return [
    {
      type: 'activity_started',
      activityId,
      activityKind: 'approval',
      title: card.title,
      detail: buildDecisionActivityDetail(card),
      text: card.body,
    },
    {
      type: 'activity_completed',
      activityId,
    },
  ];
}

function normalizeStartedItem(item: ThreadItem): SessionStreamEvent[] {
  if (item.type === 'agentMessage') {
    return [
      {
        type: 'message_started',
        messageId: item.id,
        role: 'assistant',
      },
      ...(item.text
        ? [
            {
              type: 'message_delta',
              messageId: item.id,
              delta: item.text,
            } satisfies SessionStreamEvent,
          ]
        : []),
    ];
  }

  if (isReasoningItem(item)) {
    const initialText = extractReasoningText(item);
    return [
      {
        type: 'message_started',
        messageId: item.id,
        role: 'reasoning',
        title: 'Thinking',
      },
      ...(initialText
        ? [
            {
              type: 'message_delta',
              messageId: item.id,
              delta: initialText,
            } satisfies SessionStreamEvent,
          ]
        : []),
    ];
  }

  if (isActivityItem(item)) {
    return [
      {
        type: 'activity_started',
        activityId: item.id,
        activityKind: toActivityKind(item.type),
        title: extractActivityTitle(item),
        detail: extractActivityDetail(item),
        text: extractActivityText(item) || undefined,
      },
    ];
  }

  return [];
}

function normalizeCompletedItem(item: ThreadItem): SessionStreamEvent[] {
  if (isActivityItem(item)) {
    const finalText = extractActivityText(item);
    return [
      {
        type: 'activity_completed',
        activityId: item.id,
        detail: extractActivityDetail(item),
        ...(finalText ? { text: finalText, replace: true } : {}),
      },
    ];
  }

  if (item.type !== 'agentMessage' && !isReasoningItem(item)) {
    return [];
  }

  if (isReasoningItem(item)) {
    const finalText = extractReasoningText(item);
    return [
      ...(finalText
        ? [
            {
              type: 'message_delta',
              messageId: item.id,
              delta: finalText,
              replace: true,
            } satisfies SessionStreamEvent,
          ]
        : []),
      { type: 'message_completed', messageId: item.id },
    ];
  }

  return [
    ...(item.text
      ? [
          {
            type: 'message_delta',
            messageId: item.id,
            delta: item.text,
            replace: true,
          } satisfies SessionStreamEvent,
        ]
      : []),
    { type: 'message_completed', messageId: item.id },
  ];
}

function buildUserInputEnvelope(
  requestId: RequestId,
  params: ToolRequestUserInputParams,
  request: ServerRequest,
): PendingDecisionEnvelope {
  return {
    id: String(requestId),
    requestId,
    kind: 'user_input',
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    request,
    card: {
      id: String(requestId),
      kind: 'user_input',
      title: 'Codex needs more input',
      body: 'Answer the questions below to continue the current session.',
      questions: params.questions.map((question) => ({
        id: question.id,
        header: question.header,
        question: question.question,
        allowOther: question.isOther,
        options: (question.options ?? []).map((option) => ({
          label: option.label,
          description: option.description,
          value: option.label,
        })),
      })),
    },
  };
}

function buildCommandApprovalEnvelope(
  requestId: RequestId,
  params: CommandExecutionRequestApprovalParams,
  request: ServerRequest,
): PendingDecisionEnvelope {
  const availableDecisions = params.availableDecisions ?? ['accept', 'decline'];

  return {
    id: String(requestId),
    requestId,
    kind: 'command_approval',
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    request,
    card: {
      id: String(requestId),
      kind: 'command_execution',
      title: 'Codex requests command approval',
      body: params.reason ?? 'Choose how to handle this command execution request.',
      command: params.command ?? null,
      cwd: params.cwd ?? null,
      questions: [
        {
          id: 'decision',
          header: 'Decision',
          question: 'Choose how to handle this command execution request.',
          allowOther: false,
          options: availableDecisions.map((decision) => toDecisionOption(decision)),
        },
      ],
    },
  };
}

function buildFileChangeApprovalEnvelope(
  requestId: RequestId,
  params: FileChangeRequestApprovalParams,
  request: ServerRequest,
): PendingDecisionEnvelope {
  return {
    id: String(requestId),
    requestId,
    kind: 'file_change_approval',
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    request,
    card: {
      id: String(requestId),
      kind: 'file_change',
      title: 'Codex requests file change approval',
      body: params.reason ?? 'Choose how to handle this file change request.',
      grantRoot: params.grantRoot ?? null,
      questions: [
        {
          id: 'decision',
          header: 'Decision',
          question: 'Choose how to handle this file change request.',
          allowOther: false,
          options: (['accept', 'acceptForSession', 'decline', 'cancel'] as const).map((decision) => ({
            label: decision,
            description: describeFileChangeDecision(decision),
            value: decision,
          })),
        },
      ],
    },
  };
}

function buildPermissionsApprovalEnvelope(
  requestId: RequestId,
  params: PermissionsRequestApprovalParams,
  request: ServerRequest,
): PendingDecisionEnvelope {
  return {
    id: String(requestId),
    requestId,
    kind: 'permissions_approval',
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    request,
    card: {
      id: String(requestId),
      kind: 'permissions',
      title: 'Codex requests additional permissions',
      body: params.reason ?? 'Choose the approval scope for this permission request.',
      permissionsSummary: JSON.stringify(params.permissions),
      questions: [
        {
          id: 'scope',
          header: 'Scope',
          question: 'Choose the approval scope.',
          allowOther: false,
          options: [
            { label: 'turn', description: 'Only this turn', value: 'turn' },
            { label: 'session', description: 'The entire session', value: 'session' },
          ],
        },
      ],
    },
  };
}

function buildUserInputResponse(
  params: ToolRequestUserInputParams,
  answers: Record<string, string>,
): ToolRequestUserInputResponse {
  const responseAnswers: ToolRequestUserInputResponse['answers'] = {};

  for (const question of params.questions) {
    const answer = (answers[question.id] ?? '').trim();
    responseAnswers[question.id] = {
      answers: answer ? [answer] : [],
    };
  }

  return { answers: responseAnswers };
}

function buildCommandApprovalResponse(
  params: CommandExecutionRequestApprovalParams,
  answers: Record<string, string>,
): CommandExecutionRequestApprovalResponse {
  const selectedValue = (answers.decision ?? Object.values(answers)[0] ?? '').trim();
  const availableDecisions = params.availableDecisions ?? ['accept', 'decline'];
  const matched = availableDecisions.find((decision) => serializeDecisionValue(decision) === selectedValue) ?? 'accept';

  return { decision: matched };
}

function buildFileChangeApprovalResponse(
  _params: FileChangeRequestApprovalParams,
  answers: Record<string, string>,
): FileChangeRequestApprovalResponse {
  const selected = normalizeFileChangeDecision(answers.decision ?? Object.values(answers)[0] ?? 'accept');
  return { decision: selected };
}

function buildPermissionsApprovalResponse(
  params: PermissionsRequestApprovalParams,
  answers: Record<string, string>,
): PermissionsRequestApprovalResponse {
  return {
    permissions: toGrantedPermissionProfile(params.permissions),
    scope: normalizePermissionScope(answers.scope ?? Object.values(answers)[0] ?? 'turn'),
  };
}

function toDecisionOption(decision: CommandExecutionApprovalDecision): DecisionOption {
  return {
    label: describeCommandDecision(decision),
    description: typeof decision === 'string' ? decision : JSON.stringify(decision),
    value: serializeDecisionValue(decision),
  };
}

function serializeDecisionValue(value: CommandExecutionApprovalDecision): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function describeCommandDecision(value: CommandExecutionApprovalDecision): string {
  return typeof value === 'string' ? value : (Object.keys(value)[0] ?? 'accept');
}

function describeFileChangeDecision(value: FileChangeApprovalDecision): string {
  switch (value) {
    case 'accept':
      return 'Approve once';
    case 'acceptForSession':
      return 'Approve for the session';
    case 'decline':
      return 'Decline';
    case 'cancel':
      return 'Cancel';
    default:
      return value;
  }
}

function normalizeFileChangeDecision(value: string): FileChangeApprovalDecision {
  switch (value) {
    case 'acceptForSession':
    case 'decline':
    case 'cancel':
      return value;
    case 'accept':
    default:
      return 'accept';
  }
}

function normalizePermissionScope(value: string): PermissionGrantScope {
  return value === 'session' ? 'session' : 'turn';
}

function toGrantedPermissionProfile(request: RequestPermissionProfile): GrantedPermissionProfile {
  return {
    network: request.network ?? undefined,
    fileSystem: request.fileSystem ?? undefined,
  };
}

function extractReasoningText(item: Extract<ThreadItem, { type: 'reasoning' }>): string {
  const summaryText = stringifyReasoningValue(item.summary);
  const contentText = stringifyReasoningValue(item.content);
  return [summaryText, contentText].filter(Boolean).join('\n').trim();
}

function isReasoningItem(item: ThreadItem): item is Extract<ThreadItem, { type: 'reasoning' }> {
  return item.type === 'reasoning';
}

function isActivityItem(
  item: ThreadItem,
): item is Extract<ThreadItem, { type: 'commandExecution' | 'toolCall' | 'plan' }> {
  return item.type === 'commandExecution' || item.type === 'toolCall' || item.type === 'plan';
}

function toActivityKind(itemType: 'commandExecution' | 'toolCall' | 'plan'): SessionActivityKind {
  switch (itemType) {
    case 'commandExecution':
      return 'command_execution';
    case 'toolCall':
      return 'tool_call';
    case 'plan':
      return 'plan';
    default:
      return 'tool_call';
  }
}

function extractActivityTitle(item: Extract<ThreadItem, { type: 'commandExecution' | 'toolCall' | 'plan' }>): string {
  switch (item.type) {
    case 'commandExecution':
      return item.title ?? '执行命令';
    case 'toolCall':
      return item.title ?? (item.toolName ? `调用工具：${item.toolName}` : '调用工具');
    case 'plan':
      return item.title ?? '更新计划';
    default:
      return 'Agent Activity';
  }
}

function extractActivityDetail(item: Extract<ThreadItem, { type: 'commandExecution' | 'toolCall' | 'plan' }>): string {
  switch (item.type) {
    case 'commandExecution':
      return [
        item.command ? `Command: ${item.command}` : '',
        item.cwd ? `Cwd: ${item.cwd}` : '',
        item.status ? `Status: ${item.status}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'toolCall':
      return [
        item.toolName ? `Tool: ${item.toolName}` : '',
        item.arguments ? `Arguments: ${stringifyActivityValue(item.arguments)}` : '',
        item.status ? `Status: ${item.status}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'plan':
      return item.status ? `Status: ${item.status}` : '';
    default:
      return '';
  }
}

function extractActivityText(item: Extract<ThreadItem, { type: 'commandExecution' | 'toolCall' | 'plan' }>): string {
  switch (item.type) {
    case 'commandExecution':
      return [item.text, item.stdout, item.stderr, stringifyActivityValue(item.output), formatExitCode(item.exitCode)]
        .filter(Boolean)
        .join('\n')
        .trim();
    case 'toolCall':
      return [item.text, stringifyActivityValue(item.result)].filter(Boolean).join('\n').trim();
    case 'plan':
      return [item.text, stringifyActivityValue(item.content), stringifyActivityValue(item.steps)]
        .filter(Boolean)
        .join('\n')
        .trim();
    default:
      return '';
  }
}

function buildDecisionActivityDetail(card: SessionDecisionCard): string {
  switch (card.kind) {
    case 'command_execution':
      return [card.command ? `Command: ${card.command}` : '', card.cwd ? `Cwd: ${card.cwd}` : '']
        .filter(Boolean)
        .join('\n');
    case 'file_change':
      return card.grantRoot ? `Grant Root: ${card.grantRoot}` : '';
    case 'permissions':
      return `Permissions: ${card.permissionsSummary}`;
    case 'user_input':
    default:
      return '';
  }
}

function stringifyReasoningValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyReasoningValue(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof value === 'object') {
    const text = Reflect.get(value, 'text');
    const summary = Reflect.get(value, 'summary');
    const content = Reflect.get(value, 'content');
    const parts = [text, summary, content]
      .map((entry) => stringifyReasoningValue(entry))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join('\n').trim();
    }
  }

  return '';
}

function stringifyActivityValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function formatExitCode(exitCode: number | null | undefined): string {
  return typeof exitCode === 'number' ? `Exit Code: ${exitCode}` : '';
}
