/**
 * `drive <game> --step '<flow call>'`: run flow calls against a game page that stays running in the
 * warm browser between commands, so trying one click, wait or check answers in seconds instead of
 * a full proof run. The page is booted once, paused between runs (it draws nothing, so it never
 * competes with another capture for frames) and resumed by the next `--step`; `--fresh` boots it again.
 */
import { localGetJson } from "./localhostHttp";
import { CdpSession, applyDevice, closePageTarget, navigateCapturePageWithRetry, withBrowserSession, type Device, type SizeMode, type ViewportOverride } from "./browser-lib";
import { acquireWarmCapture, brokerTurn, ensureDaemonTarget, withDaemonWatch } from "./shoot-daemon";
import { createBrowserFlow } from "./browserFlow";
import { clearOriginStorage, installFrameCounter, pageFlowDriver, readProbe } from "./drivePage";
import { closestHint } from "./closestMatch";
import { STEP_PAGE_PARAM, isStepPage } from "./devBroker";
import { detail } from "./verbosity";
import { createFlowStepper, describeFlowReport, runFlowReport } from "../packages/core/src/play/flowSteps";
import type { BrowserFlow } from "../packages/core/src/play/flow";
import type { ProbeReadings } from "../packages/core/src/game/playableGame";


export interface LiveStepOptions {
  /** Flow calls to run in order, e.g. `f.click("Start")` or `await f.wait(500); return f.probe()`. */
  steps: readonly string[];
  /** Boot the page again instead of resuming the running one. */
  fresh: boolean;
  /** The page to run on, built from the dev server's base URL. */
  targetUrl(base: string): URL;
  device: Device;
  size: SizeMode;
  viewport: ViewportOverride;
  timeoutMs: number;
  reuseStorage: boolean;
  /** Take a named screenshot of the page, the way `f.shot` does in a flow. */
  shot(session: CdpSession, name: string): Promise<void>;
}

/** Take `--step <code>` (repeatable) and `--fresh` out of a drive command line. */
export function splitStepFlags(argv: readonly string[]): { argv: string[]; steps: string[]; fresh: boolean } {
  const rest: string[] = [];
  const steps: string[] = [];
  let fresh = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--fresh") fresh = true;
    else if (arg.startsWith("--step=")) steps.push(arg.slice("--step=".length));
    else if (arg === "--step") {
      const code = argv[index + 1];
      if (code === undefined || code.trim() === "") throw new Error("drive: --step takes a flow call, e.g. --step 'f.click(\"Start\")'");
      steps.push(code);
      index += 1;
    } else rest.push(arg);
  }
  if (fresh && steps.length === 0) throw new Error("drive: --fresh boots the --step page again; pass --step too");
  return { argv: rest, steps, fresh };
}

/**
 * Page script: hold (`true`) or release (`false`) the page's animation frames. Held, every frame
 * callback the game asks for waits in a queue, so nothing draws; released, the queue runs on the
 * next real frame. Timers and the dev-server socket keep running, so the page does not reload.
 */
const pauseFramesScript = `(pause) => {
  const g = globalThis;
  if (g.__jgStepFrames === undefined) {
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const state = { raf, held: new Map(), next: 1, paused: false };
    g.__jgStepFrames = state;
    window.requestAnimationFrame = (cb) => {
      if (!state.paused) return raf(cb);
      const id = -(state.next++);
      state.held.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => { if (id < 0) state.held.delete(id); else caf(id); };
  }
  const state = g.__jgStepFrames;
  state.paused = pause;
  if (!pause) {
    const held = [...state.held.values()];
    state.held.clear();
    for (const cb of held) state.raf(cb);
  }
  return true;
}`;

interface PageTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

function pageTarget(value: unknown): PageTarget | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const id = "id" in value ? value.id : undefined;
  const type = "type" in value ? value.type : undefined;
  const url = "url" in value ? value.url : undefined;
  const ws = "webSocketDebuggerUrl" in value ? value.webSocketDebuggerUrl : undefined;
  if (typeof id !== "string" || typeof type !== "string" || typeof url !== "string") return undefined;
  return { id, type, url, ...(typeof ws === "string" ? { webSocketDebuggerUrl: ws } : {}) };
}

function chromeJson(debugPort: number, path: string, method: "GET" | "PUT" = "GET"): Promise<unknown> {
  return localGetJson(`http://127.0.0.1:${debugPort}/json/${path}`, 5_000, method);
}

async function listPages(debugPort: number): Promise<PageTarget[]> {
  const listed = await chromeJson(debugPort, "list");
  return (Array.isArray(listed) ? listed : []).map(pageTarget).filter((page): page is PageTarget => page !== undefined && page.type === "page");
}


/** A step snippet as a function of `f`: an expression first, statements when it is not one. */
export function compileStep(code: string): (f: unknown) => Promise<unknown> {
  let make: Function;
  try {
    make = new Function("f", `return (async () => (${code}\n))();`);
  } catch {
    make = new Function("f", `return (async () => {\n${code}\n})();`);
  }
  return (f) => Promise.resolve(make(f));
}

