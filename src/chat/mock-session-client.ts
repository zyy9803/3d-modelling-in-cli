import type {
  SessionContentFormat,
  SessionDecisionCard,
  SessionInfoField,
  SessionStreamEvent,
} from '../shared/codex-session-types';
import type { SessionStatusResponse } from './session-client';

export const MOCK_CODEX_QUERY_PARAM = 'mock-codex';

export type MockCodexScenarioId =
  | 'overview'
  | 'long-timeline'
  | 'streaming'
  | 'command-approval'
  | 'file-change-approval'
  | 'permissions-approval'
  | 'user-input';

type SessionClientOptions = {
  onEvent: (event: SessionStreamEvent) => void;
};

type SessionMessagePayload = {
  sessionId: string;
  activeModelId: string | null;
  message: {
    role: 'user';
    text: string;
  };
};

type SessionDecisionPayload = {
  sessionId: string;
  decisionId: string;
  answers: Record<string, string>;
};

type SessionInterruptPayload = {
  sessionId: string;
};

type SessionModelSwitchPayload = {
  sessionId: string;
  activeModelId: string | null;
  modelLabel: string | null;
};

type SessionImportPayload = {
  modelId: string;
  modelLabel: string;
};

type MockScenario = {
  id: MockCodexScenarioId;
  label: string;
  events: SessionStreamEvent[];
};

const DEFAULT_SCENARIO_ID: MockCodexScenarioId = 'overview';

const MOCK_MODEL_ID = 'model_mock_001';
const MOCK_MODEL_LABEL = 'mock-preview.stl';

const MOCK_STL = `solid mock_preview
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 40 0 0
    vertex 0 40 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 40 0 0
    vertex 40 40 0
    vertex 0 40 0
  endloop
endfacet
endsolid mock_preview
`;

export function resolveMockCodexScenarioId(search: string): MockCodexScenarioId | null {
  const rawValue = new URLSearchParams(search).get(MOCK_CODEX_QUERY_PARAM);
  if (rawValue == null) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (!normalizedValue || normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'all') {
    return DEFAULT_SCENARIO_ID;
  }

  const aliases: Record<string, MockCodexScenarioId> = {
    overview: 'overview',
    long: 'long-timeline',
    'long-timeline': 'long-timeline',
    stream: 'streaming',
    streaming: 'streaming',
    command: 'command-approval',
    'command-approval': 'command-approval',
    file: 'file-change-approval',
    'file-change': 'file-change-approval',
    'file-change-approval': 'file-change-approval',
    permission: 'permissions-approval',
    permissions: 'permissions-approval',
    'permissions-approval': 'permissions-approval',
    input: 'user-input',
    'user-input': 'user-input',
  };

  return aliases[normalizedValue] ?? DEFAULT_SCENARIO_ID;
}

export class MockSessionClient {
  private onEvent: ((event: SessionStreamEvent) => void) | null = null;
  private responseCounter = 0;

  public constructor(private readonly scenarioId: MockCodexScenarioId) {}

  public connect(options: SessionClientOptions): () => void {
    this.onEvent = options.onEvent;
    setTimeout(() => {
      this.emitScenario(this.scenarioId);
    }, 0);

    return () => {
      this.onEvent = null;
    };
  }

  public async getStatus(): Promise<SessionStatusResponse> {
    return {
      connectionStatus: 'connected',
      connectionMessage: `Mock Codex: ${getScenarioDefinition(this.scenarioId).label}`,
      sessionStatus: 'idle',
      activeModelId: MOCK_MODEL_ID,
      modelLabel: MOCK_MODEL_LABEL,
      draft: {
        status: 'empty',
        jobId: null,
        baseModelId: null,
        scriptPath: null,
        message: null,
      },
    };
  }

  public async sendMessage(payload: SessionMessagePayload): Promise<void> {
    const responseId = `mock-response-${this.responseCounter += 1}`;
    this.emit({ type: 'status_changed', status: 'streaming' });

    for (const event of [
      ...createCompletedMessageEvents(
        `${responseId}-thinking`,
        'reasoning',
        'Thinking',
        `正在根据你的指令整理局部编辑方案：${payload.message.text}`,
      ),
      ...createCompletedActivityEvents({
        activityId: `${responseId}-tool`,
        activityKind: 'tool_call',
        title: '调用工具：ReadFile',
        fields: createFields([
          ['工具', 'ReadFile'],
          ['状态', 'completed'],
        ]),
        text: `参数\n{\n  "path": "artifacts/jobs/job_001/context.json"\n}\n\n结果\n{\n  "selectedTriangles": 128,\n  "orientation": "+X"\n}`,
        bodyFormat: 'code',
      }),
      ...createCompletedMessageEvents(
        `${responseId}-assistant`,
        'assistant',
        undefined,
        `这是一个 mock 回复。当前已覆盖新的卡片渲染链路，你可以继续观察消息、工具调用和命令执行卡片的 UI 表现。`,
      ),
      { type: 'status_changed', status: 'completed' } satisfies SessionStreamEvent,
    ]) {
      this.emit(event);
    }
  }

