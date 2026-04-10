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
          detail: 'Plan step 1',
          text: 'Generate a revised mesh-edit approach.',
          status: 'completed',
        },
      ],
    });

    const details = panel.element.querySelector<HTMLElement>('[data-collapsible-card="true"]');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('Plan Update');
    expect(details?.querySelector('.chat-message__body-scroll')).not.toBeNull();
    expect(details?.textContent).toContain('Plan step 1');
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
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('Thinking');
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

    const firstDetails = panel.element.querySelector<HTMLDetailsElement>('[data-collapsible-card="true"]');
    expect(firstDetails).not.toBeNull();
    firstDetails!.open = true;
    firstDetails!.dispatchEvent(new Event('toggle'));

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

    const rerenderedDetails = panel.element.querySelector<HTMLDetailsElement>('[data-collapsible-card="true"]');
    expect(rerenderedDetails?.open).toBe(true);
  });

  it('does not render command and tool activity cards in the main timeline', () => {
    const panel = createChatPanel(noopHandlers);

    panel.render({
      ...createBaseState(),
      messages: [
        {
          kind: 'activity',
          id: 'command-1',
          activityKind: 'command_execution',
          title: 'Run command',
          detail: 'python edit.py',
          text: 'running',
          status: 'streaming',
        },
        {
          kind: 'activity',
          id: 'tool-1',
          activityKind: 'tool_call',
          title: 'Read file',
          detail: 'context.json',
          text: 'reading',
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
    expect(panel.element.textContent).not.toContain('Run command');
    expect(panel.element.textContent).not.toContain('Read file');
  });
});
