import { describe, expect, it } from 'vitest';

import { getSelectionModifier } from "../../../src/lib/viewer/selection-shortcuts";

describe('getSelectionModifier', () => {
  it('uses replace selection by default', () => {
    expect(getSelectionModifier({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe('replace');
  });

  it('uses additive selection when shift is pressed', () => {
    expect(getSelectionModifier({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe('add');
  });

  it('uses subtractive selection when ctrl is pressed', () => {
    expect(getSelectionModifier({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe('subtract');
  });

  it('lets ctrl take precedence over shift', () => {
    expect(getSelectionModifier({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe('subtract');
  });
});
