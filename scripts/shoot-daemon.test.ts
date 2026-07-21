import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearDaemonState,
  daemonStatePath,
  ensureDaemonTarget,
  isDaemonArgv,
  readDaemonState,
  reapStaleDaemonState,
  stopDaemon,
  waitForDaemonLive,
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

describe("shoot daemon readiness", () => {
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
