import type { ChatMessage, ChatStoreState } from './chat-store';
import type { SessionDecisionCard } from '../shared/codex-session-types';

export type ChatPanelHandlers = {
  onSend: (text: string) => void | Promise<void>;
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
  const root = document.createElement('aside');
  root.className = 'chat-panel';
  root.dataset.chatPanel = 'true';

  const statusLight = document.createElement('span');
  statusLight.className = 'chat-light';
  statusLight.dataset.codexConnectionLight = 'true';

  const connectionText = document.createElement('span');
  const sessionStatusText = document.createElement('span');
  const modelText = document.createElement('span');

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.dataset.clearSession = 'true';
  clearButton.textContent = '\u6e05\u7a7a\u4f1a\u8bdd';

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

  header.append(headerLeft, clearButton);

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
  input.placeholder = '\u8f93\u5165\u4f60\u5e0c\u671b Codex \u5904\u7406\u7684\u4fee\u6539\u8bf4\u660e';

  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.textContent = '\u53d1\u9001';

  composer.append(input, sendButton);

  root.append(header, contextStrip, messages, decisionHost, composer);

  clearButton.addEventListener('click', () => {
    void handlers.onClearSession();
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
    sessionStatusText.textContent = `\u4f1a\u8bdd\u72b6\u6001\uff1a${formatSessionStatus(state.sessionStatus)}`;
    modelText.textContent = `\u5f53\u524d\u6a21\u578b\uff1a${state.modelLabel ?? state.activeModelId ?? '\u672a\u52a0\u8f7d'}`;
    triangleCount.textContent = `\u5df2\u9009\u4e09\u89d2\u9762\uff1a${state.contextSummary.triangleCount}`;
    componentCount.textContent = `\u8fde\u901a\u5757\uff1a${state.contextSummary.componentCount}`;
    orientation.textContent = `\u65b9\u5411\uff1a${state.contextSummary.orientation}`;
    messages.innerHTML = renderMessageList(state.messages);
    decisionHost.innerHTML = state.pendingDecision ? renderDecisionCardMarkup(state.pendingDecision) : '';
    bindDecisionCard(decisionHost, handlers);
    root.dataset.sessionStatus = state.sessionStatus;
    root.dataset.connectionStatus = state.connectionStatus;
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

function renderMessageList(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return '<div class="chat-panel__empty">\u8fd8\u6ca1\u6709\u6d88\u606f</div>';
  }

  return messages.map((message) => renderMessage(message)).join('');
}

function renderMessage(message: ChatMessage): string {
  return `
    <article class="chat-message chat-message--${message.role}" data-message-id="${escapeHtml(message.id)}">
      <div class="chat-message__header">
        <span class="chat-message__role">${labelForRole(message.role)}</span>
        ${
          message.status
            ? `<span class="chat-message__status">${message.status === 'streaming' ? '\u6d41\u5f0f\u4e2d' : '\u5b8c\u6210'}</span>`
            : ''
        }
      </div>
      <div class="chat-message__text">${escapeHtml(message.text || ' ')}</div>
    </article>
  `;
}

function renderDecisionCardMarkup(decision: SessionDecisionCard): string {
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
                  data-answer="${escapeHtml(option.label)}"
                >
                  ${escapeHtml(option.label)}
                  <span>${escapeHtml(option.description)}</span>
                </button>
              `,
            )
            .join('')
        : '<div class="chat-decision__hint">\u6ca1\u6709\u53ef\u9009\u9879\uff0c\u8bf7\u586b\u5199\u81ea\u5b9a\u4e49\u7b54\u6848\u3002</div>';

      return `
        <fieldset class="chat-decision__question" data-question-id="${escapeHtml(question.id)}">
          <legend>${escapeHtml(question.header)}</legend>
          <p>${escapeHtml(question.question)}</p>
          <input type="hidden" data-selected-answer value="" />
          <div class="chat-decision__option-list">${optionButtons}</div>
          ${
            question.allowOther
              ? `
                <label class="chat-decision__other">
                  <span>\u5176\u4ed6\u7b54\u6848</span>
                  <input type="text" data-other-answer placeholder="\u8f93\u5165\u5176\u4ed6\u7b54\u6848" />
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
      <div class="chat-decision__questions">${questions}</div>
      <footer class="chat-decision__footer">
        <button type="button" data-decision-submit="true">\u63d0\u4ea4\u51b3\u7b56</button>
      </footer>
    </section>
  `;
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

        const hiddenInput = questionElement.querySelector<HTMLInputElement>('[data-selected-answer]');
        if (hiddenInput) {
          hiddenInput.value = answer;
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

        const hiddenInput = questionElement.querySelector<HTMLInputElement>('[data-selected-answer]');
        if (hiddenInput) {
          hiddenInput.value = '';
        }
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
      return '\u7a7a\u95f2';
    case 'sending':
      return '\u53d1\u9001\u4e2d';
    case 'streaming':
      return '\u6d41\u5f0f\u8f93\u51fa\u4e2d';
    case 'waiting_decision':
      return '\u7b49\u5f85\u51b3\u7b56';
    case 'resuming':
      return '\u6062\u590d\u4e2d';
    case 'completed':
      return '\u5df2\u5b8c\u6210';
    case 'failed':
      return '\u5931\u8d25';
    default:
      return status;
  }
}

function labelForRole(role: ChatMessage['role']): string {
  switch (role) {
    case 'user':
      return '\u7528\u6237';
    case 'assistant':
      return 'Codex';
    case 'system':
      return '\u7cfb\u7edf';
    default:
      return role;
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
