import type {
  SelectionComponentPayload,
  SelectionContextPayload,
  ViewContextPayload,
} from "../../../shared/codex-session-types";

export type SelectionContextInput = {
  fileName: string;
  view: ViewContextPayload;
  selection: {
    mode: "click" | "box";
    triangleIds: number[];
    screenRect?: [number, number, number, number];
  };
  components: SelectionComponentPayload[];
};

export type DownloadedSelectionContext = {
  version: 1;
  model: {
    file: string;
  };
  view: ViewContextPayload;
  selection: SelectionContextInput["selection"];
  components: SelectionComponentPayload[];
};

export function createSelectionContext(
  input: SelectionContextInput,
): DownloadedSelectionContext {
  return {
    version: 1,
    model: {
      file: input.fileName,
    },
    view: input.view,
    selection: input.selection,
    components: input.components,
  };
}

export type ChatSelectionContextInput = {
  selection: SelectionContextInput["selection"];
  components: SelectionComponentPayload[];
};

export function createChatSelectionContext(
  input: ChatSelectionContextInput,
): SelectionContextPayload {
  return {
    mode: input.selection.mode,
    triangleIds: input.selection.triangleIds,
    ...(input.selection.screenRect
      ? { screenRect: input.selection.screenRect }
      : {}),
    components: input.components,
  };
}