  public async sendDecision(payload: SessionDecisionPayload): Promise<void> {
    this.emit({ type: 'session_resumed', decisionId: payload.decisionId });
    this.emit({ type: 'status_changed', status: 'resuming' });

    for (const event of [
      { type: 'status_changed', status: 'streaming' } satisfies SessionStreamEvent,
      ...createCompletedMessageEvents(
        `mock-decision-result-${this.responseCounter += 1}`,
        'assistant',
        undefined,
        `已收到 mock 决策：${formatDecisionAnswers(payload.answers)}。你现在可以继续检查恢复后的时间线布局。`,
      ),
      { type: 'status_changed', status: 'completed' } satisfies SessionStreamEvent,
    ]) {
      this.emit(event);
    }
  }

  public async interrupt(payload: SessionInterruptPayload): Promise<void> {
    this.emit({
      type: 'turn_interrupted',
      turnId: `mock-turn-${payload.sessionId}`,
    });
  }

  public async generateModel(): Promise<void> {
    this.emit({
      type: 'model_generation_started',
      jobId: 'job_mock_001',
      baseModelId: MOCK_MODEL_ID,
    });
    this.emit({
      type: 'draft_state_changed',
      draft: {
        status: 'executed',
        jobId: 'job_mock_001',
        baseModelId: MOCK_MODEL_ID,
        scriptPath: '/mock/artifacts/jobs/job_mock_001/edit.py',
        message: null,
      },
    });
    this.emit({
      type: 'model_generated',
      jobId: 'job_mock_001',
      baseModelId: MOCK_MODEL_ID,
      newModelId: 'model_mock_002',
      modelLabel: 'mock-preview-edited.stl',
    });
  }

  public async importModel(sessionId: string, file: File): Promise<SessionImportPayload> {
    return {
      modelId: `${MOCK_MODEL_ID}-${sessionId}`,
      modelLabel: file.name,
    };
  }

  public async switchModel(payload: SessionModelSwitchPayload): Promise<void> {
    this.emit({
      type: 'model_switched',
      activeModelId: payload.activeModelId,
      modelLabel: payload.modelLabel,
    });
  }

  public async clearSession(): Promise<void> {
    this.emit({ type: 'session_cleared' });
  }

  public async fetchModelFile(modelId: string): Promise<File> {
    return new File([MOCK_STL], `${modelId}.stl`, { type: 'model/stl' });
  }

  private emitScenario(scenarioId: MockCodexScenarioId): void {
    const scenario = getScenarioDefinition(scenarioId);
    this.emit({ type: 'session_cleared' });
    for (const event of scenario.events) {
      this.emit(event);
    }
  }

  private emit(event: SessionStreamEvent): void {
    this.onEvent?.(event);
  }
}

function getScenarioDefinition(scenarioId: MockCodexScenarioId): MockScenario {
  switch (scenarioId) {
    case 'long-timeline':
      return buildLongTimelineScenario();
    case 'streaming':
      return buildStreamingScenario();
    case 'command-approval':
      return buildCommandApprovalScenario();
    case 'file-change-approval':
      return buildFileChangeApprovalScenario();
    case 'permissions-approval':
      return buildPermissionsApprovalScenario();
    case 'user-input':
      return buildUserInputScenario();
    case 'overview':
    default:
      return buildOverviewScenario();
  }
}

