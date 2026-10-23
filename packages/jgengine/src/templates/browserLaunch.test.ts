import { describe, expect, test } from "bun:test";

import { BROWSER_LAUNCH_BLOCK, LAUNCH_BLOCK_END, LAUNCH_BLOCK_START } from "./browserLaunch";
import { browserLibMjs, driveMjs, shootMjs } from "./gameFiles";

/** The scaffold's own `scripts/browser.mjs`, loaded exactly as a generated project runs it. */
async function scaffoldBrowser(): Promise<Record<string, any>> {
  const encoded = Buffer.from(browserLibMjs, "utf8").toString("base64");
  return (await import(`data:text/javascript;base64,${encoded}`)) as Record<string, any>;
}

/** A launched Chrome stand-in. No real directory: the block only ever tries to delete the profile. */
function fakeChrome(index: number, onKill: () => void = () => {}): { kill: () => void; userDataDir: string; exitCode: null } {
  return { kill: onKill, userDataDir: `/tmp/jg-scaffold-launch-${index}`, exitCode: null };
}

describe("scaffold launch block", () => {
  test("scripts/browser.mjs carries exactly one copy of the canonical block", () => {
    const start = browserLibMjs.indexOf(LAUNCH_BLOCK_START);
    expect(start).toBeGreaterThan(-1);
    expect(browserLibMjs.indexOf(LAUNCH_BLOCK_START, start + 1)).toBe(-1);
    const end = browserLibMjs.indexOf(LAUNCH_BLOCK_END, start);
    expect(end).toBeGreaterThan(start);
    expect(browserLibMjs.slice(start, end + LAUNCH_BLOCK_END.length)).toBe(BROWSER_LAUNCH_BLOCK);
    expect(browserLibMjs).not.toContain("Chrome debugger never came up on port");
  });

  test("shoot and drive launch through startBrowser, not a single fixed wait", () => {
    for (const [name, source] of [["shoot.mjs", shootMjs], ["drive.mjs", driveMjs]] as const) {
      expect({ name, starts: source.includes("startBrowser({") }).toEqual({ name, starts: true });
      expect({ name, waits: source.includes("waitForDebugger(") }).toEqual({ name, waits: false });
      expect({ name, fixed: source.includes("30_000") }).toEqual({ name, fixed: false });
    }
  });

  test("the per-attempt wait is tunable through JG_CHROME_READY_MS", async () => {
    const { resolveChromeReadyMs } = await scaffoldBrowser();
    expect(resolveChromeReadyMs({})).toBe(30_000);
    expect(resolveChromeReadyMs({ JG_CHROME_READY_MS: "45000" })).toBe(45_000);
    for (const bad of ["", "0", "-5", "soon"]) {
      expect(resolveChromeReadyMs({ JG_CHROME_READY_MS: bad })).toBe(30_000);
    }
  });

  test("a failed first endpoint wait is retried with a fresh profile and the launch recovers", async () => {
    const { startBrowser } = await scaffoldBrowser();
    const profiles: string[] = [];
    const killed: number[] = [];
    const waits: number[] = [];
    const lines: string[] = [];
    const started = await startBrowser({
      debugPort: 4242,
      readyMs: 100,
      log: (line: string) => lines.push(line),
      // Neither a socket nor a clock: attempt 1 fails the endpoint step outright, so a loaded
      // runner cannot spend the retry's budget before the endpoint can answer.
      waitForDebugger: async (port: number, timeoutMs: number) => {
        waits.push(timeoutMs);
        if (waits.length === 1) {
          throw new Error("the debugger on :" + port + " did not answer /json/version within " + timeoutMs + "ms");
        }
        return 0;
      },
      launch: () => {
        const index = profiles.length + 1;
        const chrome = fakeChrome(index, () => killed.push(index));
        profiles.push(chrome.userDataDir);
        return chrome;
      },
      pageProbe: async () => {},
    });
    expect(waits).toEqual([100, 200]);
    expect(started.attempts).toBe(2);
    expect(started.profilePath).toBe(profiles[1] as string);
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles).size).toBe(2);
    expect(killed).toEqual([1]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("browser: the endpoint step failed on attempt 1 after");
    expect(lines[0]).toContain("did not answer /json/version within 100ms");
    expect(lines[0]).toContain("retrying with a fresh profile and a 200ms wait");
    expect(lines[1]).toContain("browser: launch recovered on attempt 2 after");
  });

  test("a debugger that never answers is reported after the retry, naming the endpoint step", async () => {
    const { startBrowser, BrowserLaunchError } = await scaffoldBrowser();
    const profiles: string[] = [];
    let failure: any;
    try {
      await startBrowser({
        debugPort: 1,
        readyMs: 60,
        log: () => {},
        launch: () => {
          const chrome = fakeChrome(profiles.length + 1);
          profiles.push(chrome.userDataDir);
          return chrome;
        },
        pageProbe: async () => {},
      });
    } catch (error) {
      failure = error;
    }
    expect(profiles).toHaveLength(2);
    expect(failure).toBeInstanceOf(BrowserLaunchError);
    expect(failure.step).toBe("endpoint");
    expect(failure.attempts).toBe(2);
    expect(failure.message).toContain("2 attempts");
    expect(failure.message).toContain("did not answer /json/version within 120ms");
  });

  test("a browser that exited fails at once, naming the endpoint step", async () => {
    const { waitForDebugger } = await scaffoldBrowser();
    const startedAt = Date.now();
    await expect(
      waitForDebugger(1, 5_000, { browser: { exitCode: 1 }, profilePath: "/tmp/jg-profile" }),
    ).rejects.toThrow("the browser process exited (code 1) before binding the debugger on :1");
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  test("the debugger handshake ignores HTTP_PROXY", async () => {
    const { startBrowser } = await scaffoldBrowser();
    const debuggerEndpoint = await slowDebugger(0);
    const saved = new Map<string, string | undefined>();
    const proxy = {
      HTTP_PROXY: "http://127.0.0.1:9",
      http_proxy: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
      NO_PROXY: "",
      no_proxy: "",
    };
    try {
      for (const [name, value] of Object.entries(proxy)) {
        saved.set(name, process.env[name]);
        process.env[name] = value;
      }
      const started = await startBrowser({
        debugPort: debuggerEndpoint.port,
        readyMs: 1_000,
        log: () => {},
        launch: () => fakeChrome(1),
        pageProbe: async () => {},
      });
      expect(started.attempts).toBe(1);
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await debuggerEndpoint.stop();
    }
  });

  test("the shipped block probes the debugger without fetch", () => {
    expect(BROWSER_LAUNCH_BLOCK).toContain('from "node:http"');
    const fetchCall = BROWSER_LAUNCH_BLOCK.indexOf("fetch(");
    expect({ fetch: fetchCall }).toEqual({ fetch: -1 });
  });

  test("missing Chrome is a configuration error, not a flake to retry", async () => {
    const { startBrowser, BrowserLaunchError } = await scaffoldBrowser();
    let calls = 0;
    let failure: any;
    try {
      await startBrowser({
        debugPort: 1,
        readyMs: 60,
        log: () => {},
        launch: () => {
          calls += 1;
          throw new Error("No Chrome/Chromium found. Install Chrome or set CHROME_PATH.");
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(calls).toBe(1);
    expect(failure).toBeInstanceOf(BrowserLaunchError);
    expect(failure.step).toBe("launch");
    expect(failure.message).toContain("the launch step failed after");
    expect(failure.message).toContain("1 attempt");
  });
});
