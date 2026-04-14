import { describe, expect, it } from "vitest";

import {
  chatStateReducer,
  createInitialChatState,
  type ChatStoreState,
} from "../../../src/components/chat/state";
import type { SessionStreamEvent } from "../../../src/shared/codex-session-types";

describe("chatStateReducer", () => {
  it("stores activity items in the timeline and updates their streaming text", () => {
    const events: SessionStreamEvent[] = [
      {
        type: "activity_started",
        activityId: "activity-1",
        activityKind: "command_execution",
        title: "执行命令",
        fields: [
          {
            label: "命令",
            value: "pnpm test tests/frontend/chat/chat-store.test.ts",
          },
        ],
        bodyFormat: "code",
      },
      {
        type: "activity_delta",
        activityId: "activity-1",
        delta: "正在运行测试...",
      },
      {
        type: "activity_completed",
        activityId: "activity-1",
      },
    ];

    const state = events.reduce<ChatStoreState>(
      (current, event) =>
        chatStateReducer(current, {
          type: "session-event",
          event,
        }),
      createInitialChatState(),
    );

    expect(state.messages).toEqual([
      {
        kind: "activity",
        id: "activity-1",
        activityKind: "command_execution",
        title: "执行命令",
        fields: [
          {
            label: "命令",
            value: "pnpm test tests/frontend/chat/chat-store.test.ts",
          },
        ],
        text: "正在运行测试...",
        bodyFormat: "code",
        status: "completed",
      },
    ]);
  });

  it("keeps the conversation intact while tracking model generation events", () => {
    const events: SessionStreamEvent[] = [
      {
        type: "draft_state_changed",
        draft: {
          status: "ready",
          jobId: "job_001",
          baseModelId: "model_001",
          scriptPath: "/tmp/job_001/edit.py",
          message: null,
        },
      },
      {
        type: "model_generation_started",
        jobId: "job_001",
        baseModelId: "model_001",
      },
      {
        type: "model_generated",
        jobId: "job_001",
        baseModelId: "model_001",
        newModelId: "model_002",
        modelLabel: "model_002_from_model_001.stl",
        modelPath: "/tmp/models/model_002_from_model_001.stl",
      },
      {
        type: "model_generation_failed",
        jobId: "job_002",
        baseModelId: "model_002",
        message: "generation failed",
      },
    ];

    const initialState = createInitialChatState({
      activeModelId: "model_001",
      modelLabel: "part-original.stl",
      messages: [
        {
          kind: "message",
          id: "user-1",
          role: "user",
          text: "keep this conversation",
          status: "completed",
        },
      ],
    });

    const state = events.reduce<ChatStoreState>(
      (current, event) =>
        chatStateReducer(current, {
          type: "session-event",
          event,
        }),
      initialState,
    );

    expect(state.activeModelId).toBe("model_001");
    expect(state.modelLabel).toBe("part-original.stl");
    expect(state.draft.status).toBe("running");
    expect(state.messages.map((message) => message.text)).toEqual([
      "keep this conversation",
      "草稿脚本已就绪：/tmp/job_001/edit.py",
      "新 STL 已生成：/tmp/models/model_002_from_model_001.stl",
      "Model generation failed: generation failed",
    ]);
  });
});
