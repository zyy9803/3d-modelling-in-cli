const POSITION_STRIDE = 9;

export function buildTriangleAdjacency(positionArray: ArrayLike<number>): Map<number, number[]> {
  const triangleCount = Math.floor(positionArray.length / POSITION_STRIDE);
  const adjacency = new Map<number, Set<number>>();
  const edgeOwners = new Map<string, number[]>();

  for (let triangleId = 0; triangleId < triangleCount; triangleId += 1) {
    adjacency.set(triangleId, new Set());

    const base = triangleId * POSITION_STRIDE;
    const vertices = [
      getVertexKey(positionArray, base),
      getVertexKey(positionArray, base + 3),
      getVertexKey(positionArray, base + 6),
    ];

    for (const edgeKey of getTriangleEdgeKeys(vertices)) {
      const owners = edgeOwners.get(edgeKey) ?? [];
      owners.push(triangleId);
      edgeOwners.set(edgeKey, owners);
    }
  }

  for (const owners of edgeOwners.values()) {
    if (owners.length < 2) {
      continue;
    }

    for (let index = 0; index < owners.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < owners.length; nextIndex += 1) {
        const left = owners[index];
        const right = owners[nextIndex];
        adjacency.get(left)?.add(right);
        adjacency.get(right)?.add(left);
      }
    }
  }

  return new Map(
    [...adjacency.entries()].map(([triangleId, neighbors]) => [
      triangleId,
      [...neighbors].sort((left, right) => left - right),
    ]),
  );
}

export function splitSelectionComponents(
  selected: Set<number>,
  adjacency: Map<number, number[]>,
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  const orderedSelection = [...selected].sort((left, right) => left - right);

  for (const triangleId of orderedSelection) {
    if (visited.has(triangleId)) {
      continue;
    }

    const component: number[] = [];
    const stack = [triangleId];
    visited.add(triangleId);

    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!selected.has(neighbor) || visited.has(neighbor)) {
          continue;
        }

        visited.add(neighbor);
        stack.push(neighbor);
      }
    }

    component.sort((left, right) => left - right);
    components.push(component);
  }

  return components;
}

function getTriangleEdgeKeys(vertices: [string, string, string] | string[]): string[] {
  return [
    getEdgeKey(vertices[0], vertices[1]),
    getEdgeKey(vertices[1], vertices[2]),
    getEdgeKey(vertices[2], vertices[0]),
  ];
}

function getEdgeKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function getVertexKey(positionArray: ArrayLike<number>, offset: number): string {
  return [
    normalizePosition(positionArray[offset]),
    normalizePosition(positionArray[offset + 1]),
    normalizePosition(positionArray[offset + 2]),
  ].join(',');
}

function normalizePosition(value: number): string {
  return value.toFixed(6);
}
