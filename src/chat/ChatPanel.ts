import type { ChatActivity, ChatMessage, ChatStoreState, ChatTimelineEntry } from './chat-store';
import type { SessionDecisionCard } from '../shared/codex-session-types';

export type ChatPanelHandlers = {
  onSend: (text: string) => void | Promise<void>;
  onInterrupt: () => void | Promise<void>;
  onClearSession: () => void | Promise<void>;
  onDecision: (decisionId: string, answers: Record<string, string>) => void | Promise<void>;
};

export type ChatPanel = {
  element: HTMLElement;
  render(state: ChatPanelState): void;
  focusInput(): void;
};

export type ChatPanelState = Pick<
  ChatStoreState,
  | 'connectionStatus'
  | 'connectionMessage'
  | 'sessionStatus'
  | 'activeModelId'
  | 'modelLabel'
  | 'messages'
  | 'pendingDecision'
  | 'contextSummary'
>;

type QuestionSelectionState = {
  selectedAnswer: string | null;
  otherAnswer: string;
};

export function createChatPanel(handlers: ChatPanelHandlers): ChatPanel {
  const openCards = new Set<string>();
  const root = document.createElement('aside');
  root.className = 'chat-panel';
  root.dataset.chatPanel = 'true';

  const statusLight = document.createElement('span');
  statusLight.className = 'chat-light';
  statusLight.dataset.codexConnectionLight = 'true';

  const connectionText = document.createElement('span');
  const sessionStatusText = document.createElement('span');
  const modelText = document.createElement('span');

  const interruptButton = document.createElement('button');
  interruptButton.type = 'button';
  interruptButton.dataset.interruptTurn = 'true';
  interruptButton.textContent = '中断';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.dataset.clearSession = 'true';
  clearButton.textContent = '清空会话';

  const header = document.createElement('header');
  header.className = 'chat-panel__header';

  const statusRow = document.createElement('div');
  statusRow.className = 'chat-panel__status-row';
  statusRow.append(statusLight, connectionText);

  const metaRow = document.createElement('div');
  metaRow.className = 'chat-panel__meta';
  metaRow.append(sessionStatusText, modelText);

  const headerLeft = document.createElement('div');
  headerLeft.append(statusRow, metaRow);

  const headerActions = document.createElement('div');
  headerActions.className = 'chat-panel__header-actions';
  headerActions.append(interruptButton, clearButton);

  header.append(headerLeft, headerActions);

  const contextStrip = document.createElement('section');
  contextStrip.className = 'chat-panel__context';

  const triangleCount = document.createElement('span');
  const componentCount = document.createElement('span');
  const orientation = document.createElement('span');
  contextStrip.append(triangleCount, componentCount, orientation);

  const messages = document.createElement('section');
  messages.className = 'chat-panel__messages';

  const decisionHost = document.createElement('section');
  decisionHost.className = 'chat-panel__decision';

  const composer = document.createElement('form');
  composer.className = 'chat-panel__input';
  composer.dataset.chatForm = 'true';

  const input = document.createElement('textarea');
  input.dataset.chatInput = 'true';
  input.rows = 4;
  input.placeholder = '输入你希望 Codex 处理的修改说明';

  const composerActions = document.createElement('div');
  composerActions.className = 'chat-panel__composer-actions';

  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.dataset.chatSend = 'true';
  sendButton.textContent = '发送';

  composerActions.append(sendButton);
  composer.append(input, composerActions);

  root.append(header, contextStrip, messages, decisionHost, composer);

  clearButton.addEventListener('click', () => {
    void handlers.onClearSession();
  });

  interruptButton.addEventListener('click', () => {
    void handlers.onInterrupt();
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }

    void handlers.onSend(text);
    input.value = '';
  });

  function render(state: ChatPanelState): void {
    renderConnectionStatus(statusLight, connectionText, state.connectionStatus, state.connectionMessage);
    sessionStatusText.textContent = `会话状态：${formatSessionStatus(state.sessionStatus)}`;
    modelText.textContent = `当前模型：${state.modelLabel ?? state.activeModelId ?? '未加载'}`;
    triangleCount.textContent = `已选三角面：${state.contextSummary.triangleCount}`;
    componentCount.textContent = `连通块：${state.contextSummary.componentCount}`;
    orientation.textContent = `方向：${state.contextSummary.orientation}`;
    messages.innerHTML = renderMessageList(state.messages);
    bindCollapsibleCards(messages, openCards);
    decisionHost.innerHTML = state.pendingDecision ? renderDecisionCardMarkup(state.pendingDecision) : '';
    bindDecisionCard(decisionHost, handlers);
    root.dataset.sessionStatus = state.sessionStatus;
    root.dataset.connectionStatus = state.connectionStatus;
    interruptButton.disabled = state.sessionStatus !== 'streaming';
    input.disabled = state.sessionStatus === 'waiting_decision' || state.sessionStatus === 'resuming';
    sendButton.disabled = state.sessionStatus === 'waiting_decision' || state.sessionStatus === 'resuming';
    sendButton.textContent = state.sessionStatus === 'streaming' ? '追加' : '发送';
  }

  function focusInput(): void {
    input.focus();
  }

  return {
    element: root,
    render,
    focusInput,
  };
}

