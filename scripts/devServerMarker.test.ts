import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  devServerMarkerPlugin,
  idleVerdict,
  listMarkers,
  markerPath,
  readMarker,
  removeMarker,
  resolveIdleExitMs,
  startIdleWatchdog,
  writeMarker,
} from "./devServerMarker";

/**
 * The marker is how `bun run debug` finds the dev server Jon started with `bun dev`:
 * a write at listen, a read by the CLI, and a removal that never touches another
 * checkout's marker on the same port.
 */

const dirs: string[] = [];

function markerDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-marker-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("dev server marker", () => {
  test("a written marker reads back with the identity, port, pid and head the CLI expects", () => {
    const dir = markerDir();
    writeMarker({ identity: "C:/work/tree", port: 3001, pid: 4242, head: "abc123", kind: "website" }, dir);
    expect(readMarker(3001, dir)).toEqual({
      identity: "C:/work/tree",
      port: 3001,
      pid: 4242,
      head: "abc123",
      kind: "website",
    });
    expect(existsSync(markerPath(3001, dir))).toBe(true);
  });

  test("listing finds every marker in the directory", () => {
    const dir = markerDir();
    writeMarker({ identity: "a", port: 3001, kind: "website" }, dir);
    writeMarker({ identity: "b", port: 4680, kind: "runner" }, dir);
    expect(listMarkers(dir).map((marker) => marker.port).sort()).toEqual([3001, 4680]);
  });

  test("removing owns only its own identity, so a neighbouring checkout keeps its marker", () => {
    const dir = markerDir();
    writeMarker({ identity: "mine", port: 3001, kind: "website" }, dir);
    expect(removeMarker(3001, "someone-else", dir)).toBe(false);
    expect(readMarker(3001, dir)).not.toBeNull();
    expect(removeMarker(3001, "mine", dir)).toBe(true);
    expect(readMarker(3001, dir)).toBeNull();
    expect(removeMarker(3001, "mine", dir)).toBe(false);
  });

  test("a missing marker reads as null instead of throwing", () => {
    const dir = markerDir();
    expect(readMarker(9999, dir)).toBeNull();
    expect(removeMarker(9999, "mine", dir)).toBe(false);
  });

  test("the Vite plugin publishes on listen and removes its own marker on shutdown", () => {
    const dir = markerDir();
    const listeners = new Map<string, () => void>();
    const httpServer = {
      listening: false,
      address: () => ({ address: "::1", family: "IPv6", port: 30_111 }),
      once(event: string, listener: () => void) {
        listeners.set(event, listener);
      },
    };
    const plugin = devServerMarkerPlugin({ kind: "website", dir });
    plugin.configureServer({ config: { root: process.cwd() }, httpServer });
    expect(readMarker(30_111, dir)).toBeNull();

    listeners.get("listening")!();
    expect(readMarker(30_111, dir)).toMatchObject({ port: 30_111, kind: "website", host: "localhost" });

    listeners.get("close")!();
    expect(readMarker(30_111, dir)).toBeNull();
  });
});

describe("idle dev servers exit", () => {
  const base = { now: 0, lastActivity: 0, openSockets: 0, rootExists: true, idleMs: 60_000 };

  test("a server nobody touched for the idle window leaves; an open socket keeps it", () => {
    expect(idleVerdict({ ...base, now: 59_999 })).toBe("keep");
    expect(idleVerdict({ ...base, now: 60_000 })).toBe("idle");
    expect(idleVerdict({ ...base, now: 600_000, openSockets: 1 })).toBe("keep");
    expect(idleVerdict({ ...base, now: 600_000, idleMs: 0 })).toBe("keep");
  });

  test("a server whose checkout was deleted leaves at once, even with a tab open", () => {
    expect(idleVerdict({ ...base, rootExists: false, openSockets: 3 })).toBe("orphaned");
  });

  test("JG_DEV_IDLE_MINUTES sets the window and 0 turns it off", () => {
    expect(resolveIdleExitMs({})).toBe(20 * 60_000);
    expect(resolveIdleExitMs({ JG_DEV_IDLE_MINUTES: "5" })).toBe(5 * 60_000);
    expect(resolveIdleExitMs({ JG_DEV_IDLE_MINUTES: "0" })).toBe(0);
  });

  test("the watchdog counts sockets and exits once the last one has been closed for the window", () => {
    let clock = 0;
    let onConnection: ((socket: { once(event: "close", listener: () => void): void }) => void) | undefined;
    const exits: string[] = [];
    const watchdog = startIdleWatchdog(
      {
        config: { root: process.cwd() },
        httpServer: {
          listening: true,
          address: () => ({ port: 1 }),
          once() {},
          on(_event, listener) {
            onConnection = listener;
          },
        },
      },
      { idleMs: 1_000, checkEveryMs: 1_000_000, now: () => clock, rootExists: () => true, exit: (v) => exits.push(v) },
    )!;
    let close: () => void = () => {};
    onConnection!({ once: (_e, listener) => (close = listener) });
    clock = 5_000;
    expect(watchdog.check()).toBe("keep");
    close();
    clock = 5_999;
    expect(watchdog.check()).toBe("keep");
    clock = 6_000;
    expect(watchdog.check()).toBe("idle");
    expect(exits).toEqual(["idle"]);
    watchdog.stop();
  });
});
