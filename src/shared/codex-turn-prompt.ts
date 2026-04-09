import type {
  SelectionContextPayload,
  ViewContextPayload,
} from './codex-session-types';

export type CodexTurnPromptInput = {
  activeModelId: string;
  selectionContext: SelectionContextPayload;
  viewContext: ViewContextPayload;
  userText: string;
};

export function buildCodexTurnPrompt(input: CodexTurnPromptInput): string {
  return [
    'Phase 3A conversation only.',
    'No STL or mesh edit has been executed.',
    `Active model ID: ${input.activeModelId}`,
    '',
    'Selection context:',
    stableStringify(input.selectionContext),
    '',
    'View context:',
    stableStringify(input.viewContext),
    '',
    'User text:',
    input.userText,
  ].join('\n');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return Object.fromEntries(sortedEntries.map(([key, entry]) => [key, sortValue(entry)]));
  }

  return value;
}