function buildOverviewScenario(): MockScenario {
  return {
    id: 'overview',
    label: '总览',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedMessageEvents(
        'mock-overview-thinking',
        'reasoning',
        'Thinking',
        '先读取当前选区上下文，确认孔洞边缘、法线方向和模型局部厚度，再决定如何组织修改步骤。',
      ),
      ...createCompletedActivityEvents({
        activityId: 'mock-overview-plan',
        activityKind: 'plan',
        title: '更新计划',
        fields: createFields([['状态', 'completed']]),
        text: '1. 读取当前选区上下文\n2. 分析孔洞边缘连续性\n3. 生成倒圆角修改草案',
        bodyFormat: 'plain',
      }),
      ...createCompletedActivityEvents({
        activityId: 'mock-overview-tool',
        activityKind: 'tool_call',
        title: '调用工具：ReadFile',
        fields: createFields([
          ['工具', 'ReadFile'],
          ['状态', 'completed'],
        ]),
        text: `参数\n{\n  "path": "artifacts/jobs/job_001/context.json"\n}\n\n结果\n{\n  "selectedTriangles": 128,\n  "components": 3,\n  "orientation": "+X"\n}`,
        bodyFormat: 'code',
      }),
      ...createCompletedActivityEvents({
        activityId: 'mock-overview-command',
        activityKind: 'command_execution',
        title: '执行命令',
        fields: createFields([
          ['命令', 'python edit.py --selection current --preview'],
          ['目录', '/workspace/artifacts/jobs/job_001'],
          ['状态', 'completed'],
          ['退出码', '0'],
        ]),
        text: `$ python edit.py --selection current --preview\nLoaded 128 selected triangles\nBuilt rounded-edge preview mesh\nSaved preview to artifacts/jobs/job_001/preview.stl`,
        bodyFormat: 'code',
      }),
      ...createCompletedActivityEvents({
        activityId: 'mock-overview-approval',
        activityKind: 'approval',
        title: '请求审批',
        fields: createFields([
          ['命令', 'python edit.py --selection current --apply'],
          ['目录', '/workspace/artifacts/jobs/job_001'],
        ]),
        text: 'Codex 请求执行实际修改命令，等待你的审批。',
        bodyFormat: 'plain',
      }),
      ...createCompletedMessageEvents(
        'mock-overview-assistant',
        'assistant',
        undefined,
        '已经完成局部分析。根据当前 mock 数据，时间线里会同时展示思考、计划、工具调用、命令执行和审批卡片。',
      ),
      { type: 'status_changed', status: 'completed' },
    ],
  };
}

function buildLongTimelineScenario(): MockScenario {
  const events: SessionStreamEvent[] = [
    { type: 'status_changed', status: 'streaming' },
    ...createCompletedMessageEvents(
      'mock-long-intro',
      'assistant',
      undefined,
      '这是用于压测聊天区滚动和卡片高度稳定性的 mock 长时间线。',
    ),
  ];

  for (let index = 1; index <= 6; index += 1) {
    events.push(
      ...createCompletedActivityEvents({
        activityId: `mock-long-plan-${index}`,
        activityKind: 'plan',
        title: `计划更新 ${index}`,
        fields: createFields([['状态', 'completed']]),
        text: `${index}. 检查第 ${index} 轮局部边界\n${index}. 生成候选修复策略\n${index}. 记录约束条件`,
        bodyFormat: 'plain',
      }),
      ...createCompletedActivityEvents({
        activityId: `mock-long-tool-${index}`,
        activityKind: 'tool_call',
        title: `调用工具：ReadFile #${index}`,
        fields: createFields([
          ['工具', 'ReadFile'],
          ['状态', 'completed'],
        ]),
        text: `参数\n{\n  "path": "artifacts/jobs/job_00${index}/context.json"\n}\n\n结果\n{\n  "triangles": ${index * 64},\n  "componentCount": ${index + 1}\n}`,
        bodyFormat: 'code',
      }),
      ...createCompletedActivityEvents({
        activityId: `mock-long-command-${index}`,
        activityKind: 'command_execution',
        title: `执行命令 #${index}`,
        fields: createFields([
          ['命令', `python edit.py --pass ${index}`],
          ['目录', `/workspace/artifacts/jobs/job_00${index}`],
          ['状态', 'completed'],
          ['退出码', '0'],
        ]),
        text: `$ python edit.py --pass ${index}\nLoaded region ${index}\nGenerated candidate mesh patch ${index}`,
        bodyFormat: 'code',
      }),
      ...createCompletedMessageEvents(
        `mock-long-assistant-${index}`,
        'assistant',
        undefined,
        `第 ${index} 轮 mock 处理完成。这个卡片主要用于验证在大量混合消息下，消息区仍然保持可滚动且不会被下方内容挤压。`,
      ),
    );
  }

  events.push({ type: 'status_changed', status: 'completed' });

  return {
    id: 'long-timeline',
    label: '长时间线',
    events,
  };
}

