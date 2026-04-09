import type { SessionMessageRequest, SelectionComponentPayload } from './codex-session-types';

export function buildCodexTurnPrompt(request: SessionMessageRequest): string {
  const lines = [
    'Phase 3A conversation only.',
    'No STL or mesh edit has been executed.',
    `Active model ID: ${formatMaybeString(request.activeModelId)}`,
    '',
    'User message:',
    request.message.text,
    '',
    'Selection summary:',
    `- Model: ${request.selectionContext.model.fileName} (${request.selectionContext.model.id})`,
    `- Selection mode: ${request.selectionContext.selection.mode}`,
    `- Triangle IDs: ${formatNumberList(request.selectionContext.selection.triangleIds)}`,
    `- Components: ${request.selectionContext.components.length}`,
    ...request.selectionContext.components.flatMap((component, index) => formatComponentLines(component, index)),
    '',
    'View summary:',
    `- Camera position: ${formatTuple(request.viewContext.cameraPosition)}`,
    `- Target: ${formatTuple(request.viewContext.target)}`,
    `- Up: ${formatTuple(request.viewContext.up)}`,
    `- FOV: ${formatNumber(request.viewContext.fov)}`,
    `- View direction: ${formatTuple(request.viewContext.viewDirection)}`,
    `- Dominant orientation: ${request.viewContext.dominantOrientation}`,
    `- Viewport size: ${request.viewContext.viewportSize[0]} x ${request.viewContext.viewportSize[1]}`,
  ];

  return lines.join('\n');
}

function formatComponentLines(component: SelectionComponentPayload, index: number): string[] {
  return [
    `  - Component ${index + 1}: ${component.id}`,
    `    - Triangle IDs: ${formatNumberList(component.triangleIds)}`,
    `    - Centroid: ${formatTuple(component.centroid)}`,
    `    - Bounding box: ${formatTuple(component.bboxMin)} -> ${formatTuple(component.bboxMax)}`,
    `    - Average normal: ${formatTuple(component.avgNormal)}`,
    `    - Area: ${formatNumber(component.area)}`,
  ];
}

function formatTuple(value: readonly number[]): string {
  return `[${value.map((entry) => formatNumber(entry)).join(', ')}]`;
}

function formatNumberList(values: readonly number[]): string {
  return values.length === 0 ? 'none' : values.map((entry) => formatNumber(entry)).join(', ');
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function formatMaybeString(value: string | null): string {
  return value ?? 'none';
}
