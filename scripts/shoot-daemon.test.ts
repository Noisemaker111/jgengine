import { describe, expect, test } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";

import {
  clearDaemonState,
  daemonStatePath,
  isDaemonArgv,
  readDaemonState,
  writeDaemonState,
  type ShootDaemonState,
} from "./shoot-daemon";

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
    const path = daemonStatePath();
    if (existsSync(path)) unlinkSync(path);

    const state: ShootDaemonState = {
      identity: "test-checkout",
      chromePort: 9223,
      devPort: 4517,
      devBase: "http://127.0.0.1:4517",
      chromePid: 1,
      startedAt: new Date().toISOString(),
    };
    writeDaemonState(state);
    expect(existsSync(path)).toBe(true);
    const loaded = readDaemonState();
    expect(loaded?.chromePort).toBe(9223);
    expect(loaded?.devBase).toBe("http://127.0.0.1:4517");
    clearDaemonState();
    expect(readDaemonState()).toBeNull();
  });

  test("corrupt state file yields null", () => {
    const path = daemonStatePath();
    writeFileSync(path, "{not-json");
    expect(readDaemonState()).toBeNull();
    clearDaemonState();
  });
});
