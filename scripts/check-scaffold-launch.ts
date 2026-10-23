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
 *     same failure text for the same scripted failures (#2131's hung first attempt).
 *
 *   bun run check:scaffold-launch
 *
 * Exit 0 agree, 1 drift.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

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

  return problems;
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
      `shoot and drive route through startBrowser; ${ENGINE_FILE} agrees on 3 handshake scenarios`,
  );
}

await main();
