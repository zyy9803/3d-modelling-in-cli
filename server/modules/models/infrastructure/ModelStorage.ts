import { mkdirSync } from 'node:fs';
import { lstat, open, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type ModelValidationResult = {
  ok: boolean;
  message?: string;
};

export type ModelStorage = {
  modelsRoot: string;
  readModelFile(modelPath: string): Promise<Buffer>;
  writeModelFile(modelPath: string, content: Buffer): Promise<void>;
  outputModelExists(modelPath: string): Promise<boolean>;
  validateGeneratedModel(modelPath: string): Promise<ModelValidationResult>;
};

export function createModelStorage(modelsRoot: string): ModelStorage {
  const root = resolve(modelsRoot);
  mkdirSync(root, { recursive: true });

  return {
    modelsRoot: root,
    readModelFile,
    writeModelFile,
    outputModelExists,
    validateGeneratedModel,
  };
}

export async function readModelFile(modelPath: string): Promise<Buffer> {
  return readFile(modelPath);
}

export async function writeModelFile(
  modelPath: string,
  content: Buffer,
): Promise<void> {
  await writeFile(modelPath, content);
}

export async function outputModelExists(modelPath: string): Promise<boolean> {
  try {
    const stat = await lstat(modelPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export async function validateGeneratedModel(
  modelPath: string,
): Promise<ModelValidationResult> {
  const stat = await readModelStat(modelPath);
  if (!stat) {
    return {
      ok: false,
      message: `Generated STL not found: ${modelPath}`,
    };
  }

  if (!(await isLikelyStlFile(modelPath, stat.size))) {
    return {
      ok: false,
      message: `Generated STL is not a valid STL: ${modelPath}`,
    };
  }

  return {
    ok: true,
  };
}

async function readModelStat(modelPath: string) {
  try {
    const stat = await lstat(modelPath);
    return stat.isFile() && stat.size > 0 ? stat : null;
  } catch {
    return null;
  }
}

async function isLikelyStlFile(modelPath: string, size: number): Promise<boolean> {
  if (size >= 84 && (size - 84) % 50 === 0) {
    return true;
  }

  const fileHandle = await open(modelPath, 'r');
  try {
    const bytesToRead = Math.min(size, 512);
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, 0);
    const header = buffer.subarray(0, bytesRead).toString('utf8').trimStart();

    return header.startsWith('solid');
  } finally {
    await fileHandle.close();
  }
}