/** The flow with a misspelt call named, and the calls it could have meant. */
export function guardFlowCalls<F extends object>(flow: F): F {
  return new Proxy(flow, {
    get(target, key, receiver) {
      if (typeof key === "string" && !(key in target) && key !== "then") {
        throw new Error(`f.${key} is not a flow call${closestHint(key, Object.keys(target), "calls")}`);
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

/** Run every step on the live page; 0 when all pass, 1 at the first failure. */
export async function runLiveSteps(options: LiveStepOptions): Promise<number> {
  const warm = await acquireWarmCapture({});
  const daemon = warm.daemon;
  if (daemon === null) {
    console.error("drive --step: needs the warm browser, and it is not running (see the line above); run any `bun run drive` once to start it");
    return 1;
  }
  const dev = await ensureDaemonTarget(daemon, "dev");
  return withDaemonWatch(daemon, withBrowserSession(
    {
      keep: false,
      timeoutMs: options.timeoutMs,
      debugPort: daemon.chromePort,
      attach: true,
      leaveWarm: true,
      chromePrefix: "jg-drive-",
      turn: brokerTurn(daemon),
      hardDeadlineMs: options.timeoutMs * (options.steps.length + 1) + 120_000,
    },
    async ({ debugPort }) => {
      const url = options.targetUrl(dev.base);
      url.searchParams.set(STEP_PAGE_PARAM, "1");
      const wanted = url.toString();
      const pages = await listPages(debugPort);
      let reuse: PageTarget | undefined;
      for (const page of pages) {
        if (!isStepPage(page.url)) continue;
        const same = page.url === wanted && !options.fresh && reuse === undefined;
        if (same) reuse = page;
        // One step page per target on this dev server: an older one for another game, state or
        // option set, or one this run is told to boot again, goes.
        else if (page.url.startsWith(dev.base)) await closePageTarget(debugPort, page.id);
      }
      const started = performance.now();
      let session: CdpSession | null = null;
      let target: PageTarget | undefined = reuse;
      if (target?.webSocketDebuggerUrl !== undefined) {
        session = await CdpSession.connect(target.webSocketDebuggerUrl, 15_000);
        await session.send("Page.enable");
        await session.send("Runtime.enable");
        // The marker is set on the document this command booted, so a page that reloaded itself since
        // (a full dev-server reload) reads as gone instead of as the running game it no longer is.
        const kept = await session.evaluate<boolean>(`globalThis.__jgStepPage === true`).catch(() => undefined);
        if (kept === true) await session.evaluate(`(${pauseFramesScript})(false)`);
        else {
          console.error("drive --step: the kept page reloaded since the last --step, so its game state is gone; booting it again");
          await session.close();
          await closePageTarget(debugPort, target.id);
          session = null;
        }
      }
      let booted = false;
      if (session === null) {
        target = pageTarget(await chromeJson(debugPort, "new?about:blank", "PUT"));
        if (target?.webSocketDebuggerUrl === undefined) throw new Error("drive --step: Chrome opened a page with no debugger URL");
        session = await CdpSession.connect(target.webSocketDebuggerUrl, 15_000);
        await session.send("Page.enable");
        await session.send("Runtime.enable");
        await applyDevice(session, options.device, options.size, options.viewport);
        if (!options.reuseStorage) await clearOriginStorage(session, url.origin);
        await navigateCapturePageWithRetry(session, wanted, dev.base, options.timeoutMs, 2);
        await installFrameCounter(session);
        await session.evaluate(`globalThis.__jgStepPage = true`);
        booted = true;
      }
      detail(booted
        ? `drive --step: booted the page in ${((performance.now() - started) / 1000).toFixed(1)}s; it keeps running for the next --step (--fresh boots it again)`
        : `drive --step: resumed the running page`);

      const page = session;
      let code = 0;
      try {
        const driver = pageFlowDriver(page, {
          clock: null,
          async reload() {
            await navigateCapturePageWithRetry(page, wanted, dev.base, options.timeoutMs, 2);
            await installFrameCounter(page);
          },
          shot: (name) => options.shot(page, name),
        });
        for (const [index, source] of options.steps.entries()) {
          const name = `step ${index + 1}`;
          const stepper = createFlowStepper(() => readProbe(page));
          const reports: { label: string; probe: unknown }[] = [];
          const flow: BrowserFlow<ProbeReadings> = guardFlowCalls(createBrowserFlow(driver, stepper, reports));
          let value: unknown;
          let run: (f: unknown) => Promise<unknown>;
          try {
            run = compileStep(source);
          } catch (error) {
            console.error(`${name}: does not parse: ${error instanceof Error ? error.message : String(error)}`);
            code = 1;
            break;
          }
          const report = await runFlowReport(stepper, reports, async () => {
            value = await run(flow);
          });
          if (!report.ok) {
            for (const line of describeFlowReport(name, report)) console.error(line);
            code = 1;
            break;
          }
          const labels = report.steps.map((step) => step.label).join(", ") || source;
          console.log(`${name}: ok ${labels} (${(report.ms / 1000).toFixed(1)}s)${value === undefined ? "" : ` → ${JSON.stringify(value)}`}`);
        }
      } finally {
        // Paused, the page keeps its state and its dev-server connection but draws no frames until
        // the next --step resumes it, so it never competes with another capture for the frame clock.
        const paused = await page.evaluate<boolean>(`(${pauseFramesScript})(true)`).then((value) => value === true, () => false);
        await page.close();
        if (!paused && target !== undefined) await closePageTarget(debugPort, target.id);
      }
      return code;
    },
  ));
}
