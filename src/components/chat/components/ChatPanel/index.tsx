import "./index.scss";

import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { type SxProps, type Theme } from "@mui/material/styles";
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
} from "../../state";
import type {
  SessionDecisionCard,
  SessionInfoField,
} from "../../../../shared/codex-session-types";

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
  const theme = useTheme();

  const visibleMessages = useMemo(
    () => filterVisibleTimelineEntries(state),
    [state],
  );
  const fullConnectionStatus = formatConnectionStatus(
    state.connectionStatus,
    state.connectionMessage,
  );

  useLayoutEffect(() => {
    syncComposerHeight(textareaRef.current);
  }, [composerText]);

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
    <Paper
      component="aside"
      className="chat-panel"
      data-chat-panel="true"
      data-session-status={state.sessionStatus}
      data-connection-status={state.connectionStatus}
      variant="outlined"
      sx={{
        backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.94 : 0.98),
        boxShadow:
          theme.palette.mode === "dark"
            ? "0 14px 32px rgba(15, 23, 42, 0.2)"
            : "0 12px 24px rgba(148, 163, 184, 0.12)",
      }}
    >
      <Box
        component="header"
        className="chat-panel__header"
        sx={{
          alignItems: "center",
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: alpha(theme.palette.background.paper, 0.46),
        }}
      >
        <Stack className="chat-panel__header-main" spacing={1.25}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
          >
            <Tooltip title={fullConnectionStatus} arrow placement="top">
              <Box
                component="div"
                data-codex-connection-trigger="true"
                sx={{ display: "flex", alignItems: "center", minHeight: 32 }}
              >
                <Chip
                  className="chat-panel__status-row"
                  variant="filled"
                  size="small"
                  label={
                    <Box
                      component="span"
                      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
                    >
                      <span
                        className={`chat-light chat-light--${state.connectionStatus}`}
                        data-codex-connection-light="true"
                      />
                      <span data-codex-connection-message="true">
                        {formatConnectionStatusLabel(state.connectionStatus)}
                      </span>
                    </Box>
                  }
                />
              </Box>
            </Tooltip>
            <Stack
              className="chat-panel__meta"
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center", minHeight: 32 }}
            >
              <Chip
                className="chat-panel__meta-item"
                size="small"
                variant="filled"
                label={`会话状态：${formatSessionStatus(state.sessionStatus)}`}
              />
            </Stack>
          </Stack>
        </Stack>
        <Stack
          className="chat-panel__header-actions"
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: "center" }}
        >
          <Button
            type="button"
            variant="text"
            startIcon={<PauseCircleOutlineRoundedIcon />}
            data-interrupt-turn="true"
            disabled={state.sessionStatus !== "streaming"}
            onClick={() => {
              void handlers.onInterrupt();
            }}
          >
            中断
          </Button>
          <Button
            type="button"
            variant="text"
            color="inherit"
            data-clear-session="true"
            onClick={() => {
              void handlers.onClearSession();
            }}
          >
            清空会话
          </Button>
        </Stack>
      </Box>

      <Box className="chat-panel__messages">
        {visibleMessages.length === 0 && !state.pendingDecision ? (
          <Paper
            className="chat-panel__empty"
            variant="outlined"
            sx={{
              borderStyle: "solid",
              borderColor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.26 : 0.16),
              background:
                theme.palette.mode === "dark"
                  ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.background.paper, 0.96)})`
                  : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.06)}, ${alpha(theme.palette.background.paper, 0.98)})`,
              boxShadow:
                theme.palette.mode === "dark"
                  ? "inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 26px rgba(15, 23, 42, 0.16)"
                  : "0 10px 22px rgba(148, 163, 184, 0.12)",
            }}
          >
            <Typography variant="subtitle2">等待第一条指令</Typography>
            <Typography variant="body2" color="text.secondary">
              还没有消息。导入模型并选中局部区域后，就可以开始和 Codex 协作。
            </Typography>
          </Paper>
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
      </Box>

      <Box
        component="form"
        className="chat-panel__input"
        data-chat-form="true"
        onSubmit={handleSubmit}
      >
        <Paper className="chat-panel__composer-surface" variant="outlined">
          <TextField
            inputRef={textareaRef}
            id="chat-panel-input"
            multiline
            minRows={3}
            value={composerText}
            placeholder="描述你希望 Codex 在当前选区执行的修改"
            aria-label="发送给 Codex 的修改说明"
            fullWidth
            variant="outlined"
            size="small"
            disabled={
              state.sessionStatus === "waiting_decision" ||
              state.sessionStatus === "resuming"
            }
            slotProps={{
              htmlInput: {
                "data-chat-input": "true",
              },
            }}
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
          />
          <Stack
            className="chat-panel__composer-actions"
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
          >
            <Button
              type="button"
              variant="text"
              color="inherit"
              startIcon={<AutoAwesomeRoundedIcon />}
              data-generate-model="true"
              disabled={
                state.draft.status !== "ready" && state.draft.status !== "failed"
              }
              onClick={() => {
                void handlers.onGenerateModel();
              }}
            >
              {formatGenerateButtonLabel(state.draft.status)}
            </Button>
            <Button
              className="button--composer-send"
              type="submit"
              variant="contained"
              color="primary"
              endIcon={<SendRoundedIcon />}
              data-chat-send="true"
              disabled={
                state.sessionStatus === "waiting_decision" ||
                state.sessionStatus === "resuming"
              }
            >
              {state.sessionStatus === "streaming" ? "追加" : "发送"}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Paper>
  );
}

