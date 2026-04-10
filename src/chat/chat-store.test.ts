import { describe, expect, it } from 'vitest';

import { createChatStore } from './chat-store';
import type { SessionStreamEvent } from '../shared/codex-session-types';

describe('createChatStore', () => {
  it('stores activity items in the timeline and updates their streaming text', () => {
    const store = createChatStore();

    const events: SessionStreamEvent[] = [
      {
        type: 'activity_started',
        activityId: 'activity-1',
        activityKind: 'command_execution',
        title: '执行命令',
        detail: 'npm test -- src/chat/chat-store.test.ts',
      },
      {
        type: 'activity_delta',
        activityId: 'activity-1',
        delta: '正在运行测试...',
      },
      {
        type: 'activity_completed',
        activityId: 'activity-1',
      },
    ];

    for (const event of events) {
      store.applyEvent(event);
    }

    expect(store.getState().messages).toEqual([
      {
        kind: 'activity',
        id: 'activity-1',
        activityKind: 'command_execution',
        title: '执行命令',
        detail: 'npm test -- src/chat/chat-store.test.ts',
        text: '正在运行测试...',
        status: 'completed',
      },
    ]);
  });

  it('keeps the conversation intact while tracking model generation events', () => {
    const store = createChatStore({
      activeModelId: 'model_001',
      modelLabel: 'part-original.stl',
      messages: [
        {
          kind: 'message',
          id: 'user-1',
          role: 'user',
          text: 'keep this conversation',
          status: 'completed',
        },
      ],
    });

    store.applyEvent({
      type: 'model_generation_started',
      jobId: 'job_001',
      baseModelId: 'model_001',
    });
    store.applyEvent({
      type: 'model_generated',
      jobId: 'job_001',
      baseModelId: 'model_001',
      newModelId: 'model_002',
      modelLabel: 'part-edited.stl',
    });
    store.applyEvent({
      type: 'model_generation_failed',
      jobId: 'job_002',
      baseModelId: 'model_002',
      message: 'generation failed',
    });

    const state = store.getState();

    expect(state.activeModelId).toBe('model_001');
    expect(state.modelLabel).toBe('part-original.stl');
    expect(state.messages.map((message) => message.text)).toEqual([
      'keep this conversation',
      'New model generated: part-edited.stl',
      'Model generation failed: generation failed',
    ]);
  });
});
