import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
      await this.ensureListenPortAvailable();
    } catch (error) {
      this.emit('process', {
        type: 'error',
        error: error instanceof Error ? error : new Error('Failed to clear codex app-server port.'),
      } satisfies CodexProcessEvent);
      return;
    }

    try {
      const args = [
        '--sandbox',
        'danger-full-access',
        '--ask-for-approval',
        'never',
        'app-server',
        '--listen',
        this.listenUrl,
      ];
      const command = process.platform === 'win32' ? 'cmd.exe' : 'codex';
      const commandArgs =
        process.platform === 'win32'
          ? ['/d', '/s', '/c', `codex.cmd ${args.map(quoteWindowsArg).join(' ')}`]
          : args;

      const child = spawn(
        command,
        commandArgs,
        {
          cwd: this.options.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );

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
        error: error instanceof Error ? error : new Error('Failed to start codex app-server.'),
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

  private async ensureListenPortAvailable(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    const command = [
      `$connections = Get-NetTCPConnection -State Listen -LocalPort ${this.options.listenPort} -ErrorAction SilentlyContinue`,
      'if ($connections) {',
      '  $owningProcessIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique',
      '  foreach ($owningProcessId in $owningProcessIds) {',
      '    try { Stop-Process -Id $owningProcessId -Force -ErrorAction Stop } catch {}',
      '  }',
      '}',
    ].join('; ');

    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
      cwd: this.options.cwd,
      windowsHide: true,
    });
  }
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
