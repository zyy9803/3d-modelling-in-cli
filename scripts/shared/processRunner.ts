import { spawn } from 'node:child_process';

export type CommandSpec = {
  command: string;
  args: string[];
};

export function getPnpmCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function createPnpmRunCommand(
  scriptName: string,
  platform: NodeJS.Platform = process.platform,
): CommandSpec {
  if (platform === 'win32') {
    return createWindowsCommand(['pnpm.cmd', 'run', scriptName]);
  }

  return {
    command: getPnpmCommand(platform),
    args: ['run', scriptName],
  };
}

export function createPnpmExecCommand(
  args: string[],
  platform: NodeJS.Platform = process.platform,
): CommandSpec {
  if (platform === 'win32') {
    return createWindowsCommand(['pnpm.cmd', 'exec', ...args]);
  }

  return {
    command: getPnpmCommand(platform),
    args: ['exec', ...args],
  };
}

export async function runCommand(spec: CommandSpec): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      stdio: 'inherit',
      windowsHide: true,
    });

    const forwardSignal = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    const cleanup = (): void => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
    };

    child.once('error', (error) => {
      cleanup();
      reject(error);
    });

    child.once('exit', (code, signal) => {
      cleanup();

      if (signal) {
        reject(new Error(`Command exited with signal ${signal}: ${spec.command} ${spec.args.join(' ')}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: ${spec.command} ${spec.args.join(' ')}`));
        return;
      }

      resolve();
    });
  });
}

function createWindowsCommand(parts: string[]): CommandSpec {
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', parts.map(quoteWindowsArg).join(' ')],
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
