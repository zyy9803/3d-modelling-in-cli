import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateGeneratedModel } from './ModelStorage.js';

describe('validateGeneratedModel', () => {
  it('rejects missing files', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'model-storage-'));

    await expect(validateGeneratedModel(join(rootDir, 'missing.stl'))).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('Generated STL not found'),
    });
  });

  it('rejects files without a valid STL solid header', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'model-storage-'));
    const outputPath = join(rootDir, 'invalid.stl');
    await writeFile(outputPath, 'not an stl', 'utf8');

    await expect(validateGeneratedModel(outputPath)).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('Generated STL is not a valid STL'),
    });
  });

  it('accepts ascii STL files with solid content', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'model-storage-'));
    const outputPath = join(rootDir, 'valid.stl');
    await writeFile(outputPath, 'solid demo\nfacet normal 0 0 1\nendsolid demo\n', 'utf8');

    await expect(validateGeneratedModel(outputPath)).resolves.toEqual({
      ok: true,
    });
  });
});
