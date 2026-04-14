import type {
  DraftJobInput,
  DraftJobRecord,
  EditJobFactory,
  ExecutionJobRecord,
} from '../infrastructure/editJobWorkspace.js';

export type EditJobService = {
  createDraft(input: DraftJobInput): Promise<DraftJobRecord>;
  prepareExecution(draftJob: DraftJobRecord): Promise<ExecutionJobRecord>;
};

export function createEditJobService(
  editJobFactory: EditJobFactory,
): EditJobService {
  return {
    createDraft(input) {
      return editJobFactory.createDraft(input);
    },
    prepareExecution(draftJob) {
      return editJobFactory.prepareExecution(draftJob);
    },
  };
}
