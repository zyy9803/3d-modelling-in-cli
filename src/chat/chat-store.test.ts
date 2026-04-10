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
});
