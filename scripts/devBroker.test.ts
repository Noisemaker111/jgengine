import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  BrokerCore,
  brokerHandler,
  serverEnv,
  serverKey,
  type BrokerDeps,
  type LaunchedChrome,
  type LaunchedServer,
  type ServerRequest,
} from "./devBroker";
import { localPostJson, localRequest } from "./localhostHttp";

interface Fake {
  deps: BrokerDeps;
  clock: { now: number };
  alive: Set<number>;
  started: { request: ServerRequest; port: number; stopped: boolean }[];
  chromes: { stopped: boolean }[];
  closed: number[];
  logs: string[];
}

function fakeBroker(overrides: Partial<BrokerDeps> = {}): Fake {
  const clock = { now: 1_000_000 };
  const alive = new Set<number>([100, 200, 300]);
  const started: Fake["started"] = [];
  const chromes: Fake["chromes"] = [];
  const closed: number[] = [];
  const logs: string[] = [];
  let nextPort = 5000;
  const deps: BrokerDeps = {
    now: () => clock.now,
    isAlive: (pid) => alive.has(pid),
    async startServer(request, port) {
      const record = { request, port, stopped: false };
      started.push(record);
      let exit!: () => void;
      const exited = new Promise<void>((resolve) => (exit = resolve));
      await Promise.resolve();
      const launched: LaunchedServer = {
        pid: 9000 + started.length,
        port,
        exited,
        async stop() {
          record.stopped = true;
          exit();
        },
      };
      return launched;
    },
    async startChrome() {
      const record = { stopped: false };
      chromes.push(record);
      const chrome: LaunchedChrome = {
        pid: 7000 + chromes.length,
        port: 9300 + chromes.length,
        exited: new Promise(() => {}),
        async stop() {
          record.stopped = true;
        },
      };
      return chrome;
    },
    async pickPort(preferred, taken) {
      if (preferred !== undefined && !taken.has(preferred)) return preferred;
      while (taken.has(nextPort)) nextPort += 1;
      return nextPort++;
    },
    rootExists: () => true,
    async closeStrayPages(port) {
      closed.push(port);
      return 1;
    },
    log: (line) => logs.push(line),
    idleMs: 60_000,
    maxServers: 6,
    captureSlots: 1,
    captureMaxMs: 600_000,
    ...overrides,
  };
  return { deps, clock, alive, started, chromes, closed, logs };
}

function request(overrides: Partial<ServerRequest> = {}): ServerRequest {
  return { root: "C:/repo/a", gameDir: null, kind: "runner", fingerprint: "head1", clientPid: 100, label: "drive a", ...overrides };
}

