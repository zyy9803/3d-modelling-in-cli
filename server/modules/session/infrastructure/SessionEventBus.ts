import type { SessionStreamEvent } from '../../../../src/shared/codex-session-types.js';

export type SessionSubscriber = (event: SessionStreamEvent) => void;

export class SessionEventBus {
  private readonly subscribers = new Set<SessionSubscriber>();

  public subscribe(subscriber: SessionSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public publish(event: SessionStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}
