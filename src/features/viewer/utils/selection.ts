import type { ViewportSelectionSummary } from "../../../lib/viewer";

export const EMPTY_SELECTION_SUMMARY: ViewportSelectionSummary = {
  triangleCount: 0,
  componentCount: 0,
  mode: "click",
};

export function formatSelectionStatus(
  summary: ViewportSelectionSummary,
): string {
  return `已选 ${summary.triangleCount} 个三角面 | ${summary.componentCount} 个连通块`;
}
