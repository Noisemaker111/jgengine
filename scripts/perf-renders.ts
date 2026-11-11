// The harness half of the render counter (`packages/core/src/devtools/renderCounter.ts`): ship it to
// a page ahead of its scripts, then read which components rendered while the game played.
import type { CdpSession } from "./browser-lib";
import { installRenderCounter, type RenderCounts } from "../packages/core/src/devtools/renderCounter";

/** The counter as a page script; it must run before the page's own scripts load the UI runtime. */
export const RENDER_COUNTER_SCRIPT = `(${installRenderCounter.toString()})(globalThis);`;

/** Install the counter for every document this session opens from now on. */
export async function installPageRenderCounter(session: CdpSession): Promise<void> {
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: RENDER_COUNTER_SCRIPT });
}

/** Start the count over; false when the page has no counter (React DevTools' own hook was there first). */
/** The game's simulation tick through the agent bridge, or null on a page without one. */
const SIM_TICK = `(globalThis.__jgengineAgent?.handle({ method: "scene_counts" })?.tick ?? null)`;

export async function resetRenderCounter(session: CdpSession): Promise<boolean> {
  return (await session.evaluate<boolean>(`(() => { const r = globalThis.__jgRenders; if (!r) return false; r.reset(); globalThis.__jgRenderTickFrom = ${SIM_TICK}; return true; })()`)) === true;
}

/** The counts plus the simulation ticks the run covered (null when the page has no agent bridge). */
export interface RunRenderCounts extends RenderCounts {
  ticks: number | null;
}

export async function readRenderCounts(session: CdpSession): Promise<RunRenderCounts | null> {
  return (await session.evaluate<RunRenderCounts | null>(`(() => {
    const counts = globalThis.__jgRenders?.read();
    if (!counts) return null;
    const from = globalThis.__jgRenderTickFrom, now = ${SIM_TICK};
    return { ...counts, ticks: typeof from === "number" && typeof now === "number" ? now - from : null };
  })()`)) ?? null;
}

/** The busiest components for a person: commits per second and per frame, then each component's renders. */
export function renderRenderCounts(counts: RunRenderCounts, title: string, top = 20): string {
  const frames = Math.max(counts.frames, 1);
  const perTick = counts.ticks === null || counts.ticks <= 0 ? "" : `, ${counts.ticks} ticks: ${(counts.commits / counts.ticks).toFixed(2)} commits/tick, ${(counts.renders / counts.ticks).toFixed(1)} renders/tick`;
  return [
    `${title}: ${counts.commits} UI commits and ${counts.renders} component renders over ${counts.seconds} s and ${counts.frames} frames (${Math.round((counts.commits / Math.max(counts.seconds, 0.001)) * 10) / 10} commits/s, ${(counts.commits / frames).toFixed(2)} commits/frame, ${(counts.renders / frames).toFixed(1)} renders/frame${perTick})`,
    ...counts.components.slice(0, top).map((entry) => `  ${entry.name.padEnd(36)} ${String(entry.renders).padStart(7)}  ${entry.perSecond.toFixed(1).padStart(7)}/s  ${entry.perFrame.toFixed(2).padStart(6)}/frame`),
  ].join("\n");
}