function MessageEntry(props: {
  message: ChatMessage;
  isOpen: boolean;
  onToggle: (cardId: string) => void;
}) {
  const { isOpen, message, onToggle } = props;
  const theme = useTheme();

  if (message.role === "reasoning" && message.text.trim().length === 0) {
    return null;
  }

  const title = message.title ? (
    <Typography component="span" className="chat-message__title" variant="subtitle2">
      {message.title}
    </Typography>
  ) : null;
  const status = message.status ? (
    <Chip
      className="chat-message__status"
      size="small"
      variant="outlined"
      label={formatEntryStatus(message.status)}
    />
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
    <Paper
      component="article"
      className={`chat-message chat-message--${message.role}`}
      data-message-id={message.id}
      sx={getEntrySurfaceStyles(theme, message.role)}
    >
      <Box className="chat-message__header">
        <Chip
          className="chat-message__role"
          size="small"
          variant="outlined"
          label={labelForRole(message.role)}
        />
        <Box className="chat-message__meta">
          {title}
          {status}
        </Box>
      </Box>
      <Typography className="chat-message__text" variant="body2">
        {message.text || " "}
      </Typography>
    </Paper>
  );
}

function ActivityEntry(props: {
  activity: ChatActivity;
  isOpen: boolean;
  onToggle: (cardId: string) => void;
}) {
  const { activity, isOpen, onToggle } = props;
  const theme = useTheme();
  const title = (
    <Typography component="span" className="chat-message__title" variant="subtitle2">
      {activity.title}
    </Typography>
  );
  const status = activity.status ? (
    <Chip
      className="chat-message__status"
      size="small"
      variant="outlined"
      label={formatEntryStatus(activity.status)}
    />
  ) : null;
  const fields = renderFactGrid("chat-message", activity.fields);
  const text =
    activity.text.trim().length > 0
      ? renderActivityBody(activity.text, activity.bodyFormat)
      : null;

  if (!fields && !text) {
    return (
      <Paper
        component="article"
        className={`chat-message chat-message--activity chat-message--activity-${activity.activityKind}`}
        data-message-id={activity.id}
        sx={getEntrySurfaceStyles(theme, activity.activityKind)}
      >
        <Box className="chat-message__header">
          <Chip
            className="chat-message__role"
            size="small"
            variant="outlined"
            label={labelForActivityKind(activity.activityKind)}
          />
          <Box className="chat-message__meta">
            {title}
            {status}
          </Box>
        </Box>
      </Paper>
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
  const theme = useTheme();

  return (
    <Paper
      component="article"
      className={`${className} chat-message--collapsible${
        isOpen ? " is-open" : ""
      }`}
      data-message-id={id}
      data-collapsible-card="true"
      data-collapsible-open={String(isOpen)}
      sx={
        className.includes("activity")
          ? getEntrySurfaceStyles(theme, extractActivityTone(className))
          : getEntrySurfaceStyles(theme, "reasoning")
      }
    >
      <ButtonBase
        className="chat-message__summary"
        data-collapsible-toggle="true"
        aria-expanded={isOpen}
        onClick={() => {
          onToggle(id);
        }}
      >
        <span className="chat-message__summary-content">
          <span className="chat-message__summary-main">
            <Chip className="chat-message__role" size="small" variant="outlined" label={roleLabel} />
            <span className="chat-message__meta">
              {title}
              {status}
            </span>
          </span>
          <ExpandMoreRoundedIcon
            className={`chat-message__summary-icon${isOpen ? " is-open" : ""}`}
          />
        </span>
      </ButtonBase>
      <Box
        className="chat-message__body"
        data-collapsible-body="true"
        hidden={!isOpen}
      >
        <Box className="chat-message__body-scroll">{children}</Box>
      </Box>
    </Paper>
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
  const theme = useTheme();

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
    <Paper
      component="section"
      className="chat-decision"
      data-decision-card="true"
      data-decision-id={decision.id}
      variant="outlined"
      sx={{
        backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.72 : 0.94),
        borderColor: alpha(theme.palette.warning.main, 0.2),
      }}
    >
      <Stack className="chat-decision__header" direction="row" spacing={1.5}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            color: "warning.main",
            flex: "0 0 auto",
          }}
        >
          <FactCheckRoundedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography className="chat-decision__eyebrow" variant="caption">
            需要你的决策
          </Typography>
          <Typography variant="h6">{decision.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {decision.body}
          </Typography>
        </Box>
      </Stack>
      {renderFactGrid("chat-decision", getDecisionInfoFields(decision))}
      <Box className="chat-decision__questions">
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
              <Typography component="legend" variant="subtitle2">
                {question.header}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {question.question}
              </Typography>
              <Box className="chat-decision__option-list">
                {question.options.length > 0 ? (
                  question.options.map((option) => (
                    <Button
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
                      variant={
                        selection.selectedAnswer === option.value
                          ? "contained"
                          : "outlined"
                      }
                      color={selection.selectedAnswer === option.value ? "primary" : "inherit"}
                      fullWidth
                      onClick={() => {
                        updateQuestion(question.id, () => ({
                          selectedAnswer: option.value,
                          otherAnswer: "",
                        }));
                      }}
                    >
                      <Box sx={{ display: "grid", gap: 0.5, textAlign: "left", width: "100%" }}>
                        <Typography component="strong" variant="body2">
                          {option.label}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </Button>
                  ))
                ) : (
                  <Typography className="chat-decision__hint" variant="body2" color="text.secondary">
                    没有可选项，请填写自定义答案。
                  </Typography>
                )}
              </Box>

              {question.allowOther ? (
                <Box className="chat-decision__other">
                  <Typography variant="body2" color="text.secondary">
                    其他答案
                  </Typography>
                  <TextField
                    data-other-answer="true"
                    placeholder="输入其他答案"
                    size="small"
                    value={selection.otherAnswer}
                    onChange={(event) => {
                      updateQuestion(question.id, () => ({
                        selectedAnswer: null,
                        otherAnswer: event.target.value,
                      }));
                    }}
                  />
                </Box>
              ) : null}
            </fieldset>
          );
        })}
      </Box>
      <Box className="chat-decision__footer">
        <Button
          type="button"
          variant="contained"
          data-decision-submit="true"
          onClick={handleSubmit}
        >
          提交决策
        </Button>
      </Box>
    </Paper>
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

