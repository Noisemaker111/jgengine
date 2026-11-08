// The harness half of the frame breakdown (`packages/core/src/devtools/frameBreakdown.ts`): drive a
// standard path while a window is measured, read the page's breakdown and name its frame callbacks
// by source line, and diff two records so one fix is one run.
import { cdpField, remoteObjectId, type CdpSession } from "./browser-lib";
import { type FrameBreakdownSummary, type HitchSession, type NamedCost } from "../packages/core/src/devtools/frameBreakdown";
import { SourceMap } from "node:module";

/** How the run moves through the game while it is measured. */
export type PerfPath = "walk" | "still";

/**
 * Hold forward and weave left and right, so the camera sweeps new ground the way a player's would:
 * culling, streaming and shadows all move. Returns the call that releases every key.
 */
export async function startPath(session: CdpSession, path: PerfPath): Promise<() => Promise<void>> {
  if (path === "still") return async () => {};
  await session.evaluate(`(() => { if (document.activeElement !== document.body && document.activeElement !== null) return; const surface = document.querySelector('[data-jg-play-surface]'); if (surface instanceof HTMLElement) surface.focus({ preventScroll: true }); })()`);
  const key = (type: "keyDown" | "keyUp", code: string, text: string) =>
    session.send("Input.dispatchKeyEvent", { type, code, key: text, windowsVirtualKeyCode: text.toUpperCase().charCodeAt(0) });
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 960, y: 540 });
  await key("keyDown", "KeyW", "w");
  let side: "KeyA" | "KeyD" = "KeyA";
  let held = false;
  const weave = setInterval(() => {
    void (async () => {
      if (held) await key("keyUp", side, side === "KeyA" ? "a" : "d");
      side = side === "KeyA" ? "KeyD" : "KeyA";
      await key("keyDown", side, side === "KeyA" ? "a" : "d");
      held = true;
    })().catch(() => {});
  }, 1500);
  return async () => {
    clearInterval(weave);
    await key("keyUp", "KeyW", "w").catch(() => {});
    if (held) await key("keyUp", side, side === "KeyA" ? "a" : "d").catch(() => {});
  };
}

/** Start the page's breakdown window over. False when the page has none (no dev telemetry). */
export async function resetBreakdown(session: CdpSession): Promise<boolean> {
  return (await session.evaluate<boolean>(`(() => { const b = globalThis.__jgFrameBreakdown; if (!b) return false; b.reset(); return true; })()`)) === true;
}

/**
 * Read the page's breakdown and give each `frame#<n>` callback its source (`frame#3 src/scene/Water.draw.tsx:41`),
 * read from the function's own location through the debugger, since an r3f callback has no name.
 */
