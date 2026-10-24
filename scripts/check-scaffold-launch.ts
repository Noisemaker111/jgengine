/**
 * One launch/retry path, for the engine and for every project `jgengine create` scaffolds.
 *
 * `scripts/browser-lib.ts` owns the engine's copy. A scaffolded project gets standalone files
 * and cannot import repo scripts, so `packages/jgengine/src/templates/browserLaunch.ts` owns
 * one canonical block that `gameFiles.ts` embeds in `scripts/browser.mjs`. This check fails
 * when the two copies drift apart, names both files, and shows the first differing line:
 *
 *   - the block the scaffold ships must be the canonical block, byte for byte;
 *   - the scaffold's `shoot`/`drive` must launch through `startBrowser`, not their own wait;
 *   - both `startBrowser` copies must report the same step, the same two log lines and the
 *     same failure text for the same scripted failures (#2131's hung first attempt);
 *   - neither copy may reach the debugger with `fetch`: Bun sends 127.0.0.1 through
 *     `HTTP_PROXY`, so the handshake is also run with a dead proxy set and must still work.
 *
 *   bun run check:scaffold-launch
 *
 * Exit 0 agree, 1 drift.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

import { gameTemplate } from "../packages/jgengine/src/templates";
import {
  BROWSER_LAUNCH_BLOCK,
  LAUNCH_BLOCK_END,
  LAUNCH_BLOCK_START,
} from "../packages/jgengine/src/templates/browserLaunch";
import { startBrowser as engineStartBrowser } from "./browser-lib";

const ENGINE_FILE = "scripts/browser-lib.ts";
const SOURCE_FILE = "packages/jgengine/src/templates/browserLaunch.ts";
const TEMPLATE_FILE = "packages/jgengine/src/templates/gameFiles.ts";

interface ScenarioResult {
  logs: string[];
  /** `ok:<attempts>` when the launch recovered, `error:<message>` when it gave up. */
  outcome: string;
  /** The step the failure named, when it failed. */
  step?: string;
}

interface Implementation {
  startBrowser: (options: Record<string, unknown>) => Promise<{ attempts: number }>;
}

