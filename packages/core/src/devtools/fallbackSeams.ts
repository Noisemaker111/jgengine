import { devtools } from "./devtools";

/**
 * Render seams that can resolve to a placeholder FALLBACK instead of authored content:
 * `ground` (default green terrain), `entity`/`object` (primitive capsule/box actors),
 * `scatter` (stylized proxy foliage).
 */
export type FallbackSeam = "ground" | "entity" | "object" | "scatter";

/**
 * Why a seam fell back: `omittedMapping` (no mapping supplied — often intended),
 * `unpulledPack` (a mapping was supplied but its asset pack is not pulled/indexed),
 * `noScene` (nothing authored — e.g. no environment component).
 */
export type FallbackCause = "omittedMapping" | "unpulledPack" | "noScene";

/** A per-seam, per-cause count table. Serializable, allocation-stable (keys never change). */
export type FallbackSeamCounts = Record<FallbackSeam, Record<FallbackCause, number>>;

/** Non-zero-only view of {@link FallbackSeamCounts} returned by {@link fallbackSeamsSnapshot}. */
export type FallbackSeamsReport = Partial<Record<FallbackSeam, Partial<Record<FallbackCause, number>>>>;

const SEAMS: readonly FallbackSeam[] = ["ground", "entity", "object", "scatter"];
const CAUSES: readonly FallbackCause[] = ["omittedMapping", "unpulledPack", "noScene"];

function freshCounts(): FallbackSeamCounts {
  const out = {} as FallbackSeamCounts;
  for (const seam of SEAMS) {
    const row = {} as Record<FallbackCause, number>;
    for (const cause of CAUSES) row[cause] = 0;
    out[seam] = row;
  }
  return out;
}

// Module-private state. `counts` is the authoritative live tally; report sites write into it directly
// and each re-zeros its own seam before re-tallying (see the frame-boundary note in reportFallbackSeam).
// Pre-allocated tables so the report/begin/end hot paths do zero allocation.
let enabled = false;
const counts = freshCounts();
let lastSignature = "";

function zeroSeam(seam: FallbackSeam): void {
  const row = counts[seam];
  for (const cause of CAUSES) row[cause] = 0;
}

/**
 * Arm or disarm the fallback-seam diagnostic. Off by default; the shell arms it only when devtools
 * is enabled (dev builds), so production is a pure no-op. Toggling clears all counts so a fresh
 * observation starts empty and the opt-out path reports nothing.
 * @capability render-fallback-diagnostics Enable/disable the dev-only placeholder-fallback probe.
 */
export function armFallbackSeams(on: boolean): void {
  enabled = on;
  for (const seam of SEAMS) zeroSeam(seam);
  lastSignature = "";
}

/**
 * Record that a render seam CHOSE a placeholder fallback (called at the choice site). A pure,
 * allocation-free no-op when disarmed — the disarmed guard returns before touching any table.
 *
 * Frame-boundary model: rather than a per-frame reset (which would flicker to empty on the many
 * frames with no React re-render), each producing seam calls {@link beginFallbackSeam} at the top of
 * its own render/compute, then reports during that same synchronous pass. This is idempotent under
 * React StrictMode / concurrent double-render and keeps seams that re-render independently (entities
 * vs. scatter vs. ground) from clobbering one another. {@link endFallbackPass} only emits the log.
 * @capability render-fallback-diagnostics Report a seam resolving to a placeholder fallback.
 */
export function reportFallbackSeam(seam: FallbackSeam, cause: FallbackCause): void {
  if (!enabled) return;
  counts[seam][cause] += 1;
}

/** Zero one seam's tally before it re-reports (per-seam frame boundary). No-op when disarmed. */
export function beginFallbackSeam(seam: FallbackSeam): void {
  if (!enabled) return;
  zeroSeam(seam);
}

/** Zero every seam's tally. Used to bracket a whole observation batch (e.g. in tests). No-op when disarmed. */
export function beginFallbackPass(): void {
  if (!enabled) return;
  for (const seam of SEAMS) zeroSeam(seam);
}

function signature(): string {
  let sig = "";
  for (const seam of SEAMS) {
    for (const cause of CAUSES) {
      const n = counts[seam][cause];
      if (n > 0) sig += `${seam}:${cause}=${n}|`;
    }
  }
  return sig;
}

/**
 * Close an observation pass: when the set of active fallbacks changes to a non-empty signature, emit
 * ONE deduped warn line (never per-frame — the signature dedup suppresses repeats). No-op when disarmed.
 */
export function endFallbackPass(): void {
  if (!enabled) return;
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;
  if (sig === "") return;
  devtools.logs.push(
    "warn",
    `[jgengine] render seams resolved to placeholder fallbacks — ${sig.replace(/\|$/, "").replaceAll("|", ", ")}. ` +
      `Author the missing mapping/pack/scene, or ignore if the placeholder is intended.`,
  );
}

/**
 * Snapshot the current fallback tally as a compact, serializable object (non-zero entries only; empty
 * when nothing fell back). Flows into the devtools `fallbacks` probe and the `debug_snapshot` RPC.
 * @capability render-fallback-diagnostics Read authored-vs-placeholder fallback counts per seam.
 */
export function fallbackSeamsSnapshot(): FallbackSeamsReport {
  const out: FallbackSeamsReport = {};
  for (const seam of SEAMS) {
    let row: Partial<Record<FallbackCause, number>> | undefined;
    for (const cause of CAUSES) {
      const n = counts[seam][cause];
      if (n > 0) (row ??= {})[cause] = n;
    }
    if (row !== undefined) out[seam] = row;
  }
  return out;
}