export async function readBreakdown(session: CdpSession, privateMap?: (scriptId: string) => Promise<string | null>, top = 15): Promise<FrameBreakdownSummary | null> {
  const summary = await session.evaluate<FrameBreakdownSummary | null>(`globalThis.__jgFrameBreakdown?.summary({ top: ${Math.max(1, Math.floor(top))} }) ?? null`);
  if (summary === null || summary === undefined) return null;
  const scripts = new Map<string, { url: string; map: string | null }>();
  const maps = new Map<string, SourceMap | null>();
  const names = new Map<string, string>();
  const resolvedOwners = new Set<string>();
  let failure: string | undefined;
  const off = session.on("Debugger.scriptParsed", (params) => {
    scripts.set(String(params["scriptId"]), { url: String(params["url"]), map: typeof params["sourceMapURL"] === "string" ? params["sourceMapURL"] : null });
  });
  try {
    await session.send("Debugger.enable");
    for (const entry of [...summary.cpu, ...(summary.calls ?? [])]) {
      if (!entry.name.startsWith("frame#")) continue;
      const [owner, ...detail] = entry.name.split(" | ");
      if (owner === undefined) continue;
      let resolved = names.get(owner);
      if (resolved === undefined) {
        let located: { label: string; mapped: boolean } | null = null;
        try { located = await locateCallback(session, owner, scripts, maps, privateMap); }
        catch (error) { failure ??= error instanceof Error ? error.message : String(error); }
        resolved = located === null ? owner : `${owner} ${located.label}`;
        if (located?.mapped === true) resolvedOwners.add(owner);
        names.set(owner, resolved);
      }
      entry.name = detail.length === 0 ? resolved : `${resolved} | ${detail.join(" | ")}`;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    off();
    await session.send("Debugger.disable").catch(() => {});
  }
  const owners = new Set([...summary.cpu, ...(summary.calls ?? [])].map((entry) => entry.name.split(" | ")[0]?.split(" ")[0]).filter((name): name is string => name?.startsWith("frame#") === true));
  let resolved = 0;
  for (const owner of owners) if (resolvedOwners.has(owner)) resolved += 1;
  summary.sources = { resolved, unresolved: owners.size - resolved, ...(failure === undefined ? {} : { error: failure }) };
  return summary;
}

async function locateCallback(session: CdpSession, label: string, scripts: ReadonlyMap<string, { url: string; map: string | null }>, maps: Map<string, SourceMap | null>, privateMap?: (scriptId: string) => Promise<string | null>): Promise<{ label: string; mapped: boolean } | null> {
  const found = await session.send("Runtime.evaluate", { expression: `globalThis.__jgFrameBreakdown?.callbacks()[${JSON.stringify(label)}]` });
  const objectId = remoteObjectId(found["result"]);
  if (objectId === undefined) return null;
  const props = await session.send("Runtime.getProperties", { objectId, ownProperties: false });
  const internal: unknown = props["internalProperties"];
  const entries: readonly unknown[] = Array.isArray(internal) ? internal : [];
  const location = entries.find((prop) => cdpField(prop, "name") === "[[FunctionLocation]]");
  const where = cdpField(cdpField(location, "value"), "value");
  await session.send("Runtime.releaseObject", { objectId }).catch(() => {});
  const scriptId = cdpField(where, "scriptId");
  const lineNumber = cdpField(where, "lineNumber");
  const columnNumber = cdpField(where, "columnNumber");
  if (typeof scriptId !== "string" || typeof lineNumber !== "number") return null;
  const script = scripts.get(scriptId);
  if (script === undefined || script.url === "") return null;
  const map = await scriptMap(session, scriptId, script, maps, privateMap);
  const original = map?.findEntry(lineNumber, typeof columnNumber === "number" ? columnNumber : 0);
  const source = original !== undefined && "originalSource" in original && typeof original.originalSource === "string" ? original.originalSource : undefined;
  const sourceLine = original !== undefined && "originalLine" in original && typeof original.originalLine === "number" ? original.originalLine : undefined;
  const mapped = source !== undefined && sourceLine !== undefined;
  const url = mapped ? new URL(source, script.url).toString() : script.url;
  const path = repoPath(url);
  return path === "" ? null : { label: `${mapped ? "" : "generated "}${path}:${mapped ? sourceLine + 1 : lineNumber + 1}`, mapped };
}

/** The source map of one parsed script: the desktop's private maps, or the page's own same-origin map; null when neither loads. */
async function scriptMap(session: CdpSession, scriptId: string, script: { url: string; map: string | null }, maps: Map<string, SourceMap | null>, privateMap?: (scriptId: string) => Promise<string | null>): Promise<SourceMap | null> {
  let map = maps.get(scriptId);
  if (map !== undefined) return map;
  map = null;
  if (privateMap !== undefined) {
    const raw = await privateMap(scriptId);
    if (raw !== null) map = new SourceMap(JSON.parse(raw));
  } else if (script.map !== null && script.map !== "") {
    try {
      const mapUrl = new URL(script.map, script.url).toString();
      if (!mapUrl.startsWith("data:") && new URL(mapUrl).origin !== new URL(script.url).origin) throw new Error("cross-origin source map");
      const raw = await session.evaluate<string>(`fetch(${JSON.stringify(mapUrl)}).then(r => { if (!r.ok) throw new Error('source map HTTP ' + r.status); return r.text(); })`, { awaitPromise: true });
      if (raw !== undefined) map = new SourceMap(JSON.parse(raw));
    } catch { /* Keep the generated location when a source map cannot be loaded. */ }
  }
  maps.set(scriptId, map);
  return map;
}

/** A served path as the repo names it: `games/deepward/src/game/ui/GameUI.tsx`. */
function repoPath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/^\/@fs\//, "").replace(/^.*?\/(packages|games|apps|node_modules)\//, "$1/");
}

