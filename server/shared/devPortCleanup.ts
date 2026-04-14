import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ExecFileResult = {
  stdout: string;
  stderr: string;
};

export type ExecFileLike = (
  file: string,
  args: string[],
  options?: {
    windowsHide?: boolean;
  },
) => Promise<ExecFileResult>;

export function parseProcessIds(output: string): number[] {
  const uniqueProcessIds = new Set<number>();

  for (const line of output.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (!/^\d+$/u.test(trimmedLine)) {
      continue;
    }

    uniqueProcessIds.add(Number(trimmedLine));
  }

  return [...uniqueProcessIds];
}

export async function ensurePortsAvailable(options: {
  ports: number[];
  platform?: NodeJS.Platform;
  execFile?: ExecFileLike;
}): Promise<number[]> {
  const ports = [...new Set(options.ports.filter((port) => Number.isInteger(port) && port > 0))];
  if (ports.length === 0) {
    return [];
  }

  const platform = options.platform ?? process.platform;
  const runner = options.execFile ?? execFileAsync;

  if (platform === 'win32') {
    const { stdout } = await runPortCommand(
      runner,
      'powershell.exe',
      ['-NoProfile', '-Command', buildWindowsListCommand(ports)],
      'PowerShell is required to clear dev ports on Windows.',
    );

    const processIds = parseProcessIds(stdout);
    if (processIds.length === 0) {
      return [];
    }

    await runPortCommand(
      runner,
      'powershell.exe',
      ['-NoProfile', '-Command', buildWindowsKillCommand(processIds)],
      'PowerShell is required to clear dev ports on Windows.',
    );

    return processIds;
  }

  const { stdout } = await runPortCommand(
    runner,
    'lsof',
    buildUnixListArgs(ports),
    'lsof is required to clear dev ports on macOS/Linux.',
  );
  const processIds = parseProcessIds(stdout);
  if (processIds.length === 0) {
    return [];
  }

  await runPortCommand(
    runner,
    'kill',
    ['-9', ...processIds.map(String)],
    'kill is required to clear dev ports on macOS/Linux.',
  );
  return processIds;
}

function buildWindowsListCommand(ports: number[]): string {
  return `$connections = Get-NetTCPConnection -State Listen -LocalPort ${ports.join(',')} -ErrorAction SilentlyContinue; if ($connections) { $connections | Select-Object -ExpandProperty OwningProcess -Unique }; exit 0`;
}

function buildWindowsKillCommand(processIds: number[]): string {
  return `Stop-Process -Id ${processIds.join(',')} -Force -ErrorAction SilentlyContinue`;
}

function buildUnixListArgs(ports: number[]): string[] {
  return ports.flatMap((port) => ['-ti', `tcp:${port}`]);
}

async function runPortCommand(
  runner: ExecFileLike,
  file: string,
  args: string[],
  missingCommandMessage: string,
): Promise<ExecFileResult> {
  try {
    return await runner(file, args, { windowsHide: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw new Error(missingCommandMessage);
    }

    throw error;
  }
}
