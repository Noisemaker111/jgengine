/** Marks the generated launch block inside the scaffold's `scripts/browser.mjs`. */
export const LAUNCH_BLOCK_START = "// jg-launch-block:start";
/** Marks the end of the generated launch block. */
export const LAUNCH_BLOCK_END = "// jg-launch-block:end";

/**
 * The one Chrome launch path a scaffolded project ships: spawn, debugger endpoint, page
 * target. A transient handshake failure discards that browser and its profile, then retries
 * once with a fresh profile and a doubled wait; `JG_CHROME_READY_MS` sets the per-attempt
 * wait. A configuration error, and anything after the handshake, is reported once, naming
 * the step that failed. `scripts/check-scaffold-launch.ts` fails when this and the engine's
 * `scripts/browser-lib.ts` copy stop agreeing.
 *
 * Plain JS with no backticks or template interpolation: it is embedded verbatim in
 * `scripts/browser.mjs`, which is itself inside a template literal in `gameFiles.ts`.
 */
export const BROWSER_LAUNCH_BLOCK = `${LAUNCH_BLOCK_START}
// One Chrome launch path: spawn, debugger endpoint, page target. A transient handshake
// failure discards that browser and its profile, then retries once with a fresh profile and
// a doubled wait. A configuration error, and anything after the handshake, is reported once.

import { request as httpRequest } from "node:http";

const DEFAULT_CHROME_READY_MS = 30_000;
const DEBUGGER_PROBE_TIMEOUT_MS = 2_000;
const LAUNCH_ATTEMPTS = 2;

export function resolveChromeReadyMs(env) {
  const configured = Number((env ?? process.env).JG_CHROME_READY_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CHROME_READY_MS;
}

export class BrowserLaunchError extends Error {
  constructor(failure) {
    const profile = failure.profilePath === null || failure.profilePath === undefined ? "no profile" : "profile " + failure.profilePath;
    const attempts = failure.attempts + " attempt" + (failure.attempts === 1 ? "" : "s");
    const waited = failure.waitedMs === undefined ? "" : ", last wait " + failure.waitedMs + "ms";
    super(
      "browser: the " + failure.step + " step failed after " + failure.elapsedMs + "ms (" + profile + ", " + attempts + waited + "): " + failure.reason,
    );
    this.name = "BrowserLaunchError";
    this.step = failure.step;
    this.elapsedMs = failure.elapsedMs;
    this.profilePath = failure.profilePath ?? null;
    this.attempts = failure.attempts;
    this.reason = failure.reason;
  }
}

// A listening socket that has not finished booting HTTP is not a debugger, so each probe
// asks for a parsed /json/version body and gives up on that one after a short timeout.
// node:http, never fetch: Bun's fetch sends 127.0.0.1 through HTTP_PROXY, so on a machine
// with a corporate proxy a healthy browser would read as dead in about a millisecond.
async function debuggerVersionUrl(port) {
  try {
    const body = JSON.parse(await localGet("http://127.0.0.1:" + port + "/json/version", DEBUGGER_PROBE_TIMEOUT_MS));
    return typeof body.webSocketDebuggerUrl === "string" ? body.webSocketDebuggerUrl : null;
  } catch {
    return null;
  }
}

/** GET a localhost URL without a proxy in the way; the body text, or a thrown status/error. */
function localGet(url, timeoutMs, method) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: method ?? "GET",
        headers: { connection: "close" },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (body.length < 1_048_576) body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve(body);
          else {
            const error = new Error("localhost " + target.pathname + " answered " + status);
            error.status = status;
            reject(error);
          }
        });
        response.on("error", reject);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("localhost " + target.pathname + " timed out after " + timeoutMs + "ms")));
    request.on("error", reject);
    request.end();
  });
}

export async function waitForDebugger(port, timeoutMs, context = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let pause = 100;
  while (Date.now() < deadline) {
    const exit = context.browser === undefined ? undefined : context.browser.exitCode;
    if (typeof exit === "number") {
      throw new BrowserLaunchError({
        step: "endpoint",
        elapsedMs: Date.now() - startedAt,
        profilePath: context.profilePath ?? null,
        attempts: 1,
        waitedMs: timeoutMs,
        reason: "the browser process exited (code " + exit + ") before binding the debugger on :" + port,
      });
    }
    if ((await debuggerVersionUrl(port)) !== null) return Date.now() - startedAt;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pause, remaining));
    pause = Math.min(250, Math.round(pause * 1.5));
  }
  throw new BrowserLaunchError({
    step: "endpoint",
    elapsedMs: Date.now() - startedAt,
    profilePath: context.profilePath ?? null,
    attempts: 1,
    waitedMs: timeoutMs,
    reason: "the debugger on :" + port + " did not answer /json/version within " + timeoutMs + "ms",
  });
}

function isTransientPageFailure(message) {
  const lower = message.toLowerCase();
  return (
    lower.includes("target page, context or browser has been closed") ||
    lower.includes("browser has been closed") ||
    lower.includes("cdp websocket error") ||
    lower.includes("cdp websocket connect timeout") ||
    lower.includes("no cdp page target available")
  );
}

/** Which handshake failures are worth one fresh browser, and which are real configuration errors. */
export function isRetryableLaunchFailure(step, message) {
  if (message.toLowerCase().includes("no chrome/chromium found")) return false;
  if (step === "launch" || step === "endpoint") return true;
  return isTransientPageFailure(message);
}

async function pageTargetProbe(debugPort) {
  const session = await openPage(debugPort);
  session.close();
}

/**
 * Start headless Chrome: spawn it, wait for its debugger endpoint, then prove a page target
 * answers. A transient failure before the page is live gets exactly one retry with a fresh
 * profile and a doubled wait; the retry is logged. A capture or assertion failure happens
 * after this returns and is never retried here.
 */
export async function startBrowser(options) {
  let readyMs = options.readyMs ?? resolveChromeReadyMs(options.env ?? process.env);
  const log = options.log ?? ((line) => console.error(line));
  const launch = options.launch ?? launchChrome;
  const waitForEndpoint = options.waitForDebugger ?? waitForDebugger;
  const pageProbe = options.pageProbe ?? pageTargetProbe;
  let last = null;

  for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    let chrome;
    let step = "launch";
    try {
      chrome = launch(options.debugPort, options.prefix);
      step = "endpoint";
      await waitForEndpoint(options.debugPort, readyMs, { browser: chrome, profilePath: chrome.userDataDir });
      step = "page";
      await pageProbe(options.debugPort, chrome.userDataDir);
      if (attempt > 1) {
        log(
          "browser: launch recovered on attempt " + attempt + " after " + (Date.now() - startedAt) + "ms (profile " + chrome.userDataDir + ")",
        );
      }
      return { debugPort: options.debugPort, chrome: chrome, profilePath: chrome.userDataDir, attempts: attempt };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const profilePath = chrome === undefined || chrome === null ? null : chrome.userDataDir;
      const reason = error instanceof Error ? error.message : String(error);
      last = new BrowserLaunchError({
        step: step,
        elapsedMs: elapsedMs,
        profilePath: profilePath,
        attempts: attempt,
        waitedMs: step === "launch" ? undefined : readyMs,
        reason: reason,
      });
      // Discard this attempt's browser and profile before spending another wait on a new one.
      if (chrome !== undefined && chrome !== null) {
        try {
          chrome.kill();
        } catch {
          /* already gone */
        }
        removeProfileDir(chrome.userDataDir);
      }
      if (attempt >= LAUNCH_ATTEMPTS || !isRetryableLaunchFailure(step, reason)) throw last;
      const next = Math.round(readyMs * 2);
      const short = error instanceof BrowserLaunchError ? error.reason : reason;
      log(
        "browser: the " + step + " step failed on attempt " + attempt + " after " + elapsedMs + "ms" +
          (profilePath === null ? "" : " (profile " + profilePath + ")") +
          ": " + short + " — retrying with a fresh profile and a " + next + "ms wait",
      );
      readyMs = next;
    }
  }
  throw last ?? new Error("browser: launch failed without a reason");
}
${LAUNCH_BLOCK_END}`;
