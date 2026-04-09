import { describe, expect, it } from 'vitest';

import { buildTriangleAdjacency, splitSelectionComponents } from './mesh-topology';

describe('buildTriangleAdjacency', () => {
  it('connects triangles that share an edge in non-indexed geometry', () => {
    const positions = [
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ];

    const adjacency = buildTriangleAdjacency(positions);

    expect(adjacency.get(0)).toEqual([1]);
    expect(adjacency.get(1)).toEqual([0]);
  });

  it('does not connect triangles that only touch at one vertex', () => {
    const positions = [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 1, 0,
      1, 1, 0,
      0, 2, 0,
    ];

    const adjacency = buildTriangleAdjacency(positions);

    expect(adjacency.get(0)).toEqual([]);
    expect(adjacency.get(1)).toEqual([]);
  });
});

describe('splitSelectionComponents', () => {
  it('splits selected triangles into connected components', () => {
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [0]],
      [2, []],
      [3, [4]],
      [4, [3]],
    ]);

    expect(splitSelectionComponents(new Set([0, 1, 2, 4, 3]), adjacency)).toEqual([
      [0, 1],
      [2],
      [3, 4],
    ]);
  });
});