function bindCollapsibleCards(host: HTMLElement, openCards: Set<string>): void {
  host.querySelectorAll<HTMLDetailsElement>('[data-collapsible-card="true"]').forEach((details) => {
    const messageId = details.dataset.messageId;
    if (!messageId) {
      return;
    }

    if (openCards.has(messageId)) {
      details.open = true;
    }

    details.addEventListener('toggle', () => {
      if (details.open) {
        openCards.add(messageId);
        return;
      }

      openCards.delete(messageId);
    });
  });
}

function renderConnectionStatus(
  statusLight: HTMLElement,
  connectionText: HTMLElement,
  connectionStatus: ChatPanelState['connectionStatus'],
  message: string,
): void {
  statusLight.className = `chat-light chat-light--${connectionStatus}`;
  connectionText.textContent = message;
  connectionText.dataset.codexConnectionMessage = 'true';
}

function renderMessageList(messages: ChatTimelineEntry[]): string {
  const visibleMessages = messages.filter((message) => {
    if (
      message.kind === 'activity' &&
      (message.activityKind === 'command_execution' || message.activityKind === 'tool_call')
    ) {
      return false;
    }

    if (message.kind !== 'message' || message.role !== 'reasoning') {
      return true;
    }

    return message.text.trim().length > 0;
  });

  if (visibleMessages.length === 0) {
    return '<div class="chat-panel__empty">还没有消息</div>';
  }

  return visibleMessages.map((message) => renderTimelineEntry(message)).join('');
}

function renderTimelineEntry(message: ChatTimelineEntry): string {
  return message.kind === 'activity' ? renderActivity(message) : renderMessage(message);
}

function renderMessage(message: ChatMessage): string {
  const title = message.title ? `<span class="chat-message__title">${escapeHtml(message.title)}</span>` : '';
  const status = message.status
    ? `<span class="chat-message__status">${formatEntryStatus(message.status)}</span>`
    : '';

  if (message.role === 'reasoning' && message.text.trim().length > 0) {
    return renderCollapsibleCard({
      id: message.id,
      className: `chat-message chat-message--${message.role}`,
      roleLabel: labelForRole(message.role),
      title,
      status,
      body: `<div class="chat-message__text">${escapeHtml(message.text)}</div>`,
    });
  }

  return `
    <article class="chat-message chat-message--${message.role}" data-message-id="${escapeHtml(message.id)}">
      <div class="chat-message__header">
        <span class="chat-message__role">${labelForRole(message.role)}</span>
        <div class="chat-message__meta">${title}${status}</div>
      </div>
      <div class="chat-message__text">${escapeHtml(message.text || ' ')}</div>
    </article>
  `;
}

