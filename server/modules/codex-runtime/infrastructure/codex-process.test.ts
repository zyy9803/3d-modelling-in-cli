import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  execFileError: null as Error | null,
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
}));

vi.mock('node:child_process', () => {
  const execFile = vi.fn((...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null) => void;
    callback(mockState.execFileError);
  });

  const spawn = vi.fn((command: string, args: string[]) => {
    mockState.spawnCalls.push({ command, args });

    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: EventEmitter;
      stderr: EventEmitter;
    };

    child.pid = 1234;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      child.emit('spawn');
    });

    return child;
  });

  return {
    execFile,
    spawn,
    default: {
      execFile,
      spawn,
    },
  };
});

import { CodexProcessManager } from './codex-process.js';

describe('CodexProcessManager', () => {
  beforeEach(() => {
    mockState.execFileError = Object.assign(new Error('cleanup failed'), {
      code: 1,
    });
    mockState.spawnCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('still spawns codex app-server when port cleanup fails on Windows', async () => {
    const events: Array<{ type: string }> = [];
    const manager = new CodexProcessManager({
      listenPort: 4181,
      cwd: process.cwd(),
    });

    manager.on('process', (event) => {
      events.push(event as { type: string });
    });

    manager.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockState.spawnCalls).toHaveLength(1);
    expect(events.some((event) => event.type === 'spawned')).toBe(true);
  });
});
