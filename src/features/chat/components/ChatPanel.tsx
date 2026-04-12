import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type {
  ChatActivity,
  ChatMessage,
  ChatStoreState,
  ChatTimelineEntry,
} from "../state";
import type {
  SessionDecisionCard,
  SessionInfoField,
} from "../../../shared/codex-session-types";

export type ChatPanelHandlers = {
  onSend: (text: string) => void | Promise<void>;
  onGenerateModel: () => void | Promise<void>;
  onInterrupt: () => void | Promise<void>;
  onClearSession: () => void | Promise<void>;
  onDecision: (
    decisionId: string,
    answers: Record<string, string>,
  ) => void | Promise<void>;
};

export type ChatPanelState = Pick<
  ChatStoreState,
  | "connectionStatus"
  | "connectionMessage"
  | "sessionStatus"
  | "activeModelId"
  | "modelLabel"
  | "draft"
  | "messages"
  | "pendingDecision"
  | "contextSummary"
>;

type QuestionSelectionState = {
  selectedAnswer: string | null;
  otherAnswer: string;
};

export function ChatPanel(props: {
  state: ChatPanelState;
  handlers: ChatPanelHandlers;
}) {
  const { handlers, state } = props;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerText, setComposerText] = useState("");
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const visibleMessages = useMemo(
    () => filterVisibleTimelineEntries(state),
    [state],
  );

  useLayoutEffect(() => {
    syncComposerHeight(textareaRef.current);
  }, [composerText]);

  useEffect(() => {
    if (!state.pendingDecision) {
      return;
    }

    setOpenCards((current) => current);
  }, [state.pendingDecision]);

  function toggleCard(cardId: string): void {
    setOpenCards((current) => ({
      ...current,
      [cardId]: !current[cardId],
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = composerText.trim();
    if (!text) {
      return;
    }

    void handlers.onSend(text);
    setComposerText("");
  }

  return (
    <aside
      className="chat-panel"
      data-chat-panel="true"
      data-session-status={state.sessionStatus}
      data-connection-status={state.connectionStatus}
    >
      <header className="chat-panel__header">
        <div className="chat-panel__header-main">
          <div className="chat-panel__status-row">
            <span
              className={`chat-light chat-light--${state.connectionStatus}`}
              data-codex-connection-light="true"
            />
            <span data-codex-connection-message="true">
              {formatConnectionStatus(
                state.connectionStatus,
                state.connectionMessage,
              )}
            </span>
          </div>
          <div className="chat-panel__meta">
            <span className="chat-panel__meta-item">
              {`会话状态：${formatSessionStatus(state.sessionStatus)}`}
            </span>
          </div>
        </div>
        <div className="chat-panel__header-actions">
          <button
            className="button button--ghost button--compact"
            type="button"
            data-interrupt-turn="true"
            disabled={state.sessionStatus !== "streaming"}
            onClick={() => {
              void handlers.onInterrupt();
            }}
          >
            中断
          </button>
          <button
            className="button button--ghost button--compact"
            type="button"
            data-clear-session="true"
            onClick={() => {
              void handlers.onClearSession();
            }}
          >
            清空会话
          </button>
        </div>
      </header>

      <section className="chat-panel__messages">
        {visibleMessages.length === 0 && !state.pendingDecision ? (
          <div className="chat-panel__empty">
            <strong>等待第一条指令</strong>
            <span>
              还没有消息。导入模型并选中局部区域后，就可以开始和 Codex 协作。
            </span>
          </div>
        ) : null}

        {visibleMessages.map((message) =>
          message.kind === "activity" ? (
            <ActivityEntry
              key={message.id}
              activity={message}
              isOpen={Boolean(openCards[message.id])}
              onToggle={toggleCard}
            />
          ) : (
            <MessageEntry
              key={message.id}
              message={message}
              isOpen={Boolean(openCards[message.id])}
              onToggle={toggleCard}
            />
          ),
        )}

        {state.pendingDecision ? (
          <DecisionCard
            decision={state.pendingDecision}
            onSubmit={(answers) => {
              void handlers.onDecision(state.pendingDecision!.id, answers);
            }}
          />
        ) : null}
      </section>

      <form
        className="chat-panel__input"
        data-chat-form="true"
        onSubmit={handleSubmit}
      >
        <div className="chat-panel__composer-surface">
          <textarea
            ref={textareaRef}
            data-chat-input="true"
            id="chat-panel-input"
            rows={1}
            value={composerText}
            placeholder="描述你希望 Codex 在当前选区执行的修改"
            aria-label="发送给 Codex 的修改说明"
            disabled={
              state.sessionStatus === "waiting_decision" ||
              state.sessionStatus === "resuming"
            }
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
          />
          <div className="chat-panel__composer-actions">
            <button
              className="button button--ghost button--compact"
              type="button"
              data-generate-model="true"
              disabled={
                state.draft.status !== "ready" && state.draft.status !== "failed"
              }
              onClick={() => {
                void handlers.onGenerateModel();
              }}
            >
              {formatGenerateButtonLabel(state.draft.status)}
            </button>
            <button
              className="button button--composer-send"
              type="submit"
              data-chat-send="true"
              disabled={
                state.sessionStatus === "waiting_decision" ||
                state.sessionStatus === "resuming"
              }
            >
              {state.sessionStatus === "streaming" ? "追加" : "发送"}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}

function MessageEntry(props: {
  message: ChatMessage;
  isOpen: boolean;
  onToggle: (cardId: string) => void;
}) {
  const { isOpen, message, onToggle } = props;

  if (message.role === "reasoning" && message.text.trim().length === 0) {
    return null;
  }

  const title = message.title ? (
    <span className="chat-message__title">{message.title}</span>
  ) : null;
  const status = message.status ? (
    <span className="chat-message__status">
      {formatEntryStatus(message.status)}
    </span>
  ) : null;

  if (message.role === "reasoning") {
    return (
      <CollapsibleCard
        id={message.id}
        className={`chat-message chat-message--${message.role}`}
        isOpen={isOpen}
        roleLabel={labelForRole(message.role)}
        title={title}
        status={status}
        onToggle={onToggle}
      >
        <div className="chat-message__text">{message.text}</div>
      </CollapsibleCard>
    );
  }

  return (
    <article
      className={`chat-message chat-message--${message.role}`}
      data-message-id={message.id}
    >
      <div className="chat-message__header">
        <span className="chat-message__role">{labelForRole(message.role)}</span>
        <div className="chat-message__meta">
          {title}
          {status}
        </div>
      </div>
      <div className="chat-message__text">{message.text || " "}</div>
    </article>
  );
}

function ActivityEntry(props: {
  activity: ChatActivity;
  isOpen: boolean;
  onToggle: (cardId: string) => void;
}) {
  const { activity, isOpen, onToggle } = props;
  const title = <span className="chat-message__title">{activity.title}</span>;
  const status = activity.status ? (
    <span className="chat-message__status">
      {formatEntryStatus(activity.status)}
    </span>
  ) : null;
  const fields = renderFactGrid("chat-message", activity.fields);
  const text =
    activity.text.trim().length > 0
      ? renderActivityBody(activity.text, activity.bodyFormat)
      : null;

  if (!fields && !text) {
    return (
      <article
        className={`chat-message chat-message--activity chat-message--activity-${activity.activityKind}`}
        data-message-id={activity.id}
      >
        <div className="chat-message__header">
          <span className="chat-message__role">
            {labelForActivityKind(activity.activityKind)}
          </span>
          <div className="chat-message__meta">
            {title}
            {status}
          </div>
        </div>
      </article>
    );
  }

  return (
    <CollapsibleCard
      id={activity.id}
      className={`chat-message chat-message--activity chat-message--activity-${activity.activityKind}`}
      isOpen={isOpen}
      roleLabel={labelForActivityKind(activity.activityKind)}
      title={title}
      status={status}
      onToggle={onToggle}
    >
      <>
        {fields}
        {text}
      </>
    </CollapsibleCard>
  );
}

function CollapsibleCard(props: {
  id: string;
  className: string;
  isOpen: boolean;
  roleLabel: string;
  title: ReactNode;
  status: ReactNode;
  children: ReactNode;
  onToggle: (cardId: string) => void;
}) {
  const {
    children,
    className,
    id,
    isOpen,
    onToggle,
    roleLabel,
    status,
    title,
  } = props;

  return (
    <article
      className={`${className} chat-message--collapsible${
        isOpen ? " is-open" : ""
      }`}
      data-message-id={id}
      data-collapsible-card="true"
      data-collapsible-open={String(isOpen)}
    >
      <button
        type="button"
        className="chat-message__summary"
        data-collapsible-toggle="true"
        aria-expanded={isOpen}
        onClick={() => {
          onToggle(id);
        }}
      >
        <span className="chat-message__summary-content">
          <span className="chat-message__role">{roleLabel}</span>
          <span className="chat-message__meta">
            {title}
            {status}
          </span>
        </span>
      </button>
      <div
        className="chat-message__body"
        data-collapsible-body="true"
        hidden={!isOpen}
      >
        <div className="chat-message__body-scroll">{children}</div>
      </div>
    </article>
  );
}

function DecisionCard(props: {
  decision: SessionDecisionCard;
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const { decision, onSubmit } = props;
  const [questionStates, setQuestionStates] = useState<
    Record<string, QuestionSelectionState>
  >({});

  useEffect(() => {
    const nextState = Object.fromEntries(
      decision.questions.map((question) => [
        question.id,
        {
          selectedAnswer: null,
          otherAnswer: "",
        },
      ]),
    ) as Record<string, QuestionSelectionState>;
    setQuestionStates(nextState);
  }, [decision]);

  function updateQuestion(
    questionId: string,
    updater: (current: QuestionSelectionState) => QuestionSelectionState,
  ): void {
    setQuestionStates((current) => ({
      ...current,
      [questionId]: updater(
        current[questionId] ?? {
          selectedAnswer: null,
          otherAnswer: "",
        },
      ),
    }));
  }

  function handleSubmit(): void {
    const answers: Record<string, string> = {};

    for (const question of decision.questions) {
      const selection = questionStates[question.id];
      const answer =
        selection?.selectedAnswer ?? selection?.otherAnswer.trim() ?? "";
      if (answer) {
        answers[question.id] = answer;
      }
    }

    if (Object.keys(answers).length === 0) {
      return;
    }

    onSubmit(answers);
  }

  return (
    <section
      className="chat-decision"
      data-decision-card="true"
      data-decision-id={decision.id}
    >
      <header className="chat-decision__header">
        <p className="chat-decision__eyebrow">需要你的决策</p>
        <h3>{decision.title}</h3>
        <p>{decision.body}</p>
      </header>
      {renderFactGrid("chat-decision", getDecisionInfoFields(decision))}
      <div className="chat-decision__questions">
        {decision.questions.map((question) => {
          const selection = questionStates[question.id] ?? {
            selectedAnswer: null,
            otherAnswer: "",
          };

          return (
            <fieldset
              key={question.id}
              className="chat-decision__question"
              data-question-id={question.id}
            >
              <legend>{question.header}</legend>
              <p>{question.question}</p>
              <div className="chat-decision__option-list">
                {question.options.length > 0 ? (
                  question.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`chat-decision__option${
                        selection.selectedAnswer === option.value
                          ? " is-selected"
                          : ""
                      }`}
                      data-decision-option="true"
                      data-question-id={question.id}
                      data-answer={option.value}
                      onClick={() => {
                        updateQuestion(question.id, () => ({
                          selectedAnswer: option.value,
                          otherAnswer: "",
                        }));
                      }}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))
                ) : (
                  <div className="chat-decision__hint">
                    没有可选项，请填写自定义答案。
                  </div>
                )}
              </div>

              {question.allowOther ? (
                <label className="chat-decision__other">
                  <span>其他答案</span>
                  <input
                    type="text"
                    data-other-answer="true"
                    placeholder="输入其他答案"
                    value={selection.otherAnswer}
                    onChange={(event) => {
                      updateQuestion(question.id, () => ({
                        selectedAnswer: null,
                        otherAnswer: event.target.value,
                      }));
                    }}
                  />
                </label>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <footer className="chat-decision__footer">
        <button
          className="button button--primary"
          type="button"
          data-decision-submit="true"
          onClick={handleSubmit}
        >
          提交决策
        </button>
      </footer>
    </section>
  );
}

function renderActivityBody(
  text: string,
  bodyFormat: ChatActivity["bodyFormat"],
) {
  return bodyFormat === "code" ? (
    <pre className="chat-message__code">{text}</pre>
  ) : (
    <div className="chat-message__text">{text}</div>
  );
}

function renderFactGrid(
  blockName: "chat-message" | "chat-decision",
  fields: SessionInfoField[],
) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <dl className={`${blockName}__facts`}>
      {fields.map((field) => (
        <div key={`${field.label}:${field.value}`} className={`${blockName}__fact`}>
          <dt className={`${blockName}__fact-label`}>{field.label}</dt>
          <dd className={`${blockName}__fact-value`}>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function getDecisionInfoFields(decision: SessionDecisionCard): SessionInfoField[] {
  switch (decision.kind) {
    case "command_execution":
      return compactInfoFields([
        ["命令", decision.command],
        ["目录", decision.cwd],
      ]);
    case "file_change":
      return compactInfoFields([["授权目录", decision.grantRoot]]);
    case "permissions":
      return compactInfoFields([["权限", decision.permissionsSummary]]);
    case "user_input":
    default:
      return [];
  }
}

function formatGenerateButtonLabel(
  status: ChatPanelState["draft"]["status"],
): string {
  switch (status) {
    case "ready":
      return "生成新模型";
    case "running":
      return "生成中";
    case "executed":
      return "已生成";
    case "failed":
      return "重新生成";
    default:
      return "生成新模型";
  }
}

function syncComposerHeight(input: HTMLTextAreaElement | null): void {
  if (!input) {
    return;
  }

  input.style.height = "0px";
  const nextHeight = Math.min(Math.max(input.scrollHeight, 64), 200);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > 200 ? "auto" : "hidden";
}

function formatSessionStatus(status: ChatPanelState["sessionStatus"]): string {
  switch (status) {
    case "idle":
      return "空闲";
    case "sending":
      return "发送中";
    case "streaming":
      return "流式输出中";
    case "waiting_decision":
      return "等待决策";
    case "resuming":
      return "恢复中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function formatEntryStatus(status: ChatMessage["status"]): string {
  switch (status) {
    case "streaming":
      return "流式中";
    case "completed":
      return "完成";
    case "interrupted":
      return "已中断";
    default:
      return "";
  }
}

function formatConnectionStatus(
  status: ChatPanelState["connectionStatus"],
  message: string,
): string {
  switch (status) {
    case "connected":
      return "Codex 已连接";
    case "starting":
      return "正在连接 Codex";
    case "disconnected":
      return message || "Codex 已断开连接";
    case "failed":
      return message || "Codex 连接失败";
    default:
      return message;
  }
}

function filterVisibleTimelineEntries(
  state: ChatPanelState,
): ChatTimelineEntry[] {
  return state.messages.filter((message) => {
    if (
      message.kind === "activity" &&
      message.activityKind === "command_execution" &&
      message.status === "streaming" &&
      state.pendingDecision?.kind === "command_execution"
    ) {
      return false;
    }

    if (
      message.kind === "message" &&
      message.role === "reasoning" &&
      message.text.trim().length === 0
    ) {
      return false;
    }

    return true;
  });
}

function labelForRole(role: ChatMessage["role"]): string {
  switch (role) {
    case "user":
      return "用户";
    case "assistant":
      return "Codex";
    case "reasoning":
      return "Thinking";
    case "system":
      return "系统";
    default:
      return role;
  }
}

function labelForActivityKind(kind: ChatActivity["activityKind"]): string {
  switch (kind) {
    case "command_execution":
      return "命令执行";
    case "tool_call":
      return "工具调用";
    case "plan":
      return "计划";
    case "approval":
      return "审批";
    default:
      return kind;
  }
}

function compactInfoFields(
  entries: Array<[string, string | null | undefined]>,
): SessionInfoField[] {
  return entries.flatMap(([label, value]) => {
    const normalizedValue = value?.trim();
    return normalizedValue ? [{ label, value: normalizedValue }] : [];
  });
}