function renderActivity(activity: ChatActivity): string {
  const title = `<span class="chat-message__title">${escapeHtml(activity.title)}</span>`;
  const status = activity.status
    ? `<span class="chat-message__status">${formatEntryStatus(activity.status)}</span>`
    : '';
  const detail = activity.detail
    ? `<div class="chat-message__detail">${escapeHtml(activity.detail)}</div>`
    : '';
  const text = activity.text.trim().length > 0 ? `<div class="chat-message__text">${escapeHtml(activity.text)}</div>` : '';
  const body = `${detail}${text}`.trim();

  if (body.length === 0) {
    return `
      <article
        class="chat-message chat-message--activity chat-message--activity-${escapeHtml(activity.activityKind)}"
        data-message-id="${escapeHtml(activity.id)}"
      >
        <div class="chat-message__header">
          <span class="chat-message__role">${labelForActivityKind(activity.activityKind)}</span>
          <div class="chat-message__meta">${title}${status}</div>
        </div>
      </article>
    `;
  }

  return renderCollapsibleCard({
    id: activity.id,
    className: `chat-message chat-message--activity chat-message--activity-${escapeHtml(activity.activityKind)}`,
    roleLabel: labelForActivityKind(activity.activityKind),
    title,
    status,
    body,
  });
}

function renderCollapsibleCard(options: {
  id: string;
  className: string;
  roleLabel: string;
  title: string;
  status: string;
  body: string;
}): string {
  return `
    <details
      class="${options.className} chat-message--collapsible"
      data-message-id="${escapeHtml(options.id)}"
      data-collapsible-card="true"
    >
      <summary class="chat-message__summary">
        <div class="chat-message__header">
          <span class="chat-message__role">${escapeHtml(options.roleLabel)}</span>
          <div class="chat-message__meta">${options.title}${options.status}</div>
        </div>
      </summary>
      <div class="chat-message__body">
        <div class="chat-message__body-scroll">
          ${options.body}
        </div>
      </div>
    </details>
  `;
}

function renderDecisionCardMarkup(decision: SessionDecisionCard): string {
  const detailMarkup = renderDecisionDetails(decision);
  const questions = decision.questions
    .map((question) => {
      const optionButtons = question.options.length > 0
        ? question.options
            .map(
              (option) => `
                <button
                  type="button"
                  class="chat-decision__option"
                  data-decision-option="true"
                  data-question-id="${escapeHtml(question.id)}"
                  data-answer="${escapeHtml(option.value)}"
                >
                  <strong>${escapeHtml(option.label)}</strong>
                  <span>${escapeHtml(option.description)}</span>
                </button>
              `,
            )
            .join('')
        : '<div class="chat-decision__hint">没有可选项，请填写自定义答案。</div>';

      return `
        <fieldset class="chat-decision__question" data-question-id="${escapeHtml(question.id)}">
          <legend>${escapeHtml(question.header)}</legend>
          <p>${escapeHtml(question.question)}</p>
          <div class="chat-decision__option-list">${optionButtons}</div>
          ${
            question.allowOther
              ? `
                <label class="chat-decision__other">
                  <span>其他答案</span>
                  <input type="text" data-other-answer placeholder="输入其他答案" />
                </label>
              `
              : ''
          }
        </fieldset>
      `;
    })
    .join('');

  return `
    <section class="chat-decision" data-decision-card="true" data-decision-id="${escapeHtml(decision.id)}">
      <header class="chat-decision__header">
        <h3>${escapeHtml(decision.title)}</h3>
        <p>${escapeHtml(decision.body)}</p>
      </header>
      ${detailMarkup}
      <div class="chat-decision__questions">${questions}</div>
      <footer class="chat-decision__footer">
        <button type="button" data-decision-submit="true">提交决策</button>
      </footer>
    </section>
  `;
}

