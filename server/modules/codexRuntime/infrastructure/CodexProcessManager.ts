import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';

import { ensurePortsAvailable } from '../../../shared/devPortCleanup.js';

export type CodexProcessEvent =
  | {
      type: 'spawned';
      pid: number | null;
      listenUrl: string;
    }
  | {
      type: 'exit';
      code: number | null;
      signal: NodeJS.Signals | null;
    }
  | {
      type: 'error';
      error: Error;
    };

export type CodexProcessManagerOptions = {
  listenPort: number;
  cwd?: string;
};

export type CodexSpawnCommand = {
  command: string;
  args: string[];
};

export class CodexProcessManager extends EventEmitter {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stopping = false;

  public constructor(private readonly options: CodexProcessManagerOptions) {
    super();
  }

  public get listenUrl(): string {
    return `ws://127.0.0.1:${this.options.listenPort}`;
  }

  public get pid(): number | null {
    return this.child?.pid ?? null;
  }

  public start(): void {
    if (this.child) {
      return;
    }

    this.stopping = false;
    void this.startInternal();
  }

  private async startInternal(): Promise<void> {
    try {
      await ensurePortsAvailable({
        ports: [this.options.listenPort],
      });
    } catch {
      // Best-effort cleanup: a cleanup failure should not block the app-server
      // spawn because the port may still already be free.
    }

    try {
      const spawnCommand = createCodexSpawnCommand(this.listenUrl);

      const child = spawn(spawnCommand.command, spawnCommand.args, {
        cwd: this.options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.child = child;

      child.once('spawn', () => {
        this.emit('process', {
          type: 'spawned',
          pid: child.pid ?? null,
          listenUrl: this.listenUrl,
        } satisfies CodexProcessEvent);
      });

      child.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
      });

      child.once('error', (error) => {
        this.child = null;
        this.emit('process', {
          type: 'error',
          error,
        } satisfies CodexProcessEvent);
      });

      child.once('exit', (code, signal) => {
        this.child = null;
        this.emit('process', {
          type: 'exit',
          code,
          signal,
        } satisfies CodexProcessEvent);
      });
    } catch (error) {
      this.emit('process', {
        type: 'error',
        error:
          error instanceof Error
            ? error
            : new Error('Failed to start codex app-server.'),
      } satisfies CodexProcessEvent);
    }
  }

  public stop(): void {
    this.stopping = true;
    if (!this.child) {
      return;
    }

    this.child.kill();
    this.child = null;
  }

  public isStopping(): boolean {
    return this.stopping;
  }
}

export function createCodexSpawnCommand(
  listenUrl: string,
  platform: NodeJS.Platform = process.platform,
): CodexSpawnCommand {
  const args = [
    '--sandbox',
    'danger-full-access',
    '--ask-for-approval',
    'never',
    'app-server',
    '--listen',
    listenUrl,
  ];

  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `codex.cmd ${args.map(quoteWindowsArg).join(' ')}`],
    };
  }

  return {
    command: 'codex',
    args,
  };
}

function quoteWindowsArg(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}
