import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type DebugLogger = {
  log(event: string, payload?: unknown): void;
  path: string;
};

export function createDebugLogger(logPath: string): DebugLogger {
  const resolvedPath = resolve(logPath);
  let writeChain = Promise.resolve();

  return {
    path: resolvedPath,
    log(event: string, payload?: unknown): void {
      const entry = {
        ts: new Date().toISOString(),
        pid: process.pid,
        event,
        payload: payload ?? null,
      };
      const line = `${JSON.stringify(entry)}\n`;

      writeChain = writeChain
        .then(async () => {
          await mkdir(dirname(resolvedPath), { recursive: true });
          await appendFile(resolvedPath, line, 'utf8');
        })
        .catch(() => {
          // Logging must never break the main flow.
        });
    },
  };
}