describe("broker servers", () => {
  test("parallel runs of one checkout share one server, started once", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const grants = await Promise.all([
      core.acquireServer(request({ clientPid: 100 })),
      core.acquireServer(request({ clientPid: 200 })),
      core.acquireServer(request({ clientPid: 300 })),
    ]);
    expect(fake.started).toHaveLength(1);
    expect(new Set(grants.map((grant) => grant.port)).size).toBe(1);
    expect(grants.map((grant) => grant.reused)).toEqual([false, true, true]);
  });

  test("another checkout or another game dir never shares a server", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const a = await core.acquireServer(request());
    const b = await core.acquireServer(request({ root: "C:/repo/b" }));
    const c = await core.acquireServer(request({ gameDir: "C:/games/lane/harbor-heat" }));
    const web = await core.acquireServer(request({ kind: "website" }));
    expect(fake.started).toHaveLength(4);
    expect(new Set([a.port, b.port, c.port, web.port]).size).toBe(4);
    expect(serverKey(request({ gameDir: "C:/g/x" }))).toBe("runner:C:/repo/a|game-dir:C:/g/x");
  });

  test("an unleased server stops after the idle window, a leased one stays", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const held = await core.acquireServer(request({ root: "C:/repo/held" }));
    const done = await core.acquireServer(request({ root: "C:/repo/done" }));
    core.release(done.leaseId);
    fake.clock.now += 59_000;
    await core.sweep();
    expect(fake.started.map((s) => s.stopped)).toEqual([false, false]);
    fake.clock.now += 2_000;
    await core.sweep();
    expect(fake.started.map((s) => s.stopped)).toEqual([false, true]);
    expect(held.port).toBeGreaterThan(0);
  });

  test("a killed client's lease is given back on the next sweep", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    await core.acquireServer(request({ clientPid: 200 }));
    fake.alive.delete(200);
    await core.sweep();
    expect(core.status().leases).toBe(0);
    fake.clock.now += 60_000;
    await core.sweep();
    expect(fake.started[0]!.stopped).toBe(true);
  });

  test("a server whose checkout was deleted stops at once", async () => {
    let exists = true;
    const fake = fakeBroker({ rootExists: () => exists });
    const core = new BrokerCore(fake.deps);
    await core.acquireServer(request());
    exists = false;
    await core.sweep();
    expect(fake.started[0]!.stopped).toBe(true);
  });

  test("a moved tree restarts an unleased server but never one another run holds", async () => {
    const cleared: string[] = [];
    const fake = fakeBroker({ clearCaches: (root) => cleared.push(root) });
    const core = new BrokerCore(fake.deps);
    const first = await core.acquireServer(request({ clientPid: 100 }));
    const busy = await core.acquireServer(request({ clientPid: 200, fingerprint: "head2" }));
    expect(fake.started).toHaveLength(1);
    expect(busy.stale).toMatch(/other run/);
    core.release(first.leaseId);
    core.release(busy.leaseId);
    const fresh = await core.acquireServer(request({ fingerprint: "head2" }));
    expect(fake.started).toHaveLength(2);
    expect(fake.started[0]!.stopped).toBe(true);
    expect(fresh.reused).toBe(false);
    expect(cleared).toEqual(["C:/repo/a"]);
  });

  test("at the cap the least recently used idle server makes room", async () => {
    const fake = fakeBroker({ maxServers: 2 });
    const core = new BrokerCore(fake.deps);
    const a = await core.acquireServer(request({ root: "C:/a" }));
    fake.clock.now += 10;
    const b = await core.acquireServer(request({ root: "C:/b" }));
    core.release(a.leaseId);
    core.release(b.leaseId);
    await core.acquireServer(request({ root: "C:/c" }));
    expect(fake.started.map((s) => [s.request.root, s.stopped])).toEqual([
      ["C:/a", true],
      ["C:/b", false],
      ["C:/c", false],
    ]);
  });

  test("a failed start is not cached and its lease is dropped", async () => {
    let fail = true;
    const fake = fakeBroker();
    const real = fake.deps.startServer;
    fake.deps.startServer = async (req, port) => {
      if (fail) throw new Error("vite boot error");
      return real(req, port);
    };
    const core = new BrokerCore(fake.deps);
    await expect(core.acquireServer(request())).rejects.toThrow("vite boot error");
    expect(core.status()).toMatchObject({ servers: [], leases: 0 });
    fail = false;
    expect((await core.acquireServer(request())).reused).toBe(false);
  });

  test("the broker reports idle only once nothing runs and the window passed", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const grant = await core.acquireServer(request());
    core.release(grant.leaseId);
    expect(await core.sweep()).toBe(false);
    fake.clock.now += 60_000;
    expect(await core.sweep()).toBe(true);
  });
});

describe("broker capture turns", () => {
  test("turns are granted one at a time, in order", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const order: string[] = [];
    const first = core.acquireCapture(100, "drive one", 60_000);
    const second = core.acquireCapture(200, "drive two", 60_000);
    const one = await first.grant;
    order.push("one");
    void second.grant.then(() => order.push("two"));
    await Bun.sleep(5);
    expect(order).toEqual(["one"]);
    expect(core.status().capture.queued).toEqual(["drive two (pid 200)"]);
    core.release(one.leaseId);
    const two = await second.grant;
    expect(order).toEqual(["one", "two"]);
    expect(two.chromePort).toBe(one.chromePort);
    expect(fake.chromes).toHaveLength(1);
  });

  test("a wait that runs out names who holds the browser", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    await core.acquireCapture(100, "shoot harbor-heat", 60_000).grant;
    await expect(core.acquireCapture(200, "drive two", 30).grant).rejects.toThrow(/held by shoot harbor-heat \(pid 100\)/);
    expect(core.status().capture.queued).toEqual([]);
  });

  test("a dead holder's turn passes on and its pages are closed", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    await core.acquireCapture(200, "crashed drive", 60_000).grant;
    const next = core.acquireCapture(100, "next drive", 60_000);
    fake.alive.delete(200);
    await core.sweep();
    const grant = await next.grant;
    expect(grant.waitedMs).toBeGreaterThanOrEqual(0);
    expect(fake.closed).toEqual([9301]);
  });

  test("a turn held past the cap is revoked", async () => {
    const fake = fakeBroker({ captureMaxMs: 1_000 });
    const core = new BrokerCore(fake.deps);
    await core.acquireCapture(100, "hung drive", 60_000).grant;
    const next = core.acquireCapture(200, "next", 60_000);
    fake.clock.now += 1_000;
    await core.sweep();
    await next.grant;
    expect(fake.logs.some((line) => line.includes("hung drive") && line.includes("revoked"))).toBe(true);
  });

  test("a cancelled wait is never granted", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const held = await core.acquireCapture(100, "one", 60_000).grant;
    const gaveUp = core.acquireCapture(200, "gave up", 60_000);
    gaveUp.grant.catch(() => {});
    gaveUp.cancel();
    const third = core.acquireCapture(300, "three", 60_000);
    core.release(held.leaseId);
    await third.grant;
    expect(core.status().capture.holders).toEqual(["three (pid 300)"]);
  });

  test("the shared browser stops once nobody has used it for the idle window", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    const chrome = await core.acquireChrome(100, "drive");
    expect(chrome.started).toBe(true);
    expect((await core.acquireChrome(200, "drive 2")).started).toBe(false);
    fake.alive.delete(100);
    fake.alive.delete(200);
    await core.sweep();
    fake.clock.now += 60_000;
    await core.sweep();
    expect(fake.chromes[0]!.stopped).toBe(true);
  });

  test("shutdown stops every server and the browser", async () => {
    const fake = fakeBroker();
    const core = new BrokerCore(fake.deps);
    await core.acquireServer(request());
    await core.acquireChrome(100, "drive");
    await core.shutdown();
    expect(fake.started[0]!.stopped).toBe(true);
    expect(fake.chromes[0]!.stopped).toBe(true);
  });
});

