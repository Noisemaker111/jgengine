import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CdpSession } from "./browser-lib";
import { localGetJson } from "./localhostHttp";
import { readBreakdown } from "./perf-breakdown";
import { renderBreakdownText } from "../packages/core/src/devtools/frameBreakdown";

interface Target { type?: string; url?: string; webSocketDebuggerUrl?: string }

/** Select only an explicitly diagnostic local desktop page. @internal */
export function diagnosticDesktopTarget(targets: readonly Target[]): Target {
  const matching = targets.filter((target) => {
    if (target.type !== "page" || target.webSocketDebuggerUrl === undefined || target.url === undefined) return false;
    try { const url = new URL(target.url); return url.hostname === "tauri.localhost" && url.searchParams.get("telemetry") === "local"; } catch { return false; }
  });
  if (matching.length !== 1 || matching[0] === undefined) throw new Error(`expected one diagnostic desktop page, found ${matching.length}`);
  return matching[0];
}

async function main(argv: string[]): Promise<void> {
  const port = Number(argv[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || argv[1] !== "--out" || argv[2] === undefined || argv.length !== 3) throw new Error("usage: bun run perf desktop <debug-port> --out <file.json>");
  const targets = await localGetJson<Target[]>(`http://127.0.0.1:${port}/json/list`, 5_000);
  const target = diagnosticDesktopTarget(targets);
  if (target.webSocketDebuggerUrl === undefined) throw new Error("desktop debugger URL unavailable");
  const session = await CdpSession.connect(target.webSocketDebuggerUrl, 10_000);
  try {
    const breakdown = await readBreakdown(session);
    if (breakdown === null) throw new Error("desktop frame report unavailable; diagnostic telemetry has not started");
    const report = await session.evaluate<unknown>("globalThis.__JG?.report?.() ?? null");
    const build = await session.evaluate<unknown>(`fetch('./jgengine-build.json').then(r => r.ok ? r.json() : ({ error: 'build manifest HTTP ' + r.status })).catch(e => ({ error: String(e) }))`, { awaitPromise: true });
    const out = resolve(argv[2]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ at: Date.now(), target: target.url, build: build ?? { error: "build manifest unavailable" }, report: report ?? null, breakdown }, null, 2)}\n`);
    console.log(renderBreakdownText(breakdown, "desktop"));
    console.error(`perf: desktop report written to ${out}`);
  } finally { await session.close(); }
}

if (import.meta.main) await main(process.argv.slice(2)).catch((error: unknown) => { console.error(`perf desktop: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
