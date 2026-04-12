export function replaceSelection(
  _: Set<number>,
  next: Iterable<number>,
): Set<number> {
  return new Set(next);
}

export function addTriangles(
  current: Set<number>,
  next: Iterable<number>,
): Set<number> {
  return new Set([...current, ...next]);
}

export function removeTriangles(
  current: Set<number>,
  next: Iterable<number>,
): Set<number> {
  const result = new Set(current);

  for (const triangleId of next) {
    result.delete(triangleId);
  }

  return result;
}

export function clearSelection(): Set<number> {
  return new Set();
}
