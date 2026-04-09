import type { SessionMessageRequest, SelectionComponentPayload } from './codex-session-types.js';

export function buildCodexTurnPrompt(request: SessionMessageRequest): string {
  const selection = request.selectionContext;
  const view = request.viewContext;

  return [
    'Phase 3A conversation only. Do not claim that any STL or mesh edit has been executed.',
    `activeModelId: ${request.activeModelId ?? 'null'}`,
    `triangleCount: ${selection.triangleIds.length}`,
    `componentCount: ${selection.components.length}`,
    `dominantOrientation: ${view.dominantOrientation}`,
    `viewContext: ${formatViewContext(view)}`,
    `selectionContext: ${formatSelectionContext(selection)}`,
    `userInstruction: ${request.message.text}`,
  ].join('\n');
}

function formatViewContext(view: SessionMessageRequest['viewContext']): string {
  return `{"cameraPosition":${formatTuple(view.cameraPosition)},"target":${formatTuple(view.target)},"up":${formatTuple(view.up)},"fov":${formatNumber(view.fov)},"viewDirection":${formatTuple(view.viewDirection)},"dominantOrientation":${JSON.stringify(view.dominantOrientation)},"viewportSize":${formatTuple(view.viewportSize)}}`;
}

function formatSelectionContext(selection: SessionMessageRequest['selectionContext']): string {
  const screenRect = selection.screenRect ? `,"screenRect":${formatTuple(selection.screenRect)}` : '';
  const components = selection.components.map((component) => formatComponent(component)).join(',');

  return `{"mode":${JSON.stringify(selection.mode)},"triangleIds":${formatNumberArray(selection.triangleIds)}${screenRect},"components":[${components}]}`;
}

function formatComponent(component: SelectionComponentPayload): string {
  return `{"id":${JSON.stringify(component.id)},"triangleIds":${formatNumberArray(component.triangleIds)},"centroid":${formatTuple(component.centroid)},"bboxMin":${formatTuple(component.bboxMin)},"bboxMax":${formatTuple(component.bboxMax)},"avgNormal":${formatTuple(component.avgNormal)},"area":${formatNumber(component.area)}}`;
}

function formatTuple(values: readonly number[]): string {
  return `[${values.map((value) => formatNumber(value)).join(',')}]`;
}

function formatNumberArray(values: readonly number[]): string {
  return `[${values.map((value) => formatNumber(value)).join(',')}]`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}
