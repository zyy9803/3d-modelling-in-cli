import { describe, expect, it } from 'vitest';

import {
  addTriangles,
  clearSelection,
  removeTriangles,
  replaceSelection,
} from './selection-manager';

describe('selection-manager', () => {
  it('replaces the current selection', () => {
    expect(replaceSelection(new Set([1, 2]), [8, 9])).toEqual(new Set([8, 9]));
  });

  it('adds triangles to the current selection', () => {
    expect(addTriangles(new Set([1, 2]), [2, 3])).toEqual(new Set([1, 2, 3]));
  });

  it('removes triangles from the current selection', () => {
    expect(removeTriangles(new Set([1, 2, 3]), [2])).toEqual(new Set([1, 3]));
  });

  it('clears the current selection', () => {
    expect(clearSelection()).toEqual(new Set());
  });
});
