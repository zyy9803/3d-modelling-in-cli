import { describe, expect, it } from 'vitest';

import {
  createPnpmExecCommand,
  createPnpmRunCommand,
  getPnpmCommand,
} from '../../scripts/shared/processRunner.js';

describe('getPnpmCommand', () => {
  it('uses pnpm.cmd on Windows', () => {
    expect(getPnpmCommand('win32')).toBe('pnpm.cmd');
  });

  it('uses pnpm on macOS and other Unix platforms', () => {
    expect(getPnpmCommand('darwin')).toBe('pnpm');
    expect(getPnpmCommand('linux')).toBe('pnpm');
  });
});

describe('createPnpmRunCommand', () => {
  it('wraps pnpm run with cmd.exe on Windows', () => {
    expect(createPnpmRunCommand('dev:server', 'win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd run dev:server'],
    });
  });

  it('builds a portable pnpm run command on macOS', () => {
    expect(createPnpmRunCommand('dev:server', 'darwin')).toEqual({
      command: 'pnpm',
      args: ['run', 'dev:server'],
    });
  });
});

describe('createPnpmExecCommand', () => {
  it('wraps pnpm exec with cmd.exe on Windows', () => {
    expect(createPnpmExecCommand(['vite', 'build'], 'win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd exec vite build'],
    });
  });

  it('builds a portable pnpm exec command on macOS', () => {
    expect(createPnpmExecCommand(['vite', 'build'], 'darwin')).toEqual({
      command: 'pnpm',
      args: ['exec', 'vite', 'build'],
    });
  });
});
