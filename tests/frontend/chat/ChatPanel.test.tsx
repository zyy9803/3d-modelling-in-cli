import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ChatPanel,
  type ChatPanelHandlers,
  type ChatPanelState,
} from "../../../src/features/chat/components/ChatPanel";

const noopHandlers: ChatPanelHandlers = {
  onSend: vi.fn(),
  onGenerateModel: vi.fn(),
  onInterrupt: vi.fn(),
  onClearSession: vi.fn(),
  onDecision: vi.fn(),
};

function createBaseState(): ChatPanelState {
  return {
    connectionStatus: "connected",
    connectionMessage: "Connected",
    sessionStatus: "completed",
    activeModelId: "model-1",
    modelLabel: "Model 1",
    draft: {
      status: "empty",
      jobId: null,
      baseModelId: null,
      scriptPath: null,
      message: null,
    },
    messages: [],
    pendingDecision: null,
    contextSummary: {
      triangleCount: 0,
      componentCount: 0,
      orientation: "+X",
    },
  };
}

let mountedRoot: Root | null = null;
let mountedContainer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    mountedRoot?.unmount();
  });
  mountedRoot = null;
  mountedContainer?.remove();
  mountedContainer = null;
});

async function renderPanel(state: ChatPanelState): Promise<HTMLDivElement> {
  if (!mountedContainer) {
    mountedContainer = document.createElement("div");
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
  }

  await act(async () => {
    mountedRoot!.render(<ChatPanel state={state} handlers={noopHandlers} />);
    await flushMicrotasks();
  });

  return mountedContainer;
}

