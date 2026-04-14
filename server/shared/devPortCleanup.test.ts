import { describe, expect, it, vi } from 'vitest';

import { ensurePortsAvailable, parseProcessIds, type ExecFileLike } from './devPortCleanup.js';

describe('parseProcessIds', () => {
  it('extracts unique numeric process ids from shell output', () => {
    expect(parseProcessIds('\n33156\r\nabc\r\n45892\r\n33156\r\n')).toEqual([33156, 45892]);
  });
});

describe('ensurePortsAvailable', () => {
  it('kills matching Windows listeners before dev starts', async () => {
    const execFile = vi.fn<ExecFileLike>()
      .mockResolvedValueOnce({
        stdout: '33156\r\n45892\r\n33156\r\n',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

    const releasedProcessIds = await ensurePortsAvailable({
      ports: [4178, 5173, 5174],
      platform: 'win32',
      execFile,
    });

    expect(releasedProcessIds).toEqual([33156, 45892]);
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '$connections = Get-NetTCPConnection -State Listen -LocalPort 4178,5173,5174 -ErrorAction SilentlyContinue; if ($connections) { $connections | Select-Object -ExpandProperty OwningProcess -Unique }; exit 0',
      ],
      { windowsHide: true },
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'powershell.exe',
      ['-NoProfile', '-Command', expect.stringContaining('Stop-Process -Id 33156,45892 -Force')],
      { windowsHide: true },
    );
  });

  it('returns early when no target ports are occupied', async () => {
    const execFile = vi.fn<ExecFileLike>().mockResolvedValueOnce({
      stdout: '\n',
      stderr: '',
    });

    const releasedProcessIds = await ensurePortsAvailable({
      ports: [4178, 5173],
      platform: 'win32',
      execFile,
    });

    expect(releasedProcessIds).toEqual([]);
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it('kills matching Unix listeners before dev starts', async () => {
    const execFile = vi.fn<ExecFileLike>()
      .mockResolvedValueOnce({
        stdout: '8172\n9201\n8172\n',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
      });

    const releasedProcessIds = await ensurePortsAvailable({
      ports: [4178, 5173],
      platform: 'darwin',
      execFile,
    });

    expect(releasedProcessIds).toEqual([8172, 9201]);
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      'lsof',
      ['-ti', 'tcp:4178', '-ti', 'tcp:5173'],
      { windowsHide: true },
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'kill',
      ['-9', '8172', '9201'],
      { windowsHide: true },
    );
  });

  it('throws a clear error when lsof is unavailable on macOS', async () => {
    const execFile = vi.fn<ExecFileLike>().mockRejectedValueOnce(
      Object.assign(new Error('spawn lsof ENOENT'), {
        code: 'ENOENT',
      }),
    );

    await expect(
      ensurePortsAvailable({
        ports: [4178],
        platform: 'darwin',
        execFile,
      }),
    ).rejects.toThrow('lsof is required to clear dev ports on macOS/Linux.');
  });
});
