import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearDaemonState,
  daemonStatePath,
  isDaemonArgv,
  readDaemonState,
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
});

describe("shoot daemon readiness", () => {
  test("waits until both recorded endpoints are reachable", async () => {
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