function buildStreamingScenario(): MockScenario {
  return {
    id: 'streaming',
    label: '流式进行中',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedMessageEvents(
        'mock-streaming-thinking',
        'reasoning',
        'Thinking',
        '正在比较当前选区的法线连续性与边界曲率，准备下一步编辑动作。',
      ),
      ...createCompletedActivityEvents({
        activityId: 'mock-streaming-plan',
        activityKind: 'plan',
        title: '更新计划',
        fields: createFields([['状态', 'in_progress']]),
        text: '1. 读取选区上下文\n2. 预生成修复补丁\n3. 校验边界连续性',
        bodyFormat: 'plain',
      }),
      {
        type: 'activity_started',
        activityId: 'mock-streaming-tool',
        activityKind: 'tool_call',
        title: '调用工具：ReadFile',
        fields: createFields([
          ['工具', 'ReadFile'],
          ['状态', 'running'],
        ]),
        text: `参数\n{\n  "path": "artifacts/jobs/job_stream/context.json"\n}`,
        bodyFormat: 'code',
      },
      {
        type: 'activity_started',
        activityId: 'mock-streaming-command',
        activityKind: 'command_execution',
        title: '执行命令',
        fields: createFields([
          ['命令', 'python preview_patch.py --selection current'],
          ['目录', '/workspace/artifacts/jobs/job_stream'],
          ['状态', 'running'],
        ]),
        text: '$ python preview_patch.py --selection current\nGenerating in-memory preview...',
        bodyFormat: 'code',
      },
      {
        type: 'message_started',
        messageId: 'mock-streaming-assistant',
        role: 'assistant',
      },
      {
        type: 'message_delta',
        messageId: 'mock-streaming-assistant',
        delta: '正在根据最新 mock 上下文生成修改建议，请继续观察流式卡片的状态和滚动行为。',
      },
    ],
  };
}

function buildCommandApprovalScenario(): MockScenario {
  return {
    id: 'command-approval',
    label: '命令审批',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedActivityEvents({
        activityId: 'mock-command-approval-tool',
        activityKind: 'tool_call',
        title: '调用工具：ReadFile',
        fields: createFields([
          ['工具', 'ReadFile'],
          ['状态', 'completed'],
        ]),
        text: `参数\n{\n  "path": "artifacts/jobs/job_104/context.json"\n}`,
        bodyFormat: 'code',
      }),
      {
        type: 'activity_started',
        activityId: 'mock-command-approval-running',
        activityKind: 'command_execution',
        title: '执行命令',
        fields: createFields([
          ['命令', 'python edit.py --apply --selection current'],
          ['目录', '/workspace/artifacts/jobs/job_104'],
          ['状态', 'pending_approval'],
        ]),
        text: '$ python edit.py --apply --selection current',
        bodyFormat: 'code',
      },
      ...createCompletedActivityEvents({
        activityId: 'mock-command-approval-log',
        activityKind: 'approval',
        title: '请求审批',
        fields: createFields([
          ['命令', 'python edit.py --apply --selection current'],
          ['目录', '/workspace/artifacts/jobs/job_104'],
        ]),
        text: 'Codex 请求执行命令，需要你确认是否继续。',
        bodyFormat: 'plain',
      }),
      {
        type: 'needs_decision',
        decision: {
          id: 'mock-decision-command',
          kind: 'command_execution',
          title: '命令执行审批',
          body: '允许 Codex 在当前 mock 选区上执行实际修改命令吗？',
          command: 'python edit.py --apply --selection current',
          cwd: '/workspace/artifacts/jobs/job_104',
          questions: [createDecisionQuestion('decision', '处理方式', '请选择本次命令的处理方式。', false, [
            ['允许本次', '仅允许这一次执行', 'accept'],
            ['本会话持续允许', '后续同类命令自动通过', 'acceptForSession'],
            ['拒绝', '阻止本次执行', 'decline'],
          ])],
        },
      },
      { type: 'status_changed', status: 'waiting_decision' },
    ],
  };
}

function buildFileChangeApprovalScenario(): MockScenario {
  return {
    id: 'file-change-approval',
    label: '文件修改审批',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedActivityEvents({
        activityId: 'mock-file-change-plan',
        activityKind: 'plan',
        title: '更新计划',
        fields: createFields([['状态', 'completed']]),
        text: '准备把 patch 结果写回工作区中的模型输出目录。',
        bodyFormat: 'plain',
      }),
      ...createCompletedActivityEvents({
        activityId: 'mock-file-change-log',
        activityKind: 'approval',
        title: '请求审批',
        fields: createFields([['授权目录', '/workspace/artifacts/jobs/job_201']]),
        text: 'Codex 需要写入文件变更，请确认授权目录。',
        bodyFormat: 'plain',
      }),
      {
        type: 'needs_decision',
        decision: {
          id: 'mock-decision-file-change',
          kind: 'file_change',
          title: '文件修改审批',
          body: '允许 Codex 在以下目录中写入或覆盖文件吗？',
          grantRoot: '/workspace/artifacts/jobs/job_201',
          questions: [createDecisionQuestion('decision', '处理方式', '请选择文件写入的授权范围。', false, [
            ['允许本次', '仅本次授权', 'accept'],
            ['本会话持续允许', '对当前会话持续授权', 'acceptForSession'],
            ['拒绝', '不允许写入', 'decline'],
          ])],
        },
      },
      { type: 'status_changed', status: 'waiting_decision' },
    ],
  };
}

