/** Toolbar perf-pill health, separating an idle render-on-demand loop from a genuinely slow frame. */
export type EditorPerfTone = "idle" | "healthy" | "busy";

/**
 * FPS at or below which an *actively rendering* editor frame is treated as struggling.
 * Only applied when the loop is active — an idle / browser-throttled loop never trips it.
 */
export const EDITOR_PERF_LOW_FPS = 30;

/**
 * Classify a perf sample for the toolbar pill. The editor renders `frameloop="always"`, so a
 * healthy visible loop sits at ~60fps; a low wall-clock fps only appears when the browser throttles
 * rAF (backgrounded tab / headless screenshot) while nothing is happening. `PerfProbe` measures
 * that idleness (no camera move, no raycast/rebuild, no scene change) and reports it as `active:false`,
 * which classifies here as `"idle"` instead of the red danger cue. The danger cue (`"busy"`) is
 * reserved for sustained low fps while the loop is genuinely active (orbit / drag / sculpt) — the
 * regression actually worth surfacing.
 * @internal — drives the editor toolbar perf pill; not game-facing.
 */
export function classifyEditorPerf(sample: { fps: number; active: boolean }): EditorPerfTone {
  if (!sample.active) return "idle";
  return sample.fps < EDITOR_PERF_LOW_FPS ? "busy" : "healthy";
}
