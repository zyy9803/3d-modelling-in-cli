import { describe, expect, it, vi } from 'vitest';

import { createChatPanel, type ChatPanelState } from './ChatPanel';

const noopHandlers = {
  onSend: vi.fn(),
  onInterrupt: vi.fn(),
  onClearSession: vi.fn(),
  onDecision: vi.fn(),
};

function createBaseState(): ChatPanelState {
  return {
    connectionStatus: 'connected',
    connectionMessage: 'Connected',
    sessionStatus: 'completed',
    activeModelId: 'model-1',
    modelLabel: 'Model 1',
    messages: [],
    pendingDecision: null,
    contextSummary: {
      triangleCount: 0,
      componentCount: 0,
      orientation: '+X',
    },
  };
}

describe('createChatPanel', () => {
  it('does not render an empty thinking card when reasoning has no text', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'message',
          id: 'reasoning-1',
          role: 'reasoning',
          title: 'Thinking',
          text: '',
          status: 'completed',
        },
      ],
    });

    expect(panel.element.textContent).toContain('还没有消息');
    expect(panel.element.textContent).not.toContain('Thinking');
  });

  it('renders plan activity cards so users can see agent progress', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'activity',
          id: 'activity-1',
          activityKind: 'plan',
          title: 'Plan Update',
          fields: [
            {
              label: '状态',
              value: 'in_progress',
            },
          ],
          text: 'Generate a revised mesh-edit approach.',
          bodyFormat: 'plain',
          status: 'completed',
        },
      ],
    });

    const details = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(details).not.toBeNull();
    expect(details?.dataset.collapsibleOpen).toBe('false');
    expect(details?.querySelector('[data-collapsible-toggle="true"]')?.textContent).toContain('Plan Update');
    expect(details?.querySelector('.chat-message__body-scroll')).not.toBeNull();
    expect(details?.textContent).toContain('状态');
    expect(details?.textContent).toContain('in_progress');
    expect(details?.textContent).toContain('Generate a revised mesh-edit approach.');
  });

  it('renders thinking as a collapsed card with expandable content', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'message',
          id: 'reasoning-2',
          role: 'reasoning',
          title: 'Thinking',
          text: 'Inspect the current selection before deciding the next edit step.',
          status: 'completed',
        },
      ],
    });

    const details = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(details).not.toBeNull();
    expect(details?.dataset.collapsibleOpen).toBe('false');
    expect(details?.querySelector('[data-collapsible-toggle="true"]')?.textContent).toContain('Thinking');
    expect(details?.querySelector('.chat-message__body-scroll')).not.toBeNull();
    expect(details?.textContent).toContain('Inspect the current selection before deciding the next edit step.');
  });

  it('preserves collapsible card open state across re-renders', () => {
    const panel = createChatPanel(noopHandlers);
    const initialState = {
      ...createBaseState(),
      messages: [
        {
          kind: 'message' as const,
          id: 'reasoning-3',
          role: 'reasoning' as const,
          title: 'Thinking',
          text: 'first chunk',
          status: 'streaming' as const,
        },
      ],
    };

    panel.render(initialState);

    const firstCard = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(firstCard).not.toBeNull();
    firstCard?.querySelector<HTMLButtonElement>('[data-collapsible-toggle="true"]')?.click();

    panel.render({
      ...initialState,
      messages: [
        {
          kind: 'message',
          id: 'reasoning-3',
          role: 'reasoning',
          title: 'Thinking',
          text: 'first chunk\nsecond chunk',
          status: 'streaming',
        },
        {
          kind: 'message',
          id: 'assistant-1',
          role: 'assistant',
          text: 'follow-up',
          status: 'streaming',
        },
      ],
    });

    const rerenderedCard = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(rerenderedCard?.dataset.collapsibleOpen).toBe('true');
    expect(rerenderedCard?.querySelector<HTMLElement>('[data-collapsible-body="true"]')?.hidden).toBe(false);
  });

  it('renders command and tool activity cards in the main timeline', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'activity',
          id: 'command-1',
          activityKind: 'command_execution',
          title: 'Run command',
          fields: [
            {
              label: '命令',
              value: 'python edit.py',
            },
            {
              label: '目录',
              value: '/tmp/workspace',
            },
          ],
          text: 'running',
          bodyFormat: 'code',
          status: 'streaming',
        },
        {
          kind: 'activity',
          id: 'tool-1',
          activityKind: 'tool_call',
          title: 'Read file',
          fields: [
            {
              label: '工具',
              value: 'read_file',
            },
          ],
          text: '参数\ncontext.json',
          bodyFormat: 'code',
          status: 'completed',
        },
        {
          kind: 'message',
          id: 'assistant-2',
          role: 'assistant',
          text: 'final reply',
          status: 'completed',
        },
      ],
    });

    expect(panel.element.textContent).toContain('final reply');
    expect(panel.element.textContent).toContain('Run command');
    expect(panel.element.textContent).toContain('Read file');
    expect(panel.element.textContent).toContain('python edit.py');
    expect(panel.element.textContent).toContain('/tmp/workspace');
    expect(panel.element.textContent).toContain('context.json');
  });

  it('hides streaming command execution cards when command approval is pending', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      sessionStatus: 'waiting_decision',
      pendingDecision: {
        id: 'decision-1',
        kind: 'command_execution',
        title: '命令执行审批',
        body: '是否允许继续执行命令？',
        command: 'python edit.py',
        cwd: '/tmp/workspace',
        questions: [],
      },
      messages: [
        {
          kind: 'activity',
          id: 'command-1',
          activityKind: 'command_execution',
          title: 'Run command',
          fields: [
            {
              label: '命令',
              value: 'python edit.py',
            },
          ],
          text: 'running',
          bodyFormat: 'code',
          status: 'streaming',
        },
        {
          kind: 'activity',
          id: 'tool-1',
          activityKind: 'tool_call',
          title: 'Read file',
          fields: [
            {
              label: '工具',
              value: 'read_file',
            },
          ],
          text: '参数\ncontext.json',
          bodyFormat: 'code',
          status: 'streaming',
        },
      ],
    });

    expect(panel.element.textContent).not.toContain('Run command');
    expect(panel.element.textContent).toContain('Read file');
    expect(panel.element.querySelector('[data-decision-card]')?.textContent).toContain('命令执行审批');
    expect(panel.element.querySelector('[data-decision-card]')?.textContent).toContain('python edit.py');
    expect(panel.element.querySelector('[data-decision-card]')?.textContent).toContain('/tmp/workspace');
    expect(panel.element.querySelector('.chat-panel__messages [data-decision-card]')).not.toBeNull();
  });
});
