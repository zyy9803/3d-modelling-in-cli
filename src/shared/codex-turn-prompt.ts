import type { SessionMessageRequest } from './codex-session-types';

export function buildCodexTurnPrompt(request: SessionMessageRequest): string {
  const selection = request.selectionContext;
  const view = request.viewContext;

  return [
    'Phase 3A conversation only. Do not claim that any STL or mesh edit has been executed.',
    `activeModelId: ${request.activeModelId ?? 'null'}`,
    `triangleCount: ${selection.triangleIds.length}`,
    `componentCount: ${selection.components.length}`,
    `dominantOrientation: ${view.dominantOrientation}`,
    `viewContext: ${JSON.stringify(view)}`,
    `selectionContext: ${JSON.stringify(selection)}`,
    `userInstruction: ${request.message.text}`,
  ].join('\n');
}