function fail(message: string): never {
  console.error(`check-scaffold-launch: ${message}`);
  process.exit(1);
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Replace the values that legitimately differ between two runs of the same scenario. */
function normalize(line: string): string {
  return line
    .replace(/\d+ms/g, "<ms>")
    .replace(/:\d+/g, ":<port>")
    .replace(/\/tmp\/jg-parity-\d+/g, "<profile>");
}

function scaffoldFiles(): Map<string, string> {
  const files = gameTemplate({
    id: "launch-probe",
    name: "Launch Probe",
    variant: "standalone",
    engineVersion: "0.0.0",
    cliVersion: "0.0.0",
  });
  return new Map(files.map((file) => [file.path, file.contents]));
}

async function loadScaffold(browserMjs: string): Promise<Implementation> {
  const encoded = Buffer.from(browserMjs, "utf8").toString("base64");
  return (await import(`data:text/javascript;base64,${encoded}`)) as Implementation;
}

function slowDebugger(answerAfterMs: number): Promise<{ port: number; stop: () => Promise<void> }> {
  const startedAt = Date.now();
  const server: Server = createServer((request, response) => {
    if (request.url !== "/json/version" || Date.now() - startedAt < answerAfterMs) {
      response.writeHead(503);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/jg-parity" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("no debugger port");
      resolve({
        port: address.port,
        stop: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** A launched browser stand-in: no pid, no binding, one profile per attempt. */
function fakeLaunch(profiles: string[]): (port: number, prefix?: string) => Record<string, unknown> {
  return () => {
    const userDataDir = `/tmp/jg-parity-${profiles.length + 1}`;
    profiles.push(userDataDir);
    return { pid: undefined, userDataDir, exitCode: null, kill: () => {} };
  };
}

async function run(
  implementation: Implementation,
  options: Record<string, unknown>,
): Promise<ScenarioResult> {
  const logs: string[] = [];
  try {
    const started = await implementation.startBrowser({ ...options, log: (line: string) => logs.push(line) });
    return { logs, outcome: `ok:${started.attempts}` };
  } catch (error) {
    const failure = error as { message?: string; step?: string };
    const logsFirst = logs.map(normalize);
    return { logs: logsFirst, outcome: `error:${normalize(failure.message ?? String(error))}`, step: failure.step };
  }
}

function compare(name: string, engine: ScenarioResult, scaffold: ScenarioResult): string[] {
  const problems: string[] = [];
  if (engine.outcome !== scaffold.outcome) {
    problems.push(
      `${name}: outcome differs\n  ${ENGINE_FILE}: ${engine.outcome}\n  ${SOURCE_FILE}: ${scaffold.outcome}`,
    );
  }
  if (engine.step !== scaffold.step) {
    problems.push(`${name}: failed step differs (${ENGINE_FILE}: ${engine.step} / ${SOURCE_FILE}: ${scaffold.step})`);
  }
  const engineLogs = engine.logs.map(normalize);
  const scaffoldLogs = scaffold.logs.map(normalize);
  if (engineLogs.join("\n") !== scaffoldLogs.join("\n")) {
    problems.push(
      `${name}: logged lines differ\n  ${ENGINE_FILE}:\n    ${engineLogs.join("\n    ")}\n  ${SOURCE_FILE}:\n    ${scaffoldLogs.join("\n    ")}`,
    );
  }
  return problems;
}

async function parity(engine: Implementation, scaffold: Implementation): Promise<string[]> {
  const problems: string[] = [];

  const hungProfiles: string[] = [];
  const hung = { debugPort: 1, readyMs: 60, launch: fakeLaunch(hungProfiles), pageProbe: async () => {} };
  problems.push(...compare("a debugger that never answers", await run(engine, hung), await run(scaffold, hung)));

  // Each side needs its own cold endpoint: one shared server would already be answering by the
  // time the second run starts, so that run would never see a failed first attempt.
  const recovery: Record<string, unknown> = { readyMs: 100, launch: fakeLaunch([]), pageProbe: async () => {} };
  const engineRecovery = await slowDebugger(150);
  let engineRun: ScenarioResult;
  try {
    engineRun = await run(engine, { ...recovery, debugPort: engineRecovery.port });
  } finally {
    await engineRecovery.stop();
  }
  const scaffoldRecovery = await slowDebugger(150);
  let scaffoldRun: ScenarioResult;
  try {
    scaffoldRun = await run(scaffold, { ...recovery, debugPort: scaffoldRecovery.port });
  } finally {
    await scaffoldRecovery.stop();
  }
  problems.push(...compare("a hung first attempt that recovers", engineRun, scaffoldRun));

  const missingChrome = () => {
    throw new Error("No Chrome/Chromium found. Install Chrome or set CHROME_PATH.");
  };
  const missing = { debugPort: 1, readyMs: 60, launch: missingChrome };
  problems.push(...compare("no Chrome installed", await run(engine, missing), await run(scaffold, missing)));

  // #2278: Bun's fetch sends 127.0.0.1 through HTTP_PROXY, so a set proxy read a healthy
  // debugger as dead. A dead proxy proves both copies reach the debugger directly.
  const proxyEndpoint = await slowDebugger(0);
  const proxyVars = {
    HTTP_PROXY: "http://127.0.0.1:9",
    http_proxy: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    https_proxy: "http://127.0.0.1:9",
    NO_PROXY: "",
    no_proxy: "",
  };
  const proxied = { debugPort: proxyEndpoint.port, readyMs: 1_000, launch: fakeLaunch([]), pageProbe: async () => {} };
  let proxyEngine: ScenarioResult;
  let proxyScaffold: ScenarioResult;
  try {
    proxyEngine = await withEnv(proxyVars, () => run(engine, proxied));
    proxyScaffold = await withEnv(proxyVars, () => run(scaffold, proxied));
  } finally {
    await proxyEndpoint.stop();
  }
  problems.push(...compare("a debugger behind HTTP_PROXY", proxyEngine, proxyScaffold));
  if (proxyEngine.outcome !== "ok:1" || proxyScaffold.outcome !== "ok:1") {
    problems.push(
      `a debugger behind HTTP_PROXY: HTTP_PROXY=http://127.0.0.1:9 must not carry the handshake\n` +
        `  ${ENGINE_FILE}: ${proxyEngine.outcome}\n  ${SOURCE_FILE}: ${proxyScaffold.outcome}`,
    );
  }

  return problems;
}

/**
 * `fetch` in Bun routes 127.0.0.1 through `HTTP_PROXY`, so a proxy turns a healthy debugger
 * into a refused connection. Name every such call, so a revert fails here and not on a
 * corporate laptop.
 */
function proxyHijackableProbes(file: string, text: string): string[] {
  const found: string[] = [];
  for (let at = text.indexOf("fetch("); at >= 0; at = text.indexOf("fetch(", at + 1)) {
    const window = text.slice(at, at + 400);
    if (!window.includes("/json/")) continue;
    const line = text.slice(0, at).split("\n").length;
    found.push(`${file}:${line}`);
  }
  return found;
}

/**
 * Files allowed to call `fetch` because they never address this machine. Every waiver is
 * listed in the failure output, so adding one is a visible decision, not a silent pass.
 */
const REMOTE_FETCH: Record<string, string> = {
  "scripts/check-release-artifacts.ts": "registry.npmjs.org metadata and tarballs",
  "scripts/creator-app-fixture.ts": "browser-side page script inside a fixture app, not a Node probe",
  "scripts/mirror-assets.ts": "api.github.com and uploads.github.com",
  "scripts/pr-video.ts": "api.github.com",
  "packages/assets/src/cli/pull.ts": "remote asset registry, URL from the caller",
  "packages/editor/src/assetImport.ts": "an editor route the caller supplies, never a fixed local address",
  "packages/github/src/server.ts": "api.github.com",
  "packages/github/src/source.ts": "api.github.com",
  "packages/jgengine/src/desktop.ts": "the hosted page URL a desktop wrapper opens",
  "packages/jgengine/src/templates/editorWorkspace.ts": "browser-side page script, where HTTP_PROXY is the browser's",
  "packages/jgengine/src/upgrade.ts": "the npm registry",
  "packages/shell/src/audio/audioEngine.ts": "asset URLs the page loads",
  "packages/shell/src/devtools/agentBridge.ts": "browser-side bridge to an endpoint the page was handed",
  "packages/shell/src/devtools/frameSampler.ts": "browser-side sampler for an endpoint the page was handed",
};

function runtimeSources(cwd = process.cwd()): string[] {
  const files: string[] = [];
  const walk = (dir: string, keep: (path: string) => boolean): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path, keep);
      } else if (keep(path)) files.push(path);
    }
  };
  walk(join(cwd, "scripts"), (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
  const packages = join(cwd, "packages");
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      walk(join(packages, entry.name, "src"), (path) => path.endsWith(".ts") && !path.includes(".test."));
    }
  }
  return files;
}

/** `file:line` for every fetch() outside the remote-only list, so the fourth copy fails CI. */
export async function scanForFetchEverywhere(cwd = process.cwd()): Promise<string[]> {
  const offending: string[] = [];
  for (const path of runtimeSources(cwd)) {
    const relative = relativePath(cwd, path);
    if (relative === "scripts/check-scaffold-launch.ts") continue;
    if (REMOTE_FETCH[relative] !== undefined) continue;
    const text = await Bun.file(path).text();
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (/(?<![\w.])fetch\(/.test(lines[index] as string)) offending.push(`${relative}:${index + 1}`);
    }
  }
  return offending;
}

function relativePath(cwd: string, path: string): string {
  return path.slice(cwd.length + 1).replace(/\\/g, "/");
}

async function withEnv<T>(vars: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, process.env[name]);
    process.env[name] = value;
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function main(): Promise<void> {
  const files = scaffoldFiles();
  const browserMjs = files.get("scripts/browser.mjs");
  if (browserMjs === undefined) fail(`${TEMPLATE_FILE} no longer emits scripts/browser.mjs`);

  const start = browserMjs.indexOf(LAUNCH_BLOCK_START);
  if (start < 0) fail(`scripts/browser.mjs carries no ${LAUNCH_BLOCK_START} block (${TEMPLATE_FILE})`);
  const end = browserMjs.indexOf(LAUNCH_BLOCK_END, start);
  if (end < 0) fail(`scripts/browser.mjs never closes its launch block with ${LAUNCH_BLOCK_END} (${TEMPLATE_FILE})`);
  if (browserMjs.indexOf(LAUNCH_BLOCK_START, start + 1) >= 0) {
    fail(`scripts/browser.mjs carries a second launch block; ${SOURCE_FILE} is the only copy (${TEMPLATE_FILE})`);
  }

  const shipped = browserMjs.slice(start, end + LAUNCH_BLOCK_END.length);
  const canonicalHash = hash(BROWSER_LAUNCH_BLOCK);
  const shippedHash = hash(shipped);
  if (canonicalHash !== shippedHash) {
    const shippedLines = shipped.split("\n");
    const canonicalLines = BROWSER_LAUNCH_BLOCK.split("\n");
    const at = canonicalLines.findIndex((line, index) => line !== shippedLines[index]);
    fail(
      `the scaffold's launch block drifted from its source (${shippedHash} vs ${canonicalHash})\n` +
        `  source: ${SOURCE_FILE}\n  shipped: ${TEMPLATE_FILE} -> scripts/browser.mjs\n` +
        `  first difference at line ${at + 1}:\n    source:  ${canonicalLines[at] ?? "(end)"}\n    shipped: ${shippedLines[at] ?? "(end)"}`,
    );
  }

  const hijackable = [
    ...proxyHijackableProbes(`${TEMPLATE_FILE} -> scripts/browser.mjs`, shipped),
    ...proxyHijackableProbes(ENGINE_FILE, readFileSync(ENGINE_FILE, "utf8")),
  ];
  if (hijackable.length > 0) {
    fail(
      `the debugger handshake still reaches 127.0.0.1 through fetch(), which Bun sends to HTTP_PROXY (#2278):\n` +
        `  ${hijackable.join("\n  ")}\n` +
        `  probe the debugger with node:http in both copies (${SOURCE_FILE} and ${ENGINE_FILE})`,
    );
  }

  const localFetches = await scanForFetchEverywhere();
  if (localFetches.length > 0) {
    fail(
      `these ${localFetches.length} fetch() calls are not on the remote-only list, and fetch() in Bun sends a local address through HTTP_PROXY (#2278):\n` +
        `  ${localFetches.join("\n  ")}\n` +
        `  a probe of this machine goes through node:http (import from scripts/localhostHttp.ts);\n` +
        `  a call that really reaches the internet goes on REMOTE_FETCH in this check with its reason\n` +
        `  waivers in force:\n    ${Object.entries(REMOTE_FETCH).map(([file, why]) => `${file} (${why})`).join("\n    ")}`,
    );
  }

  for (const harness of ["scripts/shoot.mjs", "scripts/drive.mjs"]) {
    const source = files.get(harness);
    if (source === undefined) fail(`the scaffold no longer emits ${harness} (${TEMPLATE_FILE})`);
    if (!source.includes("startBrowser({")) {
      fail(`${harness} does not launch through startBrowser, so it has no retry and no step-named failure (${TEMPLATE_FILE})`);
    }
    if (source.includes("waitForDebugger(")) {
      fail(`${harness} still waits for the debugger itself instead of using startBrowser (${TEMPLATE_FILE})`);
    }
  }

  const problems = await parity(
    { startBrowser: engineStartBrowser as unknown as Implementation["startBrowser"] },
    await loadScaffold(browserMjs),
  );
  if (problems.length > 0) {
    fail(`the engine and the scaffold launch paths disagree:\n- ${problems.join("\n- ")}`);
  }

  console.log(
    `check-scaffold-launch ok: ${SOURCE_FILE} block ${canonicalHash} shipped verbatim to scripts/browser.mjs; ` +
      `shoot and drive route through startBrowser; no debugger probe uses fetch; ` +
      `${ENGINE_FILE} agrees on 4 handshake scenarios, including one behind HTTP_PROXY`,
  );
}

if (import.meta.main) await main();


