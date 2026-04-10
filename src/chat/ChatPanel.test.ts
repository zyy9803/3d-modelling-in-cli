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

  it('renders activity cards so users can see agent progress', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'activity',
          id: 'activity-1',
          activityKind: 'tool_call',
          title: '调用工具',
          detail: 'ReadFile: src/chat/chat-store.ts',
          text: '读取当前 store 实现以决定时间线结构。',
          status: 'completed',
        },
      ],
    });

    const details = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('调用工具');
    expect(details?.textContent).toContain('ReadFile: src/chat/chat-store.ts');
    expect(details?.textContent).toContain('读取当前 store 实现以决定时间线结构。');
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
          text: '先检查当前事件流，再决定前端如何收口。',
          status: 'completed',
        },
      ],
    });

    const details = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('Thinking');
    expect(details?.textContent).toContain('先检查当前事件流，再决定前端如何收口。');
  });
});
