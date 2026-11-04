// The harness half of the frame breakdown (`packages/core/src/devtools/frameBreakdown.ts`): drive a
// standard path while a window is measured, read the page's breakdown and name its frame callbacks
// by source line, and diff two records so one fix is one run.
import { cdpField, remoteObjectId, type CdpSession } from "./browser-lib";
import { type FrameBreakdownSummary, type NamedCost } from "../packages/core/src/devtools/frameBreakdown";
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
export async function readBreakdown(session: CdpSession): Promise<FrameBreakdownSummary | null> {
  const summary = await session.evaluate<FrameBreakdownSummary | null>(`globalThis.__jgFrameBreakdown?.summary({ top: 15 }) ?? null`);
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
        const located = await locateCallback(session, owner, scripts, maps);
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

async function locateCallback(session: CdpSession, label: string, scripts: ReadonlyMap<string, { url: string; map: string | null }>, maps: Map<string, SourceMap | null>): Promise<{ label: string; mapped: boolean } | null> {
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
  let map = maps.get(scriptId);
  if (map === undefined) {
    map = null;
    if (script.map !== null && script.map !== "") {
      try {
        const mapUrl = new URL(script.map, script.url).toString();
        if (!mapUrl.startsWith("data:") && new URL(mapUrl).origin !== new URL(script.url).origin) throw new Error("cross-origin source map");
        const raw = await session.evaluate<string>(`fetch(${JSON.stringify(mapUrl)}).then(r => { if (!r.ok) throw new Error('source map HTTP ' + r.status); return r.text(); })`, { awaitPromise: true });
        if (raw !== undefined) map = new SourceMap(JSON.parse(raw));
      } catch { /* Keep the generated location when a source map cannot be loaded. */ }
    }
    maps.set(scriptId, map);
  }
  const original = map?.findEntry(lineNumber, typeof columnNumber === "number" ? columnNumber : 0);
  const mapped = original?.originalSource !== undefined && original.originalLine !== undefined;
  const url = mapped ? new URL(original.originalSource, script.url).toString() : script.url;
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/^\/@fs\//, "").replace(/^.*?\/(packages|games|apps)\//, "$1/");
  return path === "" ? null : { label: `${mapped ? "" : "generated "}${path}:${mapped ? original.originalLine + 1 : lineNumber + 1}`, mapped };
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