/**
 * Read every hitch of the page's play session (`__jgFrameBreakdown.session()`), with each script the
 * browser ran in a hitch rewritten from `function bundle.js:char` to its source line. Null when the
 * page has no breakdown.
 */
export async function readHitchSession(session: CdpSession, privateMap?: (scriptId: string) => Promise<string | null>): Promise<HitchSession | null> {
  const read = await session.evaluate<HitchSession | null>(`globalThis.__jgFrameBreakdown?.session?.() ?? null`);
  if (read === null || read === undefined) return null;
  const scripts = new Map<string, { url: string; map: string | null }>();
  const byUrl = new Map<string, string>();
  const maps = new Map<string, SourceMap | null>();
  const texts = new Map<string, string>();
  const off = session.on("Debugger.scriptParsed", (params) => {
    const id = String(params["scriptId"]);
    const url = String(params["url"]);
    scripts.set(id, { url, map: typeof params["sourceMapURL"] === "string" ? params["sourceMapURL"] : null });
    if (url !== "") byUrl.set(url, id);
  });
  const resolved = new Map<string, string>();
  try {
    await session.send("Debugger.enable");
    for (const hitch of read.hitches) {
      for (const script of hitch.scripts ?? []) {
        const known = resolved.get(script.source);
        if (known !== undefined) { script.source = known; continue; }
        const match = /^(.*) (\S+):(-?\d+)$/.exec(script.source);
        let label = script.source;
        const id = match === null ? undefined : byUrl.get(match[2] ?? "");
        const meta = id === undefined ? undefined : scripts.get(id);
        if (match !== null && id !== undefined && meta !== undefined && Number(match[3]) >= 0) {
          let text = texts.get(id);
          if (text === undefined) {
            const got = await session.send("Debugger.getScriptSource", { scriptId: id });
            text = typeof got["scriptSource"] === "string" ? got["scriptSource"] : "";
            texts.set(id, text);
          }
          const char = Number(match[3]);
          const before = text.slice(0, char);
          const line = before.split("\n").length - 1;
          const column = char - (before.lastIndexOf("\n") + 1);
          const map = await scriptMap(session, id, meta, maps, privateMap);
          const original = map?.findEntry(line, column);
          const source = original !== undefined && "originalSource" in original && typeof original.originalSource === "string" ? original.originalSource : undefined;
          const sourceLine = original !== undefined && "originalLine" in original && typeof original.originalLine === "number" ? original.originalLine : undefined;
          const name = original !== undefined && "name" in original && typeof original.name === "string" && original.name !== "" ? original.name : match[1];
          label = source !== undefined && sourceLine !== undefined
            ? `${name} ${repoPath(new URL(source, meta.url).toString())}:${sourceLine + 1}`
            : `${match[1]} ${repoPath(meta.url)}:${line + 1}:${column + 1}`;
        }
        resolved.set(script.source, label);
        script.source = label;
      }
      const first = hitch.scripts?.[0];
      if (hitch.cause === "script" && first !== undefined) hitch.detail = `${first.invoker} ${first.source} ${first.ms} ms${first.layoutMs >= 1 ? ` (forced layout ${first.layoutMs} ms)` : ""}`;
    }
  } finally {
    off();
    await session.send("Debugger.disable").catch(() => {});
  }
  return read;
}

