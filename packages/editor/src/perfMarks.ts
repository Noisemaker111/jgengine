/** Editor-authoring cost the {@link PerfProbe} folds into its sample, separate from frame/sim cost. */
export type PerfMarkKind = "raycast" | "rebuild";

/** Rolling averages (ms) of the authoring marks recorded since the last flush. */
export interface PerfMarkSummary {
  raycastMs: number;
  rebuildMs: number;
  authoringMs: number;
}

/**
 * Accumulates editor-authoring timings (viewport raycasts, preview-mesh rebuilds) and flushes them
 * as rolling averages — so the perf probe can report authoring cost apart from frame/sim cost, and
 * "the editor feels laggy" resolves to a number instead of a guess.
 */
export interface PerfAccumulator {
  record(kind: PerfMarkKind, ms: number): void;
  /** Average ms per mark since the last flush, then reset the window. */
  flush(): PerfMarkSummary;
}

/**
 * Creates an isolated authoring-perf accumulator.
 * @internal — the editor's `PerfProbe` folds `editorPerfMarks` into the perf sample; not game-facing.
 */
export function createPerfAccumulator(): PerfAccumulator {
  let raycastSum = 0;
  let raycastCount = 0;
  let rebuildSum = 0;
  let rebuildCount = 0;
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    record(kind, ms) {
      if (!Number.isFinite(ms) || ms < 0) return;
      if (kind === "raycast") {
        raycastSum += ms;
        raycastCount += 1;
      } else {
        rebuildSum += ms;
        rebuildCount += 1;
      }
    },
    flush() {
      const raycastMs = raycastCount === 0 ? 0 : round(raycastSum / raycastCount);
      const rebuildMs = rebuildCount === 0 ? 0 : round(rebuildSum / rebuildCount);
      raycastSum = 0;
      raycastCount = 0;
      rebuildSum = 0;
      rebuildCount = 0;
      return { raycastMs, rebuildMs, authoringMs: round(raycastMs + rebuildMs) };
    },
  };
}

/** Shared accumulator the sculpt/paint layer records into and the perf probe flushes each window. */
export const editorPerfMarks: PerfAccumulator = createPerfAccumulator();
