import type {
  ChatSessionStatus,
  CodexConnectionStatus,
  SessionDecisionRequest,
  SessionInterruptRequest,
  SessionMessageRequest,
  SessionModelSwitchRequest,
  SessionStreamEvent,
} from '../shared/codex-session-types';

export type SessionStatusResponse = {
  connectionStatus: CodexConnectionStatus;
  connectionMessage: string;
  sessionStatus: ChatSessionStatus;
  activeModelId: string | null;
  modelLabel: string | null;
};

type SessionClientOptions = {
  onEvent: (event: SessionStreamEvent) => void;
};

export class SessionClient {
  private eventSource: EventSource | null = null;

  constructor(private readonly baseUrl = resolveDefaultBaseUrl()) {}

  async getStatus(options: { retries?: number; retryDelayMs?: number } = {}): Promise<SessionStatusResponse> {
    const retries = options.retries ?? 8;
    const retryDelayMs = options.retryDelayMs ?? 500;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const response = await fetch(this.resolveUrl('/api/status'));
        return await this.parseJsonResponse<SessionStatusResponse>(response);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Failed to fetch session status.');
        if (attempt < retries - 1) {
          await delay(retryDelayMs);
        }
      }
    }

    throw lastError ?? new Error('Failed to fetch session status.');
  }

  connect(options: SessionClientOptions): () => void {
    this.disconnect();

    if (typeof EventSource === 'undefined') {
      throw new Error('EventSource is not available in this environment');
    }

    const eventSource = new EventSource(this.resolveUrl('/api/session/stream'));
    eventSource.onmessage = (messageEvent) => {
      const event = safeParseEvent(messageEvent.data);
      if (event) {
        options.onEvent(event);
      }
    };
    eventSource.onerror = () => {
      options.onEvent({
        type: 'connection_status_changed',
        connectionStatus: eventSource.readyState === EventSource.CLOSED ? 'disconnected' : 'starting',
        message:
          eventSource.readyState === EventSource.CLOSED
            ? 'Session stream disconnected. Retrying...'
            : 'Waiting for local session server...',
      });
    };

    this.eventSource = eventSource;
    return () => this.disconnect();
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  async sendMessage(payload: SessionMessageRequest): Promise<void> {
    await this.postJson('/api/session/message', payload);
  }

  async sendDecision(payload: SessionDecisionRequest): Promise<void> {
    await this.postJson('/api/session/decision', payload);
  }

  async interrupt(payload: SessionInterruptRequest): Promise<void> {
    await this.postJson('/api/session/interrupt', payload);
  }

  async switchModel(payload: SessionModelSwitchRequest): Promise<void> {
    await this.postJson('/api/session/model-switch', payload);
  }

  async clearSession(): Promise<void> {
    await this.postJson('/api/session/clear', {});
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const response = await fetch(this.resolveUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private resolveUrl(path: string): string {
    if (!this.baseUrl) {
      return path;
    }

    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }
}

function safeParseEvent(data: unknown): SessionStreamEvent | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    return JSON.parse(data) as SessionStreamEvent;
  } catch {
    return null;
  }
}

function resolveDefaultBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  if (window.location.port === '4178') {
    return '';
  }

  return 'http://127.0.0.1:4178';
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
