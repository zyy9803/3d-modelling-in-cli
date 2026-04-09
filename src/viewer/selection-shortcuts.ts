export type SelectionModifier = 'replace' | 'add' | 'subtract';

export type SelectionShortcutState = {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export function getSelectionModifier(state: SelectionShortcutState): SelectionModifier {
  if (state.ctrlKey || state.metaKey) {
    return 'subtract';
  }

  if (state.shiftKey) {
    return 'add';
  }

  return 'replace';
}
