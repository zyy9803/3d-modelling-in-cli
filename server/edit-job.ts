import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { SelectionContextPayload, ViewContextPayload } from '../src/shared/codex-session-types.js';
import type { ModelRecord, ModelRegistry } from './model-registry.js';

export type EditJobInput = {
  activeModelId: string;
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
  userInstruction: string;
};

export type EditJobRecord = {
  jobId: string;
  workspacePath: string;
  contextPath: string;
  scriptPath: string;
  resultPath: string;
  baseModel: ModelRecord;
  outputModel: ModelRecord;
};

export type EditJobFactoryOptions = {
  jobsRoot: string;
  registry: ModelRegistry;
};

export type EditJobFactory = {
  createJob(input: EditJobInput): Promise<EditJobRecord>;
};

export function createEditJobFactory(options: EditJobFactoryOptions): EditJobFactory {
  let nextSequence = 0;
  const jobsRoot = resolve(options.jobsRoot);

  return {
    async createJob(input: EditJobInput): Promise<EditJobRecord> {
      nextSequence += 1;
      const jobId = `job_${String(nextSequence).padStart(3, '0')}`;
      const baseModel = options.registry.getModel(input.activeModelId);
      if (!baseModel) {
        throw new Error(`Unknown active model: ${input.activeModelId}`);
      }

      const outputModel = options.registry.registerDerivedModel({
        parentModelId: baseModel.modelId,
        sourceFileName: `${stripStlExtension(baseModel.sourceFileName)}-edited.stl`,
        jobId,
      });

      const workspacePath = join(jobsRoot, jobId);
      const contextPath = join(workspacePath, 'context.json');
      const scriptPath = join(workspacePath, 'edit.py');
      const resultPath = join(workspacePath, 'result.json');

      await mkdir(workspacePath, { recursive: true });
      await writeFile(contextPath, buildContextJson(jobId, baseModel, outputModel, input), 'utf8');

      return {
        jobId,
        workspacePath,
        contextPath,
        scriptPath,
        resultPath,
        baseModel,
        outputModel,
      };
    },
  };
}

function buildContextJson(
  jobId: string,
  baseModel: ModelRecord,
  outputModel: ModelRecord,
  input: EditJobInput,
): string {
  return JSON.stringify(
    {
      jobId,
      baseModelId: baseModel.modelId,
      activeModelId: input.activeModelId,
      baseModelPath: baseModel.storagePath,
      outputModelPath: outputModel.storagePath,
      selectionContext: input.selectionContext,
      viewContext: input.viewContext,
      userInstruction: input.userInstruction,
    },
    null,
    2,
  );
}

function stripStlExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.stl') ? fileName.slice(0, -4) : fileName;
}
