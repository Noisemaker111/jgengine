import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

import {
  SERVER_IDENTITY_PATH,
  checkMarkedServer,
  devServerIdentity,
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

const servers: Server[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  while (servers.length > 0) servers.pop()!.close();
});

/** A stand-in dev server on a free port; `report` is what its identity route answers, or none. */
async function liveServer(report: { identity: string; pid: number } | null): Promise<number> {
  const server = createServer((req, res) => {
    if (req.url === SERVER_IDENTITY_PATH && report !== null) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ root: "x", gameDir: null, kind: "runner", ...report }));
      return;
    }
    res.statusCode = req.url === SERVER_IDENTITY_PATH ? 404 : 200;
    res.end("ok");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

describe("a marker is checked against the live server before reuse", () => {
  test("another checkout's Vite on a stale marker's port is foreign, and the lying marker goes", async () => {
    const dir = markerDir();
    const port = await liveServer({ identity: "C:/other-tree", pid: 777 });
    const marker = { identity: "C:/my-tree", port, pid: 111, kind: "runner" as const, host: "127.0.0.1" };
    writeMarker(marker, dir);
    const checked = await checkMarkedServer(marker, "C:/my-tree", { dir });
    expect(checked.status).toBe("foreign");
    expect(readMarker(port, dir)).toBeNull();
  });

  test("our own server is reused and the marker gets the pid the server reports, not the wrapper's", async () => {
    const dir = markerDir();
    const port = await liveServer({ identity: "C:/my-tree", pid: 4242 });
    const marker = { identity: "C:/my-tree", port, pid: 111, kind: "runner" as const, host: "127.0.0.1" };
    writeMarker(marker, dir);
    const checked = await checkMarkedServer(marker, "C:/my-tree", { dir });
    expect(checked.status).toBe("ours");
    expect(readMarker(port, dir)?.pid).toBe(4242);
  });

  test("a server with no identity route never passes for ours, and a marker claiming ours over it goes", async () => {
    const dir = markerDir();
    const port = await liveServer(null);
    const mine = { identity: "C:/my-tree", port, pid: 111, host: "127.0.0.1" };
    writeMarker(mine, dir);
    expect((await checkMarkedServer(mine, "C:/my-tree", { dir })).status).toBe("foreign");
    expect(readMarker(port, dir)).toBeNull();

    const theirs = { identity: "C:/old-tree", port, pid: 222, host: "127.0.0.1" };
    writeMarker(theirs, dir);
    expect((await checkMarkedServer(theirs, "C:/my-tree", { dir })).status).toBe("foreign");
    expect(readMarker(port, dir)).not.toBeNull();
  });

  test("a dead server's marker is deleted; a booting one (process alive) is kept", async () => {
    const dir = markerDir();
    const port = await liveServer(null);
    servers.pop()!.close();
    const marker = { identity: "C:/my-tree", port, pid: 111, host: "127.0.0.1" };
    writeMarker(marker, dir);
    expect((await checkMarkedServer(marker, "C:/my-tree", { dir, isAlive: () => true })).status).toBe("booting");
    expect(readMarker(port, dir)).not.toBeNull();
    expect((await checkMarkedServer(marker, "C:/my-tree", { dir, isAlive: () => false })).status).toBe("dead");
    expect(readMarker(port, dir)).toBeNull();
  });

  test("the Vite plugin answers the identity route with its own pid and identity", () => {
    const dir = markerDir();
    let handler: ((req: unknown, res: never, next: () => void) => void) | undefined;
    devServerMarkerPlugin({ kind: "runner", dir }).configureServer({
      config: { root: process.cwd() },
      httpServer: { listening: false, address: () => null, once() {} },
      middlewares: {
        use(path, fn) {
          if (path === SERVER_IDENTITY_PATH) handler = fn as typeof handler;
        },
      },
    });
    let body = "";
    handler!({}, { statusCode: 0, setHeader() {}, end: (text: string) => (body = text) } as never, () => {});
    expect(JSON.parse(body)).toMatchObject({ identity: devServerIdentity(process.cwd()), pid: process.pid, kind: "runner" });
  });
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

  test("a --game-dir server's marker keeps the game dir, so the next run for that folder reuses it", () => {
    const dir = markerDir();
    const gameDir = markerDir();
    const before = process.env["JG_GAME_DIR"];
    process.env["JG_GAME_DIR"] = gameDir;
    try {
      const listeners = new Map<string, () => void>();
      const httpServer = {
        listening: false,
        address: () => ({ address: "127.0.0.1", family: "IPv4", port: 30_112 }),
        once(event: string, listener: () => void) {
          listeners.set(event, listener);
        },
      };
      devServerMarkerPlugin({ kind: "runner", dir }).configureServer({ config: { root: process.cwd() }, httpServer });
      listeners.get("listening")!();
      const marker = readMarker(30_112, dir);
      expect(marker?.identity).toBe(devServerIdentity(process.cwd()));
      expect(marker?.identity).toContain(`|game-dir:${gameDir}`);
      listeners.get("close")!();
    } finally {
      if (before === undefined) delete process.env["JG_GAME_DIR"];
      else process.env["JG_GAME_DIR"] = before;
    }
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
