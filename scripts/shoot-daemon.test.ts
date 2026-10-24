import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { localOk } from "./localhostHttp";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireWarmCapture,
  clearDaemonState,
  daemonDiedUnder,
  daemonRevisionDrift,
  daemonStatePath,
  describeWorldChange,
  ensureDaemonTarget,
  gamesWorld,
  isDaemonArgv,
  readDaemonState,
  reapStaleDaemonState,
  stopDaemon,
  startDaemon,
  waitForDaemonLive,
  worldChanged,
  writeDaemonState,
  type ShootDaemonState,
} from "./shoot-daemon";
import { checkoutIdentity } from "./browser-lib";

describe("shoot daemon CLI routing", () => {
  test("isDaemonArgv recognizes daemon subcommand and --serve", () => {
    expect(isDaemonArgv(["daemon", "start"])).toBe(true);
    expect(isDaemonArgv(["--serve"])).toBe(true);
    expect(isDaemonArgv(["wreckway", "--mode", "play"])).toBe(false);
    expect(isDaemonArgv(["--keep"])).toBe(false);
  });

});

describe("shoot daemon state file", () => {
  test("legacy compatibility reads and clears only the exact checkout's record", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-legacy-fixture-"));
    const legacy = join(cwd, "legacy-state.json");
    try {
      const foreign = { identity: "/foreign-checkout", chromePort: 1, startedAt: "fixture" };
      writeFileSync(legacy, JSON.stringify(foreign));
      expect(readDaemonState(cwd, legacy)).toBeNull();
      clearDaemonState(cwd, legacy);
      expect(existsSync(legacy)).toBe(true);
      const own = { ...foreign, identity: checkoutIdentity(cwd) };
      writeFileSync(legacy, JSON.stringify(own));
      expect(readDaemonState(cwd, legacy)).toEqual(own);
      clearDaemonState(cwd, legacy);
      expect(existsSync(legacy)).toBe(false);
    } finally {
      clearDaemonState(cwd, legacy);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("same-port checkouts have isolated metadata and locks even under a port override", () => {
    const first = mkdtempSync(join(tmpdir(), "jg-shoot-isolated-a-"));
    const second = mkdtempSync(join(tmpdir(), "jg-shoot-isolated-b-"));
    const prior = process.env.JG_CHROME_PORT;
    process.env.JG_CHROME_PORT = "9230";
    try {
      const firstPath = daemonStatePath(first);
      const secondPath = daemonStatePath(second);
      expect(firstPath).not.toBe(secondPath);
      expect(`${firstPath}.lock`).not.toBe(`${secondPath}.lock`);
      expect(firstPath).not.toBe(join(tmpdir(), "jgengine-shoot-daemon-9230.json"));
      for (const cwd of [first, second]) {
        writeDaemonState({ identity: checkoutIdentity(cwd), chromePort: 9230, startedAt: "isolated" }, cwd);
      }
      expect(readDaemonState(first)?.identity).toBe(checkoutIdentity(first));
      expect(readDaemonState(second)?.identity).toBe(checkoutIdentity(second));
      clearDaemonState(first);
      expect(readDaemonState(first)).toBeNull();
      expect(readDaemonState(second)?.identity).toBe(checkoutIdentity(second));
      expect(existsSync(secondPath)).toBe(true);
    } finally {
      clearDaemonState(first);
      clearDaemonState(second);
      if (prior === undefined) delete process.env.JG_CHROME_PORT;
      else process.env.JG_CHROME_PORT = prior;
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  test("write/read/clear round-trip on the per-checkout path", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-state-"));
    try {
      const path = daemonStatePath(cwd);
      if (existsSync(path)) unlinkSync(path);

      const state: ShootDaemonState = {
        identity: "test-checkout",
        chromePort: 9223,
        devPort: 4517,
        devBase: "http://127.0.0.1:4517",
        webPort: 5017,
        webBase: "http://127.0.0.1:5017",
        chromePid: 1,
        startedAt: new Date().toISOString(),
      };
      writeDaemonState(state, cwd);
      expect(existsSync(path)).toBe(true);
      const loaded = readDaemonState(cwd);
      expect(loaded?.chromePort).toBe(9223);
      expect(loaded?.devBase).toBe("http://127.0.0.1:4517");
      clearDaemonState(cwd);
      expect(readDaemonState(cwd)).toBeNull();
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("corrupt state file yields null", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-corrupt-"));
    try {
      const path = daemonStatePath(cwd);
      writeFileSync(path, "{not-json");
      expect(readDaemonState(cwd)).toBeNull();
      clearDaemonState(cwd);
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lazily records the website target without requiring a game server", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-lazy-web-"));
    try {
      const state: ShootDaemonState = {
        identity: checkoutIdentity(cwd),
        chromePort: 9223,
        startedAt: new Date().toISOString(),
      };
      writeDaemonState(state, cwd);
      const server = await ensureDaemonTarget(state, "web", cwd, async (receivedCwd) => {
        expect(receivedCwd).toBe(cwd);
        return { child: null, port: 5712, base: "http://127.0.0.1:5712" };
      });
      expect(server.base).toBe("http://127.0.0.1:5712");
      expect(readDaemonState(cwd)).toMatchObject({
        chromePort: 9223,
        webPort: 5712,
        webBase: "http://127.0.0.1:5712",
      });
      expect(readDaemonState(cwd)?.devBase).toBeUndefined();
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("merges concurrent lazy game and website target activation", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-lazy-both-"));
    try {
      const initial: ShootDaemonState = {
        identity: checkoutIdentity(cwd),
        chromePort: 9223,
        startedAt: new Date().toISOString(),
      };
      writeDaemonState(initial, cwd);
      await Promise.all([
        ensureDaemonTarget({ ...initial }, "dev", cwd, async () => ({
          child: null,
          port: 4517,
          base: "http://127.0.0.1:4517",
        })),
        ensureDaemonTarget({ ...initial }, "web", cwd, async () => ({
          child: null,
          port: 5712,
          base: "http://127.0.0.1:5712",
        })),
      ]);
      expect(readDaemonState(cwd)).toMatchObject({
        devBase: "http://127.0.0.1:4517",
        webBase: "http://127.0.0.1:5712",
      });
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("shoot daemon games world", () => {
  const fixture = (): { cwd: string; games: (names: string[]) => void } => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-world-"));
    const games = (names: string[]): void => {
      for (const name of names) mkdirSync(join(cwd, "Games", name, "src"), { recursive: true });
      for (const name of names) writeFileSync(join(cwd, "Games", name, "src", "index.tsx"), "");
    };
    return { cwd, games };
  };

  test("reports no world when there is no Games checkout", () => {
    const { cwd } = fixture();
    try {
      expect(gamesWorld(cwd)).toEqual({ target: null, linkMtimeMs: null, head: null, games: [] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports a repointed link and an added game as a change", () => {
    const first = fixture();
    const second = fixture();
    try {
      first.games(["beacon"]);
      second.games(["beacon", "harbor-heat"]);
      const before = gamesWorld(first.cwd);
      expect(before.games).toEqual(["beacon"]);
      expect(worldChanged(undefined, before)).toBe(false);
      expect(worldChanged(before, gamesWorld(first.cwd))).toBe(false);

      const after = gamesWorld(second.cwd);
      expect(worldChanged(before, after)).toBe(true);
      expect(describeWorldChange(before, after)).toContain("+harbor-heat");
    } finally {
      rmSync(first.cwd, { recursive: true, force: true });
      rmSync(second.cwd, { recursive: true, force: true });
    }
  });

  test("retires the dev server when its game list went stale, and reuses a fresh one", async () => {
    const { cwd, games } = fixture();
    try {
      games(["beacon"]);
      writeDaemonState(
        {
          identity: checkoutIdentity(cwd),
          chromePort: 9223,
          devPort: 4517,
          devBase: "http://127.0.0.1:4517",
          devWorld: gamesWorld(cwd),
          startedAt: new Date().toISOString(),
        },
        cwd,
      );
      games(["beacon", "harbor-heat"]);

      let sawRetired = false;
      await ensureDaemonTarget(readDaemonState(cwd)!, "dev", cwd, async () => {
        // The stale server must be gone before anything boots a replacement.
        sawRetired = readDaemonState(cwd)?.devBase === undefined;
        return { child: null, port: 4517, base: "http://127.0.0.1:4517" };
      });
      expect(sawRetired).toBe(true);
      expect(readDaemonState(cwd)?.devWorld?.games).toEqual(["beacon", "harbor-heat"]);

      const recorded = readDaemonState(cwd)!;
      const reused = await ensureDaemonTarget(recorded, "dev", cwd, async () => ({
        child: null,
        port: 4517,
        base: "http://127.0.0.1:4517",
      }));
      expect(reused.base).toBe("http://127.0.0.1:4517");
      expect(readDaemonState(cwd)?.devBase).toBe("http://127.0.0.1:4517");
      expect(readDaemonState(cwd)?.devWorld).toEqual(gamesWorld(cwd));
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("shoot daemon readiness", () => {
  test("rejects an occupied unowned debugger port without launching or claiming Chrome", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-occupied-"));
    const server = createServer((_request, response) => { response.writeHead(200); response.end("{}"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const prior = process.env.JG_CHROME_PORT;
    process.env.JG_CHROME_PORT = String(port);
    try {
      await expect(startDaemon({ cwd })).rejects.toThrow(`explicitly --connect ${port}`);
      expect(readDaemonState(cwd)).toBeNull();
      expect(existsSync(daemonStatePath(cwd))).toBe(false);
      expect(await localOk(`http://127.0.0.1:${port}/json/version`, 2_000)).toBe(true);
    } finally {
      clearDaemonState(cwd);
      if (prior === undefined) delete process.env.JG_CHROME_PORT;
      else process.env.JG_CHROME_PORT = prior;
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reaps an unreachable recorded daemon before the next start", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-stale-"));
    try {
      writeDaemonState({
        identity: checkoutIdentity(cwd),
        chromePort: 1,
        devPort: 1,
        devBase: "http://127.0.0.1:1",
        webPort: 1,
        webBase: "http://127.0.0.1:1",
        startedAt: new Date().toISOString(),
      }, cwd);
      await expect(reapStaleDaemonState(cwd)).resolves.toBe(true);
      expect(readDaemonState(cwd)).toBeNull();
      await expect(reapStaleDaemonState(cwd)).resolves.toBe(false);
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("refuses to reap state owned by another checkout", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-foreign-"));
    try {
      writeDaemonState({
        identity: "C:/another/checkout",
        chromePort: 1,
        devPort: 1,
        devBase: "http://127.0.0.1:1",
        webPort: 1,
        webBase: "http://127.0.0.1:1",
        startedAt: new Date().toISOString(),
      }, cwd);
      await expect(reapStaleDaemonState(cwd)).rejects.toThrow("state port collision");
      expect(readDaemonState(cwd)?.identity).toBe("C:/another/checkout");
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("refuses to stop state owned by another checkout", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-foreign-stop-"));
    try {
      writeDaemonState({
        identity: "C:/another/checkout",
        chromePort: 1,
        startedAt: new Date().toISOString(),
      }, cwd);
      await expect(stopDaemon({ cwd })).rejects.toThrow("refusing to stop daemon owned by");
      expect(readDaemonState(cwd)?.identity).toBe("C:/another/checkout");
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("waits until the recorded Chrome endpoint is reachable", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-ready-"));
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address() as AddressInfo;
      const state: ShootDaemonState = {
        identity: checkoutIdentity(cwd),
        chromePort: address.port,
        devPort: address.port,
        devBase: `http://127.0.0.1:${address.port}`,
        webPort: address.port,
        webBase: `http://127.0.0.1:${address.port}`,
        chromePid: process.pid,
        startedAt: new Date().toISOString(),
      };
      writeDaemonState(state, cwd);

      await expect(
        waitForDaemonLive(cwd, { pid: process.pid, timeoutMs: 1_000, pollMs: 10 }),
      ).resolves.toEqual(state);
    } finally {
      clearDaemonState(cwd);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails immediately when the background process exits", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-dead-"));
    try {
      await expect(
        waitForDaemonLive(cwd, { pid: Number.MAX_SAFE_INTEGER, timeoutMs: 10_000, pollMs: 10 }),
      ).resolves.toBeNull();
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("stops waiting when a live background process never publishes endpoints", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-timeout-"));
    try {
      await expect(
        waitForDaemonLive(cwd, { pid: process.pid, timeoutMs: 5, pollMs: 1 }),
      ).resolves.toBeNull();
    } finally {
      clearDaemonState(cwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

/** Collect the lines a lane prints while it decides, so the decision is asserted, not assumed. */
async function captureStderr<T>(run: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    return { value: await run(), lines };
  } finally {
    console.error = original;
  }
}

const liveState = (head?: string): ShootDaemonState => ({
  identity: "checkout",
  chromePort: 9261,
  ...(head === undefined ? {} : { head }),
  startedAt: "fixture",
});

describe("capture lanes acquire a warm daemon by default", () => {
  test("reuses a live daemon serving this commit and never starts another", async () => {
    let started = 0;
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        cold: false,
        probe: async () => liveState("abc12345"),
        start: async () => {
          started += 1;
          return liveState("abc12345");
        },
        head: () => "abc12345",
        stop: async () => false,
      }),
    );
    expect(value.mode).toBe("warm");
    expect(value.daemon?.chromePort).toBe(9261);
    expect(started).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warm: reused :9261 \(\d+\.\ds\)$/);
  });

  test("starts one when none is live, and says so with the time it took", async () => {
    let started = 0;
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        probe: async () => null,
        start: async () => {
          started += 1;
          return liveState("abc12345");
        },
        head: () => "abc12345",
        stop: async () => false,
      }),
    );
    expect(value.mode).toBe("cold");
    expect(value.daemon?.chromePort).toBe(9261);
    expect(started).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^cold: started :9261 \(\d+\.\ds\)$/);
  });

  test("--cold never probes, starts, or reuses a daemon", async () => {
    let probed = 0;
    let started = 0;
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        cold: true,
        probe: async () => {
          probed += 1;
          return liveState("abc12345");
        },
        start: async () => {
          started += 1;
          return liveState("abc12345");
        },
        head: () => "abc12345",
        stop: async () => false,
      }),
    );
    expect(value).toMatchObject({ daemon: null, mode: "cold" });
    expect({ probed, started }).toEqual({ probed: 0, started: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("--cold");
    expect(lines[0]).toContain("no daemon reused");
  });

  test("replaces a daemon serving another commit instead of reusing it", async () => {
    const stopped: string[] = [];
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        probe: async () => liveState("old00000"),
        start: async () => liveState("new11111"),
        head: () => "new11111",
        stop: async () => {
          stopped.push("stop");
          return true;
        },
      }),
    );
    expect(stopped).toEqual(["stop"]);
    expect(value.mode).toBe("cold");
    expect(value.daemon?.head).toBe("new11111");
    expect(lines[0]).toContain("replaced daemon on :9261 serving old00000");
    expect(lines[1]).toMatch(/^cold: started :9261/);
  });

  test("falls back once, with one line, when the port is taken and no daemon can start", async () => {
    let started = 0;
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        probe: async () => null,
        start: async () => {
          started += 1;
          throw new Error("shoot daemon: Chrome debug port 9261 is already reachable without a live record");
        },
        head: () => "abc12345",
        stop: async () => false,
      }),
    );
    expect({ started, mode: value.mode, daemon: value.daemon }).toEqual({ started: 1, mode: "cold", daemon: null });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("cold: daemon unavailable");
    expect(lines[0]).toContain("no retry");
  });

  test("falls back when the stale daemon refuses to stop", async () => {
    const { value, lines } = await captureStderr(() =>
      acquireWarmCapture({
        probe: async () => liveState("old00000"),
        start: async () => liveState("new11111"),
        head: () => "new11111",
        stop: async () => {
          throw new Error("would not die");
        },
      }),
    );
    expect(value).toMatchObject({ daemon: null, mode: "cold" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("would not stop");
  });

  test("a daemon record with no recorded commit is unproven, not reused", () => {
    expect(daemonRevisionDrift(undefined, "abc12345")).toBe(true);
    expect(daemonRevisionDrift("abc12345", "abc12345")).toBe(false);
    expect(daemonRevisionDrift("old00000", "new11111")).toBe(true);
    expect(daemonRevisionDrift(undefined, undefined)).toBe(false);
    expect(daemonRevisionDrift("abc12345", undefined)).toBe(false);
  });

  test("a caller that must not share the daemon's browser says why", async () => {
    const { lines } = await captureStderr(() =>
      acquireWarmCapture({ cold: true, because: "--headed needs its own browser window" }),
    );
    expect(lines[0]).toContain("--headed needs its own browser window");
    expect(lines[0]).toContain("no daemon reused or started");
  });

  test("a run only falls back cold when its daemon is really gone", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "jg-shoot-died-"));
    try {
      await expect(daemonDiedUnder(null, cwd)).resolves.toBe(false);
      await expect(daemonDiedUnder(liveState("abc12345"), cwd)).resolves.toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
