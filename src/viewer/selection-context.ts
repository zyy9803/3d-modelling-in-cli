export type Vector3Tuple = [number, number, number];
export type ViewportSizeTuple = [number, number];

export type SelectionMode = 'click' | 'box';

export type ViewExport = {
  cameraPosition: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
  fov: number;
  viewDirection: Vector3Tuple;
  dominantOrientation: string;
  viewportSize: ViewportSizeTuple;
};

export type SelectionExport = {
  mode: SelectionMode;
  triangleIds: number[];
  screenRect?: [number, number, number, number];
};

export type SelectionComponentExport = {
  id: string;
  triangleIds: number[];
  centroid: Vector3Tuple;
  bboxMin: Vector3Tuple;
  bboxMax: Vector3Tuple;
  avgNormal: Vector3Tuple;
  area: number;
};

export type SelectionContextInput = {
  fileName: string;
  view: ViewExport;
  selection: SelectionExport;
  components: SelectionComponentExport[];
};

export function createSelectionContext(input: SelectionContextInput) {
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
