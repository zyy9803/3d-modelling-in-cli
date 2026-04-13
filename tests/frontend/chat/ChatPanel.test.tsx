import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../src/app/providers/AppProviders";
import {
  ChatPanel,
  type ChatPanelHandlers,
  type ChatPanelState,
} from "../../../src/components/chat/components/ChatPanel";

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
    mountedRoot!.render(
      <AppProviders>
        <ChatPanel state={state} handlers={noopHandlers} />
      </AppProviders>,
    );
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

  it("hides the header context summary tags and active model name", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      modelLabel: "Bracket_v2.stl",
      contextSummary: {
        triangleCount: 128,
        componentCount: 3,
        orientation: "-Y",
      },
    });

    expect(container.textContent).not.toContain("Bracket_v2.stl");
    expect(container.textContent).not.toContain("128 个三角面");
    expect(container.textContent).not.toContain("3 个组件");
    expect(container.textContent).not.toContain("朝向 -Y");
    expect(container.querySelector(".chat-panel__context-summary")).toBeNull();
  });

  it("shows the full Codex connection message in a tooltip on hover", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      connectionStatus: "failed",
      connectionMessage: "Codex 连接失败：本地服务未启动，请检查 4178 端口。",
    });

    const trigger = container.querySelector<HTMLElement>(
      '[data-codex-connection-trigger="true"]',
    );

    expect(container.textContent).toContain("连接失败");
    expect(container.textContent).not.toContain("本地服务未启动");
    expect(trigger?.getAttribute("aria-label")).toBe(
      "Codex 连接失败：本地服务未启动，请检查 4178 端口。",
    );
  });

  it("renders connection and session status as borderless filled chips", async () => {
    const container = await renderPanel(createBaseState());

    const connectionChip = container.querySelector<HTMLElement>(
      '[data-codex-connection-trigger="true"] .MuiChip-root',
    );
    const sessionChip = container.querySelector<HTMLElement>(
      '.chat-panel__meta .MuiChip-root',
    );

    expect(connectionChip?.className).toContain("MuiChip-filled");
    expect(connectionChip?.className).not.toContain("MuiChip-outlined");
    expect(sessionChip?.className).toContain("MuiChip-filled");
    expect(sessionChip?.className).not.toContain("MuiChip-outlined");
  });

  it("keeps the interrupt and clear session buttons side by side", async () => {
    const container = await renderPanel(createBaseState());

    const headerActions = container.querySelector<HTMLElement>(".chat-panel__header-actions");

    expect(headerActions).not.toBeNull();
    expect(headerActions?.className).not.toContain("chat-panel__header-actions--stacked");
  });

  it("vertically centers the status chips and header action buttons", async () => {
    const container = await renderPanel(createBaseState());

    const header = container.querySelector<HTMLElement>(".chat-panel__header");
    const headerActions = container.querySelector<HTMLElement>(".chat-panel__header-actions");
    const connectionTrigger = container.querySelector<HTMLElement>(
      '[data-codex-connection-trigger="true"]',
    );
    const sessionMeta = container.querySelector<HTMLElement>(".chat-panel__meta");

    expect(header).not.toBeNull();
    expect(headerActions).not.toBeNull();
    expect(connectionTrigger).not.toBeNull();
    expect(sessionMeta).not.toBeNull();
    expect(getComputedStyle(header!).alignItems).toBe("center");
    expect(getComputedStyle(headerActions!).alignItems).toBe("center");
    expect(connectionTrigger?.tagName).toBe("DIV");
    expect(sessionMeta?.tagName).toBe("DIV");
    expect(getComputedStyle(connectionTrigger!).minHeight).toBe("32px");
    expect(getComputedStyle(sessionMeta!).minHeight).toBe("32px");
  });

  it("renders timeline cards without outlined paper borders", async () => {
    const container = await renderPanel({
      ...createBaseState(),
      messages: [
        {
          kind: "message",
          id: "assistant-borderless",
          role: "assistant",
          text: "borderless card",
          status: "completed",
        },
      ],
    });

    const messageCard = container.querySelector<HTMLElement>(
      '[data-message-id="assistant-borderless"]',
    );

    expect(messageCard?.className).toContain("MuiPaper-root");
    expect(messageCard?.className).not.toContain("MuiPaper-outlined");
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