describe("ChatPanel", () => {
  it("does not render an empty thinking card when reasoning has no text", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      messages: [
        {
          kind: "message",
          id: "reasoning-1",
          role: "reasoning",
          title: "Thinking",
          text: "",
          status: "completed",
        },
      ],
    });

    expect(container.textContent).toContain("还没有消息");
    expect(container.textContent).not.toContain("Thinking");
  });

  it("renders plan activity cards so users can see agent progress", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      messages: [
        {
          kind: "activity",
          id: "activity-1",
          activityKind: "plan",
          title: "Plan Update",
          fields: [{ label: "状态", value: "in_progress" }],
          text: "Generate a revised mesh-edit approach.",
          bodyFormat: "plain",
          status: "completed",
        },
      ],
    });

    const details = container.querySelector<HTMLElement>(
      '[data-collapsible-card="true"]',
    );
    expect(details).not.toBeNull();
    expect(details?.dataset.collapsibleOpen).toBe("false");
    expect(
      details?.querySelector('[data-collapsible-toggle="true"]')?.textContent,
    ).toContain("Plan Update");
    expect(details?.querySelector(".chat-message__body-scroll")).not.toBeNull();
    expect(details?.textContent).toContain("状态");
    expect(details?.textContent).toContain("in_progress");
    expect(details?.textContent).toContain(
      "Generate a revised mesh-edit approach.",
    );
  });

  it("enables the generate button only when a draft script is ready", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      draft: {
        status: "ready",
        jobId: "job_001",
        baseModelId: "model_001",
        scriptPath: "/tmp/job_001/edit.py",
        message: null,
      },
    });

    const generateButton = container.querySelector<HTMLButtonElement>(
      '[data-generate-model="true"]',
    );
    expect(generateButton?.disabled).toBe(false);
    expect(generateButton?.textContent).toContain("生成新模型");

    await renderPanel(createBaseState());
    expect(generateButton?.disabled).toBe(true);
  });

  it("renders thinking as a collapsed card with expandable content", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      messages: [
        {
          kind: "message",
          id: "reasoning-2",
          role: "reasoning",
          title: "Thinking",
          text: "Inspect the current selection before deciding the next edit step.",
          status: "completed",
        },
      ],
    });

    const details = container.querySelector<HTMLElement>(
      '[data-collapsible-card="true"]',
    );
    expect(details).not.toBeNull();
    expect(details?.dataset.collapsibleOpen).toBe("false");
    expect(
      details?.querySelector('[data-collapsible-toggle="true"]')?.textContent,
    ).toContain("Thinking");
    expect(details?.querySelector(".chat-message__body-scroll")).not.toBeNull();
    expect(details?.textContent).toContain(
      "Inspect the current selection before deciding the next edit step.",
    );
  });

  it("preserves collapsible card open state across re-renders", async () => {
    const initialState = {
      ...createBaseState(),
      messages: [
        {
          kind: "message" as const,
          id: "reasoning-3",
          role: "reasoning" as const,
          title: "Thinking",
          text: "first chunk",
          status: "streaming" as const,
        },
      ],
    };

    const container = await renderPanel(initialState);

    const firstCard = container.querySelector<HTMLElement>(
      '[data-collapsible-card="true"]',
    );
    expect(firstCard).not.toBeNull();
    await act(async () => {
      firstCard
        ?.querySelector<HTMLButtonElement>('[data-collapsible-toggle="true"]')
        ?.click();
      await flushMicrotasks();
    });

    await renderPanel({
      ...initialState,
      messages: [
        {
          kind: "message",
          id: "reasoning-3",
          role: "reasoning",
          title: "Thinking",
          text: "first chunk\nsecond chunk",
          status: "streaming",
        },
        {
          kind: "message",
          id: "assistant-1",
          role: "assistant",
          text: "follow-up",
          status: "streaming",
        },
      ],
    });

    const rerenderedCard = container.querySelector<HTMLElement>(
      '[data-collapsible-card="true"]',
    );
    expect(rerenderedCard?.dataset.collapsibleOpen).toBe("true");
    expect(
      rerenderedCard?.querySelector<HTMLElement>('[data-collapsible-body="true"]')
        ?.hidden,
    ).toBe(false);
  });

  it("renders command and tool activity cards in the main timeline", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      messages: [
        {
          kind: "activity",
          id: "command-1",
          activityKind: "command_execution",
          title: "Run command",
          fields: [
            { label: "命令", value: "python edit.py" },
            { label: "目录", value: "/tmp/workspace" },
          ],
          text: "running",
          bodyFormat: "code",
          status: "streaming",
        },
        {
          kind: "activity",
          id: "tool-1",
          activityKind: "tool_call",
          title: "Read file",
          fields: [{ label: "工具", value: "read_file" }],
          text: "参数\ncontext.json",
          bodyFormat: "code",
          status: "completed",
        },
        {
          kind: "message",
          id: "assistant-2",
          role: "assistant",
          text: "final reply",
          status: "completed",
        },
      ],
    });

    expect(container.textContent).toContain("final reply");
    expect(container.textContent).toContain("Run command");
    expect(container.textContent).toContain("Read file");
    expect(container.textContent).toContain("python edit.py");
    expect(container.textContent).toContain("/tmp/workspace");
    expect(container.textContent).toContain("context.json");
  });

  it("hides streaming command execution cards when command approval is pending", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      sessionStatus: "waiting_decision",
      pendingDecision: {
        id: "decision-1",
        kind: "command_execution",
        title: "命令执行审批",
        body: "是否允许继续执行命令？",
        command: "python edit.py",
        cwd: "/tmp/workspace",
        questions: [],
      },
      messages: [
        {
          kind: "activity",
          id: "command-1",
          activityKind: "command_execution",
          title: "Run command",
          fields: [{ label: "命令", value: "python edit.py" }],
          text: "running",
          bodyFormat: "code",
          status: "streaming",
        },
        {
          kind: "activity",
          id: "tool-1",
          activityKind: "tool_call",
          title: "Read file",
          fields: [{ label: "工具", value: "read_file" }],
          text: "参数\ncontext.json",
          bodyFormat: "code",
          status: "streaming",
        },
      ],
    });

    expect(container.textContent).not.toContain("Run command");
    expect(container.textContent).toContain("Read file");
    expect(container.querySelector("[data-decision-card]")?.textContent).toContain(
      "命令执行审批",
    );
    expect(container.querySelector("[data-decision-card]")?.textContent).toContain(
      "python edit.py",
    );
    expect(container.querySelector("[data-decision-card]")?.textContent).toContain(
      "/tmp/workspace",
    );
    expect(
      container.querySelector(".chat-panel__messages [data-decision-card]"),
    ).not.toBeNull();
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
