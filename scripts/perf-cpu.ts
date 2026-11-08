import type { CdpSession } from "./browser-lib";

/*
 * A CPU profile over a drive, read against the page's hitch log. The log names the handler a stalled
 * frame ran (a keydown, a frame callback); the profile says which functions inside it took the time.
 */

export interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}

export interface CpuProfile {
  nodes: CpuProfileNode[];
  /** Microseconds, on the clock `startedAtMs` was read against. */
  startTime: number;
  samples: number[];
  timeDeltas: number[];
}

/** Start sampling; returns the page clock (performance.now) at the start, for lining samples up with hitches. */
export async function startCpuProfile(session: CdpSession): Promise<number> {
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 500 });
  const before = (await session.evaluate<number>("performance.now()")) ?? 0;
  await session.send("Profiler.start");
  const after = (await session.evaluate<number>("performance.now()")) ?? before;
  return (before + after) / 2;
}

export async function stopCpuProfile(session: CdpSession): Promise<CpuProfile> {
  const result = await session.send("Profiler.stop");
  const profile = result["profile"] as CpuProfile | undefined;
  if (profile === undefined) throw new Error("drive: --cpu got no profile back from the page");
  return profile;
}

export interface ProfiledHitch {
  atS: number;
  ms: number;
  /** Functions by self time inside the hitch, most first. */
  top: { fn: string; at: string; ms: number }[];
  /** The game's and engine's own functions by time including what they called: which of ours drove it. */
  ours: { fn: string; at: string; ms: number }[];
}

/** Our source, not a dependency's: what `ours` lists. */
function isOurs(url: string): boolean {
  return /\/(packages|games)\//.test(url) && !url.includes("node_modules");
}

/**
 * For each hitch, the functions that ran longest (self time) inside it. `zeroMs` is the page clock
 * at the hitch log's zero and `startedAtMs` the page clock when sampling began.
 */
export function profileHitches(profile: CpuProfile, startedAtMs: number, zeroMs: number, hitches: { atS: number; ms: number }[], top = 6): ProfiledHitch[] {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  // Sample i's time on the page clock: the profile's own deltas from its start, which is `startedAtMs`.
  const times: number[] = [];
  let clock = 0;
  for (const delta of profile.timeDeltas) {
    clock += delta;
    times.push(startedAtMs + clock / 1000);
  }
  return hitches.map((hitch) => {
    const end = zeroMs + hitch.atS * 1000;
    const start = end - hitch.ms;
    const self = new Map<string, { fn: string; at: string; ms: number }>();
    const inclusive = new Map<string, { fn: string; at: string; ms: number }>();
    for (let i = 0; i < profile.samples.length; i += 1) {
      const at = times[i]!;
      if (at < start || at >= end) continue;
      const node = byId.get(profile.samples[i]!);
      if (node === undefined) continue;
      const frame = node.callFrame;
      if (frame.functionName === "(idle)" || frame.functionName === "(program)") continue;
      const next = times[i + 1] ?? at;
      const key = `${frame.functionName}|${frame.url}|${frame.lineNumber}`;
      const spent = Math.max(0, Math.min(next, end) - at);
      const entry = self.get(key) ?? { fn: frame.functionName || "(anonymous)", at: `${shortUrl(frame.url)}:${frame.lineNumber + 1}`, ms: 0 };
      entry.ms += spent;
      self.set(key, entry);
      // Each of our functions on the stack once, however deep it recursed.
      const counted = new Set<string>();
      for (let id: number | undefined = node.id; id !== undefined; id = parentOf.get(id)) {
        const call = byId.get(id)?.callFrame;
        if (call === undefined || !isOurs(call.url)) continue;
        const callKey = `${call.functionName}|${call.url}|${call.lineNumber}`;
        if (counted.has(callKey)) continue;
        counted.add(callKey);
        const mine = inclusive.get(callKey) ?? { fn: call.functionName || "(anonymous)", at: `${shortUrl(call.url)}:${call.lineNumber + 1}`, ms: 0 };
        mine.ms += spent;
        inclusive.set(callKey, mine);
      }
    }
    const rank = (entries: Iterable<{ fn: string; at: string; ms: number }>) => [...entries].sort((a, b) => b.ms - a.ms).slice(0, top).map((entry) => ({ ...entry, ms: Math.round(entry.ms * 10) / 10 }));
    return { atS: hitch.atS, ms: hitch.ms, top: rank(self.values()), ours: rank(inclusive.values()) };
  });
}

function shortUrl(url: string): string {
  if (url === "") return "(native)";
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
  return path.replace(/^.*\/node_modules\/\.bun\/[^/]+\/node_modules\//, "").replace(/^\/@fs\/.*?\/(packages|games)\//, "$1/");
}

export function renderProfiledHitches(profiled: ProfiledHitch[]): string {
  const lines = ["cpu: what ran longest in each hitch (self time)"];
  for (const hitch of profiled) {
    if (hitch.top.length === 0) continue;
    lines.push(`  ${hitch.atS.toFixed(2).padStart(6)} s ${hitch.ms.toFixed(1).padStart(6)} ms`);
    for (const entry of hitch.top) lines.push(`      ${entry.ms.toFixed(1).padStart(6)} ms  ${entry.fn}  ${entry.at}`);
    if (hitch.ours.length > 0) lines.push(`      ours, with what they called:`);
    for (const entry of hitch.ours) lines.push(`      ${entry.ms.toFixed(1).padStart(6)} ms  ${entry.fn}  ${entry.at}`);
  }
  return lines.join("\n");
}