function renderDecisionDetails(decision: SessionDecisionCard): string {
  switch (decision.kind) {
    case 'command_execution':
      return `
        <div class="chat-decision__details">
          ${decision.command ? `<div><strong>Command</strong><pre>${escapeHtml(decision.command)}</pre></div>` : ''}
          ${decision.cwd ? `<div><strong>Cwd</strong><pre>${escapeHtml(decision.cwd)}</pre></div>` : ''}
        </div>
      `;
    case 'file_change':
      return decision.grantRoot
        ? `<div class="chat-decision__details"><div><strong>Grant Root</strong><pre>${escapeHtml(decision.grantRoot)}</pre></div></div>`
        : '';
    case 'permissions':
      return `
        <div class="chat-decision__details">
          <div><strong>Permissions</strong><pre>${escapeHtml(decision.permissionsSummary)}</pre></div>
        </div>
      `;
    case 'user_input':
    default:
      return '';
  }
}

function bindDecisionCard(host: HTMLElement, handlers: ChatPanelHandlers): void {
  const decisionCard = host.querySelector<HTMLElement>('[data-decision-card]');
  if (!decisionCard) {
    return;
  }

  const questionStates = new Map<string, QuestionSelectionState>();

  decisionCard.querySelectorAll<HTMLElement>('[data-question-id]').forEach((questionElement) => {
    const questionId = questionElement.dataset.questionId;
    if (!questionId) {
      return;
    }

    questionStates.set(questionId, {
      selectedAnswer: null,
      otherAnswer: '',
    });

    const optionButtons = questionElement.querySelectorAll<HTMLButtonElement>('[data-decision-option]');
    optionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const answer = button.dataset.answer;
        if (!answer) {
          return;
        }

        questionStates.set(questionId, {
          selectedAnswer: answer,
          otherAnswer: '',
        });

        questionElement.querySelectorAll<HTMLButtonElement>('[data-decision-option]').forEach((optionButton) => {
          optionButton.classList.toggle('is-selected', optionButton === button);
        });

        const otherInput = questionElement.querySelector<HTMLInputElement>('[data-other-answer]');
        if (otherInput) {
          otherInput.value = '';
        }
      });
    });

    const otherInput = questionElement.querySelector<HTMLInputElement>('[data-other-answer]');
    if (otherInput) {
      otherInput.addEventListener('input', () => {
        questionStates.set(questionId, {
          selectedAnswer: null,
          otherAnswer: otherInput.value,
        });

        questionElement.querySelectorAll<HTMLButtonElement>('[data-decision-option]').forEach((optionButton) => {
          optionButton.classList.remove('is-selected');
        });
      });
    }
  });

  decisionCard.querySelector<HTMLButtonElement>('[data-decision-submit]')?.addEventListener('click', () => {
    const decisionId = decisionCard.dataset.decisionId;
    if (!decisionId) {
      return;
    }

    const answers: Record<string, string> = {};
    for (const [questionId, selection] of questionStates) {
      const answer = selection.selectedAnswer ?? selection.otherAnswer.trim();
      if (answer) {
        answers[questionId] = answer;
      }
    }

    if (Object.keys(answers).length === 0) {
      return;
    }

    void handlers.onDecision(decisionId, answers);
  });
}

function formatSessionStatus(status: ChatPanelState['sessionStatus']): string {
  switch (status) {
    case 'idle':
      return '空闲';
    case 'sending':
      return '发送中';
    case 'streaming':
      return '流式输出中';
    case 'waiting_decision':
      return '等待决策';
    case 'resuming':
      return '恢复中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

function formatEntryStatus(status: ChatMessage['status']): string {
  switch (status) {
    case 'streaming':
      return '流式中';
    case 'completed':
      return '完成';
    case 'interrupted':
      return '已中断';
    default:
      return '';
  }
}

function labelForRole(role: ChatMessage['role']): string {
  switch (role) {
    case 'user':
      return '用户';
    case 'assistant':
      return 'Codex';
    case 'reasoning':
      return 'Thinking';
    case 'system':
      return '系统';
    default:
      return role;
  }
}

function labelForActivityKind(kind: ChatActivity['activityKind']): string {
  switch (kind) {
    case 'command_execution':
      return '命令执行';
    case 'tool_call':
      return '工具调用';
    case 'plan':
      return '计划';
    case 'approval':
      return '审批';
    default:
      return kind;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