/** The session's hitches for a person: count, worst, and each with its cause and the scripts in it. */
export function renderHitchSession(read: HitchSession, title: string): string {
  // A stall behind a travel card or a full-screen cover froze that, not the game: counted apart.
  const seen = read.hitches.filter((hitch) => hitch.covered === undefined);
  const covered = read.hitches.length - seen.length;
  const worst = seen.reduce((max, hitch) => Math.max(max, hitch.ms), 0);
  const byCause = new Map<string, number>();
  for (const hitch of seen) byCause.set(hitch.cause, (byCause.get(hitch.cause) ?? 0) + 1);
  const coveredWorst = read.hitches.reduce((max, hitch) => (hitch.covered === undefined ? max : Math.max(max, hitch.ms)), 0);
  return [
    `${title}: ${read.frames} frames over ${read.seconds} s, gc ~${read.gcMb} MB`,
    seen.length === 0 ? "hitches the player saw: none over 33 ms" : `hitches the player saw over 33 ms: ${seen.length}${read.dropped > 0 ? ` (+${read.dropped} past the log)` : ""}, worst ${worst} ms; by cause: ${[...byCause].map(([cause, n]) => `${cause} ${n}`).join(", ")}`,
    ...(covered === 0 ? [] : [`behind a travel card or cover: ${covered}, worst ${coveredWorst} ms`]),
    ...read.hitches.map((hitch) => [
      `  ${hitch.atS.toFixed(2).padStart(7)} s ${hitch.ms.toFixed(1).padStart(7)} ms  ${hitch.covered === undefined ? "" : `[${hitch.covered}] `}${hitch.cause}: ${hitch.detail}`,
      ...(hitch.scripts ?? []).slice(0, 3).map((script) => `             ${script.ms.toFixed(1).padStart(6)} ms ${script.invoker} ${script.source}${script.layoutMs >= 1 ? ` (layout ${script.layoutMs})` : ""}`),
    ].join("\n")),
  ].join("\n");
}

/** A cost's system: its `frame#<n>` or system label, without the source location appended to it. */
function systemOf(name: string): string {
  return name.split(" ", 1)[0] ?? name;
}

const signed = (value: number, digits = 2) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

function costRows(title: string, before: readonly NamedCost[], after: readonly NamedCost[], top: number): string[] {
  const base = new Map(before.map((entry) => [systemOf(entry.name), entry]));
  const rows = after.slice(0, top).map((entry) => {
    const was = base.get(systemOf(entry.name));
    return `  ${entry.name.padEnd(48)} ${entry.avgMs.toFixed(2).padStart(7)} (${was === undefined ? "new" : signed(entry.avgMs - was.avgMs)})`;
  });
  return rows.length === 0 ? [] : [title, ...rows];
}

/** A before/after table of two breakdowns: frame spread, CPU and GPU cost, counts, and the top systems. */
export function compareBreakdowns(before: FrameBreakdownSummary, after: FrameBreakdownSummary): string {
  const line = (name: string, a: number, b: number, unit = "ms") =>
    `  ${name.padEnd(14)} ${a.toFixed(2).padStart(9)} -> ${b.toFixed(2).padStart(9)} ${unit}  (${signed(b - a)}, ${a > 0 ? signed(((b - a) / a) * 100, 0) : "n/a"}%)`;
  const cost = (summary: FrameBreakdownSummary, key: "p50" | "p95") => Math.max(summary.work[key], summary.gpu?.[key] ?? 0);
  return [
    "compare (before -> after):",
    line("frame p50", before.frame.p50, after.frame.p50),
    line("frame p95", before.frame.p95, after.frame.p95),
    line("frame p99", before.frame.p99, after.frame.p99),
    line("cpu p50", before.work.p50, after.work.p50),
    line("cpu p95", before.work.p95, after.work.p95),
    before.gpu === null || after.gpu === null ? "  gpu            unavailable in one or both runs" : line("gpu p50", before.gpu.p50, after.gpu.p50),
    before.gpu === null || after.gpu === null ? "  gpu p95        unavailable in one or both runs" : line("gpu p95", before.gpu.p95, after.gpu.p95),
    before.gpu === null || after.gpu === null ? "  cost p50       unavailable without GPU timings" : line("max cpu/gpu p50", cost(before, "p50"), cost(after, "p50")),
    line("draws", before.counts.drawsAvg, after.counts.drawsAvg, ""),
    line("triangles", before.counts.trianglesAvg, after.counts.trianglesAvg, ""),
    `  hitches       ${before.hitches.length} -> ${after.hitches.length}`,
    ...costRows("cpu by system (avg ms, change):", before.cpu, after.cpu, 8),
    ...costRows("gpu by pass (avg ms, change):", before.passes, after.passes, 8),
  ].join("\n");
}
