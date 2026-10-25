/**
 * Boot each game that declares a boot probe and prove the system is live.
 *
 * A declaration can be true on paper and false in play: a game imports the
 * mission module, declares it adopted, then never mounts the runtime. This
 * half reads the engine's own devtools counters on the running page
 * (`window.__jgengineAgent` -> `debug_snapshot.probes`) and each declared
 * `window.__jgengine*` readout (`window.__jgengineAudio`, `window.__jgengineRun`),
 * so an adopted system that is merely imported fails here.
 *
 * Capabilities with no probe surface stay at declaration level; `games:check-capabilities`
 * lists them. This command only checks modules whose declaration names a probe.
 *
 * Usage: bun run games:capabilities-probe [game...]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DECLINE_MIN,
  gameDirs,
  probeMatches,
  readDeclaration,
  readInstalled,
  windowProbeVerdict,
  type CapabilityEntry,
  type Declaration,
  type Ledger,
} from "./capabilities";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const wanted = args.filter((arg) => !arg.startsWith("--"));
const ledger = JSON.parse(readFileSync(`${root}/capabilities.json`, "utf8")) as Ledger;
const installed = readInstalled(root);

interface ProbeFailure {  game: string;
  capability: string;
  module: string;
  reason: string;
}

const failures: ProbeFailure[] = [];
const checked: string[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // The dev server is still compiling.
    }
    await Bun.sleep(250);
  }
  throw new Error(`dev server did not answer ${url} within ${timeoutMs}ms`);
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.JG_CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
  for (const path of candidates) if (existsSync(path)) return path;
  throw new Error("No Chrome/Chromium found. Set CHROME_PATH to run the capability probe.");
}

class Cdp {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) pending.reject(new Error(message.error.message ?? "CDP error"));
      else pending.resolve(message.result);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(`cannot open ${url}`)), { once: true });
    });
    const cdp = new Cdp(socket);
    await cdp.send("Runtime.enable");
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 30000);
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text?: string } };
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.text ?? "page evaluation failed");
    }
    return result.result?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

async function pageTarget(debugPort: number, timeoutMs: number): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
        signal: AbortSignal.timeout(1000),
      });
      const targets = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl !== undefined);
      if (page?.webSocketDebuggerUrl !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await Bun.sleep(250);
  }
  throw new Error("Chrome opened no page target");
}

const READ_PAGE = `(() => {
  const agent = window.__jgengineAgent;
  const windows = {};
  // Every readout the engine mounts, not a list kept here: a new window.__jgengine* is read too.
  for (const name of Object.keys(window).filter((key) => key.startsWith("__jgengine") && key !== "__jgengineAgent")) {
    const probe = window[name];
    if (probe === null || typeof probe !== "object" || (typeof probe.read !== "function" && typeof probe.measure !== "function")) continue;
    try {
      if (typeof probe.read === "function") {
        windows[name] = probe.read();
      } else {
        const level = probe.measure();
        windows[name] = { rms: level.rms, peak: level.peak, master: probe.masterLevel() };
      }
    } catch (error) {
      windows[name] = { error: String(error) };
    }
  }
  let probes = null;
  let error;
  if (agent !== undefined) {
    try {
      const response = agent.handle({ method: "debug_snapshot" });
      probes = response?.snapshot?.probes ?? response?.probes ?? null;
    } catch (caught) {
      error = String(caught);
    }
  }
    return { ready: agent !== undefined || Object.keys(windows).length > 0, probes, windows, error };
})()`;

interface LivePage {
  probes: Record<string, unknown> | null;
  /** Every `window.__jgengine*` readout the page answers with, keyed by global name. */
  windows: Record<string, unknown>;
  error?: string;
}

interface Expectations {
  windows: string[];
  devtools: string[];
}

async function bootAndRead(
  game: string,
  port: number,
  timeoutMs: number,
  expectations: Expectations,
): Promise<LivePage> {
  const url = `http://127.0.0.1:${port}/`;
  const dev = spawn("bun", ["run", "dev", "--", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    cwd: join(root, game),
    env: { ...process.env, BROWSER: "none" },
    stdio: "ignore",
  });

  let chrome: ReturnType<typeof spawn> | undefined;
  let profile: string | undefined;
  let cdp: Cdp | undefined;
  try {
    await waitForHttp(url, 120000);
    const debugPort = await freePort();
    profile = mkdtempSync(join(tmpdir(), "jg-capability-"));
    chrome = spawn(
      findChrome(),
      [
        "--headless=new",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--mute-audio",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--window-size=1280,720",
        url,
      ],
      { stdio: "ignore" },
    );

    cdp = await Cdp.connect(await pageTarget(debugPort, 30000));
    const started = Date.now();
    let last: LivePage = { probes: null, windows: {} };
    while (Date.now() - started < timeoutMs) {
      try {
        const page = await cdp.evaluate<LivePage>(READ_PAGE);
        last = page;
        const windowsLive = expectations.windows.every((name) => page.windows?.[name] !== undefined);
        const probesLive =
          expectations.devtools.length === 0 ||
          (page.probes !== null &&
            expectations.devtools.every((pattern) => probeMatches(pattern, Object.keys(page.probes ?? {}))));
        if (page.ready && windowsLive && probesLive) return page;
      } catch (error) {
        last = { probes: null, windows: {}, error: String(error) };
      }
      await Bun.sleep(500);
    }
    return last;
  } finally {
    cdp?.close();
    if (chrome !== undefined) {
      chrome.kill();
      await Bun.sleep(500);
    }
    if (profile !== undefined) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // Chrome can hold its profile open briefly on Windows; a temp dir is disposable.
      }
    }
    dev.kill();
  }
}

