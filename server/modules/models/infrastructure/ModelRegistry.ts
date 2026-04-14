import { basename, extname, join, resolve } from 'node:path';

export type ModelRecord = {
  modelId: string;
  parentModelId: string | null;
  sourceFileName: string;
  storagePath: string;
  sourceJobId: string | null;
  createdAt: string;
};

export type ImportedModelInput = {
  sourceFileName: string;
  createdAt?: Date;
};

export type DerivedModelInput = {
  parentModelId: string;
  sourceFileName: string;
  jobId: string;
  createdAt?: Date;
};

export type ModelRegistry = {
  registerImportedModel(input: ImportedModelInput): ModelRecord;
  registerDerivedModel(input: DerivedModelInput): ModelRecord;
  getModel(modelId: string): ModelRecord | null;
  listModels(): ModelRecord[];
};

export function createModelRegistry(modelsRoot: string): ModelRegistry {
  let nextSequence = 0;
  const records = new Map<string, ModelRecord>();
  const root = resolve(modelsRoot);

  function nextModelId(): string {
    nextSequence += 1;
    return `model_${String(nextSequence).padStart(3, '0')}`;
  }

  function storeRecord(record: ModelRecord): ModelRecord {
    records.set(record.modelId, record);
    return record;
  }

  return {
    registerImportedModel(input: ImportedModelInput): ModelRecord {
      const modelId = nextModelId();
      const record = buildImportedModelRecord({
        modelId,
        sourceFileName: input.sourceFileName,
        storagePath: join(root, `${modelId}_original.stl`),
        createdAt: input.createdAt ?? new Date(),
      });
      return storeRecord(record);
    },

    registerDerivedModel(input: DerivedModelInput): ModelRecord {
      const parent = records.get(input.parentModelId);
      if (!parent) {
        throw new Error(`Unknown parent model: ${input.parentModelId}`);
      }

      const modelId = nextModelId();
      const storagePath = join(root, `${modelId}_from_${input.parentModelId}.stl`);
      const record = buildDerivedModelRecord({
        modelId,
        parentModelId: input.parentModelId,
        sourceFileName: basename(storagePath),
        storagePath,
        sourceJobId: input.jobId,
        createdAt: input.createdAt ?? new Date(),
      });
      return storeRecord(record);
    },

    getModel(modelId: string): ModelRecord | null {
      return records.get(modelId) ?? null;
    },

    listModels(): ModelRecord[] {
      return [...records.values()];
    },
  };
}

function buildImportedModelRecord(input: {
  modelId: string;
  sourceFileName: string;
  storagePath: string;
  createdAt: Date;
}): ModelRecord {
  return {
    modelId: input.modelId,
    parentModelId: null,
    sourceFileName: input.sourceFileName,
    storagePath: input.storagePath,
    sourceJobId: null,
    createdAt: input.createdAt.toISOString(),
  };
}

function buildDerivedModelRecord(input: {
  modelId: string;
  parentModelId: string;
  sourceFileName: string;
  storagePath: string;
  sourceJobId: string;
  createdAt: Date;
}): ModelRecord {
  return {
    modelId: input.modelId,
    parentModelId: input.parentModelId,
    sourceFileName: input.sourceFileName,
    storagePath: input.storagePath,
    sourceJobId: input.sourceJobId,
    createdAt: input.createdAt.toISOString(),
  };
}

export function getModelFileStem(fileName: string): string {
  const parsed = fileName.trim();
  const extension = extname(parsed);
  const stem = extension ? parsed.slice(0, -extension.length) : parsed;
  const safeStem = stem.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  return safeStem.length > 0 ? safeStem : 'model';
}
