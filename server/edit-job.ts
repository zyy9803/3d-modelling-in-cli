import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { SelectionContextPayload, ViewContextPayload } from '../src/shared/codex-session-types.js';
import type { ModelRecord, ModelRegistry } from './model-registry.js';

export type DraftJobInput = {
  activeModelId: string;
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
  userInstruction: string;
};

export type DraftJobRecord = {
  jobId: string;
  workspacePath: string;
  contextPath: string;
  scriptPath: string;
  resultPath: string;
  baseModel: ModelRecord;
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
  userInstruction: string;
};

export type ExecutionJobRecord = DraftJobRecord & {
  outputModel: ModelRecord;
};

export type EditJobFactoryOptions = {
  jobsRoot: string;
  registry: ModelRegistry;
};

export type EditJobFactory = {
  createDraft(input: DraftJobInput): Promise<DraftJobRecord>;
  prepareExecution(draftJob: DraftJobRecord): Promise<ExecutionJobRecord>;
};

export function createEditJobFactory(options: EditJobFactoryOptions): EditJobFactory {
  let nextSequence = 0;
  const jobsRoot = resolve(options.jobsRoot);

  return {
    async createDraft(input: DraftJobInput): Promise<DraftJobRecord> {
      nextSequence += 1;
      const jobId = `job_${String(nextSequence).padStart(3, '0')}`;
      const baseModel = options.registry.getModel(input.activeModelId);
      if (!baseModel) {
        throw new Error(`Unknown active model: ${input.activeModelId}`);
      }

      const workspacePath = join(jobsRoot, jobId);
      const contextPath = join(workspacePath, 'context.json');
      const scriptPath = join(workspacePath, 'edit.py');
      const resultPath = join(workspacePath, 'result.json');

      await mkdir(workspacePath, { recursive: true });
      await writeFile(
        contextPath,
        buildContextJson(jobId, baseModel, null, input.selectionContext, input.viewContext, input.userInstruction),
        'utf8',
      );

      return {
        jobId,
        workspacePath,
        contextPath,
        scriptPath,
        resultPath,
        baseModel,
        selectionContext: input.selectionContext,
        viewContext: input.viewContext,
        userInstruction: input.userInstruction,
      };
    },
    async prepareExecution(draftJob: DraftJobRecord): Promise<ExecutionJobRecord> {
      const outputModel = options.registry.registerDerivedModel({
        parentModelId: draftJob.baseModel.modelId,
        sourceFileName: `${stripStlExtension(draftJob.baseModel.sourceFileName)}-edited.stl`,
        jobId: draftJob.jobId,
      });

      await rm(draftJob.resultPath, { force: true });
      await rm(outputModel.storagePath, { force: true });
      await writeFile(
        draftJob.contextPath,
        buildContextJson(
          draftJob.jobId,
          draftJob.baseModel,
          outputModel,
          draftJob.selectionContext,
          draftJob.viewContext,
          draftJob.userInstruction,
        ),
        'utf8',
      );

      return {
        ...draftJob,
        outputModel,
      };
    },
  };
}

function buildContextJson(
  jobId: string,
  baseModel: ModelRecord,
  outputModel: ModelRecord | null,
  selectionContext: SelectionContextPayload,
  viewContext: ViewContextPayload,
  userInstruction: string,
): string {
  return JSON.stringify(
    {
      jobId,
      baseModelId: baseModel.modelId,
      activeModelId: baseModel.modelId,
      baseModelPath: baseModel.storagePath,
      outputModelPath: outputModel?.storagePath ?? null,
      selectionContext,
      viewContext,
      userInstruction,
    },
    null,
    2,
  );
}

function stripStlExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.stl') ? fileName.slice(0, -4) : fileName;
}
