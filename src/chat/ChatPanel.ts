import type { ChatActivity, ChatMessage, ChatStoreState, ChatTimelineEntry } from './chat-store';
import type { SessionDecisionCard, SessionInfoField } from '../shared/codex-session-types';

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
  sessionStatusText.className = 'chat-panel__meta-item';

  const interruptButton = document.createElement('button');
  interruptButton.type = 'button';
  interruptButton.dataset.interruptTurn = 'true';
  interruptButton.textContent = '中断';
  interruptButton.className = 'button button--ghost button--compact';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.dataset.clearSession = 'true';
  clearButton.textContent = '清空会话';
  clearButton.className = 'button button--ghost button--compact';

  const header = document.createElement('header');
  header.className = 'chat-panel__header';

  const statusRow = document.createElement('div');
  statusRow.className = 'chat-panel__status-row';
  statusRow.append(statusLight, connectionText);

  const metaRow = document.createElement('div');
  metaRow.className = 'chat-panel__meta';
  metaRow.append(sessionStatusText);

  const headerLeft = document.createElement('div');
  headerLeft.className = 'chat-panel__header-main';
  headerLeft.append(statusRow, metaRow);

  const headerActions = document.createElement('div');
  headerActions.className = 'chat-panel__header-actions';
  headerActions.append(interruptButton, clearButton);

  header.append(headerLeft, headerActions);

  const messages = document.createElement('section');
  messages.className = 'chat-panel__messages';

  const composer = document.createElement('form');
  composer.className = 'chat-panel__input';
  composer.dataset.chatForm = 'true';

  const composerSurface = document.createElement('div');
  composerSurface.className = 'chat-panel__composer-surface';

  const input = document.createElement('textarea');
  input.dataset.chatInput = 'true';
  input.rows = 1;
  input.id = 'chat-panel-input';
  input.placeholder = '描述你希望 Codex 在当前选区执行的修改';
  input.setAttribute('aria-label', '发送给 Codex 的修改说明');

  const composerActions = document.createElement('div');
  composerActions.className = 'chat-panel__composer-actions';

  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.dataset.chatSend = 'true';
  sendButton.textContent = '发送';
  sendButton.className = 'button button--composer-send';

  composerActions.append(sendButton);
  composerSurface.append(input, composerActions);
  composer.append(composerSurface);

  root.append(header, messages, composer);

  clearButton.addEventListener('click', () => {
    void handlers.onClearSession();
  });

  interruptButton.addEventListener('click', () => {
    void handlers.onInterrupt();
  });

  input.addEventListener('input', () => {
    syncComposerHeight(input);
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }

    void handlers.onSend(text);
    input.value = '';
    syncComposerHeight(input);
  });

  syncComposerHeight(input);

  function render(state: ChatPanelState): void {
    renderConnectionStatus(statusLight, connectionText, state.connectionStatus, state.connectionMessage);
    sessionStatusText.textContent = `会话状态：${formatSessionStatus(state.sessionStatus)}`;
    messages.innerHTML = renderMessageList(filterVisibleTimelineEntries(state), state.pendingDecision, openCards);
    bindCollapsibleCards(messages, openCards);
    bindDecisionCard(messages, handlers);
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

function syncComposerHeight(input: HTMLTextAreaElement): void {
  input.style.height = '0px';
  const nextHeight = Math.min(Math.max(input.scrollHeight, 64), 200);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > 200 ? 'auto' : 'hidden';
}

function bindCollapsibleCards(host: HTMLElement, openCards: Set<string>): void {
  host.querySelectorAll<HTMLElement>('[data-collapsible-card="true"]').forEach((card) => {
    const messageId = card.dataset.messageId;
    if (!messageId) {
      return;
    }

    const toggleButton = card.querySelector<HTMLButtonElement>('[data-collapsible-toggle="true"]');
    const body = card.querySelector<HTMLElement>('[data-collapsible-body="true"]');
    if (!toggleButton || !body) {
      return;
    }

    toggleButton.addEventListener('click', () => {
      const nextOpen = card.dataset.collapsibleOpen !== 'true';
      card.dataset.collapsibleOpen = nextOpen ? 'true' : 'false';
      card.classList.toggle('is-open', nextOpen);
      toggleButton.setAttribute('aria-expanded', String(nextOpen));
      body.hidden = !nextOpen;

      if (nextOpen) {
        openCards.add(messageId);
      } else {
        openCards.delete(messageId);
      }
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
  connectionText.textContent = formatConnectionStatus(connectionStatus, message);
  connectionText.dataset.codexConnectionMessage = 'true';
}

function renderMessageList(
  messages: ChatTimelineEntry[],
  pendingDecision: SessionDecisionCard | null,
  openCards: Set<string>,
): string {
  const visibleMessages = messages.filter((message) => {
    if (message.kind !== 'message' || message.role !== 'reasoning') {
      return true;
    }

    return message.text.trim().length > 0;
  });

  const timelineMarkup = visibleMessages.map((message) => renderTimelineEntry(message, openCards)).join('');
  const decisionMarkup = pendingDecision ? renderDecisionCardMarkup(pendingDecision) : '';

  if (timelineMarkup.length === 0 && decisionMarkup.length === 0) {
    return `
      <div class="chat-panel__empty">
        <strong>等待第一条指令</strong>
        <span>还没有消息。导入模型并选中局部区域后，就可以开始和 Codex 协作。</span>
      </div>
    `;
  }

  return `${timelineMarkup}${decisionMarkup}`;
}

function renderTimelineEntry(message: ChatTimelineEntry, openCards: Set<string>): string {
  return message.kind === 'activity' ? renderActivity(message, openCards) : renderMessage(message, openCards);
}

function renderMessage(message: ChatMessage, openCards: Set<string>): string {
  const title = message.title ? `<span class="chat-message__title">${escapeHtml(message.title)}</span>` : '';
  const status = message.status
    ? `<span class="chat-message__status">${formatEntryStatus(message.status)}</span>`
    : '';

  if (message.role === 'reasoning' && message.text.trim().length > 0) {
    return renderCollapsibleCard({
      id: message.id,
      className: `chat-message chat-message--${message.role}`,
      isOpen: openCards.has(message.id),
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

function renderActivity(activity: ChatActivity, openCards: Set<string>): string {
  const title = `<span class="chat-message__title">${escapeHtml(activity.title)}</span>`;
  const status = activity.status
    ? `<span class="chat-message__status">${formatEntryStatus(activity.status)}</span>`
    : '';
  const fields = renderFactGrid('chat-message', activity.fields);
  const text = activity.text.trim().length > 0 ? renderActivityBody(activity.text, activity.bodyFormat) : '';
  const body = `${fields}${text}`.trim();

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
    isOpen: openCards.has(activity.id),
    roleLabel: labelForActivityKind(activity.activityKind),
    title,
    status,
    body,
  });
}

function renderCollapsibleCard(options: {
  id: string;
  className: string;
  isOpen: boolean;
  roleLabel: string;
  title: string;
  status: string;
  body: string;
}): string {
  return `
    <article
      class="${options.className} chat-message--collapsible${options.isOpen ? ' is-open' : ''}"
      data-message-id="${escapeHtml(options.id)}"
      data-collapsible-card="true"
      data-collapsible-open="${options.isOpen ? 'true' : 'false'}"
    >
      <button
        type="button"
        class="chat-message__summary"
        data-collapsible-toggle="true"
        aria-expanded="${options.isOpen ? 'true' : 'false'}"
      >
        <span class="chat-message__summary-content">
          <span class="chat-message__role">${escapeHtml(options.roleLabel)}</span>
          <span class="chat-message__meta">${options.title}${options.status}</span>
        </span>
      </button>
      <div class="chat-message__body" data-collapsible-body="true"${options.isOpen ? '' : ' hidden'}>
        <div class="chat-message__body-scroll">
          ${options.body}
        </div>
      </div>
    </article>
  `;
}

function renderDecisionCardMarkup(decision: SessionDecisionCard): string {
  const contextMarkup = renderFactGrid('chat-decision', getDecisionInfoFields(decision));
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
        <p class="chat-decision__eyebrow">需要你的决策</p>
        <h3>${escapeHtml(decision.title)}</h3>
        <p>${escapeHtml(decision.body)}</p>
      </header>
      ${contextMarkup}
      <div class="chat-decision__questions">${questions}</div>
      <footer class="chat-decision__footer">
        <button class="button button--primary" type="button" data-decision-submit="true">提交决策</button>
      </footer>
    </section>
  `;
}

function renderActivityBody(text: string, bodyFormat: ChatActivity['bodyFormat']): string {
  return bodyFormat === 'code'
    ? `<pre class="chat-message__code">${escapeHtml(text)}</pre>`
    : `<div class="chat-message__text">${escapeHtml(text)}</div>`;
}

function renderFactGrid(blockName: 'chat-message' | 'chat-decision', fields: SessionInfoField[]): string {
  if (fields.length === 0) {
    return '';
  }

  const content = fields
    .map(
      (field) => `
        <div class="${blockName}__fact">
          <dt class="${blockName}__fact-label">${escapeHtml(field.label)}</dt>
          <dd class="${blockName}__fact-value">${escapeHtml(field.value)}</dd>
        </div>
      `,
    )
    .join('');

  return `<dl class="${blockName}__facts">${content}</dl>`;
}

function getDecisionInfoFields(decision: SessionDecisionCard): SessionInfoField[] {
  switch (decision.kind) {
    case 'command_execution':
      return compactInfoFields([
        ['命令', decision.command],
        ['目录', decision.cwd],
      ]);
    case 'file_change':
      return compactInfoFields([['授权目录', decision.grantRoot]]);
    case 'permissions':
      return compactInfoFields([['权限', decision.permissionsSummary]]);
    case 'user_input':
    default:
      return [];
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

function formatConnectionStatus(
  status: ChatPanelState['connectionStatus'],
  message: string,
): string {
  switch (status) {
    case 'connected':
      return 'Codex 已连接';
    case 'starting':
      return '正在连接 Codex';
    case 'disconnected':
      return message || 'Codex 已断开连接';
    case 'failed':
      return message || 'Codex 连接失败';
    default:
      return message;
  }
}

function filterVisibleTimelineEntries(state: ChatPanelState): ChatTimelineEntry[] {
  return state.messages.filter((message) => {
    if (
      message.kind === 'activity' &&
      message.activityKind === 'command_execution' &&
      message.status === 'streaming' &&
      state.pendingDecision?.kind === 'command_execution'
    ) {
      return false;
    }

    return true;
  });
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

function compactInfoFields(entries: Array<[string, string | null | undefined]>): SessionInfoField[] {
  return entries.flatMap(([label, value]) => {
    const normalizedValue = value?.trim();
    return normalizedValue ? [{ label, value: normalizedValue }] : [];
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
