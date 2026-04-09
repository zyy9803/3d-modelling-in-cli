import type {
  SelectionComponentPayload,
  SelectionContextPayload,
  SelectionMode,
} from '../shared/codex-session-types';

export type SelectionContextInput = {
  fileName: string;
  modelId?: string;
  selection: SelectionContextPayload['selection'];
  components: SelectionComponentPayload[];
};

export function createSelectionContext(input: SelectionContextInput): SelectionContextPayload {
  return {
    version: 1,
    model: {
      id: input.modelId ?? input.fileName,
      fileName: input.fileName,
    },
    selection: input.selection,
    components: input.components,
  };
}

export type { SelectionMode, SelectionComponentPayload };
