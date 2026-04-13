import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MockSessionClient,
  resolveMockCodexScenarioId,
} from "../../../src/components/chat/services";

describe('resolveMockCodexScenarioId', () => {
  it('returns null when mock mode is not enabled', () => {
    expect(resolveMockCodexScenarioId('')).toBeNull();
  });

  it('maps aliases to supported mock scenarios', () => {
    expect(resolveMockCodexScenarioId('?mock-codex=1')).toBe('overview');
    expect(resolveMockCodexScenarioId('?mock-codex=command')).toBe('command-approval');
    expect(resolveMockCodexScenarioId('?mock-codex=file')).toBe('file-change-approval');
    expect(resolveMockCodexScenarioId('?mock-codex=permissions')).toBe('permissions-approval');
    expect(resolveMockCodexScenarioId('?mock-codex=input')).toBe('user-input');
  });
});

describe('MockSessionClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the overview scenario after connect', async () => {
    vi.useFakeTimers();
    const client = new MockSessionClient('overview');
    const events: Array<{ type: string }> = [];

    client.connect({
      onEvent: (event) => {
        events.push(event);
      },
    });

    await vi.runAllTimersAsync();

    expect(events[0]?.type).toBe('session_cleared');
    expect(events.some((event) => event.type === 'message_started')).toBe(true);
    expect(events.some((event) => event.type === 'activity_started')).toBe(true);
    expect(events.at(-1)?.type).toBe('status_changed');
  });

  it('emits a pending decision for command approval scenario', async () => {
    vi.useFakeTimers();
    const client = new MockSessionClient('command-approval');
    const events: Array<{ type: string; decision?: { kind: string } }> = [];

    client.connect({
      onEvent: (event) => {
        events.push(event);
      },
    });

    await vi.runAllTimersAsync();

    expect(events.some((event) => event.type === 'needs_decision' && event.decision?.kind === 'command_execution')).toBe(
      true,
    );
  });

  it('emits a mock assistant reply after decision submission', async () => {
    vi.useFakeTimers();
    const client = new MockSessionClient('permissions-approval');
    const events: Array<{ type: string }> = [];

    client.connect({
      onEvent: (event) => {
        events.push(event);
      },
    });

    await vi.runAllTimersAsync();
    events.length = 0;

    await client.sendDecision({
      sessionId: 'sess_main',
      decisionId: 'mock-decision-permissions',
      answers: {
        scope: 'session',
      },
    });

    expect(events.some((event) => event.type === 'session_resumed')).toBe(true);
    expect(events.some((event) => event.type === 'message_started')).toBe(true);
    expect(events.at(-1)?.type).toBe('status_changed');
  });
});