function getEntrySurfaceStyles(theme: Theme, tone: string): SxProps<Theme> {
  const paletteMap: Record<string, string> = {
    user: theme.palette.warning.main,
    assistant: theme.palette.primary.main,
    system: theme.palette.grey[500],
    reasoning: theme.palette.info.main,
    activity: theme.palette.secondary.main,
    command_execution: theme.palette.warning.main,
    tool_call: theme.palette.info.main,
    plan: theme.palette.secondary.main,
    approval: theme.palette.error.main,
  };
  const toneColor = paletteMap[tone] ?? theme.palette.secondary.main;
  const isDark = theme.palette.mode === "dark";
  const toneBackground =
    tone === "user"
      ? alpha(toneColor, isDark ? 0.2 : 0.12)
      : tone === "assistant"
        ? alpha(toneColor, isDark ? 0.18 : 0.1)
        : alpha(toneColor, isDark ? 0.12 : 0.07);

  return {
    background:
      isDark
        ? `linear-gradient(180deg, ${toneBackground}, ${alpha(theme.palette.background.paper, 0.98)})`
        : `linear-gradient(180deg, ${alpha(toneColor, 0.08)}, ${alpha(theme.palette.background.paper, 0.98)})`,
    borderColor: alpha(toneColor, isDark ? 0.3 : 0.18),
    boxShadow: isDark
      ? "0 10px 24px rgba(15, 23, 42, 0.12)"
      : "0 8px 18px rgba(148, 163, 184, 0.08)",
    "& .chat-message__role": {
      borderColor: alpha(toneColor, isDark ? 0.26 : 0.16),
      backgroundColor: alpha(toneColor, isDark ? 0.14 : 0.08),
    },
    "& .chat-message__status": {
      borderColor: alpha(toneColor, isDark ? 0.26 : 0.16),
      backgroundColor: alpha(toneColor, isDark ? 0.12 : 0.05),
    },
  };
}

function extractActivityTone(className: string): string {
  const match = className.match(/chat-message--activity-([a-z_]+)/);
  return match?.[1] ?? "activity";
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

function formatConnectionStatusLabel(
  status: ChatPanelState["connectionStatus"],
): string {
  switch (status) {
    case "connected":
      return "已连接";
    case "starting":
      return "连接中";
    case "disconnected":
      return "已断开";
    case "failed":
      return "连接失败";
    default:
      return status;
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
