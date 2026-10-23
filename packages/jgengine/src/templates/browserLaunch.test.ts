import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";

import { BROWSER_LAUNCH_BLOCK, LAUNCH_BLOCK_END, LAUNCH_BLOCK_START } from "./browserLaunch";
import { browserLibMjs, driveMjs, shootMjs } from "./gameFiles";

/** The scaffold's own `scripts/browser.mjs`, loaded exactly as a generated project runs it. */
async function scaffoldBrowser(): Promise<Record<string, any>> {
  const encoded = Buffer.from(browserLibMjs, "utf8").toString("base64");
  return (await import(`data:text/javascript;base64,${encoded}`)) as Record<string, any>;
}

/** A debugger endpoint that refuses `/json/version` until `answerAfterMs`, like a cold Chrome. */
async function slowDebugger(answerAfterMs: number): Promise<{ port: number; stop: () => Promise<void> }> {
  const startedAt = Date.now();
  const server: Server = createServer((request, response) => {
    if (request.url !== "/json/version" || Date.now() - startedAt < answerAfterMs) {
      response.writeHead(503);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/jg-test" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no debugger port");
  return {
    port: address.port,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A launched Chrome stand-in. No real directory: the block only ever tries to delete the profile. */
function fakeChrome(index: number): { kill: () => void; userDataDir: string; exitCode: null } {
  return { kill: () => {}, userDataDir: `/tmp/jg-scaffold-launch-${index}`, exitCode: null };
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

  test("a hung first attempt is retried with a fresh profile and the launch recovers", async () => {
    const { startBrowser } = await scaffoldBrowser();
    const debuggerEndpoint = await slowDebugger(150);
    const profiles: string[] = [];
    const lines: string[] = [];
    try {
      const started = await startBrowser({
        debugPort: debuggerEndpoint.port,
        readyMs: 100,
        log: (line: string) => lines.push(line),
        launch: () => {
          const chrome = fakeChrome(profiles.length + 1);
          profiles.push(chrome.userDataDir);
          return chrome;
        },
        pageProbe: async () => {},
      });
      expect(started.attempts).toBe(2);
      expect(started.profilePath).toBe(profiles[1] as string);
      expect(profiles).toHaveLength(2);
      expect(new Set(profiles).size).toBe(2);
    } finally {
      await debuggerEndpoint.stop();
    }
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("browser: the endpoint step failed on attempt 1 after");
    expect(lines[0]).toContain("did not answer /json/version within 100ms");
    expect(lines[0]).toContain("retrying with a fresh profile and a 200ms wait");
    expect(lines[1]).toContain("browser: launch recovered on attempt 2 after");
  });

  test("a browser that exited fails at once, naming the endpoint step", async () => {
    const { waitForDebugger } = await scaffoldBrowser();
    const startedAt = Date.now();
    await expect(
      waitForDebugger(1, 5_000, { browser: { exitCode: 1 }, profilePath: "/tmp/jg-profile" }),
    ).rejects.toThrow("the browser process exited (code 1) before binding the debugger on :1");
    expect(Date.now() - startedAt).toBeLessThan(1_000);
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