function capabilitiesForModule(declaration: Declaration, module: string): CapabilityEntry[] {
  return ledger.capabilities.filter(
    (entry) => entry.module === module && declaration.adopts.includes(entry.id),
  );
}

/** The system-level slug a probe should name, not a helper tag like mission-validation. */
function primaryCapability(capabilities: CapabilityEntry[]): string {
  const score = (id: string): number => (id.includes("runtime") ? 0 : id.includes("system") ? 1 : 2);
  return [...capabilities].sort((a, b) => score(a.id) - score(b.id) || a.id.length - b.id.length || (a.id < b.id ? -1 : 1))[0]?.id ?? "*";
}

const games = gameDirs(root).filter((game) => wanted.length === 0 || wanted.includes(game));
const targets = games.filter((game) => {
  const declaration = readDeclaration(root, game);
  if (declaration === null) return false;
  return Object.keys(declaration.probes ?? {}).length > 0;
});

if (targets.length === 0) {
  console.log("games:capabilities-probe: nothing to probe - no game declares a boot probe");
  process.exit(0);
}

const startedAt = Date.now();
for (const game of targets) {
  const declaration = readDeclaration(root, game);
  if (declaration === null) continue; // The static gate names the missing file.
  const entries = Object.entries(declaration.probes ?? {});
  const expectations: Expectations = { windows: [], devtools: [] };
  for (const [module, patterns] of entries) {
    const info = installed.modules.find((item) => item.specifier === module);
    if (info?.probe?.kind === "window" && info.probe.global !== undefined) expectations.windows.push(info.probe.global);
    if (info?.probe?.kind === "devtools") expectations.devtools.push(...patterns);
  }
  const port = await freePort();
  process.stdout.write(`probing ${game}... `);
  const page = await bootAndRead(game, port, 45000, expectations);
  const gameFailures: ProbeFailure[] = [];

  for (const [module, patterns] of entries) {
    const capabilities = capabilitiesForModule(declaration, module);
    if (capabilities.length === 0) continue;
    const capability = primaryCapability(capabilities);
    const info = installed.modules.find((item) => item.specifier === module);
    if (info?.probe?.kind === "window") {
      const global = info.probe.global;
      if (global === undefined) continue;
      const readout = page.windows?.[global];
      const verdict = windowProbeVerdict(global, readout);
      if (verdict !== null) {
        gameFailures.push({ game, capability, module, reason: `declared adopted, but ${verdict}` });
      } else {
        const counters = Object.entries(readout as Record<string, unknown>)
          .filter(([, value]) => typeof value === "number")
          .slice(0, 4)
          .map(([key, value]) => `${key} ${String(value)}`)
          .join(", ");
        checked.push(`${game}: ${capability} live via window.${global} (${counters})`);
      }
      continue;
    }

    const probes = page.probes ?? {};
    const keys = Object.keys(probes);
    const missing = patterns.filter((pattern) => !probeMatches(pattern, keys));
    if (missing.length > 0) {
      gameFailures.push({
        game,
        capability,
        module,
        reason: `declared adopted, but debug_snapshot.probes has no ${missing.map((p) => `"${p}"`).join(" or ")} (keys: ${keys.slice(0, 8).join(", ") || "none"}${page.error === undefined ? "" : `; ${page.error}`})`,
      });
      continue;
    }
    const broken = patterns.filter((pattern) => {
      const hit = keys.find((key) => probeMatches(pattern, [key]));
      return hit !== undefined && String(probes[hit]).startsWith("probe failed");
    });
    if (broken.length > 0) {
      gameFailures.push({ game, capability, module, reason: `probe ${broken.join(", ")} reported a failure` });
      continue;
    }
    checked.push(`${game}: ${capability} live via ${patterns.join(", ")}`);
  }

  if (gameFailures.length === 0) {
    console.log(`OK (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
  } else {
    console.log("FAIL");
    failures.push(...gameFailures);
  }
}

for (const line of checked) console.log(`  OK   ${line}`);

if (failures.length > 0) {
  console.error("");
  console.error("capability probe: FAIL - these games declare a running engine system that is not live:");
  for (const failure of failures) {
    console.error(`  ${failure.game}: "${failure.capability}" via ${failure.module}`);
    console.error(`    ${failure.reason}`);
    console.error(
      `    Two ways out: mount the system at boot so its probe reports and keep the adoption, or drop the adoption and decline it with a ${DECLINE_MIN}+ character reason.`,
    );
  }
  process.exit(1);
}

console.log(
  `capability probe: OK - ${targets.length} games booted, ${checked.length} probed capability checks passed`,
);