function buildPermissionsApprovalScenario(): MockScenario {
  return {
    id: 'permissions-approval',
    label: '权限审批',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedActivityEvents({
        activityId: 'mock-permissions-log',
        activityKind: 'approval',
        title: '请求审批',
        fields: createFields([['权限', 'network: github.com\nfilesystem: /workspace/artifacts']]),
        text: 'Codex 需要更高权限来继续当前 mock 流程。',
        bodyFormat: 'plain',
      }),
      {
        type: 'needs_decision',
        decision: {
          id: 'mock-decision-permissions',
          kind: 'permissions',
          title: '权限审批',
          body: '允许 Codex 获取以下网络与文件系统权限吗？',
          permissionsSummary: 'network: github.com\nfilesystem: /workspace/artifacts',
          questions: [createDecisionQuestion('scope', '授权范围', '请选择此次权限授权的范围。', false, [
            ['仅当前步骤', '只允许当前请求使用这些权限', 'turn'],
            ['整个会话', '本会话内持续允许', 'session'],
          ])],
        },
      },
      { type: 'status_changed', status: 'waiting_decision' },
    ],
  };
}

function buildUserInputScenario(): MockScenario {
  return {
    id: 'user-input',
    label: '补充输入',
    events: [
      { type: 'status_changed', status: 'streaming' },
      ...createCompletedActivityEvents({
        activityId: 'mock-user-input-log',
        activityKind: 'approval',
        title: '请求补充输入',
        fields: [],
        text: 'Codex 需要更多约束信息才能继续生成局部修改方案。',
        bodyFormat: 'plain',
      }),
      {
        type: 'needs_decision',
        decision: {
          id: 'mock-decision-user-input',
          kind: 'user_input',
          title: '需要补充输入',
          body: '请选择你更倾向的边缘处理方式，也可以输入自定义要求。',
          questions: [
            createDecisionQuestion('edge-style', '边缘风格', '希望边缘处理成哪种效果？', true, [
              ['小倒角', '轻微去锐边，保留整体轮廓', '小倒角'],
              ['大圆角', '明显平滑边缘，强调过渡', '大圆角'],
              ['保持锐边', '不处理边缘，只修复局部缺陷', '保持锐边'],
            ]),
          ],
        },
      },
      { type: 'status_changed', status: 'waiting_decision' },
    ],
  };
}

function createCompletedMessageEvents(
  messageId: string,
  role: 'assistant' | 'reasoning',
  title: string | undefined,
  text: string,
): SessionStreamEvent[] {
  return [
    {
      type: 'message_started',
      messageId,
      role,
      ...(title ? { title } : {}),
    },
    {
      type: 'message_delta',
      messageId,
      delta: text,
    },
    {
      type: 'message_completed',
      messageId,
    },
  ];
}

function createCompletedActivityEvents(options: {
  activityId: string;
  activityKind: 'plan' | 'tool_call' | 'command_execution' | 'approval';
  title: string;
  fields: SessionInfoField[];
  text: string;
  bodyFormat: SessionContentFormat;
}): SessionStreamEvent[] {
  return [
    {
      type: 'activity_started',
      activityId: options.activityId,
      activityKind: options.activityKind,
      title: options.title,
      fields: options.fields,
      text: options.text,
      bodyFormat: options.bodyFormat,
    },
    {
      type: 'activity_completed',
      activityId: options.activityId,
    },
  ];
}

function createFields(entries: Array<[string, string]>): SessionInfoField[] {
  return entries.map(([label, value]) => ({ label, value }));
}

function createDecisionQuestion(
  id: string,
  header: string,
  question: string,
  allowOther: boolean,
  options: Array<[string, string, string]>,
): SessionDecisionCard['questions'][number] {
  return {
    id,
    header,
    question,
    allowOther,
    options: options.map(([label, description, value]) => ({
      label,
      description,
      value,
    })),
  };
}

function formatDecisionAnswers(answers: Record<string, string>): string {
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return '未提供答案';
  }

  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}