describe("broker server environment", () => {
  test("a client's own game dir and ports never leak into another checkout's server", () => {
    const env = serverEnv(
      { PATH: "/bin", JG_GAME_DIR: "/x", VITE_JG_GAME_DIR: "/x", JG_DEV_PORT: "1", JG_STEP_FILE: "/s" },
      request({ kind: "website" }),
      5123,
      600_000,
      42,
    );
    expect(env).toEqual({ PATH: "/bin", JG_WEB_PORT: "5123", JG_CAPTURE_SITE: "1", JG_DEV_IDLE_MINUTES: "20", JG_BROKER_PID: "42" });
    const served = serverEnv({}, request({ gameDir: "C:\\games\\lane\\harbor-heat" }), 4600, 600_000, 42);
    expect(served["VITE_JG_GAME_DIR"]).toBe("C:/games/lane/harbor-heat");
    expect(served["JG_DEV_PORT"]).toBe("4600");
  });
});

/** A real HTTP broker whose "servers" are real child processes, so stopping one is a real kill. */
describe("broker over HTTP with real child processes", () => {
  test("serves, reuses, frees a dead client's turn and kills idle children", async () => {
    const children: number[] = [];
    const fake = fakeBroker({
      async startServer(req, port) {
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
        children.push(child.pid!);
        const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
        return {
          pid: child.pid!,
          port,
          exited,
          async stop() {
            child.kill("SIGKILL");
            await exited;
          },
        };
      },
    });
    const core = new BrokerCore(fake.deps);
    const http: Server = createServer(brokerHandler(core, () => {}));
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    try {
      const body = { root: "C:/repo/a", gameDir: null, kind: "runner", fingerprint: "h", clientPid: 100, label: "t" };
      const first = await localPostJson<{ leaseId: string; port: number; reused: boolean }>(`${base}/v1/server`, body, 10_000);
      const second = await localPostJson<{ port: number; reused: boolean }>(`${base}/v1/server`, { ...body, clientPid: 200 }, 10_000);
      expect(first.status).toBe(200);
      expect(second.body).toMatchObject({ port: first.body.port, reused: true });
      expect(children).toHaveLength(1);

      const turn = await localPostJson<{ leaseId: string }>(`${base}/v1/capture`, { clientPid: 300, label: "a" }, 10_000);
      expect(turn.status).toBe(200);
      const busy = await localPostJson<{ error: string }>(`${base}/v1/capture`, { clientPid: 100, label: "b", waitMs: 50 }, 10_000);
      expect(busy.status).toBe(408);
      expect(busy.body.error).toMatch(/held by a \(pid 300\)/);

      const status = JSON.parse((await localRequest(`${base}/v1/status`, { timeoutMs: 5_000 })).body);
      expect(status.servers).toHaveLength(1);

      await localPostJson(`${base}/v1/release`, { leaseId: first.body.leaseId }, 5_000);
      fake.alive.clear();
      await core.sweep();
      fake.clock.now += 60_000;
      await core.sweep();
      const pid = children[0]!;
      let gone = false;
      try {
        process.kill(pid, 0);
      } catch {
        gone = true;
      }
      expect(gone).toBe(true);
    } finally {
      await core.shutdown();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
