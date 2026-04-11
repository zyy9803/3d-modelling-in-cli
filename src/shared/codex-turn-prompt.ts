import type { EditJobContext, SessionMessageRequest, SelectionComponentPayload } from './codex-session-types.js';

export function buildCodexTurnPrompt(request: SessionMessageRequest): string {
  const selection = request.selectionContext;
  const view = request.viewContext;

  const lines = [
    'You are a senior 3D modeling expert specializing in STL mesh editing and triangle-based geometry workflows.',
    'This is a draft-only turn. You must first inspect and globally parse the active STL, then reason about selection context, and create or update a Python draft script for a possible mesh edit when appropriate.',
    'Do not run the draft script, do not write result.json, and do not generate or overwrite any STL files in this turn.',
    'If editJob paths are provided, read editJob.contextPath and inspect editJob.baseModelPath directly before making geometry claims or proposing edits.',
    'Read-only shell commands and one-off local Python inspection scripts are allowed in this turn only for STL parsing and geometry inspection. Do not install packages, do not modify the base STL, and do not write output STL files during inspection.',
    'Do not browse the internet or attempt network access. If exact external dimensions are required and are not already in the prompt or context, ask the user to provide them explicitly.',
    'Any draft script that you write must run with the local default Python interpreter using the standard library only. Do not depend on numpy, trimesh, scipy, pandas, shapely, mapbox_earcut, numpy-stl, or any other third-party package.',
    'If you cannot complete a reliable draft from the provided context alone, respond with a concise clarification request instead of continuing to explore.',
    'If the request is still exploratory or ambiguous, continue the discussion instead of forcing a draft.',
    'Use the model and selection context as the primary source of truth for geometry-focused requests.',
    selection.triangleIds.length === 0
      ? 'No triangles are selected in this turn. Treat the request as applying to the whole STL unless the user says otherwise.'
      : 'Selected triangles are provided below. Treat the request as scoped to that selection unless the user says otherwise.',
    `activeModelId: ${request.activeModelId ?? 'null'}`,
    `triangleCount: ${selection.triangleIds.length}`,
    `componentCount: ${selection.components.length}`,
    `dominantOrientation: ${view.dominantOrientation}`,
    `viewContext: ${formatViewContext(view)}`,
    `selectionContext: ${formatSelectionContext(selection)}`,
    `userInstruction: ${request.message.text}`,
  ];

  if (request.editJob) {
    lines.splice(3, 0, ...formatEditJobContext(request.editJob));
  }

  return lines.join('\n');
}

function formatViewContext(view: SessionMessageRequest['viewContext']): string {
  return `{"cameraPosition":${formatTuple(view.cameraPosition)},"target":${formatTuple(view.target)},"up":${formatTuple(view.up)},"fov":${formatNumber(view.fov)},"viewDirection":${formatTuple(view.viewDirection)},"dominantOrientation":${JSON.stringify(view.dominantOrientation)},"viewportSize":${formatTuple(view.viewportSize)}}`;
}

function formatEditJobContext(editJob: EditJobContext): string[] {
  return [
    `editJob.jobId: ${editJob.jobId}`,
    `editJob.workspacePath: ${editJob.workspacePath}`,
    `editJob.contextPath: ${editJob.contextPath}`,
    `editJob.baseModelPath: ${editJob.baseModelPath}`,
    `editJob.scriptPath: ${editJob.scriptPath}`,
  ];
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
