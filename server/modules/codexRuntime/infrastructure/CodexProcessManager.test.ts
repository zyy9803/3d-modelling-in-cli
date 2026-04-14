import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  cleanupError: null as Error | null,
  cleanupCalls: [] as Array<{ ports: number[] }>,
  spawnCalls: [] as Array<{ command: string; args: string[] }>,
}));

vi.mock('node:child_process', () => {
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
    spawn,
    default: {
      spawn,
    },
  };
});

vi.mock('../../../shared/devPortCleanup.js', () => ({
  ensurePortsAvailable: vi.fn(async (options: { ports: number[] }) => {
    mockState.cleanupCalls.push({ ports: options.ports });
    if (mockState.cleanupError) {
      throw mockState.cleanupError;
    }

    return [];
  }),
}));

import { CodexProcessManager, createCodexSpawnCommand } from './CodexProcessManager.js';

describe('CodexProcessManager', () => {
  beforeEach(() => {
    mockState.cleanupError = null;
    mockState.cleanupCalls.length = 0;
    mockState.spawnCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a cmd.exe spawn command on Windows', () => {
    expect(createCodexSpawnCommand('ws://127.0.0.1:4181', 'win32')).toEqual({
      command: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'codex.cmd --sandbox danger-full-access --ask-for-approval never app-server --listen ws://127.0.0.1:4181',
      ],
    });
  });

  it('creates a codex spawn command on macOS', () => {
    expect(createCodexSpawnCommand('ws://127.0.0.1:4181', 'darwin')).toEqual({
      command: 'codex',
      args: [
        '--sandbox',
        'danger-full-access',
        '--ask-for-approval',
        'never',
        'app-server',
        '--listen',
        'ws://127.0.0.1:4181',
      ],
    });
  });

  it('delegates listen-port cleanup to the shared cross-platform helper', async () => {
    const manager = new CodexProcessManager({
      listenPort: 4181,
      cwd: process.cwd(),
    });

    manager.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockState.cleanupCalls).toEqual([{ ports: [4181] }]);
    expect(mockState.spawnCalls).toHaveLength(1);
  });

  it('still spawns codex app-server when shared cleanup fails', async () => {
    mockState.cleanupError = Object.assign(new Error('cleanup failed'), {
      code: 1,
    });
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

    expect(mockState.cleanupCalls).toEqual([{ ports: [4181] }]);
    expect(mockState.spawnCalls).toHaveLength(1);
    expect(events.some((event) => event.type === 'spawned')).toBe(true);
  });
});
